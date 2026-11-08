# Trial Match against the AgentVerse 2026 Biotech brief

Source: `AV slides.pptx` on GitHub `main` (Biotech slides 11–14; the slides are images, read 7 Nov 2026). Checked against the live site https://trial-match-ebon.vercel.app and branch `trial-match-vercel`.

## What the brief asks

- **Challenge.** "Make the path to patients faster": pick a stage of the journey, find a real bottleneck, and build an agent that makes it faster, cheaper or fairer. "Trial agents" and "Clinical support agents" are both listed. Keep a human in the loop for decisions that matter, and show reasoning a scientist could check.
- **Data rules.** Synthetic data is allowed if you label it and say how you made it. Never present it as real-world performance. No real patient data, ever. Reference every dataset and check its licence.
- **Submit four things.** A working demo; code in a **public** repo with a short README; a **one-page write-up** (problem, who it helps, data, how you evaluated it, the agent's limits and safeguards); and a **pitch of up to 4 minutes, plus 2 minutes for the judges to test the model**.
- **Judges.** André Shamsabadi (Isomorphic Labs), Zayd Lakhi (AmpliSynth), Francesco Farina (Basecamp Research), Diana Cojocaru (UCL). No weights are given for Biotech.

## Deliverables today

| Deliverable | Status | What's missing |
|---|---|---|
| Working demo | ✅ Live: landing page, `/app/` and the chat | MedGemma isn't hosted for the live site yet (see "Live demo" below) |
| Code in a public repo | ❌ **The repo is private** (GitHub returns 404 without a sign-in) | Make it public, and merge `trial-match-vercel` into `main` so the default branch is what we submit. `main` also holds teammates' uploads, so agree which version is the submission |
| One-page write-up | ❌ Not written | The five headings above, matched to this version |
| Pitch | ⏸ Deferred (you asked to wait) | — |

## The five criteria

| Criterion ("top score looks like…") | Where we are | Gaps that cost points | Fix |
|---|---|---|---|
| **Uniqueness of idea**: a fresh approach beyond a literature chatbot or stock model | 🟢 A two-sided agent: the patient's agent finds and applies, and the trial team ranks. Every fact is grounded in a quote, matching is deterministic, nothing dead-ends (failed screens reroute), and each trial has a 3D view | Trial matching itself isn't new (TrialGPT and registry search exist). Say why ours differs in one line | Lead with "every fact keeps its source" and the two-sided flow, not with "AI finds trials" |
| **Real-world need**: one specific bottleneck for a named user, with a plausible next step to real use | 🟡 The landing page cites real sources (95%, 63%, 122/169 days, 3 in 10) | We name two users (patients and trial teams); the brief wants one bottleneck for a named user. No next step to real use is written down | Name one user, such as *the research nurse pre-screening for a Phase III lung trial*. Add the next step: a pilot with one NHS site on synthetic records, then the NHS assessment route (see the certification proposal) |
| **Science, data and evaluation**: tested against a baseline, with data referenced and licence-checked | 🔴 The landing page's numbers (77% vs 0%, 12×, 0.6 vs 7.1, 1,080 synthetic pairs) **aren't produced by anything in this repo**. The only evaluation in the repo is `relay/eval/results.md` (45 pairs, a different app) | Judges can't reproduce the headline. The package has no data or licence list (ClinicalTrials.gov, PDB structures, 3Dmol, MedGemma terms, SMART/Synthea) | Add an evaluation script that measures the deployed matcher against a registry-search baseline and writes `results.md`, and make the landing numbers come from it. Add `DATA.md` with each source and its licence |
| **Agent design and live demo**: a real multi-step agent whose live demo handles a judge's new input | 🟢 The steps are Records Reader → Skeptic → Trial Scout → Matcher → care team. A judge can paste any synthetic letter, ask the chat anything, connect a FHIR test patient, or pre-check a live trial | MedGemma answers need a server. Without one, the live site falls back to built-in answers | For the pitch, run MedGemma on the laptop ("this computer" mode; ~10 s answers) or host it. Rehearse three judge inputs |
| **Security and responsible design**: named risks, each with a mitigation, and a human signs off key decisions | 🟡 The safeguards exist in code: quote check, eligibility-claim guard, "draft" labels, deterministic matching, consent events, rate limits, synthetic-only labels, private local-model option | They aren't written down as a risk table | Put a risk → mitigation table in the write-up (hallucinated facts, false "eligible", privacy, prompt injection, over-trust, abuse of the shared demo, bias from travel limits), plus "the lead doctor signs off enrolment" |

## Data-rule check

- ✅ Synthetic data is labelled throughout the demo, and the FHIR test server is synthetic.
- ✅ **"Never present it as real-world performance."** Fixed 8 Nov: the Results section's big line now reads "0% wrong on synthetic patients, with every real match still found".
- ❌ **"Reference every dataset and check its licence."** There's no list for this package yet. Add `DATA.md`.
- ✅ **The landing page's four cited figures all trace to their sources** (rechecked 8 Nov). The 7 Nov check wrongly called the 95% untraceable. The BMJ Open Respiratory Research article (e003702, June 2026) exists and states it, citing the Institute of Cancer Research's 2021 report. The page now says "if eligible" for the 95%, cites the 122 / 169 days as the KPI report's median for industry drug trials, and uses the full-year 2025 "4 in 10" in place of a one-month "3 in 10". See `evidence/STATISTICS.md`.

## Your idea list, scored against the rubric

| Idea | Rubric value | Risk | Verdict |
|---|---|---|---|
| Humanise the landing text | Low (clarity helps the pitch) | Gemini may add claims or drop the "synthetic" labels | Do it, but keep every number and source exactly (prompt provided) |
| Logo | None directly (brand polish) | Time sink | Pick one from the board and move on |
| "More medical and certified" look | Medium, if framed as the *next step to real use* | **High if it implies certifications we don't hold.** That breaks the responsible-design criterion | Use "designed to meet" language and a roadmap, never badges |
| Statistics for a strong target case | **High** (real-world need) | Mixing them into product code | Keep sources in `pitch/evidence/`; only cited numbers go on the site |
| Posters on iPads, AI images of happy people | Low | AI faces of "patients" in a health pitch read as staged, and blur the synthetic-vs-real rule | Prefer real product screens; label any AI image as AI-generated |
| Money incentives for patients to sign up | **Negative** | Paying patients to join trials risks undue inducement (an ethics red flag for UK review) | Reframe: reimburse travel; trial sponsors and sites pay per qualified referral; model this as the business case |
| Aura team photo | None | — | 30 minutes, max |

## The judges: what each will probe

Only André Shamsabadi has a public self-description (Bluesky: a chemical biologist working on AI for therapeutics at Isomorphic Labs). For the others I found nothing reliable, so the notes below come from their organisations. Paste their LinkedIn headlines if you'd like this sharpened.

- **André Shamsabadi, Isomorphic Labs** (AlphaFold-based drug discovery). Expect questions on scientific honesty. Our 3D view already says "crystal structure, not this patient's tumour" and uses real PDB entries; show that.
- **Francesco Farina, Basecamp Research** (the company builds biological foundation models on consented, benefit-shared sequence data; individual role unverified). Data provenance and licensing will matter: have `DATA.md` ready.
- **Zayd Lakhi, AmpliSynth** (organisation details unverified). Treat as a founder lens: who pays, and the next step to real use.
- **Diana Cojocaru, UCL** (department unverified). Treat as an academic lens: baseline, reproducibility, limits.

## Do first (highest value per hour)

1. Make the repo public and put the submitted version on `main`. *(Your call: it's public and outward-facing.)*
2. One-page write-up.
3. A reproducible evaluation for the deployed matcher against a baseline, with the landing numbers taken from it.
4. `DATA.md` with sources and licences.
5. A plan for MedGemma during the live demo (laptop or hosted), with three rehearsed judge inputs.
