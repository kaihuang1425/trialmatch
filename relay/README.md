# Relay

Relay checks one synthetic patient against nine lung-cancer trials, criterion by criterion, and cites the passage behind every decision. When evidence is missing it works out which single document would resolve the most open requirements, drafts the request, and re-assesses every affected trial when the document arrives. A coordinator approves every request and invitation. Agentverse 2026, Biotech track.

Engine, data and evaluation only; the UI is built separately on top of `src/engine` and `/api/agent`.

## Run

```bash
npm i
npm test            # Vitest: rules, story, agent, safety, live (fake model), route
npm run typecheck
npm run eval        # writes eval/results.md (replay mode, no network)
npm run dev         # http://localhost:3000, API at /api/agent
npm run build
```

Regenerate data: `npm run encode` (trials from `data/trials/raw`) then `npm run synth` (documents and labels from the hand-written facts). `npx tsx scripts/demo-trace.ts` prints the SYN-0417 demo as an event stream.

## Modes

- **replay** (default): a deterministic policy calls the agent tools; rules extractor; no network. The demo works offline.
- **live**: Gemini chooses the order of the same tools (function calling) and extracts facts with structured output. Needs `GEMINI_API_KEY`. Model id lives only in `src/engine/config.ts` (`gemini-3.6-flash`, checked on 2026-11-07; override with `RELAY_MODEL`). For Vertex AI set `RELAY_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` and use Application Default Credentials (not exercised here). Without a key, live mode emits a clear `error` event and changes nothing.

Both modes emit the same `AgentEvent` stream: `plan`, `tool_call`, `tool_result`, `fact_rejected`, `needs_review`, `assessment_changed` (with the per-criterion diff), `proposal` (needs approval), `message`, `error`, `done` (carries the new state).

## API

- `GET /api/agent?patientId=SYN-0417[&documents=initial|all|none][&sessionId=…]` → `{ sessionId, state, patients, availableDocuments, trials }`
- `POST /api/agent` with `{ sessionId?, patientId?, state?, mode?, trigger }` → NDJSON, one event per line. Triggers: `start`, `document_added` (`doc` or judge-set `molecular` values), `fact_corrected`, `fact_verified`, `site_unavailable`, `preference_changed`, `approve`, `reject`.

## Data and licences

- **Trials**: ClinicalTrials.gov API v2 records for 9 studies, snapshot 2026-11-07 (`data/trials/raw`, unmodified). Public registry content from the U.S. National Library of Medicine; used under the ClinicalTrials.gov terms and conditions, cited with source URL and snapshot date in every encoded trial. Encoded criteria in `data/trials/encoded` keep the verbatim registry text.
- **Patients**: five SYNTHETIC patients. Facts were written by hand first; documents were generated from those facts by templates; every document starts with a SYNTHETIC banner. No real patient data, ever. See `data/DATA.md`.
- **Relay policy** (`data/policy/relay-policy.json`): prescreening choices that are not protocol rules (28-day lab recency, PD-L1 negative = TPS < 1%, a dated table of UK targeted-therapy approvals that was not verified against NICE/MHRA). Every row that uses a policy says so.
- Site availability, invitations and recipients are **simulated**. City coordinates are approximate.

## Safeguards

- A fact enters the record only if its quote is found verbatim in the document; quotes about relatives, negated sentences and historical specimens are caught; every rejection is an event and an audit entry.
- Missing evidence is `unknown` (missing, not tested or stale), never a conflict; ambiguity is `needs_review`; nothing is guessed.
- Requests and invitations need a coordinator approval recorded in the audit log; the send functions throw without it and the model has no send tool.
- Document text is treated as data; instructions inside documents are ignored.
- Preferences and site availability filter options; they never change eligibility. Final eligibility belongs to the study team.
- Evaluation is a synthetic-case evaluation with stated n and its limitations (`eval/results.md`).
