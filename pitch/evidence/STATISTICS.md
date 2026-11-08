# Evidence for Trial Match: claims, sources and the target case

Checked 7 November 2026; every source in section 1 rechecked 8 November 2026, and the landing page updated to match. The rule we follow (it's also the judges' data rule): **only a number with a working source goes on the site or in the pitch, with its scope and date.** Our own synthetic results are always labelled as synthetic and never presented as real-world performance.

This folder sits outside the deployed app (`trial-match-vercel/`), so editing it never changes the product. When a number here is approved, it's copied onto the landing page together with its source line.

## 1. The claims on the landing page today

| On the page | Status | What the source actually says | Change |
|---|---|---|---|
| **95%** "would consider joining a trial if eligible" (cited to BMJ Open Respiratory Research) | ✅, secondhand. *Corrected 8 Nov: the 7 Nov check said this article couldn't be found. It can.* | Lond B, Dodd C, Davey Z, Williamson IR. "Supporting nurses to improve clinical trial discussions with patients with lung cancer using the Lung I-ACT tool: a mixed methods pilot study." *BMJ Open Respir Res*, June 2026, doi:10.1136/bmjresp-2025-003702 (PMID 42342292, open access as PMC13295780). Its background section says: "Around 95% of patients in the UK report being open to considering participation in cancer clinical trials if eligible", citing reference 5, the **Institute of Cancer Research's 2021 report** *Clinical Trials in Cancer: Barriers in Access to Clinical Trials*. That's the same survey as the 63%. The ICR press coverage gives only the 63% and 11%, so the BMJ paper is the source we can link | **Done 8 Nov:** added "if eligible", and the footer now credits the ICR 2021 report by way of the BMJ paper. Also from the same survey: only **11%** had taken part in a trial ([ICR, Dec 2021](https://ca.news.yahoo.com/let-cancer-patients-check-trial-000500467.html)) |
| **63%** "were never told about one" | ✅ | Institute of Cancer Research survey of 500+ cancer patients, published Dec 2021: 63% "did not hear about clinical trials" during treatment | Keep. Wording could be "never heard about one during treatment" |
| **122 days** to first patient in industry trials, "down from 169" | ✅ | [DHSC KPIs to Aug 2026](https://www.gov.uk/government/statistics/uk-clinical-research-delivery-key-performance-indicators-data-to-august-2026/uk-clinical-research-delivery-key-performance-indicators-data-to-august-2026), indicator 1: **median** days from application to first participant recruited, commercial contract interventional CTIMP (drug) studies. Applications April–September 2025: **122**; October 2024–March 2025: 157; April–September 2024: **169**. The [HRA's April 2026 news item](https://www.hra.nhs.uk/about-us/news-updates/uk-clinical-trials-reach-150-day-set-up-milestone/) reports the same 169 → 122 but calls it the "average time to set up" | 8 Nov: the page now cites the KPI report and says "median, industry drug trials". Note the clock starts at the regulatory **application**, not at opening |
| **4 in 10** studies "still had no patient a month after opening" (was "3 in 10") | ✅ | Same KPI report, indicator 4, table 4.3: in **2025, 56%** of studies (460 of 823) recruited their first participant within 30 days of opening, so **44%** did not. All study types. A further 192 studies that opened in 2025 hadn't recruited anyone, or hadn't recorded it, and aren't in the 823, so 44% is if anything an underestimate. The old "3 in 10" came from a single month (February 2026, commercial only, 14 of 20) | 8 Nov: switched to the full-year 2025 figure, a much sturdier base |
| **93%** wrong vs **0%**, **11×** fewer to review, 1.6 vs 16.7, "45,600 synthetic pairs" (was 77% vs 0%, 12×, 0.6 vs 7.1, 1,080 pairs, which nothing in the repo produced) | ✅ **Reproducible, synthetic** | `npm run eval` in `trial-match-vercel/` (writes `eval/results.md`; identical on every rerun). 2,400 synthetic patients × 19 demo trials. Registry search (condition + phase + recruiting) lists 16.7 trials per patient, 92.7% of them wrong. Trial Match's "all rules met" lists 0.5, 0% wrong, but finds only 43% of real matches; counting "to check" it lists 1.6 and finds 100%, with 21% of those not truly eligible. So the old "0% wrong, with every real match still found" mixed two tiers | **Done 8 Nov:** the page now says "0% wrong among full matches on synthetic patients. Every other real match was flagged 'to check'", and "11× fewer: 1.6 per patient, counting those to check, instead of 16.7". Limits: labels and matcher share the same reading of the rules, and no clinician reviewed them |

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
- The national share of lung cancer patients in trials (no current audit figure found). Lead: the BMJ paper above says recruitment into lung cancer trials "is as low as 5%" and "5%–13%" globally, but it cites studies from 2000 (Thorax) and 2013 (J Cancer Educ), so find a current UK figure before using it.

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
1. ~~Replace or verify the 95% claim.~~ Verified 8 Nov (see section 1).
2. A UK figure for how many lung cancer patients join trials.
3. A real nurse workload number (ask a research nurse; one quote with permission beats any estimate).
4. Recruitment KPIs for lung cancer trials specifically, if NIHR publishes them by cancer type.
