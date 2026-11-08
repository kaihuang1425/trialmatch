# How we checked the matcher

No labelled answer key exists for these 30 patients against today's recruiting trials, so we checked the part that decides every match: the criteria parser. Each check compared the parsed fields with the trial's raw eligibility text, read by hand.

| Check | Trials | Fields judged | Correct | Accuracy |
| --- | --- | --- | --- | --- |
| Tuning sample, first version | 12 random treatment trials | 96 | 82 | 85% |
| Same 12 after fixes | 12 | 96 | 95 | 99% (tuned on these, so optimistic) |
| Held-out sample after fixes | 8 new random trials | 63 | 58 | 92% |

Fields judged per trial: stage, histology, ECOG limit, prior treatment lines, biomarker rules, PD-L1 threshold, brain metastases, fresh biopsy. One held-out field was too unclear to judge and was left out.

Fixes made between the first and second check: "not amenable to surgical resection" no longer reads as early stage; "Stage IIIB, IIIC, or IV" keeps the IV; first-line wording ("No previous systemic...", "Absence of prior...") is recognised; "Known actionable genomic alterations" in the exclusion criteria now excludes EGFR, ALK and ROS1; passing mentions of a fresh biopsy no longer count as a requirement. After the held-out check we also added KRAS G12D, PD-L1 thresholds on lines that name the test antibody, and stripped treatment mentions ("EGFR TKI", "EGFR-targeting agents") before reading tumour biomarkers.

11 unit tests in `tests/test_parser.py` pin these cases.

## Known blind spots

- Requirements for rarer biomarkers (HER2, NTRK, MET amplification) are not modelled. They are left to the Gemini pass or the nurse.
- Trials that *require* brain or leptomeningeal metastases are read as excluding them.
- Some resectable or adjuvant trials are also tagged "advanced" when their text mentions metastatic disease in passing.
- A few supportive-care studies (cachexia, focused ultrasound) are registered with "treatment" as their purpose and still appear.
- Patient data gaps: ROS1, RET, brain metastases and prior treatment lines (TCGA) are not recorded, so these always come back as questions. MSKCC records have no stage or ECOG.
- Travel uses straight-line distance to the nearest listed site, not travel time.
