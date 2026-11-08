# Trial Match: offline matching test

**Synthetic data only.** 2,400 synthetic patients (20 batches of 120, seeds 2026 to 2045) × 19 synthetic trials = **45,600 patient–trial pairs**. Run on 2026-11-08 with `npm run eval`. These numbers say how the matching step behaves on patients we generated ourselves, labelled by rules we wrote. They are not real-world accuracy, enrolment or benefit.

To rerun it from the `trial-match-vercel` folder (Node 22 or later, nothing to install):

```bash
npm run eval
```

Everything except the date above comes out the same on every run. It also writes `results.json` (all the numbers), and for the first batch (seed 2026) `pairs.csv` (every pair with its label and both answers) and `cohort.json` (every patient's true state and record).

## Results on all 19 demo trials

| | Registry search | Trial Match: “All rules met” | Trial Match: “All met” + “to check” |
|---|---|---|---|
| Pairs listed as a match | 40,140 | 1,268 | 3,753 |
| Share of listed pairs that are wrong (patient not truly eligible) | **92.7%** (37,190) | **0%** (0) | 21% (803) |
| Truly eligible pairs found (recall), of 2,950 | 100% (2,950) | **43%** (1,268) | **100%** (2,950) |
| Trials to review per patient | **16.7** | **0.5** | **1.6** |
| Fewer trials to review than registry search | | 31.7× | 10.7× |
| Truly eligible pairs ruled out (“not met”) | n/a | 0 | 0 |

On average a patient is truly eligible for 1.2 of the 19 trials.

- **“All rules met”** is the app's "strong" match: every entry rule is met by a value in the record. This is the list a patient's agent would apply from.
- **“To check”** is the app's "possible" match: nothing rules the patient out, but at least one rule needs a fact the record doesn't have yet. The app shows the missing fact, for a nurse or the patient to settle. 2,485 pairs were "to check", and 1,682 of them (68%) were truly eligible once the hidden facts are known.
- **No truly eligible pair was ruled out.** Of 92,610 "not met" rule results, 0 were for a rule the patient truly passes: each "not met" came from a recorded value that fails the rule, and a missing fact gave "to check" instead. The stage is always recorded in this run; the what-ifs below show what happens when it isn't.
- **How many real matches reach "all rules met" depends on how complete the records are.** With no gaps it would be all of them (see the criterion check below). The gaps are our choice (listed below). The app also asks the patient about some of them (brain scan, PD-L1, gene tests, dates of treatment), which isn't modelled here. Truly eligible pairs that stayed "to check" were mostly waiting on: "Blood counts: neutrophils ≥1.5, platelets ≥100" (774), "No untreated or symptomatic brain metastases" (474), "Kidney function: creatinine clearance ≥45 mL/min" (271), "Liver function: bilirubin ≤1.5× upper limit" (201), "Fitness (ECOG) 0–1" (194).

### How much the numbers move between batches

The same measures for each batch of 120 patients on its own, lowest to highest across the 20 batches:

| | Registry search | Trial Match: “All rules met” | Trial Match: “All met” + “to check” |
|---|---|---|---|
| Share of listed pairs that are wrong | 90.1% to 94.5% | 0% | 14% to 28% |
| Recall | 100% | 27% to 57% | 100% |
| Trials to review per patient | 16.7 | 0.3 to 0.8 | 1.2 to 2.2 |
| Fewer trials to review than registry search | | 20.7× to 52.8× | 7.6× to 13.7× |

## Numbers for the landing page's Results section

The measured value for each slot on the page, pooled over all batches. The page should also say they come from synthetic patients.

| Slot | Measured |
|---|---|
| Registry search: share of "eligible" matches that were wrong | 92.7% |
| Trial Match: share wrong | 0% of "all rules met" (21% once "to check" is included) |
| "With every real match still found" | 100% of real matches are "all rules met" or "to check"; 43% are "all rules met" |
| "N× less to review" | 10.7× counting "to check" (31.7× for "all rules met" alone) |
| "X trials per patient instead of Y" | 1.6 counting "to check" (0.5 for "all rules met" alone), instead of 16.7 |
| Small print: pair count | 45,600 synthetic patient–trial pairs (2,400 patients × 19 trials) |

## What each side does

- **Registry search.** What a ClinicalTrials.gov search filters on: condition, phase and recruiting status (the same filters Trial Scout sends, see `lib/ctgov.js`). It doesn't read entry rules, so it lists every recruiting phase III trial for the patient's diagnosis. Each synthetic trial's registry condition comes from its diagnosis rule (LT-308 is small cell; the rest are non-small cell). The patient searches for their own diagnosis, which is kinder to the baseline than a plain "lung cancer" search (that would list all 19 trials for everyone). All demo trials are phase III and recruiting, so those two filters remove nothing here.
- **Trial Match.** The deployed matcher, read straight from `public/app/index.html` (the rule helpers, the 19 trials and `evaluate()`; SHA-256 of that code `81f3bfdf5e366156`). It sees only the record. Its tier is used as is: "strong" (all rules met), "possible" (to check) or "not". Travel limits and other preferences only change the app's score, not the tier, and neither side uses them here.

## How the synthetic patients and labels were made

1. **Patients.** Each batch of 120 has fixed shares of nine kinds of referral (table below). Within each kind, the facts are drawn at random from a seeded generator: EGFR subtype, PD-L1 band, earlier treatments and whether the cancer grew, weeks since treatment, fitness (ECOG 0–3), brain spread (none, treated and stable, untreated), autoimmune disease (6%), lung disease (4%), infection (3%), and blood counts, kidney and liver results from normal-shaped spreads that put a few percent outside each trial's limits. The shares and rates are our choices, picked so every trial has some eligible patients. They are not estimates of the UK population.
2. **True state and record.** Each patient has a complete true state with every fact known. The matcher gets a record made from it with ordinary gaps, each written the way the app writes "unknown": no gene panel (12% of adenocarcinoma, 35% of squamous; never for small cell), PD-L1 not reported (20%; 80% for small cell), ECOG not written down (10%), no recent brain scan (30% of stage IV and extensive stage), no recent bloods (30%, plus 5% per single test), latest scan not reported (12% of treated patients), date of last treatment missing (15%), end of chemoradiotherapy missing (15%). Values that are in the record are correct, and yes/no facts are always recorded.
3. **Labels.** A pair is truly eligible when every entry rule of the trial is met by the true state. The label rules are in `scripts/eval.mjs` (`GOLD`), written from each criterion's wording with thresholds read from the text, separately from the app's rule code. **Criterion check:** run on the complete true states, the app's own rules agree with the label rules on 326,400 of 326,400 criterion checks. No clinician reviewed the labels.

| Kind of patient | Share | Truly eligible per patient | Registry search per patient | All rules met per patient | Incl. "to check" per patient |
|---|---|---|---|---|---|
| EGFR-positive, after an EGFR tablet | 20% | 4.2 | 18.0 | 1.8 | 5.1 |
| EGFR-positive, untreated | 4.2% | 0.0 | 18.0 | 0.0 | 0.0 |
| ALK-positive | 5.8% | 0.8 | 18.0 | 0.5 | 0.8 |
| KRAS G12C | 8.3% | 0.5 | 18.0 | 0.2 | 0.6 |
| No EGFR/ALK, untreated stage IV | 28% | 0.6 | 18.0 | 0.2 | 0.9 |
| No EGFR/ALK, after first treatment | 12% | 0.3 | 18.0 | 0.1 | 0.5 |
| Stage III, after chemoradiotherapy | 8.3% | 0.3 | 18.0 | 0.2 | 0.6 |
| Operable stage II–IIIA | 5.8% | 0.8 | 18.0 | 0.6 | 0.8 |
| Small cell lung cancer | 7.5% | 0.4 | 1.0 | 0.2 | 0.4 |

## Per trial

| Trial | Rules | Truly eligible | Registry search lists | All rules met (wrong) | To check (truly eligible) | Truly eligible ruled out |
|---|---|---|---|---|---|---|
| LT-301 A new targeted tablet after EGFR treatment stops working | 9 | 130 | 2,220 | 39 (0) | 131 (91) | 0 |
| LT-302 A newer ALK tablet as a first treatment | 5 | 103 | 2,220 | 63 (0) | 216 (40) | 0 |
| LT-303 A KRAS G12C tablet combination after earlier treatment | 8 | 45 | 2,220 | 13 (0) | 64 (32) | 0 |
| LT-304 Immunotherapy combination for high PD-L1 | 8 | 125 | 2,220 | 52 (0) | 132 (73) | 0 |
| LT-305 Adding a new antibody to chemo-immunotherapy | 8 | 301 | 2,220 | 107 (0) | 236 (194) | 0 |
| LT-306 Immunotherapy after chemoradiotherapy for stage III | 7 | 57 | 2,220 | 36 (0) | 31 (21) | 0 |
| LT-307 Immunotherapy before and after surgery | 5 | 112 | 2,220 | 80 (0) | 33 (32) | 0 |
| LT-308 A new antibody for extensive small cell lung cancer | 7 | 64 | 180 | 28 (0) | 48 (36) | 0 |
| LT-309 An antibody–drug conjugate after earlier treatment | 8 | 250 | 2,220 | 78 (0) | 246 (172) | 0 |
| LT-310 A two-target antibody with chemotherapy after EGFR treatment | 9 | 120 | 2,220 | 36 (0) | 126 (84) | 0 |
| LT-311 A HER3-targeted antibody–drug conjugate | 8 | 147 | 2,220 | 63 (0) | 115 (84) | 0 |
| LT-312 Adding a TROP2 antibody–drug conjugate to the EGFR tablet | 7 | 238 | 2,220 | 88 (0) | 183 (150) | 0 |
| LT-313 Keeping the EGFR tablet and adding chemotherapy | 7 | 162 | 2,220 | 80 (0) | 114 (82) | 0 |
| LT-314 Targeted radiotherapy for a few growing spots | 6 | 214 | 2,220 | 121 (0) | 116 (93) | 0 |
| LT-315 A next-generation EGFR tablet for resistance changes | 8 | 149 | 2,220 | 44 (0) | 141 (105) | 0 |
| LT-316 Immunotherapy and a blood-vessel blocker with chemotherapy | 8 | 204 | 2,220 | 101 (0) | 137 (103) | 0 |
| LT-317 A brain-reaching EGFR tablet for spread to the brain | 5 | 144 | 2,220 | 84 (0) | 126 (60) | 0 |
| LT-318 The two-target antibody as a quick injection | 7 | 187 | 2,220 | 78 (0) | 134 (109) | 0 |
| LT-319 A fresh biopsy to choose the next targeted treatment | 6 | 198 | 2,220 | 77 (0) | 156 (121) | 0 |

## What if the record is silent?

The main run assumes recorded values are right and that yes/no facts (earlier treatments, autoimmune disease, lung disease, infection) are always recorded. The app has no "unknown" for those facts, so a record that says nothing reads as "no". Each what-if applies one gap to every record, for the same patients. It shows how big the failure is at its worst, not how often it happens.

| | “All rules met”: wrong | Real matches that are "all rules met" or "to check" | Truly eligible pairs ruled out |
|---|---|---|---|
| Main run | 0% (0 of 1,268) | 100% | 0 |
| The record never mentions autoimmune disease, lung disease, infection or earlier immunotherapy, even when the patient has them | 4.3% (57 of 1,312) | 98.3% | 51 |
| The stage is missing from the record | 0% (0 of 0) | 0% | 2,950 |

- **The record never mentions autoimmune disease, lung disease, infection or earlier immunotherapy, even when the patient has them:** the wrong "all rules met" pairs truly fail "No autoimmune disease treated in the last 2 years" (37), "No interstitial lung disease or pneumonitis" (14), "No pneumonitis after radiotherapy" (3), "No earlier immunotherapy" (2); truly eligible pairs are ruled out by "Cancer grew after platinum chemotherapy and immunotherapy" (45), "Cancer grew after at least one earlier treatment for advanced disease" (6).
- **The stage is missing from the record:** truly eligible pairs are ruled out by "Non-small cell lung cancer, stage IV" (2,614), "Non-small cell lung cancer, stage II–IIIA, operable" (112), "Non-small cell lung cancer, stage III not operable or stage IV" (103), "Small cell lung cancer, extensive stage" (64).

The first gap is why the Records Reader, the Skeptic quote check and the trial team's own screening stay in the loop. The second is a fault in the rules: an unknown stage should give "to check", not "not met".

## The first nine trials only (LT-301 to LT-309)

LT-310 to LT-319 are ten extra trials for EGFR-positive cancer that grew on an EGFR tablet. On LT-301 to LT-309 alone (2,400 × 9 = 21,600 pairs): registry search lists 7.5 trials per patient and 93.4% of them are wrong. Trial Match lists 0.2 with all rules met (0% wrong, recall 42%), and 0.7 counting "to check" (27% wrong, recall 100%). That is 11.0× fewer to review counting "to check", or 36.2× for "all rules met" alone.

## Limits

- **The labels and the matcher come from the same criteria.** Both are our reading of each rule's wording. So "0% wrong" mostly shows that the code does what its criteria say and treats missing facts as unknown. It is not independent evidence of clinical accuracy, and real trial protocols have many more rules than these.
- **Reading the record isn't tested here.** The main run assumes recorded values are right. The Records Reader's quote check is tested separately (`npm test`). The what-ifs show what happens when the record is silent.
- **The cohort mix drives the registry number.** Most demo trials need one narrow profile (EGFR-positive after an EGFR tablet), so most people a registry search lists for them can't join. A different mix gives a different share. The per-kind table shows how.
- **The record gaps drive the "all rules met" recall.** Fewer gaps means more real matches are "all rules met" and fewer are "to check".
- **The baseline is a simple one.** A person searching ClinicalTrials.gov can also type a gene name or read each trial's rules. We compare against the filters alone.
- **Not tested:** the MedGemma pre-check for live ClinicalTrials.gov trials, travel limits and other preferences, and whether a trial still has places.
