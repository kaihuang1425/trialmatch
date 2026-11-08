# TrialMatch

**Swipe-to-match for lung cancer clinical trials, with a nurse in the loop.**
AgentVerse 2026 · Biotech track · *Make the path to patients faster*

Most Phase III trials miss their recruitment timeline, and lung cancer trials are especially hard to fill. They have more eligibility criteria every year, they depend on biomarkers, and patients can get too unwell to join while they wait to be screened. TrialMatch ranks recruiting Phase III non-small cell lung cancer (NSCLC) trials by how likely a patient is to **succeed** in each one: be eligible, enrol, and stay to the end. A research nurse prescreens every match, and their results feed back into the matcher.

- **Patients** swipe through a short list of their best-fitting trials, answer a few quick questions that re-score every trial live, and tap a card to see why it fits.
- **Staff** prescreen candidates for a trial, with the evidence for every criterion, and confirm or reject what the agent couldn't settle.
- **It's a match** when the patient is interested *and* the nurse passes them at prescreen.

## Quick start

```bash
pip install -r requirements.txt
python run.py                       # match 30 patients x 205 recruiting Phase 3 NSCLC treatment trials -> results/
python build_app.py                 # rebuild the app from the matcher -> app/index.html
python -m pytest -q tests           # parser tests
```

Open `app/index.html` in a browser: no server or install needed.

Other options:

```bash
python run.py --refresh                                    # re-download trials from ClinicalTrials.gov first
python run.py --home 51.5246,-0.1340                       # add travel distance from a home location
python run.py --feedback data/prescreen_outcomes_DEMO.csv  # feed nurse prescreening back in (demo rows are synthetic)
python run.py --llm 3                                      # optional Gemini pass over remaining criteria (needs GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT)
```

## How it works

1. **Trial Scout** (`fetch_trials.py`): recruiting and not-yet-recruiting Phase 3 NSCLC trials from the ClinicalTrials.gov API v2. Snapshot of 7 Nov 2026: 210 trials, 205 with treatment as their primary purpose, 46 with UK sites.
2. **Criteria Parser** (`trialmatch/criteria.py`): turns free-text eligibility into the fields that decide most NSCLC matches. These are stage range, histology, ECOG limit, required or excluded biomarkers (EGFR, ALK, ROS1, KRAS G12C/G12D, BRAF V600E, RET, MET exon 14), PD-L1 threshold, prior treatment lines, brain metastases, fresh biopsy and placebo arm. Each field keeps the criterion line it came from.
3. **Eligibility Checker** (`trialmatch/match.py`): labels each criterion *met / not met / unknown*, quoting both the patient record and the trial text.
4. **Verifier**: a "not met" without a recorded value becomes "unknown", so nobody is ruled out on missing data.
5. **Interviewer**: turns unknowns into plain questions, asking first the one that settles the most trials. Untested biomarkers become "needs testing", never "no".
6. **Feasibility and ranking**: `Score = E x F x (1 + 0.2D)`
   - **E**, eligibility: each unknown x0.7, and any criterion not met removes the trial.
   - **F**, feasibility: 0.8 base. Fresh biopsy required x0.7, from screen-failure rates of 49.1% vs 26.5% (Spiegel et al., *Cancer* 2017). Placebo arm x0.9. Distant sites x0.85 / x0.7.
   - **D**, a boost for groups lung cancer trials under-enrol (age 70+, Black patients). It only ever raises a score.
   - Patients at stage IIIB–IV with ECOG 1 or more are flagged "refer this week".
   - Apart from the biopsy penalty, the weights are team assumptions, tunable in `W` in `trialmatch/match.py`.
7. **Prescreening loop** (`trialmatch/feedback.py`): the nurse's prescreen log feeds back in four ways.
   - Patient answers fill gaps in the record.
   - Corrections to a misread trial rule are saved for that trial.
   - Verdicts on a specific patient–trial pair override the agent; a screen failure or decline removes it, and an enrolled pair is listed first.
   - Outcomes re-estimate the weights (Beta-Binomial, starting from the team's guesses).
8. **Gemini pass** (`trialmatch/llm.py`, optional): checks the criteria the parser doesn't model (labs, comorbidities, other drugs) for each patient's top trials. Not run in the offline build.

## The app (`app/index.html`)

- **Patient mode**
  - **Swipe:** a minimal card per trial. Tap it for details underneath.
  - **Questions:** one at a time, re-scoring every trial live.
  - **My picks:** your trials and their status, with details inline.
- **Staff mode**
  - **Prescreen:** pick a trial and swipe on candidates. Interested patients come first; criteria and evidence are tucked behind a toggle, with Confirm met / Not met buttons.
  - **Dashboard:** matches, candidate pools, and the prescreen log. The log copies out in the exact format `run.py --feedback` reads.
- **Demo state** is kept in the browser; reset it from the staff Dashboard.

## Data

| Data | Source | Notes |
| --- | --- | --- |
| Trials | [ClinicalTrials.gov API v2](https://clinicaltrials.gov/data-api/api) (US National Library of Medicine) | Snapshot in `data/trials.json`, 7 Nov 2026 |
| Patients | `data/lung_cancer_patients.xlsx`: 30 de-identified records from public cBioPortal studies ([TCGA LUAD](https://www.cbioportal.org/study/summary?id=luad_tcga), [TCGA LUSC](https://www.cbioportal.org/study/summary?id=lusc_tcga), [MSKCC NSCLC 2018](https://www.cbioportal.org/study/summary?id=nsclc_pd1_msk_2018)) | Sources and limits in `docs/Patient_Data_Report.docx`. Treated as snapshots at diagnosis |
| Prescreen outcomes | `data/prescreen_outcomes_DEMO.csv` | **Synthetic**, hand-written to show the feedback loop. Never reported as performance |

No identifiable or private patient data is used.

## Evaluation and limits

The rule-based parser was hand-checked against raw trial text. It got 85% of fields right on a 12-trial tuning sample before fixes, and 92% (58/63) on 8 held-out trials after them. Method, fixes and known blind spots are in [`docs/EVALUATION.md`](docs/EVALUATION.md). Results are a demonstration on public research data, not real-world performance. TrialMatch recommends and explains; a research nurse confirms every match, and the tool never enrols anyone or tells a patient they qualify.

## Repo layout

```
app/            index.html (built app), template.html (app source)
data/           trials snapshot, patient records, synthetic prescreen demo
docs/           evaluation notes, patient data report
results/        matcher output; results_after_feedback_DEMO/ shows the loop
tests/          parser unit tests
trialmatch/     patients.py, criteria.py, match.py, feedback.py, llm.py
run.py          run the matcher      fetch_trials.py   download trials      build_app.py   rebuild the app
```
