// Relay agent API.
//   GET  /api/agent?patientId=SYN-0417[&documents=initial|all|none][&sessionId=...]
//        -> { sessionId, state, patients, availableDocuments, trials }
//   POST /api/agent  { sessionId?, patientId?, state?, mode?: 'replay'|'live', documents?, trigger }
//        -> NDJSON: one AgentEvent per line; the last line is { type: 'done', state, ... }
// State resolution for POST: body.state, else the stored session, else a fresh patient state.

import {
  TRIALS,
  availableDocuments,
  listPatients,
  runAgent,
  store,
  createPatientState,
  type RelayState,
  type Trigger,
} from '@/src/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function newSessionId(): string {
  return `S-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function trialSummaries() {
  return TRIALS.map((t) => ({
    id: t.id,
    acronym: t.acronym,
    briefTitle: t.briefTitle,
    phase: t.phase,
    sponsor: t.sponsor,
    status: t.status,
    snapshotDate: t.snapshotDate,
    criteria: t.criteria.length,
    sites: t.sites,
    source: t.source,
  }));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId') ?? newSessionId();
  const patientId = url.searchParams.get('patientId') ?? 'SYN-0417';
  const documents = (url.searchParams.get('documents') as 'initial' | 'all' | 'none' | null) ?? 'initial';
  let state = store.get(sessionId);
  try {
    if (!state) state = store.create(sessionId, patientId, { documents });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  return Response.json({ sessionId, state, patients: listPatients(), availableDocuments: availableDocuments(state), trials: trialSummaries() });
}

interface PostBody {
  sessionId?: string;
  patientId?: string;
  state?: RelayState;
  mode?: 'replay' | 'live';
  documents?: 'initial' | 'all' | 'none';
  trigger?: Trigger;
}

export async function POST(req: Request) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  if (!body.trigger || typeof body.trigger.type !== 'string') {
    return Response.json({ error: 'trigger is required, e.g. {"type":"start"}' }, { status: 400 });
  }
  const sessionId = body.sessionId ?? newSessionId();
  let state: RelayState;
  try {
    state = body.state ?? store.get(sessionId) ?? createPatientState(body.patientId ?? 'SYN-0417', { documents: body.documents ?? 'initial' });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  if (state.synthetic !== true) return Response.json({ error: 'Relay accepts synthetic patients only.' }, { status: 400 });
  const mode = body.mode === 'live' ? 'live' : 'replay';
  const trigger = body.trigger;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of runAgent({ mode, state, trigger })) {
          if (ev.type === 'done') store.set(sessionId, ev.state);
          controller.enqueue(encoder.encode(JSON.stringify(ev) + '\n'));
        }
      } catch (e) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: (e as Error).message, recoverable: false }) + '\n'));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-relay-session': sessionId,
    },
  });
}
