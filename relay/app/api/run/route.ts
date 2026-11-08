// Stateless live-mode route for the decks.
//   GET  /api/run → { live } : true when a Gemini key (or Vertex AI) is configured. Never returns the key.
//   POST /api/run { log, action } → NDJSON AgentEvents. The server folds the action log over its own
//        fixtures in replay mode, then runs the new action's trigger in live mode. Clients send
//        actions only, never facts or state, and nothing is kept between requests.
// Replay mode never calls this route: the decks run the same engine in the browser.

import { TRIALS } from '@/src/engine/data';
import { runAgent } from '@/src/engine/agent';
import { cleanAction, cleanLog, triggerFor } from '@/lib/actions';
import { foldLog } from '@/lib/fold';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function liveConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  const vertex = process.env.RELAY_USE_VERTEXAI === 'true' && !!process.env.GOOGLE_CLOUD_PROJECT?.trim();
  return !!key || vertex;
}

export async function GET() {
  return Response.json({ live: liveConfigured() }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  if (!liveConfigured()) return Response.json({ error: 'Live mode is not configured; the decks run replay in the browser.' }, { status: 409 });
  let body: { log?: unknown; action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  const log = cleanLog(body.log);
  const action = cleanAction(body.action);
  if (!action) return Response.json({ error: 'action is missing or not allowed' }, { status: 400 });
  const prior = await foldLog(log);
  const trigger = triggerFor(prior.state, TRIALS, action);
  if (!trigger) return Response.json({ error: 'this action does not change the record' }, { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of runAgent({ mode: 'live', state: prior.state, trigger })) {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + '\n'));
        }
      } catch (e) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: (e as Error).message, recoverable: false }) + '\n'));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
