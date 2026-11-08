# Evidence for Trial Match: claims, sources and the target case

Checked 7 November 2026. The rule we follow (it's also the judges' data rule): **only a number with a working source goes on the site or in the pitch, with its scope and date.** Our own synthetic results are always labelled as synthetic and never presented as real-world performance.

This folder sits outside the deployed app (`trial-match-vercel/`), so editing it never changes the product. When a number here is approved, it's copied onto the landing page together with its source line.

## 1. The claims on the landing page today

| On the page | Status | What the source actually says | Change |
|---|---|---|---|
| **95%** "would consider joining a trial" (cited to BMJ Open Respiratory Research) | ❌ **Not verifiable.** Article e003702 can't be found in any index, and the link refuses automated reading. Judges may click it | — | Replace it, or remove it until a real source is found (open the link yourself first; if it does exist, note the exact sentence). Verified alternative from the same survey as the 63%: "only **11%** of cancer patients surveyed had taken part in a trial" ([ICR, Dec 2021](https://ca.news.yahoo.com/let-cancer-patients-check-trial-000500467.html)) |
| **63%** "were never told about one" | ✅ | Institute of Cancer Research survey of 500+ cancer patients, published Dec 2021: 63% "did not hear about clinical trials" during treatment | Keep. Wording could be "never heard about one during treatment" |
| **122 days** to open a trial, "down from 169" | ✅, but scoped | **Commercial interventional** trials only; average set-up time; published April 2026 ([HRA](https://www.hra.nhs.uk/about-us/news-updates/uk-clinical-trials-reach-150-day-set-up-milestone/)) | Say "to open an **industry** trial". The footer already says the HRA |
| **3 in 10** "still have no patient a month after opening" | ✅, small sample | February 2026: 70% of commercial contract studies recruited their first participant within 30 days (14 of 20), so 30% did not. Across all study types it was 67% (42 of 63), so about **1 in 3** did not ([DHSC KPIs to Aug 2026](https://www.gov.uk/government/statistics/uk-clinical-research-delivery-key-performance-indicators-data-to-august-2026/uk-clinical-research-delivery-key-performance-indicators-data-to-august-2026)) | Prefer "**1 in 3 UK studies** have no patient a month after opening" (63 studies, so a sturdier base than 20) |
| **77%** wrong vs **0%**, **12×** less to review, 0.6 vs 7.1, "1,080 synthetic pairs" | ❌ **Not reproducible from this repo** | Our own numbers, but no script or results file here produces them | Add an evaluation for the deployed matcher (see `../RUBRIC-CHECK.md`), then use its numbers with "on synthetic patients" in the headline |

## 2. Statistics for the target case (verified)

**England, people diagnosed with lung cancer in 2024** ([National Lung Cancer Audit, State of the Nation 2026, England infographic](https://www.natcan.org.uk/wp-content/uploads/2026/02/NLCA-SotN-2026-Infographic-England.pdf)):

| Measure | Figure |
|---|---|
| People diagnosed | **39,409** |
| Diagnosed at **stage 4** | **41%** (44% in 2023, 47% in 2022) |
| Median age at diagnosis | **74** |
| Median time from referral to systemic anti-cancer therapy (NSCLC stage 3B–4) | **63 days** |
| NSCLC stage 3B–4 with good fitness (PS 0–1) who got systemic therapy | **63%** (audit standard ≥70%) |
| Median survival / one-year survival | **372 days** / **51%** |

**UK as a whole:** about **50,200** new lung cancer cases a year, 46% of them in people aged 75 or over ([Cancer Research UK](https://www.cancerresearchuk.org/health-professional/cancer-statistics/statistics-by-cancer-type/lung-cancer/incidence)).

**Trials that struggle to recruit** (international; older, so cite with year):
- About **1 in 5** publicly funded phase II/III cancer trials didn't recruit enough patients to answer their question (787 US NCTN trials, 2000–2011; [Fred Hutch / JNCI 2015](https://www.fredhutch.org/en/news/center-news/2015/12/one-in-five-cancer-clinical-trials-fizzle-fred-hutch.html)).
- **28.6%** of 898 trials at US cancer centres had zero accrual (2010; [Cancer Network](https://www.cancernetwork.com/view/thirty-percent-clinical-trials-face-zero-enrollment)).

**Manual pre-screening time.** No single authoritative figure exists. The published range is **about 20 to 45 minutes per chart**, longer for complex oncology records. Treat it as a range, not a fact:
- 43.9 minutes per review for humans alone in a randomised human-versus-human+AI pre-screening trial (interim analysis; the final paper found no significant time saving with AI) ([ResearchHub summary](https://researchhub.com/paper/8161165/human-ai-teams-to-improve-accuracy-and-timeliness-of-oncology-trial-prescreening-preplanned-interim-analysis-of-a-randomized-trial)).
- 20 minutes in a breast cancer screening example; that one is vendor-reported ([MDLinx](https://www.mdlinx.com/article/ai-in-oncology-how-ai-is-transforming-clinical-trial-matching/6L8sTCl2GCNjbVPzyjqTla)).

**Needs a better source before use:**
- EGFR mutation rate in UK NSCLC (16.6% in England and Wales, from a secondary summary, [GPnotebook](https://gpnotebook.com/en-GB/pages/oncology/egfr-tk-mutation-testing-and-lung-cancer)).
- The national share of lung cancer patients in trials (no current audit figure found).

## 3. The target case (one named user, one bottleneck)

The brief rewards "one specific bottleneck for a named user". Proposed wording:

> **User:** a research nurse at an NHS lung cancer centre who pre-screens referred patients for Phase III trials (illustrative persona).
> **Bottleneck:** every referral is checked by hand against each open trial's entry rules, about 20–45 minutes per chart. Meanwhile 41% of patients are diagnosed at stage 4, median survival is about a year, and a third of studies still have no patient a month after opening.
> **What Trial Match changes:** the agent reads the record, checks every rule with a quote for each fact, and hands the nurse a ranked list with only the unknowns left to confirm. The nurse still decides.
> **Next step to real use:** a pilot at one centre on synthetic or retrospective records, measuring nurse minutes per referral and time to first patient (see the certification proposal for the route).

**Size of the problem (a transparent, assumption-labelled model, not a fact):**
- 39,409 × 41% ≈ **16,200 people a year in England are diagnosed at stage 4** (from the audit figures).
- If a centre's nurse pre-screens 10 referrals a week at 20–45 minutes each, that's **3.3 to 7.5 hours a week** of chart reading *(assumed workload; replace it with a real centre's number when we have one)*.

## 4. What to gather next, and where

```
pitch/evidence/
  STATISTICS.md        this file: claim → source → status
  sources/             PDFs or screenshots of each source page, named by claim (e.g. 41pct-stage4-NLCA-2026.pdf)
  model/               the assumption-labelled sizing model (a spreadsheet), feeding the business case
```

Priorities:
1. Replace or verify the 95% claim.
2. A UK figure for how many lung cancer patients join trials.
3. A real nurse workload number (ask a research nurse; one quote with permission beats any estimate).
4. Recruitment KPIs for lung cancer trials specifically, if NIHR publishes them by cancer type.
