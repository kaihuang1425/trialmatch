"""Human prescreening feedback loop.

A research nurse prescreens each shortlist and records what they find in a CSV
(data/prescreen_outcomes.csv). Each run feeds it back three ways:

  answer     patient-level facts (brain scan, earlier treatments, a test result)
             -> merged into the patient record, so matching re-runs with fewer unknowns
  rule       a correction to how the reader parsed one trial's rule
             -> saved as an override for that trial, used on every later run
  criterion  the nurse's verdict on one criterion for one patient (met / not_met)
  outcome    what happened next: enrolled / declined / screen_failed / dropped_out / completed
             (the TrialMatch app also logs interested and prescreen_pass)
             -> both re-estimate the scoring weights (Beta-Binomial: start from the
                team's guess, move toward the observed rate as evidence builds)

Columns: patient, nct, kind, field, value, note
"""
import csv
import copy

from trialmatch import match

PRIOR_STRENGTH = 10  # how many observations the starting guess is worth


def load(path):
    with open(path, newline="") as fh:
        return [r for r in csv.DictReader(fh) if not (r.get("patient") or "").startswith("#")]


# ---------- 1. answers -> patient record ----------
GENES = {"EGFR", "ALK", "ROS1", "RET", "KRAS_G12C", "KRAS_G12D", "BRAF_V600E", "MET_ex14"}


def apply_answers(patients, rows):
    by_id = {p["id"]: p for p in patients}
    n = 0
    for r in rows:
        if r["kind"] != "answer" or r["patient"] not in by_id:
            continue
        p, f, v = by_id[r["patient"]], r["field"], r["value"].strip()
        src = f"Prescreen answer: {f} = {v}" + (f" ({r['note']})" if r.get("note") else "")
        if f in GENES:
            p["biomarkers"][f] = v
            if f == "EGFR" and v == "positive":
                p["biomarkers"]["EGFR_type"] = r.get("note") or "sensitising"
        elif f in ("ecog", "prior_lines"):
            p[f] = int(v)
        elif f == "pdl1":
            p[f] = float(v)
        elif f in ("brain_mets", "stage", "histology"):
            p[f] = v
        else:
            continue
        p["evidence"][f] = src
        n += 1
    return n


# ---------- 2. rule corrections -> trial overrides ----------
def apply_rules(trials, rows):
    by_nct = {t["nct"]: t for t in trials}
    n = 0
    for r in rows:
        if r["kind"] != "rule" or r["nct"] not in by_nct:
            continue
        t, f, v = by_nct[r["nct"]], r["field"], r["value"].strip()
        ev = f"Nurse correction: {r.get('note') or v}"
        rules = t["rules"]
        if f == "stage":
            rules["stage"] = {"scopes": [s.strip() for s in v.split(";")], "evidence": ev}
        elif f == "ecog":
            rules["ecog"] = {"max": int(v), "evidence": ev}
        elif f == "brain_mets":
            rules["brain_mets"] = None if v == "none" else {"rule": v, "evidence": ev}
        elif f in GENES:
            if v == "none":
                rules["genes"].pop(f, None)
            else:
                rules["genes"][f] = {"rule": v, "evidence": ev}
        elif f == "prior_lines":
            lo, hi = v.split("-")
            rules["prior_lines"] = {"min": int(lo), "max": int(hi), "evidence": ev}
        else:
            continue
        t.setdefault("overrides", []).append(f)
        n += 1
    return n


# ---------- 2b. per-pair verdicts and outcomes -> override that patient-trial pair ----------
def apply_pairs(rows):
    n = 0
    for r in rows:
        if r["kind"] not in ("criterion", "outcome") or not r["nct"]:
            continue
        pair = match.PAIRS.setdefault((r["patient"], r["nct"]), {"fields": {}})
        if r["kind"] == "criterion":
            pair["fields"][r["field"]] = r["value"].strip()
        else:
            pair["outcome"] = r["value"].strip()
        n += 1
    return n


# ---------- 3. verdicts and outcomes -> learned weights ----------
def _beta(prior_mean, successes, total):
    a = prior_mean * PRIOR_STRENGTH + successes
    return a / (PRIOR_STRENGTH + total)


def learn_weights(rows, scored):
    """scored: {(patient, nct): result from match.score} for the pairs the nurse saw."""
    # 3a. How often a field the agent left unknown turns out to be met, per field
    seen = {}
    agree = {}
    for r in rows:
        if r["kind"] != "criterion":
            continue
        res = scored.get((r["patient"], r["nct"]))
        if not res:
            continue
        agent = next((l["status"] for l in res["labels"] if l["field"] == r["field"]), None)
        nurse = r["value"].strip()
        if agent == "unknown":
            m, n = seen.get(r["field"], (0, 0))
            seen[r["field"]] = (m + (nurse == "met"), n + 1)
        elif agent in ("met", "not_met"):
            a, n = agree.get(r["field"], (0, 0))
            agree[r["field"]] = (a + (agent == nurse), n + 1)
    unknown_w = {f: round(_beta(match.W["unknown"], m, n), 3) for f, (m, n) in seen.items()}

    # 3b. Enrolment among prescreen-eligible patients, with vs without a fresh biopsy / placebo arm
    out = [r for r in rows if r["kind"] == "outcome"]
    learned = {}
    for flag, key in (("fresh_biopsy", "fresh biopsy required (x0.7)"), ("placebo", "placebo arm (x0.9)")):
        w, wo = [0, 0], [0, 0]
        for r in out:
            res = scored.get((r["patient"], r["nct"]))
            if not res or r["value"] not in ("enrolled", "completed", "dropped_out", "declined"):
                continue  # screen failures, app-only states (interested, prescreen_pass) don't measure enrolment
            enrolled = r["value"] in ("enrolled", "completed", "dropped_out")
            bucket = w if any(key.split(" (")[0] in n for n in res["feasibility_notes"]) else wo
            bucket[0] += enrolled
            bucket[1] += 1
        if w[1] and wo[1]:
            observed = (w[0] / w[1]) / max(wo[0] / wo[1], 1e-6)
            n = w[1]
            learned[flag] = round((match.W[flag] * PRIOR_STRENGTH + observed * n) / (PRIOR_STRENGTH + n), 3)
    return {"unknown_by_field": unknown_w, "feasibility": learned,
            "agent_agreement": {f: f"{a}/{n}" for f, (a, n) in agree.items()},
            "counts": {k: sum(r["kind"] == k for r in rows) for k in ("answer", "rule", "criterion", "outcome")}}


def apply_weights(learned):
    """Install learned weights into the scorer for this run."""
    W = copy.deepcopy(match.W)
    W.update(learned["feasibility"])
    W["unknown_by_field"] = learned["unknown_by_field"]
    match.W.clear()
    match.W.update(W)
