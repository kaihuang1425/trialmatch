"""Run the matcher on every patient.

python run.py                       # uses data/trials.json and the patient spreadsheet
python run.py --home 51.52,-0.13    # add travel distance from a home location (here: UCL, London)
python run.py --refresh             # re-download trials from ClinicalTrials.gov first
"""
import argparse, csv, json, os
from trialmatch.patients import load_patients
from trialmatch.criteria import parse_trial
from trialmatch.match import rank, score

ap = argparse.ArgumentParser()
ap.add_argument("--patients", default="data/lung_cancer_patients.xlsx")
ap.add_argument("--trials", default="data/trials.json")
ap.add_argument("--home", default=None, help="lat,lon for travel distance")
ap.add_argument("--top", type=int, default=5)
ap.add_argument("--out", default="results")
ap.add_argument("--refresh", action="store_true")
ap.add_argument("--llm", type=int, default=0, help="run Gemini on each patient's top N trials (needs credentials)")
ap.add_argument("--feedback", default=None, help="prescreening outcomes CSV to feed back (see trialmatch/feedback.py)")
a = ap.parse_args()

if a.refresh or not os.path.exists(a.trials):
    from fetch_trials import fetch
    fetch(a.trials)

home = tuple(map(float, a.home.split(","))) if a.home else None
patients = load_patients(a.patients)
trials = [parse_trial(s) for s in json.load(open(a.trials))]
trials = [t for t in trials if t["purpose"] == "TREATMENT"]  # drop supportive-care, diagnostic etc.
os.makedirs(a.out, exist_ok=True)

if a.feedback:
    # Human prescreening loop: learn from the nurse's verdicts on the pairs they saw (scored as the
    # agent saw them), then fold in their answers and rule corrections and match again.
    from trialmatch import feedback as fb
    rows = fb.load(a.feedback)
    T0 = {t["nct"]: t for t in trials}
    P0 = {p["id"]: p for p in patients}
    pairs = {(r["patient"], r["nct"]) for r in rows if r["nct"] and r["patient"] in P0 and r["nct"] in T0}
    scored = {k: score(P0[k[0]], T0[k[1]], home) for k in pairs}
    learned = fb.learn_weights(rows, scored)
    fb.apply_weights(learned)
    learned["patients_updated"] = fb.apply_answers(patients, rows)
    learned["trial_rules_corrected"] = fb.apply_rules(trials, rows)
    learned["pair_verdicts_applied"] = fb.apply_pairs(rows)
    json.dump(learned, open(f"{a.out}/feedback_summary.json", "w"), indent=1)
    print("feedback:", json.dumps(learned))

# Patient-to-trial view
results = [rank(p, trials, home, max(a.top, a.llm)) for p in patients]
if a.llm:
    from trialmatch.llm import llm_labels
    from trialmatch.match import rescore
    T = {t["nct"]: t for t in trials}
    for p, r in zip(patients, results):
        for res in r["top"][:a.llm]:
            used = " | ".join(l["trial_evidence"] for l in res["labels"])
            rescore(res, llm_labels(p, T[res["nct"]], used), p)
        r["top"] = sorted([x for x in r["top"] if x["E"] > 0], key=lambda x: -x["score"])[:a.top]
json.dump(results, open(f"{a.out}/patient_matches.json", "w"), indent=1)

with open(f"{a.out}/summary.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["patient", "stage", "possible_trials", "rank", "nct", "score", "E", "F", "unknowns",
                "urgent", "uk_sites", "title"])
    for p, r in zip(patients, results):
        for i, t in enumerate(r["top"], 1):
            unk = ";".join(l["field"] for l in t["labels"] if l["status"] == "unknown")
            w.writerow([p["id"], p["stage"], r["n_possible"], i, t["nct"], t["score"], t["E"], t["F"],
                        unk, t["urgent"], t["uk_sites"], t["title"]])

# Trial-to-patient view: for each trial, which patients should the site call first
by_trial = []
for t in trials:
    cands = [score(p, t, home) | {"patient": p["id"]} for p in patients]
    cands = sorted([c for c in cands if c["E"] > 0], key=lambda c: -c["score"])
    if cands:
        by_trial.append({"nct": t["nct"], "title": t["title"], "uk_sites": t["uk_sites"],
                         "candidates": [{"patient": c["patient"], "score": c["score"], "D": c["D"]} for c in cands[:5]]})
json.dump(by_trial, open(f"{a.out}/trial_to_patients.json", "w"), indent=1)

# Readable report
with open(f"{a.out}/report.md", "w") as fh:
    fh.write("# Trial matches (rule-based layer)\n\n")
    fh.write(f"{len(trials)} recruiting Phase 3 NSCLC trials x {len(patients)} patients. "
             "Scores = E x F x (1 + 0.2D). Unknowns are counted at 0.7 each; nothing is ruled out without "
             "a recorded value. A research nurse confirms every match.\n\n")
    for p, r in zip(patients, results):
        fh.write(f"## {p['id']} ({p['source']}): stage {p['stage']}, {p['histology']}, ECOG {p['ecog']}, "
                 f"PD-L1 {p['pdl1']}\n\n{r['n_possible']} possible trials, {r['removed']} ruled out.\n\n")
        for i, t in enumerate(r["top"][:3], 1):
            flag = " **REFER THIS WEEK**" if t["urgent"] else ""
            fh.write(f"{i}. [{t['nct']}]({t['url']}) {t['title']}: score {t['score']} "
                     f"(E {t['E']}, F {t['F']}){flag}\n")
            for l in t["labels"]:
                mark = {"met": "OK", "not_met": "NO", "unknown": "??"}[l["status"]]
                fh.write(f"    - {mark} {l['field']}: {l['patient_evidence']}\n")
        if r["questions"]:
            fh.write("\nQuestions to ask:\n\n")
            for q in r["questions"]:
                fh.write(f"- {q['question']} (affects {q['trials_affected']} trials)\n")
        fh.write("\n")
print(f"wrote {a.out}/patient_matches.json, summary.csv, trial_to_patients.json, report.md")
