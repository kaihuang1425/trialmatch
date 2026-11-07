# Trial Match on Vercel

The landing page (`/`) and the demo app (`/app/`), with the app's agents connected to real services. Static files plus a few Node.js serverless functions, with no build step and no npm dependencies.

| Agent in the app | Connected to | What it does | If not set up |
|---|---|---|---|
| **Records Reader** (clinic letters) | **MedGemma** | Pulls facts out of a pasted letter, each with the exact words it came from | Reads the letter on the device, as before |
| **Skeptic** check | Server code | Drops any fact whose quote isn't in the source word for word, or doesn't state the value | Always on |
| **Connect a record** | **FHIR R4 server** + MedGemma | Reads conditions, results, medicines and reports, read-only; maps lab codes (LOINC) directly, and MedGemma reads the rest | Shows the synthetic demo records |
| **Trial Scout** | **ClinicalTrials.gov API v2** | Lists recruiting phase III lung cancer trials with UK hospitals, live | Needs no setup |
| **Pre-check** (Matcher, live trials) | **MedGemma** + ClinicalTrials.gov | Reads a live trial's full entry rules and checks them against the record: met / not met / to check | Button hidden, with a note |
| **Shared demo data** | **Upstash Redis** | Everyone who opens the site sees and changes the same demo | Changes stay in each browser |
| Matching for the demo's own trials (LT-301…) | Rules in code | Unchanged and deterministic: an agent never decides eligibility | n/a |
| **Ask your agent** (chat, patients and clinicians) | Built-in answers, or **MedGemma on the visitor's computer** (Ollama), or **MedGemma on this site** | Answers from the record and the trial rules; typed questions can go to MedGemma, labelled as a draft, with eligibility claims flagged | Built-in answers |

### MedGemma for the chat

The chat offers three sources, and visitors choose between them in the chat itself:

- **Built-in.** This works everywhere and needs no setup. The answers are worked out from the record and the trial rules.
- **MedGemma on this computer (desktop).** The chat detects Windows, Mac or Linux. It shows one copy-paste command that lets the site talk to Ollama, restarts Ollama and downloads `medgemma1.5:4b` (about 3.3 GB). It then finds the model by itself. Questions never leave that computer. The site's security policy allows only `localhost:11434`.
- **MedGemma on this site.** This works on any device, phones included, once the deployment has a MedGemma server set in the variables below. Any OpenAI-compatible server works, including Ollama's own API (`MEDGEMMA_BASE_URL=http://<host>:11434/v1`, `MEDGEMMA_MODEL=medgemma1.5:4b`). If you serve it with Ollama, start it with `OLLAMA_CONTEXT_LENGTH=16384` so the longer trial pre-check prompts fit.

These were tested with MedGemma 1.5 4B on an RTX 5070 Ti laptop: chat answers took about 8 to 20 seconds, including the model's thinking.

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
   - **FHIR:** set `FHIR_BASE_URL`. For testing, `https://r4.smarthealthit.org` is a public sandbox of synthetic patients with no token. `FHIR_DEMO_PATIENT_ID=1a96f2e7-7ce0-4164-b3f6-4fdffeca00fb` is one of its lung cancer patients. Add `FHIR_BEARER_TOKEN` for a server that needs one.

Every variable is described in `.env.example`.

## Run it locally

```bash
npm run dev
```

This serves the site at http://localhost:3000 the way Vercel would (same redirects and headers, and `api/` runs). It reads `.env.local`. Restart after editing anything in `lib/`.

To test the MedGemma plumbing without a GPU, `npm run mock:medgemma` starts a stand-in on port 8790. Set `MEDGEMMA_BASE_URL=http://127.0.0.1:8790/v1` and `MEDGEMMA_API_KEY=test-key` to use it. It only pattern-matches, so never deploy with it.

Run the tests with:

```bash
npm test
```

They cover the fact checks.

## Files

```
public/index.html          landing page (all its text is in LANDING-COPY.md)
public/media/              landing videos and posters
public/app/index.html      the demo app, with the 3D protein view in each applicant sheet
public/app/connectors.js   browser side of the connectors
public/app/protein/, vendor/  3D viewer, PDB structures, 3Dmol.js (BSD-3, licence in vendor/)
api/status.js              which connectors are live
api/store.js               shared demo data (Redis)
api/agents/records-reader.js   MedGemma reads a letter
api/agents/trial-scout.js      ClinicalTrials.gov search (cached for an hour)
api/agents/prescreen.js        MedGemma pre-check of a live trial
api/connectors/fhir.js         FHIR record reader
lib/                       shared server code (MedGemma client, Redis, FHIR mapping, record schema and checks)
scripts/dev.mjs            local server; scripts/mock-medgemma.mjs  local stand-in model
LANDING-COPY.md            every word on the landing page, for editing
```

## Limits to know before sharing the link

- **Demo data only.** The app says so on screen. Don't connect a FHIR server holding real patients, and don't paste real letters. This is a prototype, not a medical device.
- **No sign-in.** Anyone with the link can change the shared demo data (size limits and rate limits apply). Anyone can also use the MedGemma endpoints, up to 30 calls per IP every 10 minutes, so watch your model costs.
- **Pre-checks are AI output.** They're labelled that way, and they never change the deterministic matching for the demo's own trials.
- **Bilirubin from FHIR** is converted to "× upper limit of normal" using a typical limit (1.2 mg/dL or 21 µmol/L), and the app says so.
