"""Rebuild the TrialMatch app (app/index.html) from the current matcher.

python build_app.py            # after python run.py, or after a --feedback run's code changes
Embeds each patient's top-10 trial pool, the agent's top candidates per trial and the
evidence for every pair into app/template.html.
"""
import json
from trialmatch.patients import load_patients
from trialmatch.criteria import parse_trial
from trialmatch import match

POOL, CANDS = 10, 6
P = load_patients("data/lung_cancer_patients.xlsx")
raw = {s["protocolSection"]["identificationModule"]["nctId"]: s for s in json.load(open("data/trials.json"))}
TT = {n: parse_trial(s) for n, s in raw.items()}
T = [t for t in TT.values() if t["purpose"] == "TREATMENT"]


def params(field, t):
    r = t["rules"]
    if field == "prior_lines" and r["prior_lines"]:
        return {k: v for k, v in r["prior_lines"].items() if k != "evidence"}
    if field == "brain_mets" and r["brain_mets"]:
        return {"rule": r["brain_mets"]["rule"]}
    if field == "ecog" and r["ecog"]:
        return {"max": r["ecog"]["max"]}
    if field in ("pdl1", "stage") and r[field]:
        return {k: v for k, v in r[field].items() if k != "evidence"}
    if field in r["genes"]:
        return {k: v for k, v in r["genes"][field].items() if k != "evidence"}
    return {}


def item(res, t):
    return {"nct": res["nct"], "F": res["F"], "D": res["D"], "urgent": res["urgent"], "notes": res["feasibility_notes"],
            "labels": [{"f": l["field"], "s": l["status"], "pe": l["patient_evidence"], "te": l["trial_evidence"][:240],
                        "why": l["reason"], "p": params(l["field"], t)} for l in res["labels"]]}


def summary(n):
    d = raw[n]["protocolSection"].get("descriptionModule", {}).get("briefSummary", "").strip().replace("\n", " ")
    return (d[:260].rsplit(" ", 1)[0] + "…") if len(d) > 260 else d


patients, used = [], set()
for p in P:
    res = match.rank(p, T, top=POOL)
    pool = [item(r, TT[r["nct"]]) for r in res["top"]]
    used |= {x["nct"] for x in pool}
    patients.append({"id": p["id"], "source": p["source"], "age": int(p["age"]), "sex": p["sex"].title(), "stage": p["stage"],
                     "histology": p["histology"], "ecog": p["ecog"], "prior_lines": p["prior_lines"], "pdl1": p["pdl1"],
                     "bio": p["biomarkers"], "n_possible": res["n_possible"], "pool": pool,
                     "questions": [q["field"] for q in res["questions"]]})
pools = {p["id"]: {x["nct"] for x in p["pool"]} for p in patients}
cands, extra = {}, {}
for n in used:
    scored = sorted(((match.score(p, TT[n]), p) for p in P), key=lambda x: -x[0]["score"])
    cands[n] = [p["id"] for s, p in scored if s["E"] > 0][:CANDS]
    for s, p in scored:
        if p["id"] in cands[n] and n not in pools[p["id"]]:
            extra[f"{p['id']}|{n}"] = item(s, TT[n])
trials = {n: {"nct": n, "title": TT[n]["title"], "summary": summary(n), "uk": TT[n]["uk_sites"], "placebo": TT[n]["placebo"],
              "biopsy": bool(TT[n]["rules"]["biopsy"] and TT[n]["rules"]["biopsy"]["fresh_required"]),
              "sponsor": raw[n]["protocolSection"].get("sponsorCollaboratorsModule", {}).get("leadSponsor", {}).get("name", ""),
              "phase": "/".join(x.replace("PHASE", "Phase ") for x in TT[n]["phases"]),
              "status": TT[n]["status"].replace("_", " ").title(), "n_candidates": len(cands[n])} for n in used}
data = {"n_trials": len(T), "patients": patients, "trials": trials, "candidates": cands, "extra": extra}
html = open("app/template.html").read().replace("__DATA__", json.dumps(data, separators=(",", ":")).replace("</", "<\\/"))
html = html.replace("function itemFor(pid, nct) { return PAT[pid].pool.find((x) => x.nct === nct); }",
                    "function itemFor(pid, nct) { return PAT[pid].pool.find((x) => x.nct === nct) || D.extra[`${pid}|${nct}`]; }")
open("app/index.html", "w").write(html)
print(f"wrote app/index.html ({len(html) // 1024} KB): {len(patients)} patients, {len(trials)} trials")
