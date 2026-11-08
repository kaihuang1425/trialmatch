# Trial Match on Vercel

The landing page (`/`) and the demo app (`/app/`), with the app's agents connected to real services. Static files plus a few Node.js serverless functions, with no build step and no npm dependencies.

| Agent in the app | Connected to | What it does | If not set up |
|---|---|---|---|
| **Records Reader** (clinic letters) | **MedGemma** | Pulls facts out of a pasted letter, each with the exact words it came from | Reads the letter on the device, as before |
| **Skeptic** check | Server code | Drops any fact whose quote isn't in the source word for word, or doesn't state the value. The app lists what it left out, and **Try a trick letter** loads a letter that plants an instruction, a relative's result and a scan that hasn't been done, so anyone can test it | Always on |
| **Connect a record** | **FHIR R4 server** + MedGemma | Reads conditions, results, medicines and reports, read-only; maps lab codes (LOINC) directly, and MedGemma reads the rest | Shows the synthetic demo records |
| **Trial Scout** | **ClinicalTrials.gov API v2** | Lists recruiting phase III lung cancer trials with UK hospitals, live. `?term=` narrows it to a gene change or drug, which the chat uses to search from a patient's record | Needs no setup |
| **Pre-check** (Matcher, live trials) | **MedGemma** + ClinicalTrials.gov | Reads a live trial's full entry rules and checks them against the record: met / not met / to check. It also counts answers the patient gave in the chat, labelled as theirs, and for each rule it can't settle it names the one fact that would | Button hidden, with a note |
| **The chat's team** (drug questions) | **Researcher:** Gemini online, with PubMed (Europe PMC), FDA labels (openFDA) and ClinicalTrials.gov. **Analyst:** MedGemma where the record is | The Researcher looks up a drug or a comparison with public words only and writes a brief in which every sentence cites a source it read; the Analyst reads that brief against the record, on the visitor's computer or this site's own MedGemma server, never a cloud model (see below) | Researcher: a PubMed search with no brief. Analyst: fixed rules on the device |
| **Shared demo data** | **Upstash Redis** | Everyone who opens the site sees and changes the same demo | Changes stay in each browser |
| Matching for the demo's own trials (LT-301…) | Rules in code | Unchanged and deterministic: an agent never decides eligibility | n/a |
| **Ask your agent** (chat, patients and clinicians) | Built-in answers, or **MedGemma on the visitor's computer** (Ollama), or **the site's model** (MedGemma, or Gemini) | Answers from the record and the trial rules; typed questions can go to the model, labelled as a draft, with eligibility claims flagged. It can also offer to act in the app, research a drug and search the live registry (see below). On Gemini it's a tool-using agent that looks up live trials on ClinicalTrials.gov itself | Built-in answers |

### MedGemma for the chat

The chat offers three sources, and visitors choose between them in the chat itself:

- **Built-in.** This works everywhere and needs no setup. The answers are worked out from the record and the trial rules.
- **MedGemma on this computer (desktop).** The chat detects Windows, Mac or Linux. It shows one copy-paste command that lets the site talk to Ollama, restarts Ollama and downloads `medgemma1.5:4b` (about 3.3 GB). It then finds the model by itself. Questions never leave that computer. The site's security policy allows only `localhost:11434`.
- **The site's model.** This works on any device, phones included. It is MedGemma once the deployment has a MedGemma server set in the variables below. Until then, a Gemini API key can stand in: the app then says "Gemini · cloud", tells people their questions go to Google's cloud and are fine for this synthetic demo only, and keeps "MedGemma · this computer" one tap away (with a lock icon) for anyone who wants privacy. MedGemma is always used when both are set. Any OpenAI-compatible server works, including Ollama's own API (`MEDGEMMA_BASE_URL=http://<host>:11434/v1`, `MEDGEMMA_MODEL=medgemma1.5:4b`). If you serve it with Ollama, start it with `OLLAMA_CONTEXT_LENGTH=16384` so the longer trial pre-check prompts fit.

These were tested with MedGemma 1.5 4B on an RTX 5070 Ti laptop: chat answers took about 8 to 20 seconds, including the model's thinking.

### Gemini on this site

With `GEMINI_API_KEY` set (and no MedGemma server), the site calls the Gemini API natively (`lib/gemini.js`, `generateContent`), not through its OpenAI-compatible route:

- **Structured output.** The Records Reader and the trial pre-check send a JSON Schema (`responseJsonSchema`), so Gemini's reply always parses. The Skeptic still checks every quote against the letter afterwards.
- **A chat agent with tools** (`lib/agent.js`). Gemini can call `search_live_trials` (recruiting phase III lung cancer trials with UK hospitals, narrowed by a keyword such as "KRAS G12C" or by a city) and `get_live_trial` (one trial's summary, UK hospitals and full eligibility criteria). A third tool, `propose_action`, offers to do something in the app, and never acts by itself (see "What the chat can do" below). It takes at most 4 model calls and 6 tool calls per question, offers at most 2 actions, and its last call must answer in words. Thought signatures are passed back unchanged.
- **What the person sees.** Each lookup appears as a step above the answer, and the live trials it named come back as links that open in the app. An NCT ID it names without having looked it up gets a "check it on ClinicalTrials.gov" note.
- **What it can't do.** The tools receive search words and trial IDs only, never the patient's facts. Nothing they return changes matching: the demo trials stay on the deterministic rules, and the trial team decides.
- **Thinking.** Thinking is set to `LOW`, and no temperature is sent, because Gemini 3 models are tuned for the default.

`npm test` covers this path with a stubbed network (`tests/gemini.test.mjs` and `tests/agent-actions.test.mjs`), so it doesn't call Google.

### What the chat can do beyond answering

- **Offer to act.** A request such as "apply me to LT-311", "my brain scan was clear", "I can travel 50 miles" or, for a trial team, "invite people to LT-319" becomes a card. Nothing happens until the person taps it, and the action is logged as the agent's. On Gemini the model chooses the action with `propose_action`. With the built-in answers or MedGemma, fixed rules read the request, and the card says "Matched by rules". Either way the page runs its own checks before offering the card: already applied, already on a trial, entry rules not met, or no model for a pre-check. Patients can apply, pass, withdraw, turn apply-for-me or invitations on and off, add a brain scan result, change how far they'll travel and pre-check a live trial. Trial teams can invite the people who could fit and open Rank.
- **Ask about a drug: a team of agents.** "What's the drug in the first one?", "How does it compare with chemotherapy?", "Side effects of sotorasib?" go to a team, and the chat draws it at work: two lanes either side of a privacy line ("On this device" and "Online"), a packet crossing the line with the words that went out and the brief that came back, live counts as each source is read, and a step-by-step trace with timings.
  - **Coordinator** (rules, on the device) routes the question.
  - **Privacy guard** (on the device) builds what goes online from allow-lists only: drug and gene names, the demo trial's research topics or a live trial's registry treatments, and the kind of question. It never sends the record or the question as typed, and it shows both lists, "Going online" and "Kept here". The server echoes what it received, and the chat confirms it matches. `lib/researcher.js` drops anything that still looks personal (ages, dates, names, IDs).
  - **Researcher** (Gemini, online: `api/agents/research.js`, `lib/researcher.js`). A tool-using agent with `search_pubmed`, `get_drug_label`, `search_live_trials` and `get_live_trial`. Its first turn must look something up, it has at most 2 rounds of tools, and its last turn returns a brief in a JSON Schema: the drug, what kind it is, 3 to 5 sentences each with source numbers, who it was studied in, and what it doesn't settle. Sentences that cite nothing it read are dropped. It streams each lookup as NDJSON (`Accept: application/x-ndjson`), so the lanes update live. With no Gemini key it searches PubMed and lists the papers.
  - **Analyst** (MedGemma: `lib/analyst.js`). It reads the brief against the record where the record is: MedGemma on this computer through Ollama (streamed from the browser, so it types in live), or this site's own MedGemma server (`api/agents/analyst.js`, which refuses with `record_stays_local` when the site's only model is Gemini). It answers in three labelled lines (who was studied, what fits, what to ask). Small local models can loop or overreach, so repeated sentences are dropped, it stops once it has said enough, and any sentence saying someone is eligible is removed and replaced by the reminder that the trial team decides. Fixed rules on the device also check the research's gene change and earlier treatment against the record, show the result beside the Analyst's words ("Checked by rules on this device"), and give it to MedGemma as checked facts. With no MedGemma anywhere, those rules are the Analyst.
- **Find and check, in rounds.** "Search for live trials" starts a loop of search, check, ask and check again. Every round shows as steps above the answer:
  1. **Search.** The agent plans a search from the record (EGFR, ALK, KRAS G12C, ROS1, or PD-L1 of 50% or more), and Trial Scout runs it on ClinicalTrials.gov.
  2. **Check.** The Matcher's fixed rules rank every result, with no AI. When the site has a model, it pre-checks the closest 2 trials against their full entry rules, side by side.
  3. **Ask.** The one fact that would settle unknown rules in the most trials becomes a question with answer buttons, such as "Did the cancer grow on your latest treatment?" The answer goes into the record, marked as the patient's own until the care team confirms it, and the same trials are checked again. "Not sure" passes the question to the care team. The agent only asks what a patient can know: brain scans, how they manage day to day, earlier treatments and when the last one was, lung inflammation, autoimmune disease and current infections. It never asks about gene results, stage or blood counts.
  4. **Widen.** If every trial it checked is ruled out, it checks the next closest ones, then widens the search to all lung cancer trials.

  It stops when nothing the patient can answer is left, when every trial it checked is ruled out, or after 4 rounds or 8 model checks. **Keep checking** gives it the same budget again. The outcome goes to the activity log, and **My health** lists what the patient told the agent. It never applies for anyone. With no model, it still searches and ranks with the Matcher.

The status endpoint `GET /api/status` shows which connectors are live, and the app's sign-in screen lists them.

## Live

https://trial-match-ebon.vercel.app (demo at `/app/`). Vercel project `trial-match` uses this folder as its Root Directory and is connected to the GitHub repo `kaihuang1425/agentic-legacy`. Pushes to `main` deploy to production, and other branches get a preview link. To deploy by hand, run this from the repo root:

```bash
vercel deploy --prod
```

`FHIR_BASE_URL` and `FHIR_DEMO_PATIENT_ID` are set to the public SMART sandbox. MedGemma and Redis still need their keys (see below).

## Deploy a new copy

1. Push this folder to a GitHub repo (or run `vercel deploy` from inside it).
2. In Vercel, choose **Add New → Project** and import the repo (set the root directory to this folder if it sits inside a bigger repo). Leave Framework Preset as **Other** and the build settings at their defaults. There is nothing to build, and `vercel.json` already sets the output to `public/`.
3. Add the connectors you want (all optional), then redeploy:
   - **Shared data:** go to **Storage → Marketplace → Upstash for Redis**, create a database and connect it to the project. Vercel adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you. The first visit loads the demo data.
   - **MedGemma:** pick one option.
     - **Vertex AI:** in Model Garden, deploy MedGemma (`medgemma-27b-text-it` reads text best; `medgemma-1.5-4b-it` is smaller and cheaper). Copy the endpoint into `MEDGEMMA_VERTEX_BASE_URL` as `https://{DEDICATED_ENDPOINT_DNS}/v1beta1/projects/{PROJECT_ID}/locations/{REGION}/endpoints/{ENDPOINT_ID}`. Create a service account with the **Vertex AI User** role and paste its JSON key into `GOOGLE_SERVICE_ACCOUNT_JSON`, either raw on one line or base64.
     - **Hugging Face Inference Endpoints, or your own vLLM/TGI server:** set `MEDGEMMA_BASE_URL` (ending in `/v1`), `MEDGEMMA_API_KEY` and `MEDGEMMA_MODEL`. You must accept the model's terms on Hugging Face first.
     - **No MedGemma server yet:** set `GEMINI_API_KEY` (from Google AI Studio) and optionally `GEMINI_MODEL` (default `gemini-3.8-flash`). Every AI step (Records Reader, pre-check, chat) then uses Gemini and says so, and the chat can look up live trials. Gemini runs in Google's cloud, so keep to the synthetic demo data.
   - **FHIR:** set `FHIR_BASE_URL`. For testing, `https://r4.smarthealthit.org` is a public sandbox of synthetic patients with no token. `FHIR_DEMO_PATIENT_ID=1a96f2e7-7ce0-4164-b3f6-4fdffeca00fb` is one of its lung cancer patients. Add `FHIR_BEARER_TOKEN` for a server that needs one.

Every variable is described in `.env.example`.

## Run it locally

```bash
npm run dev
```

This serves the site at http://localhost:3000 the way Vercel would (same redirects and headers, and `api/` runs). It reads `.env.local`. Restart after editing anything in `lib/`.

For the full demo with every agent on MedGemma on this computer, install Ollama, run `ollama pull medgemma1.5:4b`, then:

```bash
npm run demo
```

Open http://localhost:8768/app/. The first run adds a local model, `medgemma-demo`: the same weights, with a 16k context so the pre-check prompts fit. Everything that reads patient text runs on MedGemma on the computer. A Gemini key in `.env.local` is kept for the chat team's Researcher only, which receives public search words and never the record; set `DEMO_OFFLINE=1` to turn it off too. The outside services the agents call are ClinicalTrials.gov, Europe PMC, openFDA, the public FHIR test server and, for the Researcher, Gemini.

To test the MedGemma plumbing without a GPU, `npm run mock:medgemma` starts a stand-in on port 8790. Set `MEDGEMMA_BASE_URL=http://127.0.0.1:8790/v1` and `MEDGEMMA_API_KEY=test-key` to use it. It only pattern-matches, so never deploy with it.

Run the tests with:

```bash
npm test
```

They cover the fact checks, plus the Gemini calls, the chat agent's tool loop and its action proposals against a stubbed network. They also cover how the pre-check handles chat answers and names the fact each unknown rule needs.

## Evaluation

```bash
npm run eval
```

This runs the matcher from `public/app/index.html` and a registry-search baseline (condition, phase and recruiting status, the way ClinicalTrials.gov filters) on synthetic patients. It writes `eval/results.md`, which says how the patients and labels were made and what the numbers do and don't show. It's synthetic data only, so the numbers aren't real-world performance. The run takes a few seconds and gives the same numbers every time.

## The 3D zoom (body, lungs, cell, protein)

Each trial's 3D box can zoom from a whole body to the lungs (with the tumour), into a cancer cell, and down to the real protein structure. The protein is 3Dmol with a crystal structure from the Protein Data Bank. The body, lungs and cell are illustrations built in code with three.js: signed distance fields meshed with surface nets, drawn as Gemini-style glowing silhouettes. There is no model file to license. The 3D only loads when someone zooms out of the protein. Without WebGL, the zoom falls back to flat drawings.

The source is `src/body3d.js`, and the bundle in `public/app/protein/body3d.js` is committed, so deploys still need no build step. To rebuild it after editing the source:

```bash
npm i --no-save three@0.186.1 esbuild && npx esbuild src/body3d.js --bundle --format=iife --minify --target=es2019 --legal-comments=eof --outfile=public/app/protein/body3d.js
```

Then bump `?v=` for `body3d.js` in `protein-view.js`, and for `protein-view.js` in `app/index.html`, because `/app/protein` is cached for a week. three.js is MIT-licensed (`public/app/vendor/LICENSE-three.txt`).

### Drug targets

Trials whose drug doesn't aim at a gene change still get a protein: the drug's own target, from a real crystal structure of that kind of drug on it. They cover PD-L1 for immunotherapy (5X8M, durvalumab), VEGF for blood-vessel blockers (1BJ1), EGFR's outer part for antibodies such as amivantamab (1YY9, cetuximab) and topoisomerase I for antibody–drug conjugates with a topotecan-family payload (1K4T, topotecan). The trial's drug names choose the target. The caption says whether the drug shown is the trial's own or one of the same kind. A trial for a gene change that the patient's record doesn't show gets that gene's protein, with a caption saying so.

These structures are in `public/app/protein/targets.js`, which `tools/prepare_targets.py` generates. To rebuild it (Python 3, no packages needed):

```bash
python -I tools/prepare_targets.py
```

It downloads each entry from files.rcsb.org into `tools/.pdb-cache/` (not committed) and keeps the target, the drug and the binding site. Then bump `?v=` for `targets.js` in `protein-view.js`. PDB data is CC0.

## Files

```
public/index.html          landing page (all its text is in LANDING-COPY.md)
public/media/              landing videos and posters
public/app/index.html      the demo app, with the 3D protein view in each applicant sheet
public/app/connectors.js   browser side of the connectors
public/app/protein/, vendor/  3D viewer, PDB structures, 3Dmol.js (BSD-3, licence in vendor/)
public/app/protein/targets.js  drug-target structures (generated by tools/prepare_targets.py)
api/status.js              which connectors are live
api/store.js               shared demo data (Redis)
api/agents/records-reader.js   MedGemma reads a letter
api/agents/trial-scout.js      ClinicalTrials.gov search, optionally narrowed by ?term= (cached for an hour)
api/agents/prescreen.js        MedGemma pre-check of a live trial, with the patient's chat answers
api/agents/research.js         the team's Researcher: Gemini with PubMed, FDA labels and ClinicalTrials.gov, streamed
api/agents/analyst.js          the team's Analyst on this site's own MedGemma (refused on a cloud model)
api/connectors/fhir.js         FHIR record reader
api/agents/ask.js              the chat: Gemini agent with live-trial and action tools, or MedGemma in one step
lib/                       shared server code (MedGemma client, Redis, FHIR mapping, record schema and checks)
lib/gemini.js, lib/agent.js    native Gemini calls (structured output, function calling) and the chat agent's tools
lib/researcher.js, lib/literature.js, lib/analyst.js   the chat team: Researcher loop, public sources, Analyst prompt and clean-up
scripts/dev.mjs            local server; scripts/mock-medgemma.mjs  local stand-in model
scripts/demo-medgemma.mjs  the whole site on MedGemma through Ollama (npm run demo)
scripts/eval.mjs           offline matching test (npm run eval); results in eval/
tools/prepare_targets.py   builds targets.js from the Protein Data Bank
tests/                     npm test (fact checks, Gemini calls, the chat agent's tools and actions, the pre-check, the chat team)
LANDING-COPY.md            every word on the landing page, for editing
```

## Limits to know before sharing the link

- **Demo data only.** The app says so on screen. Don't connect a FHIR server holding real patients, and don't paste real letters. This is a prototype, not a medical device.
- **No sign-in.** Anyone with the link can change the shared demo data (size limits and rate limits apply). Anyone can also use the MedGemma endpoints, up to 30 calls per IP every 10 minutes, so watch your model costs. The Researcher has its own limit of 20 calls per IP every 10 minutes, and each call can use up to 3 Gemini calls.
- **Pre-checks are AI output.** They're labelled that way, and they never change the deterministic matching for the demo's own trials.
- **The chat only offers actions.** Every action is a card that the person confirms with a tap, after the page's own checks. Nothing a model returns applies anyone to a trial by itself.
- **Chat answers are the patient's own word.** Answers given in the chat go into the record marked as the patient's, and when the pre-check uses one, its reason starts with "You said". The care team confirms them at pre-screening.
- **Bilirubin from FHIR** is converted to "× upper limit of normal" using a typical limit (1.2 mg/dL or 21 µmol/L), and the app says so.
