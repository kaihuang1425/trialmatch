# Relay — synthetic-case evaluation

**Synthetic-case evaluation, n = 45 patient–trial pairs** (5 synthetic patients × 9 trials, 945 criterion rows). Run date as-of 2026-11-08, trial snapshot 2026-11-07, mode: replay (rules extractor, no network).

All patients and documents are synthetic (templates filled from hand-written facts). These numbers describe agreement with our own gold labels on our own templates. They are **not** real-world accuracy, enrolment or benefit.

## Pair level (45 pairs)

| Measure | Relay (replay) | Baseline A: condition + age + location | Baseline B: LLM only |
|---|---|---|---|
| Missed exclusions (gold "not a match" reported as anything else) | 0 / 31 (patients 0/5) | 18 / 31 (patients 4/5) | skipped (no GEMINI_API_KEY or no --live) |
| Wrongly discarded (gold plausible reported as "not a match") | 0 / 14 (patients 0/5) | 5 / 14 (patients 3/5) | skipped (no GEMINI_API_KEY or no --live) |
| Derived status matches gold (4 statuses) | 45 / 45 | n/a (2 outcomes only) | n/a (2 outcomes only) |

Gold pairs: 31 "not a match", 14 plausible (SYN-0417/CodeBreaK 202, SYN-0417/KANDLELIT-007, SYN-0417/Krascendo 2, SYN-0417/Beamion LUNG-1, SYN-0288/COPERNICUS, SYN-0288/Beamion LUNG-1, SYN-0532/ALPACCA, SYN-0532/COPERNICUS, SYN-0532/ALKAZAR, SYN-0532/Beamion LUNG-1, SYN-0610/RASolve 301, SYN-0610/Beamion LUNG-1, SYN-0745/ALKAZAR, SYN-0745/Beamion LUNG-1).

## Criterion rows, per gold state

Baseline A never looks at criteria, so it is scored as "every row satisfied". Patient-level denominators: patients whose gold labels contain that state.

| Gold state | Rows | Relay errors | Patients with ≥1 Relay error | Baseline A errors | Patients with ≥1 baseline error |
|---|---|---|---|---|---|
| supported | 601 | 0 | 0 / 5 | 0 | 0 / 5 |
| conflicting | 85 | 0 | 0 / 5 | 85 | 5 / 5 |
| unknown | 164 | 0 | 0 / 5 | 164 | 5 / 5 |
| needs_review | 95 | 0 | 0 / 5 | 95 | 5 / 5 |

Criterion-state accuracy: 945 / 945 rows (100.0%); on checkable rows only (rows that read a fact): 775 / 775 (100.0%).

Confusion (gold → Relay):

| gold \ Relay | supported | conflicting | unknown | needs_review |
|---|---|---|---|---|
| supported | 601 | 0 | 0 | 0 |
| conflicting | 0 | 85 | 0 | 0 |
| unknown | 0 | 0 | 164 | 0 |
| needs_review | 0 | 0 | 0 | 95 |

## Evidence and unknown handling

- Evidence accuracy: 397 / 397 extracted facts cite the gold passage (same document, quote within the gold line) — 100.0%. Gold passages recovered: 397 / 397.
- Unknown handling: 78 / 78 gold-unknown rows stay `unknown` (final stage for all 5 patients + SYN-0417 before its report). Sub-reasons seen: stale 22, missing 44, not_tested 14. Missing evidence turned into a conflict: 0. Baseline A has no unknown state (0 / 78).

## Actions to reach a reviewable referral (modelled, not timed)

Counting rule. A referral is reviewable when every row of every study is decided with a cited passage, flagged for a clinician or the study team, or covered by an outstanding evidence request.
- Relay: one approval per distinct document request the agent drafted, plus one review of the cited evidence panel per study (9 per patient; for a "not a match" study this is confirming the cited conflict).
- Baseline A + manual: the coordinator reads every registry criterion of each study the filter passes and looks for it in the documents (one action per criterion row), plus one decision per study, plus the same document requests (we assume they would dedupe requests as well as Relay does).

| Patient | Relay: requests + reviews | Baseline A + manual: criterion look-ups + decisions + requests |
|---|---|---|
| SYN-0417 | 1 + 9 = **10** | 144 + 9 + 1 = **154** |
| SYN-0288 | 0 + 9 = **9** | 80 + 9 + 0 = **89** |
| SYN-0532 | 1 + 9 = **10** | 92 + 9 + 1 = **102** |
| SYN-0610 | 0 + 9 = **9** | 144 + 9 + 0 = **153** |
| SYN-0745 | 0 + 9 = **9** | 16 + 9 + 0 = **25** |
| **Total** | **47** | **523** |

## Limitations

- Gold labels were written by the same team that built the rules (`scripts/gold-labels.ts`), before running the engine but with knowledge of the encoding. Agreement here shows internal consistency, not clinical validity. A second reviewer slot is left in `data/patients/<id>/labels.review.json` (empty).
- The rules extractor is tuned to our synthetic templates; free-text documents would go through the Gemini extractor, which is not evaluated in replay mode.
- Five patients and nine trials: too few for rates to generalise. Treat every number as a description of these 45 pairs.
- Baseline B (LLM only, gemini-3.6-flash) was skipped: it needs GEMINI_API_KEY and `npm run eval -- --live`.
- Replay agent event counts per patient: SYN-0417 30, SYN-0288 25, SYN-0532 28, SYN-0610 25, SYN-0745 26.
