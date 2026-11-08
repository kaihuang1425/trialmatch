<h1 align="center">
  <a href="https://trial-match-ebon.vercel.app/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.png">
      <img src="docs/logo-light.png" alt="Trial Match" width="420">
    </picture>
  </a>
</h1>

<h4 align="center">Find the right patients for your clinical trial, before the trial sits empty.</h4>

<p align="center"><b>🏆 1st place at AgentVerse 2026, UCL AI Society’s flagship hackathon.</b></p>

<p align="center">
  <img alt="1st place, AgentVerse 2026" src="https://img.shields.io/badge/%F0%9F%8F%86%201st%20place-AgentVerse%202026-F9AB00">
  <img alt="AgentVerse 2026" src="https://img.shields.io/badge/AgentVerse-2026-4285F4">
  <img alt="Biotech track" src="https://img.shields.io/badge/track-Biotech-9B72CB">
  <img alt="Python" src="https://img.shields.io/badge/python-3.10%2B-3776AB?logo=python&logoColor=white">
  <img alt="Gemini" src="https://img.shields.io/badge/Gemini-agents-8E75B2?logo=googlegemini&logoColor=white">
  <img alt="MedGemma" src="https://img.shields.io/badge/MedGemma-on%20device-34A853">
  <img alt="Demo data" src="https://img.shields.io/badge/demo%20data-synthetic-D96570">
</p>

<p align="center">
  <a href="https://trial-match-ebon.vercel.app/app/"><b>Live demo</b></a> •
  <a href="#quick-start">Quick start</a> •
  <a href="#how-it-works">How it works</a> •
  <a href="#how-we-use-gemini">How we use Gemini</a> •
  <a href="#results">Results</a> •
  <a href="#safeguards">Safeguards</a> •
  <a href="One-page%20report.pdf">One-page report</a>
</p>

<p align="center">
  <a href="https://trial-match-ebon.vercel.app/media/trial-match-agentverse.mp4">
    <img src="docs/trial-match-video.webp" width="480" alt="The 55-second Trial Match video. Mei's agent checks trial LT-301's nine entry rules against her record, asks her the one it can't settle and applies for her. Each agent does one job. The privacy guard sends only public words online while the record stays on the device. The 3D view zooms from the body through the lungs and a cancer cell to the EGFR protein, with a drug bound in its pocket. The trial team gets a ranked shortlist, and people decide.">
  </a>
  <br>
  <sub>🔊 <a href="https://trial-match-ebon.vercel.app/media/trial-match-agentverse.mp4">Play it with sound</a></sub>
</p>

<p align="center">
Trial Match is a multi-agent system that finds eligible patients for recruiting clinical trials. It reads patient records, checks every entry rule against the evidence, and hands trial teams a ranked shortlist of people who are likely to qualify, enrol and stay to the end. A research nurse pre-screens every match, and their results feed back into the next ranking.
</p>

The [one-page report](https://github.com/kaihuang1425/trialmatch/blob/main/One-page%20report.pdf) is included in this repository.

> [!IMPORTANT]
> **Prototype, not a medical device.** Every patient, trial and hospital in the demo is synthetic. Results are from offline tests and are **not** real-world performance.

---

## The problem

4 in 10 UK trials still have **no patient a month after opening**, and it takes 122 days on average to recruit the first one. Meanwhile 95% of patients say they'd consider a trial, and 63% are never told about one. Finding them today depends on a busy clinician remembering which trials exist and checking 20–30 eligibility rules by hand.

## Quick start

**Try it in the browser:** open the [live demo](https://trial-match-ebon.vercel.app/app/), choose **I'm a clinician**, and pick Dr Amira Rahman. No sign-up needed.

**Run it locally:**

```bash
git clone https://github.com/kaihuang1425/trialmatch.git
cd trialmatch
pip install -r requirements.txt

python fetch_trials.py                                      # pull recruiting Phase III trials
python run.py --top 10 --out results/                       # rank trials for each patient
python run.py --feedback data/prescreen_outcomes_DEMO.csv   # learn from nurse pre-screens
python build_app.py                                         # rebuild the web app
```

> **Note:** set `GEMINI_API_KEY` to turn on the Gemini agents. Everything else runs without it.

**Run the live demo's web app:** its code is in [`trial-match-vercel/`](trial-match-vercel/), with the landing page, the demo app and its agents. It needs Node.js 22:

```bash
cd trial-match-vercel
cp .env.example .env.local   # add GEMINI_API_KEY; every connector is optional
npm run dev                  # http://localhost:3000
npm test                     # tests, with a stubbed network
npm run eval                 # the offline evaluation behind the Results numbers
```

### Set up MedGemma

Running MedGemma on your own computer simulates how NHS hospitals could, in future, run the model on their own local servers, so patient records never leave the hospital.

1. Install [Ollama](https://ollama.com/download) and download the model: `ollama pull medgemma1.5:4b` (about 3.3 GB).
2. Let the live site reach it: set `OLLAMA_ORIGINS` to `https://trial-match-ebon.vercel.app`, then restart Ollama. In the demo's chat, **Where your agent runs → MedGemma on this computer** shows the exact command for Windows, Mac or Linux.
3. Choose **MedGemma on this computer** in the chat. Questions and records then stay on the computer.

Until a MedGemma server is set up, the site's Gemini key plays the hospital's server, and the app labels it **Hospital server (simulated)**. The full options, including pointing the site at your own MedGemma server, are in [`trial-match-vercel/README.md`](trial-match-vercel/README.md#set-up-medgemma).

---

### 🔎 Key features

- 📋 **Ranked shortlists for every trial:** applicants ordered by how likely they are to qualify, enrol and complete, not just whether they pass a keyword search.
- 🧾 **Every rule shows its evidence:** each criterion is marked *met*, *not met* or *unknown*, with the line from the record and the trial text quoted.
- ❓ **Unknown is not "no":** an untested biomarker becomes "needs testing", so eligible patients aren't silently dropped.
- 🔁 **Pre-screening feeds back:** nurse results fill gaps in records, correct misread rules and re-tune the ranking.
- 🔒 **The record stays on the device:** Gemini researches online using only public words, and MedGemma reads the findings against the record locally.
- 🌍 **Fairer recruitment:** a small boost for under-represented groups that can only raise a score, never lower one.

---

## How it works

1. **Trial Scout** pulls recruiting trials live from ClinicalTrials.gov.
2. **Criteria Parser** turns each trial's eligibility text into rules: stage, histology, ECOG, biomarkers, PD-L1, prior lines, brain metastases, biopsy and placebo arm.
3. **Records Reader** (MedGemma) extracts facts from clinic letters and records.
4. **Skeptic** throws out any fact it can't quote word for word from the record.
5. **Matcher** checks every rule in fixed code (rules, not AI) and asks for the one missing fact that settles the most trials.
6. **Ranker** scores each patient–trial pair:
   `Score = Eligibility × Feasibility × (1 + 0.2 × Diversity)`
7. **Research nurse** pre-screens the shortlist. Their outcomes flow back into steps 5 and 6.

```mermaid
flowchart LR
    A[Trial Scout] --> B[Criteria Parser]
    C[Records Reader] --> D[Skeptic]
    B --> E[Matcher]
    D --> E
    E --> F[Ranker]
    F --> G[Research nurse]
    G -- pre-screen results --> F
```

---

## How we use Gemini

Gemini does four jobs, each with a narrow brief and a hard limit on what it sees. The web app calls it natively (`generateContent`) through [`trial-match-vercel/lib/gemini.js`](trial-match-vercel/lib/gemini.js), with the model set by `GEMINI_MODEL` (default `gemini-3.8-flash`) and thinking set to low.

| Job | Code | What Gemini does | What it sees |
|---|---|---|---|
| **Researcher agent** | [`lib/researcher.js`](trial-match-vercel/lib/researcher.js) | A tool-using agent with four tools: `search_pubmed` (Europe PMC), `get_drug_label` (openFDA), and `search_live_trials` and `get_live_trial` (ClinicalTrials.gov). It does up to two rounds of lookups, then writes a brief in a JSON Schema. Every sentence must cite a source it read, and uncited sentences are dropped. Each lookup streams to the page as it happens. | Public search words only, such as drug and gene names. Never the record. |
| **Chat agent** | [`lib/agent.js`](trial-match-vercel/lib/agent.js) | Function calling with four tools. `search_live_trials` and `get_live_trial` look up live trials. `propose_action` offers an action as a card the person must tap. `hand_to_team` passes the question to the research team or the find-and-check team. It makes at most 4 model calls and 6 tool calls per question, and the last call must answer in words. | The facts needed to answer, from synthetic demo records. |
| **Hospital server (simulated)** | [`lib/medgemma.js`](trial-match-vercel/lib/medgemma.js) | Until a MedGemma server is connected, Gemini stands in for an NHS hospital's own MedGemma server. It reads clinic letters (Records Reader) and pre-checks live trials against a record. It uses structured output (`responseJsonSchema`), so every reply parses, and the Skeptic still checks every quote word for word. | Synthetic demo records only. The app labels it "Hospital server (simulated)". |
| **Criteria pass** (Python engine) | [`trialmatch/llm.py`](trialmatch/llm.py) | An optional pass, through the Gemini API or Vertex AI, over the entry rules the parser doesn't model (labs, other conditions, other drugs). It runs on each patient's top trials. | Each patient's de-identified research record and the trial text. |

Gemini never decides eligibility: matching stays in fixed rules, and a research nurse confirms every match. The Analyst, which reads research against a patient's record, runs only on MedGemma, on the device or the hospital's own server. It refuses a cloud model.

---

## Results

| Test | Result |
|:---|:---|
| Matching, 45,600 synthetic patient–trial pairs | A plain registry search got **93%** of its "eligible" matches wrong. Trial Match got **0%** wrong and cut trials to review per patient from **16.7 to 1.6** |
| Criteria parser, hand-checked against raw trial text | **92%** of fields correct (58/63) on 8 held-out trials |
| Chat agent | All 11 tests passed on the live model |

> Small samples on synthetic data. Method in [`docs/EVALUATION.md`](docs/EVALUATION.md).

---

## Safeguards

- **People decide.** A nurse pre-screens every match, and the tool never enrols anyone.
- **Names stay hidden.** Trial teams see an ID until the patient says yes.
- **Nothing happens without a tap.** Agents only suggest, and a person confirms every action.
- **Honest limits.** The scoring weights (apart from the biopsy penalty) are our own assumptions and haven't been validated against real enrolment. So far it's built and tested on lung cancer trials, and other diseases are untested.

---

## Data and licences

| Source | Used for | Licence |
|:---|:---|:---|
| [ClinicalTrials.gov API v2](https://clinicaltrials.gov/data-api/api) | Live trial records | Public domain (US NLM) |
| [cBioPortal](https://www.cbioportal.org/) (TCGA LUAD/LUSC, MSKCC NSCLC 2018) | De-identified research records for building the engine | Open access, per study terms |
| PubMed, FDA labels | Researcher agent's public sources | Public |
| Synthetic | All demo patients, trials, sites and pre-screen outcomes | Ours |
| [Unsplash](https://unsplash.com/) (CDC) | Site photography | Unsplash licence |

## Project structure

```
trialmatch/
  criteria.py   # trial text → rules
  match.py      # check, verify, score and rank
  feedback.py   # learn from nurse pre-screen outcomes
  llm.py        # optional Gemini pass
fetch_trials.py · run.py · build_app.py
app/ · docs/ · tests/
trial-match-vercel/   # the live web app: landing page, demo app and agents
One-page report.pdf   # the submission write-up
```

---

<p align="center">
  Built by <b>Team TrialMatch</b> for <b>AgentVerse 2026</b> · UCL AI Society × Google DeepMind · Biotech track: <i>make the path to patients faster</i>
</p>
