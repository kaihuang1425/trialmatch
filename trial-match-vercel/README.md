# Trial Match on Vercel

The landing page (`/`) and the demo app (`/app/`), with the app's agents connected to real services. Static files plus a few Node.js serverless functions, with no build step and no npm dependencies.

| Agent in the app | Connected to | What it does | If not set up |
|---|---|---|---|
| **Records Reader** (clinic letters) | **MedGemma** | Pulls facts out of a pasted letter, each with the exact words it came from | Reads the letter on the device, as before |
| **Skeptic** check | Server code | Drops any fact whose quote isn't in the source word for word, or doesn't state the value. The app lists what it left out, and **Try a trick letter** loads a letter that plants an instruction, a relative's result and a scan that hasn't been done, so anyone can test it | Always on |
| **Connect a record** | **FHIR R4 server** + MedGemma | Reads conditions, results, medicines and reports, read-only; maps lab codes (LOINC) directly, and MedGemma reads the rest | Shows the synthetic demo records |
| **Trial Scout** | **ClinicalTrials.gov API v2** | Lists recruiting phase III lung cancer trials with UK hospitals, live. `?term=` narrows it to a gene change or drug, which the chat uses to search from a patient's record | Needs no setup |
| **Pre-check** (Matcher, live trials) | **MedGemma** + ClinicalTrials.gov | Reads a live trial's full entry rules and checks them against the record: met / not met / to check | Button hidden, with a note |
| **Research agent** (in the chat) | **Europe PMC** (PubMed and preprints) + the site's model | Finds recent papers on a trial's drug or target, and writes a short summary in which every sentence cites one of them | Lists the papers, with no summary |
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
- **Research a drug** (`api/agents/research.js`). A question such as "what's known about this drug?" searches Europe PMC for papers since 2019 on the trial's drug or target. Live trials use their listed treatments, and the demo trials have search phrases in the app. With a model connected, it reads the top 5 abstracts and writes at most 90 words. Citations to papers it wasn't given are removed, and so is any sentence left with no citation. The agent only sees search words, never the record.
- **Find and check.** "Search for live trials" makes the patient's agent search ClinicalTrials.gov from their record (EGFR, ALK, KRAS G12C, ROS1, or PD-L1 of 50% or more). It ranks the results with fixed rules, with no AI. When the site has a model, it pre-checks the closest trial and says which unknown entry rules would settle it. Each step shows above the answer.

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

Open http://localhost:8768/app/. The first run adds a local model, `medgemma-demo`: the same weights, with a 16k context so the pre-check prompts fit. It ignores any Gemini key in `.env.local`, so patient text stays on the computer. The only outside services the agents call are ClinicalTrials.gov, Europe PMC and the public FHIR test server.

To test the MedGemma plumbing without a GPU, `npm run mock:medgemma` starts a stand-in on port 8790. Set `MEDGEMMA_BASE_URL=http://127.0.0.1:8790/v1` and `MEDGEMMA_API_KEY=test-key` to use it. It only pattern-matches, so never deploy with it.

Run the tests with:

```bash
npm test
```

They cover the fact checks, plus the Gemini calls, the chat agent's tool loop and its action proposals against a stubbed network.

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
api/agents/prescreen.js        MedGemma pre-check of a live trial
api/agents/research.js         Research agent: Europe PMC papers, with a cited summary
api/connectors/fhir.js         FHIR record reader
api/agents/ask.js              the chat: Gemini agent with live-trial and action tools, or MedGemma in one step
lib/                       shared server code (MedGemma client, Redis, FHIR mapping, record schema and checks)
lib/gemini.js, lib/agent.js    native Gemini calls (structured output, function calling) and the chat agent's tools
scripts/dev.mjs            local server; scripts/mock-medgemma.mjs  local stand-in model
scripts/demo-medgemma.mjs  the whole site on MedGemma through Ollama (npm run demo)
scripts/eval.mjs           offline matching test (npm run eval); results in eval/
tools/prepare_targets.py   builds targets.js from the Protein Data Bank
tests/                     npm test (fact checks, Gemini calls, the chat agent's tools and actions)
LANDING-COPY.md            every word on the landing page, for editing
```

## Limits to know before sharing the link

- **Demo data only.** The app says so on screen. Don't connect a FHIR server holding real patients, and don't paste real letters. This is a prototype, not a medical device.
- **No sign-in.** Anyone with the link can change the shared demo data (size limits and rate limits apply). Anyone can also use the MedGemma endpoints, up to 30 calls per IP every 10 minutes, so watch your model costs. The Research agent has its own limit of 20 calls per IP every 10 minutes, and its summaries also use the model.
- **Pre-checks are AI output.** They're labelled that way, and they never change the deterministic matching for the demo's own trials.
- **The chat only offers actions.** Every action is a card that the person confirms with a tap, after the page's own checks. Nothing a model returns applies anyone to a trial by itself.
- **Bilirubin from FHIR** is converted to "× upper limit of normal" using a typical limit (1.2 mg/dL or 21 µmol/L), and the app says so.
