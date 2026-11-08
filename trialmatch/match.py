"""Eligibility Checker, Verifier rule, Feasibility Scorer, Ranker and Interviewer questions.

Score = E x F x (1 + 0.2 D)
  E: 1.0 per met criterion, 0.7 per unknown, any not-met -> 0 (trial removed)
  F: 0.8 x 0.7 if a fresh biopsy is required x 0.9 if there is a placebo arm
       x travel factor (only when a home location is given)
  D: 1 if the patient is in a group lung cancer trials historically under-enrol
     (age 70+ or Black). Population-level evidence, not trial-specific enrolment.
Only the biopsy penalty comes from published data (screen-failure 49.1% vs 26.5%,
Spiegel et al., Cancer 2017). Every other weight is a team assumption and is tunable.
"""
import math
import re

W = {"unknown": 0.7, "base_F": 0.8, "fresh_biopsy": 0.7, "placebo": 0.9,
     "travel_100km": 0.85, "travel_200km": 0.7, "diversity": 0.2}

MET, FAIL, UNK = "met", "not_met", "unknown"

# Nurse prescreen results for specific patient-trial pairs, filled by feedback.apply_pairs:
# {(patient_id, nct): {"fields": {field: "met"|"not_met"}, "outcome": "...", "note": "..."}}
PAIRS = {}


def _lab(field, status, patient_ev, trial_ev, reason):
    return {"field": field, "status": status, "patient_evidence": patient_ev,
            "trial_evidence": trial_ev, "reason": reason}


STAGE_FIT = {
    "I": {"early"},
    "II": {"early"},
    "IIIA": {"early", "stage3_unresectable"},
    "III": {"early", "stage3_unresectable"},
    "IIIB-C": {"stage3_unresectable", "advanced"},
    "IV": {"advanced"},
}


def check(patient, trial):
    """Label each structured criterion met / not_met / unknown, quoting both sides."""
    r, ev, labels = trial["rules"], patient["evidence"], []

    a = r["age"]
    if (a["min"] and patient["age"] < a["min"]) or (a["max"] and patient["age"] > a["max"]):
        labels.append(_lab("age", FAIL, ev["age"], f"Age {a['min']}-{a['max'] or 'no limit'}",
                           "Outside the trial's age range at diagnosis."))
    if r["sex"] not in ("ALL", patient["sex"]):
        labels.append(_lab("sex", FAIL, ev["sex"], f"Sex: {r['sex']}", "Trial enrols one sex only."))

    if r["stage"]:
        scopes = set(r["stage"]["scopes"])
        st = patient["stage"]
        if st == "unknown":
            labels.append(_lab("stage", UNK, ev["stage"], r["stage"]["evidence"], "Stage not in record."))
        else:
            fit = STAGE_FIT[st] & scopes
            num = {"I": 1, "II": 2, "IIIA": 3, "III": 3, "IIIB-C": 3, "IV": 4}[st]
            lo, hi = r["stage"].get("min_num"), r["stage"].get("max_num")
            if fit and ((lo and num < lo) or (hi and num > hi)):
                labels.append(_lab("stage", FAIL, ev["stage"], r["stage"]["evidence"],
                                   f"Trial enrols stage {lo}-{hi} (as numbers); patient is stage {st}."))
            elif not fit:
                labels.append(_lab("stage", FAIL, ev["stage"], r["stage"]["evidence"],
                                   f"Trial enrols {', '.join(sorted(scopes))}; patient is stage {st}."))
            elif st in ("IIIA", "III") and fit != STAGE_FIT[st]:
                labels.append(_lab("stage", UNK, ev["stage"], r["stage"]["evidence"],
                                   "Stage III: depends on whether the tumour can be removed by surgery."))
            else:
                labels.append(_lab("stage", MET, ev["stage"], r["stage"]["evidence"], "Disease stage fits."))
    else:
        labels.append(_lab("stage", UNK, ev["stage"], "No stage line parsed", "Check stage wording by hand."))

    if r["histology"]:
        need, has = r["histology"]["required"], patient["histology"]
        status = UNK if has == "unknown" else (MET if need == has else FAIL)
        labels.append(_lab("histology", status, ev["histology"], r["histology"]["evidence"],
                           f"Trial requires {need} NSCLC."))

    if not r["ecog"]:
        labels.append(_lab("ecog", UNK, ev["ecog"], "ECOG limit not parsed",
                           "Trial's fitness limit not parsed: LLM or nurse to check."))
    else:
        mx = r["ecog"]["max"]
        if patient["ecog"] is None:
            labels.append(_lab("ecog", UNK, ev["ecog"], r["ecog"]["evidence"], f"Trial needs ECOG 0-{mx}; not recorded."))
        else:
            labels.append(_lab("ecog", MET if patient["ecog"] <= mx else FAIL, ev["ecog"], r["ecog"]["evidence"],
                               f"Trial needs ECOG 0-{mx}."))

    for g, rule in r["genes"].items():
        pstat = patient["biomarkers"].get(g, "unknown")
        pev = ev.get(g, f"{g}: not in record")
        kind = rule["rule"]
        if g == "EGFR" and pstat == "positive" and kind == "excluded" and rule.get("sensitising_only") \
                and patient["biomarkers"]["EGFR_type"] != "sensitising":
            labels.append(_lab(g, UNK, pev, rule["evidence"],
                               "Trial excludes sensitising EGFR; this mutation type needs a clinician's call."))
            continue
        if kind == "conditional":
            status = MET if pstat == "negative" else UNK
            reason = "Allowed only in some cases (e.g. after targeted therapy): needs a human check."
        elif kind == "required":
            status = {"positive": MET, "negative": FAIL}.get(pstat, UNK)
            if g == "EGFR" and pstat == "positive" and patient["biomarkers"]["EGFR_type"] != "sensitising":
                status = UNK
            if g == "EGFR" and status == MET and rule.get("specific_variant"):
                labels.append(_lab(g, UNK, pev, rule["evidence"],
                                   "Trial wants specific EGFR variants: a clinician must confirm this one qualifies."))
                continue
            if g == "EGFR" and status == MET and rule.get("classical_only") and \
                    not re.search(r"exon ?19|L858R", patient["evidence"]["EGFR"], re.I):
                status, reason = UNK, "Trial asks for classical EGFR (exon 19 / L858R); this mutation needs a clinician's call."
                labels.append(_lab(g, status, pev, rule["evidence"], reason))
                continue
            reason = f"Trial requires a {g} alteration."
        else:  # excluded
            status = {"positive": FAIL, "negative": MET}.get(pstat, UNK)
            reason = f"Trial excludes {g}-positive tumours."
        labels.append(_lab(g, status, pev, rule["evidence"], reason))

    if r["pdl1"]:
        p, rule = patient["pdl1"], r["pdl1"]
        if p is None:
            labels.append(_lab("pdl1", UNK, ev["pdl1"], rule["evidence"], "PD-L1 score needed."))
        else:
            ok = True
            if "min" in rule and p < rule["min"]:
                ok = False
            if "max_below" in rule and p >= rule["max_below"]:
                ok = False
            if "max_incl" in rule and p > rule["max_incl"]:
                ok = False
            labels.append(_lab("pdl1", MET if ok else FAIL, ev["pdl1"], rule["evidence"], "PD-L1 threshold."))

    if not r["prior_lines"] and r["stage"] and "advanced" in r["stage"]["scopes"]:
        labels.append(_lab("prior_lines", UNK, ev["prior_lines"], "Treatment-line rule not parsed",
                           "Trial's prior-treatment rule not parsed: LLM or nurse to check."))
    if r["prior_lines"]:
        n, rule = patient["prior_lines"], r["prior_lines"]
        if n is None:
            labels.append(_lab("prior_lines", UNK, ev["prior_lines"], rule["evidence"], "Treatment history needed."))
        else:
            ok = (n >= rule.get("min", 0)) and (n <= rule.get("max", 99))
            labels.append(_lab("prior_lines", MET if ok else FAIL, ev["prior_lines"], rule["evidence"],
                               "Number of earlier treatment lines."))

    if r["brain_mets"]:
        bm, rule = patient["brain_mets"], r["brain_mets"]
        if bm == "unknown":
            labels.append(_lab("brain_mets", UNK, ev["brain_mets"], rule["evidence"], "Brain scan result needed."))
        else:
            ok = (bm != "active") if rule["rule"] == "active_excluded" else (bm == "none")
            labels.append(_lab("brain_mets", MET if ok else FAIL, ev["brain_mets"], rule["evidence"],
                               "Brain metastases rule."))
    return labels


def eligibility(labels, skip_source=None):
    """1.0 if everything is met; each unknown multiplies by its field's weight (learned from
    prescreening when available, else the default); any not-met gives 0."""
    if any(l["status"] == FAIL for l in labels):
        return 0.0
    per_field = W.get("unknown_by_field", {})
    e = 1.0
    for l in labels:
        if l["status"] == UNK and (skip_source is None or l.get("source") != skip_source):
            e *= per_field.get(l["field"], W["unknown"])
    return e


def verify(labels, record_text=None):
    """Verifier rule: a 'not met' must rest on a recorded value, otherwise it becomes 'unknown'.
    For LLM labels, the quoted evidence must also appear word for word in the patient record."""
    for l in labels:
        pe = (l.get("patient_evidence") or "none")
        unsupported = ("not in record" in pe.lower() or "not recorded" in pe.lower() or pe.lower() == "none"
                       or (record_text is not None and l.get("source") == "gemini" and pe not in record_text))
        if l["status"] == FAIL and unsupported:
            l["status"], l["reason"] = UNK, l["reason"] + " (downgraded: no recorded evidence)"
    return labels


def _km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def feasibility(trial, home=None):
    f, notes = W["base_F"], []
    bx = trial["rules"]["biopsy"]
    if bx and bx["fresh_required"]:
        f *= W["fresh_biopsy"]
        notes.append("fresh biopsy required (x0.7)")
    if trial["placebo"]:
        f *= W["placebo"]
        notes.append("placebo arm (x0.9)")
    nearest = None
    if home:
        d = [_km(home, (s["geo"]["lat"], s["geo"]["lon"])) for s in trial["sites"] if s.get("geo")]
        if d:
            nearest = min(d)
            if nearest > 200:
                f *= W["travel_200km"]
                notes.append(f"nearest site {nearest:.0f} km (x0.7)")
            elif nearest > 100:
                f *= W["travel_100km"]
                notes.append(f"nearest site {nearest:.0f} km (x0.85)")
        else:
            f *= W["travel_100km"]
            notes.append("no sites listed yet (x0.85, assumption)")
    return min(f, 1.0), notes, nearest


def diversity(patient):
    return 1.0 if (patient["age"] >= 70 or "Black" in patient["race"]) else 0.0


def score(patient, trial, home=None):
    labels = verify(check(patient, trial))
    pair = PAIRS.get((patient["id"], trial["nct"]))
    if pair:
        for l in labels:
            if l["field"] in pair["fields"]:
                l["status"] = pair["fields"][l["field"]]
                l["patient_evidence"] = "Nurse prescreen verdict"
        if pair.get("outcome") in ("screen_failed", "declined"):
            labels.append(_lab("prescreen", FAIL, f"Prescreen outcome: {pair['outcome']}", "Human prescreen",
                               "Removed after prescreening."))
    E = eligibility(labels)
    F, fnotes, nearest = feasibility(trial, home)
    D = diversity(patient)
    S = E * F * (1 + W["diversity"] * D)
    urgent = (E > 0 and patient["stage"] in ("IV", "IIIB-C") and (patient["ecog"] or 0) >= 1)
    return {"nct": trial["nct"], "title": trial["title"], "url": trial["url"], "uk_sites": trial["uk_sites"],
            "score": round(S, 3), "E": round(E, 3), "F": round(F, 3), "D": D,
            "feasibility_notes": fnotes, "prescreen": (pair or {}).get("outcome"), "nearest_site_km": nearest, "urgent": urgent,
            "labels": labels,
            "left_for_llm_or_nurse": _remaining(trial, labels),
            }


def _remaining(trial, labels):
    used = " | ".join(l["trial_evidence"] for l in labels)
    return sum(1 for line in trial["inclusion"] + trial["exclusion"] if line not in used)


QUESTIONS = {
    "stage": "Has the cancer spread outside the chest, or could it still be removed by surgery?",
    "ecog": "Which best describes your day-to-day activity: fully active, light work only, up and about but can't work, or mostly in a bed or chair?",
    "brain_mets": "Have you had a brain scan since diagnosis, and did it show any spread to the brain?",
    "prior_lines": "How many different cancer treatments (chemotherapy, immunotherapy, targeted pills) have you had since diagnosis?",
    "pdl1": "Do you know your tumour's PD-L1 score (a percentage on your pathology report)?",
    "EGFR": "Has your tumour been tested for an EGFR mutation? What did it show?",
    "ALK": "Has your tumour been tested for an ALK change? What did it show?",
    "ROS1": "Has your tumour been tested for a ROS1 change? What did it show?",
    "RET": "Has your tumour been tested for a RET change?",
    "KRAS_G12C": "Has your tumour been tested for KRAS G12C?",
    "KRAS_G12D": "Has your tumour been tested for KRAS G12D?",
    "BRAF_V600E": "Has your tumour been tested for BRAF V600E?",
    "MET_ex14": "Has your tumour been tested for a MET exon 14 change?",
    "histology": "Was your lung cancer described as squamous or non-squamous (e.g. adenocarcinoma)?",
}
TEST_ONLY = {"EGFR", "ALK", "ROS1", "RET", "KRAS_G12C", "KRAS_G12D", "BRAF_V600E", "MET_ex14", "pdl1"}


def interview(results, max_q=5):
    """Ask first about the unknown that appears in the most candidate trials."""
    counts = {}
    for res in results:
        if res["E"] == 0:
            continue
        for l in res["labels"]:
            if l["status"] == UNK:
                counts[l["field"]] = counts.get(l["field"], 0) + 1
    order = sorted(counts.items(), key=lambda kv: -kv[1])[:max_q]
    return [{"field": f, "trials_affected": n,
             "question": QUESTIONS.get(f, f"Can you tell us about: {f}?"),
             "if_never_tested": "needs testing (ask your oncologist)" if f in TEST_ONLY else None}
            for f, n in order]


def rescore(res, extra, patient):
    """Add LLM labels to a scored trial, re-verify, and recompute E and the score."""
    record = "\n".join(patient["evidence"].values())
    labels = res["labels"] + verify(extra, record)
    E = eligibility(labels, skip_source="gemini")
    # LLM unknowns (consent, labs...) are things every screening checks; they are listed, not penalised
    res.update(labels=labels, E=round(E, 3), score=round(E * res["F"] * (1 + W["diversity"] * res["D"]), 3))
    return res


def rank(patient, trials, home=None, top=5):
    results = [score(patient, t, home) for t in trials]
    mets = lambda r: sum(l["status"] == MET for l in r["labels"])
    eligible = sorted([r for r in results if r["E"] > 0], key=lambda r: (r.get("prescreen") != "enrolled", -r["score"], -mets(r), -r["uk_sites"]))
    return {"patient": patient["id"], "n_trials": len(trials), "n_possible": len(eligible),
            "top": eligible[:top], "questions": interview(eligible),
            "removed": len(results) - len(eligible)}
