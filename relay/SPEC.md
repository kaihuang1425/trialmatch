# Relay — product spec (working name)

Agentverse 2026, Biotech track, 7–8 Nov 2026. Brief: "Make the path to patients faster" (slides 11–14 of `AV slides.pptx`).

## One line

A patient keeps one profile. An agent checks it against a small portfolio of lung-cancer trials, criterion by criterion, with a cited passage for every decision. When information is missing, the agent works out which single piece of evidence would move the most referrals forward, drafts the request, and re-assesses every affected trial when the evidence arrives. A coordinator signs off every invitation. A trial that falls through keeps the patient's progress.

## Who and what bottleneck

- **Primary user:** an oncology clinical research coordinator (or research nurse) screening referrals for a defined set of NSCLC studies.
- **Second user:** the patient, who sees what each study involves, what still needs checking, and can say "I'm interested — arrange a discussion".
- **Bottleneck:** coordinators and patients repeatedly compare complex criteria with incomplete records. The same missing report stalls several referrals at once, and a failed referral restarts from nothing.
- **What we measure:** time and number of actions to prepare a referral for informed human review, on synthetic cases. Nothing about enrolment, benefit or real-world performance.

## Claims we make and don't make

| We show | We never show |
|---|---|
| Which requirements the evidence supports, contradicts, or leaves open | A "success rate" or any probability of enrolment or benefit |
| The exact passage and document date behind every decision | A verdict without a source |
| What single next step would resolve the most open requirements | Autonomous ordering of tests or contact with anyone without approval |
| Synthetic-case evaluation against a stated baseline, with n | Real-world accuracy claims |

Final eligibility belongs to the study team using the current protocol. Site availability, invitations and hospital accounts are **simulated** and labelled as such. **No real patient data, ever** (slide 12): every patient is synthetic and every synthetic document carries a `SYNTHETIC` mark.

## Owner's standing feedback (verbatim, top of every brief)

- "Make design boards first."
- "Remember, microinteraction animation is key."
- From the owner's brief: "Make the moment when new evidence changes the assessment the centre of the demonstration."
- From the owner's brief: "Get that working before spending significant time on swipe animations." (Swipe is a gesture on top of labelled buttons, never instead of them.)
- From the owner's brief: "Show important uncertainties on the front of the card."

## Criterion states (the core vocabulary)

Every criterion of every trial, for one patient, is in exactly one state:

| State | Meaning | Glyph | Colour token |
|---|---|---|---|
| `supported` | Available evidence satisfies the requirement | filled circle + check | `--ok` green |
| `conflicting` | Evidence contradicts the requirement | filled diamond + cross | `--conflict` vermilion |
| `unknown` | Information absent **or outdated** (sub-reason `missing` / `stale`) | dashed hollow ring | `--open` amber |
| `needs_review` | Cannot be resolved reliably by the system; a clinician decides | half-filled circle | `--review` violet |

A `supported` decision can additionally carry `pendingVerification: true` (the coordinator has not yet ticked it). Shapes differ as well as colours, so the states read in greyscale and for colour-blind users.

Some `needs_review` items can only be checked by the study team at screening (central PD-L1 confirmation, protocol criteria the registry lists as "not limited to", HIV status). They carry `atScreening: true` and are shown as "checked at screening", never hidden.

**Trial-level status** is derived, never scored:
- any `conflicting` on a mandatory criterion → **Not a match on current evidence** (shows which one);
- else any `unknown` → **Potential match — needs evidence**;
- else any `needs_review` that is not `atScreening` → **Potential match — needs clinical review**;
- else → **Ready for prescreening review** (with the count of items checked at screening).

Coordinator verification binds to the cited evidence (document, value, quote span) and is invalidated when any of them changes. "Invite anyway" with open or conflicting items requires a typed reason, recorded with the exact open items, record version and registry snapshot.

Clinical eligibility, **patient preferences** (travel, schedule) and **site availability** are three separate lanes. A nearby site never compensates for a failed criterion; a missing report never auto-disqualifies.

## Colour meanings (each colour has one job)

| Meaning | Token | Value (light) |
|---|---|---|
| Supported / done / confirmed | `--ok` | `#1D7A4F` |
| Conflict | `--conflict` | `#B93B28` |
| Open: missing or outdated evidence; the agent's next step lives here | `--open` | `#9A5B00` text, `#E9A23B` ring |
| Needs a clinician's judgement | `--review` | `#5B43C9` |
| Source: a document, a passage, a site location ("where it came from") | `--source` | `#2B57C9` |
| Waiting count bubble only | `--alarm` | `#D42A1C` |

Everything else is neutral ink on warm paper. Dark surfaces (rail, selection bar, toast) carry weight; the work area stays light.

## Type roles

- **Display:** Fraunces (variable, optical size) — page titles, big counts.
- **Text:** IBM Plex Sans — everything you read.
- **Mono:** IBM Plex Mono — synthetic IDs, NCT IDs, dates, counts, values with units, document names.

## Views

### Coordinator (house board — most used, sets the style)

1. **Referrals queue.** Page head: title, mono count, one view switch (To review · Waiting on evidence · Invited · Closed) with a sliding underline. One search field. Above the list, one **agent card**: the single next action that resolves the most open requirements ("A molecular pathology report would resolve 7 open requirements across 6 studies"), with Review request.
2. **Referral card (front).** Synthetic ID, age, diagnosis line; trial acronym + cohort; derived status; the **evidence strip** (one segment per criterion, coloured by state, conflicts first) with mono counts; the most important uncertainty in one line; the next action. Whole card opens the details panel.
3. **Details panel** (480 px desktop, full width phone). Header: patient + trial + derived status + record versions (`Patient record v3 · Trial snapshot 2026-11-07`). Criterion rows: requirement · evidence · state. A row expands to the **exact requirement text and the source passage** with the cited span highlighted, document name and date. Extracted values are correctable inline (the correction is logged and the row re-evaluates). Tabs: Criteria · History (audit of extractions, corrections, approvals). Footer actions: **Invite for prescreening · Request information · Not suitable · Save for review**.
4. **Not suitable** opens an inline reason sheet: Protocol requirement not met · No place in cohort (simulated) · Evidence insufficient · Travel not manageable · Patient prefers another option. The reason decides what the agent does next.
5. **Request composer** (inline in the panel): the drafted request, what it unblocks (list of studies), recipient (simulated referring team), Approve & send.
6. **Evidence arrival.** A synthetic document is dropped (or generated from the "synthetic report" sheet, where a judge can set values). The agent extracts facts with passages, then re-assesses every affected referral; cards update in sequence; a receipt summarises what changed.
7. **Site unavailable (alternative path).** Coordinator marks a simulated site/cohort unavailable → the agent keeps the profile, records the operational reason, and offers other sites or studies within the patient's travel preference.

### Patient

1. **Your profile.** Extracted facts as rows with their source; missing facts as dashed slots ("Molecular pathology report — asked for on 7 Nov"). Upload synthetic documents. Preferences (travel distance, days available) kept visibly separate from clinical facts.
2. **Opportunities.** One card per suggested study in plain language: what it investigates; why it was suggested (linked to their facts); what still needs checking; treatments, procedures and study groups; location and visit schedule; duration and support; research team contact; source link and last verified date. Actions: **I'm interested — arrange a discussion · Not for me (reason) · Save**. Patients can express interest before any invitation.
3. **Conversations.** Status per study: You're interested → Team reviewing → Discussion offered. Mutual interest is the moment both sides have said yes.

## Data model (TypeScript, `src/engine/types.ts`)

```ts
type CriterionState = 'supported' | 'conflicting' | 'unknown' | 'needs_review';

interface SourceDoc { id: string; patientId: string; kind: 'referral_summary' | 'pathology' | 'molecular' | 'labs' | 'imaging' | 'letter';
  title: string; date: string; version: number; synthetic: true; text: string; }

interface Fact { key: FactKey; value: string | number | boolean; unit?: string; observedOn?: string;
  source: { docId: string; quote: string; start: number; end: number };   // quote MUST occur verbatim in doc text
  extractedBy: 'rules' | 'llm' | 'human'; verified: boolean; }

interface Criterion { id: string; trialId: string; kind: 'inclusion' | 'exclusion'; text: string;   // verbatim from registry
  plain: string;                       // short coordinator wording
  logic: Rule;                         // structured; AND/OR preserved; units and time windows explicit
  needsFacts: FactKey[]; mandatory: boolean; derivedFrom: 'criteria' | 'title' | 'conditions'; }

interface CriterionResult { criterionId: string; state: CriterionState; reason: string; evidence: Fact[];
  missing?: FactKey[]; stale?: { key: FactKey; observedOn: string; windowDays: number }; pendingVerification?: boolean; }

interface Assessment { patientId: string; trialId: string; patientVersion: number; trialSnapshot: string;
  results: CriterionResult[]; status: 'not_match' | 'needs_evidence' | 'needs_review' | 'ready'; computedAt: string; }

interface NextAction { kind: 'request_document' | 'ask_patient' | 'clinical_review' | 'find_alternatives';
  target: FactKey[]; unblocks: { trialId: string; criterionIds: string[] }[]; draft: string; requiresApproval: true; }

interface AuditEvent { at: string; actor: 'agent' | 'coordinator' | 'patient' | 'system'; type: string; detail: object;
  patientVersion?: number; trialSnapshot?: string; }
```

## The agent

One orchestrating agent with explicit tools. The tools hold the invariants; the model chooses the order.

| Tool | Does | Guardrail |
|---|---|---|
| `extract_facts(docId)` | LLM extraction of the fact keys we care about, each with a verbatim quote | A fact whose quote is not found verbatim in the document is rejected and logged |
| `assess(patientId, trialId?)` | Deterministic rules over verified facts → `Assessment` per trial | Missing → `unknown`; outside time window → `unknown/stale`; unparseable logic → `needs_review`. Never guesses. |
| `plan_next_action(patientId)` | Ranks missing facts by how many open requirements across trials each would resolve | Proposes only; never sends |
| `draft_request(action)` | Plain, specific request text naming the document and what it unblocks | Requires coordinator approval to "send" (simulated) |
| `find_alternatives(patientId, reason)` | Other sites/studies after a failed option, filtered by preferences | Preferences filter, never override eligibility |
| `explain_for_patient(assessment)` | Plain-language explanation for the patient view | Must cite the same facts; no outcome predictions |

Two run modes producing the **same event stream** (the UI animates events): `live` (Claude tool use; model ids in one config file) and `replay` (deterministic policy calling the same tools, no network) so the demo never depends on Wi-Fi.

## Live demo script (4-minute pitch, 2 minutes for judges)

1. Synthetic patient SYN-0417 uploads a referral summary. The board shows the 8 portfolio studies with a UK site (the Lung-MAP sub-study has none).
2. Coordinator view: one study (RASolve 301) conflicts on a documented fact; seven are blocked by the same missing molecular report.
3. Agent card: "Request the molecular pathology report — resolves 12 open requirements across 7 studies." Coordinator approves the drafted request (the approved wording is recorded).
4. **Judge input:** a judge sets values in the synthetic molecular report sheet (e.g., KRAS G12C, PD-L1 TPS 0% or 60%) and drops it in.
5. The agent cites the new passages and updates every affected study in sequence: EGFR/ALK studies flip to conflict; HER2 "mutation/amplification not detected" becomes a review item for Beamion (overexpression wasn't tested); KRAS G12C studies move forward; PD-L1 decides CodeBreaK 202 (local result supported, central confirmation checked at screening). Unresolved items stay unresolved (bloods older than the Relay 28-day policy).
6. Coordinator verifies the cited evidence and approves a prescreening invitation. Patient sees the plain-language card and says "I'm interested".
7. Alternative path: a simulated cohort is marked full → the agent keeps the profile and offers the next site within the patient's travel range.

## Trial portfolio (ClinicalTrials.gov API v2 snapshot, `data/trials/raw/`, dated in `SNAPSHOT_DATE`)

| NCT | Acronym | Why it's in the set |
|---|---|---|
| NCT05920356 | CodeBreaK 202 | KRAS G12C, 1L, requires PD-L1 negative — PD-L1 decides it |
| NCT07190248 | KANDLELIT-007 | KRAS G12C (title), 1L; registry lists "main" criteria only → some rows `needs_review` |
| NCT06793215 | Krascendo 2 | KRAS G12C, 1L, needs documented PD-L1 status and adequate organ function (labs window) |
| NCT06881784 | RASolve 301 | RAS-mutant, **previously treated** — conflicts for a 1L patient |
| NCT07185997 | ALPACCA | EGFR PACC uncommon mutations, 1L |
| NCT06667076 | (amivantamab SC 2b) | Common EGFR mutations, 1L / 2L cohorts |
| NCT06765109 | ALKAZAR | ALK-positive, 1L |
| NCT04886804 | Beamion LUNG-1 | HER2 aberrations, phase 1 |
| NCT05642572 | Lung-MAP sub-study (capmatinib + osimertinib) | EGFR-mutant, MET-amplified, recurrent/stage IV |

Criteria are encoded by hand from the snapshot text, reviewed, and every encoded rule keeps a pointer to its verbatim text. Data licence: ClinicalTrials.gov content is public (NLM terms); cite the source and snapshot date.

## Evaluation (synthetic only, stated n)

- **Cases:** 5 synthetic patients × 9 trials, gold labels per criterion written **before** generating the documents (facts first, documents second).
- **Baseline:** condition + age + location filter, then "eligible" if all three pass.
- **Measures:** criterion-state accuracy; missed exclusions (a documented conflict reported as anything else); wrongly discarded (an eligible or unresolved pairing reported as not a match); evidence accuracy (quote matches the gold passage); unknown handling (missing facts stay `unknown`); actions to reach a reviewable referral.
- Report as "synthetic-case evaluation, n = 45 patient–trial pairs".

## Stack

- Next.js (App Router) + TypeScript; engine is plain TS under `src/engine` with no framework imports, tested with Vitest.
- Motion: CSS transitions/keyframes + the Web Animations API; Motion (motion.dev) for layout/FLIP in the real app.
- LLM: Claude via the Anthropic SDK behind an `LlmProvider` interface (a Gemini adapter can drop in). Construct the client with an explicit `baseURL: "https://api.anthropic.com"` (this machine sets `ANTHROPIC_BASE_URL` for Claude Code).
- Deploy: Vercel, `replay` mode by default so judges can test without keys.
