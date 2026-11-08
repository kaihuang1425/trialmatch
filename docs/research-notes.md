# Research notes for the implementation plan

Every entry: claim → source URL → date checked. All web sources were checked on **2026-11-07**. **Unconfirmed**
means no official page confirmed it today. Pages were read through a fetch tool that sometimes summarises, so quoted
code and wording may not be byte-exact; registry data (npm, PyPI) was read from the JSON APIs directly.

`ai.google.dev/gemini-api/docs/*` now 301-redirects to `aistudio.google.com/docs/*`, and ADK docs moved to
`adk.dev`. URLs below are the pages actually read.

## Google Agent Development Kit (ADK)

**R-1. ADK Python is on 2.x; the newest release has a breaking change.** `google-adk` 2.14.0 was uploaded
2026-11-07 01:03 UTC and needs Python ≥3.11. 2.0.0 went GA on 2026-05-19. 2.14.0 changes `FunctionTool` so enum
arguments arrive as enum members, not strings. 1.27.0 was yanked. Pin an exact version.
https://pypi.org/pypi/google-adk/json · https://github.com/google/adk-python/releases (checked 2026-11-07).
Unconfirmed: a 1.x → 2.x migration guide.

**R-2. ADK Python function tools.** A plain function in `tools=[...]` is wrapped as `FunctionTool`; the name,
docstring, type hints and defaults form the schema; return a dict. `LongRunningFunctionTool` pauses a run until the
client posts the final response. https://adk.dev/tools-custom/function-tools/ (checked 2026-11-07).

**R-3. ADK tool confirmation is Experimental.** Python `FunctionTool(fn, require_confirmation=True)` (since
v1.14.0); TypeScript has `toolContext.requestConfirmation` but no `require_confirmation` flag. Not supported with
`DatabaseSessionService` or `VertexAiSessionService`. https://adk.dev/tools-custom/confirmation/ (checked 2026-11-07).

**R-4. ADK live streaming is Experimental.** Python `runner.run_live()` with `LiveRequestQueue`; needs a Live API
model (no ids listed); a FastAPI WebSocket sample exists. Only `SequentialAgent` streams among workflow agents.
TypeScript has `Runner.runLive` in source marked "experimental", not documented on adk.dev.
https://adk.dev/live/ · https://adk.dev/live/get-started/streaming-python/ · https://adk.dev/live/custom-server/index.md ·
https://github.com/google/adk-js/blob/main/core/src/runner/runner.ts (checked 2026-11-07).

**R-5. ADK Python A2A is Experimental.** `from google.adk.a2a.utils.agent_to_a2a import to_a2a`;
`from google.adk.agents.remote_a2a_agent import RemoteA2aAgent`; install `google-adk[a2a]`; agent card at
`/.well-known/agent-card.json`; works with `a2a-sdk` 0.3.x and 1.x (1.x recommended). `to_a2a` parameters include
`host` (default "localhost"), `protocol` ("http") and `port` (8000); it does not bind a port, so serve it with uvicorn
and set these to the public address, or the card advertises the wrong URL. `adk api_server --a2a` is an alternative. Go A2A also Experimental; the
A2A docs list no TypeScript quickstart. https://adk.dev/a2a/quickstart-exposing/ ·
https://adk.dev/a2a/quickstart-consuming/ · https://adk.dev/a2a/intro/ (checked 2026-11-07).

**R-6. An official ADK TypeScript SDK exists.** npm `@google/adk` 2.4.0, published 2026-10-28; 2.0.0 on
2026-08-21; Node ≥20.19. adk.dev announces "ADK TypeScript 2.0 GA". Function tools: yes (Zod schemas). An A2A
module (`toA2a`, `RemoteA2AAgent`) is in the source and the package depends on `@a2a-js/sdk`, but its maturity is
undocumented (**unconfirmed**). https://registry.npmjs.org/@google/adk · https://github.com/google/adk-js ·
https://github.com/google/adk-js/blob/main/core/src/a2a/index.ts · https://adk.dev/ (checked 2026-11-07).

**R-7. A2A SDKs.** `@a2a-js/sdk` 1.3.0 (2026-09-29), "Server & Client SDK for Agent2Agent protocol", Node ≥20,
optional Express and gRPC peer dependencies. Python `a2a-sdk` 1.3.0 (2026-10-27). **Unconfirmed:** which A2A protocol
version `@a2a-js/sdk` 1.3.0 implements, and whether it can run inside a Next.js route handler without Express.
https://registry.npmjs.org/@a2a-js/sdk · https://pypi.org/pypi/a2a-sdk/json (checked 2026-11-07).

**R-8. ADK deployment and API server.** `adk deploy cloud_run` (Python) and `npx adk deploy cloud_run` (TS) build
and deploy the agent plus API server to Cloud Run; without session/artifact URIs it uses in-memory services. Agent
Runtime (formerly Vertex AI Agent Engine) is documented for Python and Go only. `POST /run_sse` streams one JSON
event per SSE `data:` line; body fields in camelCase per the docs (**unconfirmed** on a live server).
https://adk.dev/deploy/cloud-run/ · https://adk.dev/deploy/agent-runtime/ · https://adk.dev/runtime/api-server/
(checked 2026-11-07).

## Gemini API

**R-9. Model ids and deprecations.**
- Flash: `gemini-3.8-flash` (Stable, GA 2 Sep 2026); `gemini-3.6-flash` (Stable, GA 21 Jul 2026). Neither has a
  shutdown date. 3.8 Flash: 1,048,576 input / 65,536 output tokens, structured output, function calling, PDF input;
  thinking `minimal` is not supported and errors.
- Flash-Lite: `gemini-3.5-flash-lite` (Stable). Pro: only `gemini-3.1-pro-preview` (Preview); no GA Pro.
  Flagship: `gemini-4-argon` (GA 13 Oct 2026; no Live API).
- Live: `gemini-3.8-live` (GA 15 Sep 2026, default Live model).
- Shutdowns: `gemini-3.1-flash-live-preview` and `gemini-2.5-flash-native-audio-preview-12-2025` on **17 Nov 2026**
  (earliest possible date); `gemini-2.5-pro` / `gemini-2.5-flash` auto-reroute on 1 Dec 2026; 2.0 models already gone.
- The engine's `config.ts` cites `gemini-3.6-flash` as verified Stable at https://aistudio.google.com/docs/models;
  consistent with the above.
https://aistudio.google.com/docs/models · https://aistudio.google.com/docs/models/gemini-3.8-flash ·
https://aistudio.google.com/docs/models/gemini-4-argon · https://aistudio.google.com/docs/deprecations ·
https://aistudio.google.com/docs/changelog (checked 2026-11-07).

**R-10. PDF input.** Up to 50 MB or 1,000 pages, inline or Files API (files kept 48 h). Native text is extracted
and passed to the model; pages are also rendered as images (258 tokens per page).
https://aistudio.google.com/docs/document-processing (checked 2026-11-07).

**R-11. Structured output.** JS `generateContent`: `responseMimeType: 'application/json'` plus
`responseJsonSchema` (plain JSON Schema). `minLength`, `maxLength`, `uniqueItems` and similar are accepted but not
enforced; very deep schemas return 400. Combining structured output with function calling is **Preview** on
Gemini 3/4 models. **Unconfirmed:** whether the older `responseSchema` field is deprecated.
https://aistudio.google.com/docs/structured-output.md?generate-content=true ·
https://aistudio.google.com/docs/tool-combination.md?generate-content=true (checked 2026-11-07).

**R-12. Function calling.** Declarations go in `config.tools: [{ functionDeclarations }]`. Automatic function
calling is Python-SDK-only, so JS needs a manual loop. Parallel calls supported. Modes AUTO, ANY, NONE, VALIDATED.
Thought signatures are mandatory for function calling on Gemini 3 and 4 (400 if missing); the SDK handles them when
the returned `Content` is passed back unchanged.
https://aistudio.google.com/docs/function-calling.md?generate-content=true ·
https://aistudio.google.com/docs/thought-signatures.md?generate-content=true (checked 2026-11-07).
Local check: `src/engine/llm/gemini.ts` stores `cand.content` as `providerRaw` and replays it, which matches this.

**R-13. Live API from a browser.**
- Ephemeral tokens: server-side `client.authTokens.create({ config: { uses, expireTime, newSessionExpireTime,
  liveConnectConstraints } })`; defaults 1 use, 30 min expiry, 1 min to start a session; the browser uses
  `token.name` as its API key and calls `ai.live.connect`. Gemini Developer API only: the SDK throws when `vertexai`
  is set. **Unconfirmed:** the API version tokens need (docs say `v1beta`; SDK source says `v1alpha`).
- Audio: input 16-bit little-endian PCM, natively 16 kHz (`audio/pcm;rate=16000`); the API resamples other input
  rates given in the MIME type (relayed by the fetch tool; test it). Output 24 kHz 16-bit PCM.
- Sessions: audio-only 15 min, audio+video 2 min without compression; `contextWindowCompression` (sliding window)
  removes the cap; connections last about 10 min (GoAway); session resumption handles reconnects (handle valid 2 h).
  Context 128k tokens for native audio models.
- Input and output audio transcription available; function calling supported (client answers `toolCall` with
  `sendToolResponse`). No numeric latency claim; default VAD silence about 800 ms.
https://aistudio.google.com/docs/live-api/ephemeral-tokens.md · https://aistudio.google.com/docs/live-api/capabilities ·
https://aistudio.google.com/docs/live-api/session-management.md · https://aistudio.google.com/docs/live-api/tools ·
https://github.com/googleapis/js-genai/tree/main/src (checked 2026-11-07).

**R-14. SDK versions.** `@google/genai` 3.0.0 published 2026-11-06: default Developer API version now `v1` (was
`v1beta`; the `*-latest` aliases exist only on `v1beta`), Node ≥22 required; previous 2.32.0 (2026-10-29). Python
`google-genai` 3.0.0 (2026-11-06). **Unconfirmed:** Vercel Edge runtime support; use the Node runtime.
https://registry.npmjs.org/@google%2fgenai · https://github.com/googleapis/js-genai/releases/tag/v3.0.0 ·
https://pypi.org/pypi/google-genai/json (checked 2026-11-07).
Local check: the engine's `package.json` declares `"@google/genai": "^3.0.0"`.

**R-19. Gemini API key.** `GEMINI_API_KEY` or `GOOGLE_API_KEY`; if both are set, `GOOGLE_API_KEY` wins.
https://aistudio.google.com/docs/api-key (checked 2026-11-07).

**R-25. Pricing and limits.** `gemini-3.8-flash` and `gemini-3.6-flash`: $0.75 input / $3.75 output per 1M tokens
until 31 Dec 2026. `gemini-4-argon`: $2 / $10 until 30 Nov, then $4 / $20, no free tier. `gemini-3.8-live`: audio in
$3.00 / 1M, audio out $12.00 / 1M. Free-tier data is used to improve products; paid-tier data is not.
**Unconfirmed:** free-tier RPM/RPD (shown only inside AI Studio after sign-in; one uncorroborated blog claims 20 RPD
for 3.8 Flash). https://aistudio.google.com/docs/pricing · https://aistudio.google.com/docs/rate-limits
(checked 2026-11-07).

**R-28. Interactions API.** The docs now recommend the Interactions API and call `generateContent` legacy but still
supported; the changelog announces no shutdown. https://aistudio.google.com/llms.txt ·
https://aistudio.google.com/docs/changelog (checked 2026-11-07).

## Vercel

**R-15. Function duration.** With Fluid compute: Hobby default and max 300 s; Pro default 300 s, max 800 s, 1,800 s
in beta per function. Streaming is supported but counts toward the limit; overrun returns 504. Without Fluid:
**unconfirmed** (not on current pages). https://vercel.com/docs/functions/limitations ·
https://vercel.com/docs/functions/configuring-functions/duration · https://vercel.com/docs/functions/streaming-functions
(checked 2026-11-07).

**R-16. Body size and memory.** Request or response body max 4.5 MB (413 above). Memory: Hobby 2 GB / 1 vCPU;
Pro up to 4 GB / 2 vCPU. https://vercel.com/docs/functions/limitations (checked 2026-11-07).

**R-17. WebSockets on Vercel Functions.** Available on all plans; public beta 22 Jun 2026, GA 20 Oct 2026. Next.js
uses `upgradeWebSocket()` from `@vercel/functions` ≥3.10.0. Connections close at the function's max duration and are
pinned to one instance. https://vercel.com/docs/functions/websockets ·
https://vercel.com/changelog/websocket-support-is-now-generally-available (checked 2026-11-07).

**R-18. Vercel OIDC → Google Cloud.** Workload Identity Federation via npm `@vercel/oidc` (`getVercelOidcToken`) and
`google-auth-library` `ExternalAccountClient`; project env vars `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`,
`GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`; available on
all plans; call `getVercelOidcToken()` inside the handler. A service-account JSON key in an env var also works
technically but has no official Vercel page (**unconfirmed** as documented practice).
https://vercel.com/docs/oidc/gcp · https://vercel.com/docs/oidc/reference (checked 2026-11-07).

**R-20. Python on Vercel.** GA; Python 3.12 (default), 3.13, 3.14; FastAPI zero-config; 500 MB bundle limit. ADK on
Vercel: **unconfirmed** (not documented by either side). https://vercel.com/docs/functions/runtimes/python ·
https://vercel.com/docs/frameworks/backend/fastapi (checked 2026-11-07).

**R-26. Hobby plan terms.** "Hobby teams are restricted to non-commercial personal use only"; team collaboration
features are Pro-only. How prize money is treated, and deploying an org-owned private repo on Hobby:
**unconfirmed**. https://vercel.com/docs/limits/fair-use-guidelines · https://vercel.com/docs/plans/hobby
(checked 2026-11-07).

**R-27. Vercel AI Gateway** lists `google/gemini-*` models, including `google/gemini-3.8-flash`. Not used in the
plan. https://vercel.com/ai-gateway/models?providers=google (checked 2026-11-07).

**R-29. Fluid compute** is on by default for projects created on or after 23 Apr 2025.
https://vercel.com/docs/fluid-compute (checked 2026-11-07).

## Google Cloud

**R-21. Cloud Run.** WebSockets supported with no extra configuration, subject to the request timeout (default
5 min, max 60 min). Session affinity is best effort. Min instances stay running; idle ones are billed at a lower rate
under request-based billing (exact rate **unconfirmed**). `europe-west2` (London) is a Cloud Run region.
`gcloud run deploy --source` uses buildpacks without a Dockerfile. Typical Python cold start: **unconfirmed**.
https://docs.cloud.google.com/run/docs/triggering/websockets ·
https://docs.cloud.google.com/run/docs/configuring/request-timeout ·
https://docs.cloud.google.com/run/docs/configuring/min-instances ·
https://docs.cloud.google.com/run/docs/configuring/session-affinity · https://docs.cloud.google.com/run/docs/locations ·
https://docs.cloud.google.com/run/docs/deploying-source-code (checked 2026-11-07).

**R-22. Gemini on Vertex AI in London.** The locations table marks only `gemini-4-argon` as available in
europe-west2; `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite` and `gemini-3.8-live` are not marked
there. Flash models are available on the `global` endpoint and the `eu` multi-region. The data-residency page's UK
column lists `gemini-4-argon`, `gemini-3.5-flash` and `gemini-2.5-flash`. Both tables were parsed from HTML; check in a
browser before relying on a region. https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations ·
https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency (checked 2026-11-07).
Local check: the engine's `config.ts` defaults `vertexLocation` to `europe-west2`.

**R-23. Firestore.** Free quota per day: 50,000 reads, 20,000 writes, 20,000 deletes; 1 GiB stored; one free
database per project; a Native-mode database must be created first, with a location.
https://firebase.google.com/docs/firestore/quotas ·
https://docs.cloud.google.com/firestore/native/docs/create-database-server-client-library (checked 2026-11-07).

**R-24. Firebase App Hosting.** Needs the Blaze plan; Next.js 13.5+ on Node 22+; deploys to Cloud Run; no documented
Python support. Next.js 16 support and App Router streaming: **unconfirmed**.
https://firebase.google.com/docs/app-hosting · https://firebase.google.com/docs/app-hosting/frameworks-tooling
(checked 2026-11-07).

## Claims from the owner's notes

**R-30. Synthea does not generate lung-cancer biomarkers: TRUE.** In `lung_cancer.json`,
`lung_cancer/lung_cancer_probabilities.json` and `veteran_lung_cancer.json` (master, commit `bd8a52b`, 2026-10-21):
no EGFR, ALK, ROS1, KRAS, BRAF or PD-L1 ("ALK" matches only "Alkaline phosphatase"). The module models NSCLC vs SCLC,
stages I–IV, chest X-ray/CT, biopsy, bronchoscopy, cisplatin + paclitaxel (NSCLC) or etoposide (SCLC) with
chemo/radiation, and routine labs. No other module emits these biomarkers (breast cancer has HER2/ER/PR).
https://raw.githubusercontent.com/synthetichealth/synthea/master/src/main/resources/modules/lung_cancer.json ·
https://github.com/synthetichealth/synthea (checked 2026-11-07).

**R-31. CRUK, age 75+: TRUE.** CRUK: "almost half (46%) of all new lung cancer cases in the UK are diagnosed in
people aged 75 and over" (data 2019 and 2021–2022, UK-wide). Read through a summarising fetch tool; check the live
page before putting the quote on a slide.
https://www.cancerresearchuk.org/health-professional/cancer-statistics/statistics-by-cancer-type/lung-cancer/incidence
(checked 2026-11-07).

**R-32. ClinicalTrials.gov API v2 is current.** `/api/v2/version` returned apiVersion 2.0.5, data timestamp
2026-11-06. The classic API was retired 2024-06-25 (from a search result, **unconfirmed** on the news page). Terms page
exists but is JavaScript-rendered and was not read (**unconfirmed** content).
https://clinicaltrials.gov/api/v2/version · https://clinicaltrials.gov/data-api/api ·
https://clinicaltrials.gov/about-site/terms-conditions (checked 2026-11-07).

## Local observations (repository, not web)

**R-33. Engine state on 2026-11-07 ~16:30.** Read from the scratch copy of `relay/`:
- `src/engine/config.ts`: provider `gemini`, `DEFAULT_MODEL = 'gemini-3.6-flash'`, `apiKeyEnv: 'GEMINI_API_KEY'`,
  pinned base URL `https://generativelanguage.googleapis.com/`, Vertex switch `RELAY_USE_VERTEXAI`, `maxAgentTurns: 12`,
  `DEMO_AS_OF = '2026-11-08'`.
- `src/engine/llm/gemini.ts`: `generateContent` with `functionDeclarations` + `parametersJsonSchema`,
  `automaticFunctionCalling: { disable: true }`, `responseJsonSchema` for extraction, model parts replayed verbatim.
- `src/engine/extract/verify.ts`: verbatim-quote gate, enum and type checks; biomarker enums have no `not_tested`.
- Data: 9 encoded trials; snapshot `2026-11-07T15:35:10Z`; 5 synthetic patients; 1,182 hand-written criterion labels
  over 6 patient stages. The coordinator board hard-codes 8 trials (no NCT05642572) and its own rules.
- `synthetic/templates.ts` `MOLECULAR_OPTIONS`: KRAS 6, EGFR 9, ALK 2, ROS1 2, BRAF 3, MET 3, RET 2, HER2 5 values
  (plus NRAS, HRAS, NRG1); PD-L1 TPS is a number.

**R-35. Lead-session input (not web), 2026-11-07.** From an independent Codex review of the house board and SPEC,
relayed by the session that commissioned this plan: at-screening status semantics, version-bound approvals with a
typed override reason, verification bound to (docId, value, quote span), same-task baselines (checklist filter and
LLM-only) with per-state errors and patient-level denominators, subject/time/polarity/injection safety tests, the
held-out free-text report challenge, and the engine session's instructions (switch to `@google/genai`, keep data as
Python-readable JSON, fix PD-L1 local vs central, HER2 assay-specific negatives, organ-function conjunctions,
treatment episodes, full allele lists, three-valued AND/OR). The engine changes were not verified in the tree here.

**R-34. Adversarial review.** Codex CLI 0.164.0, model gpt-6.1-sol, reasoning effort ultra, read-only, run on
2026-11-07 against the first draft. Its findings (quote-vs-value support, forged client state, fallback duplication,
unprotected spending routes, latency, injection surface, voice audio handling, A2A consent binding and deployment,
an unfair Option C comparison, eval coverage, tool count, over-firm qualifiers) were applied to the plan.
- Not yet present when read: assess, plan-next-action, alternatives, audit, diff, agent (another session is building
  them), so their names in the plan are proposals.
