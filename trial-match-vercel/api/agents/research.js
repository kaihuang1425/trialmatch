// POST /api/agents/research { aspect, about[], compare[], nct? }  ->  the Researcher's brief (lib/researcher.js)
// The online agent in the chat's team. It takes public words only (the browser's privacy guard builds them from an
// allow-list, and researchRequest() checks them again), reads PubMed, FDA labels and ClinicalTrials.gov with Gemini,
// and returns a brief in which every sentence cites a source it read.
// With "Accept: application/x-ndjson" it streams one JSON line per event, so the chat can show each lookup live:
//   { t: "start", request }   exactly what the Researcher received
//   { t: "step", id, agent, state: "run" | "ok" | "fail", label, source?, count? }
//   { t: "done", brief, sources, model, family, agentic, steps }   or   { t: "error", message }
// Without it, it answers once with the "done" object. Older callers that send { topic, terms } still work.
import { HttpError, clientIp, readJson, route, send } from '../../lib/http.js';
import { rateLimit } from '../../lib/redis.js';
import { research, researchRequest } from '../../lib/researcher.js';

export default route(['POST'], async (req, res) => {
  const body = await readJson(req, 8 * 1024);
  if (!body.about && (body.terms || body.topic)) body.about = (Array.isArray(body.terms) && body.terms.length ? body.terms : [body.topic]);
  const r = researchRequest(body);
  await rateLimit('research:' + clientIp(req), 20, 600);
  if (!/ndjson/i.test(String(req.headers.accept || ''))) return send(res, 200, await research(r));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();
  const line = (o) => res.write(JSON.stringify(o) + '\n');
  const { dropped, ...received } = r;
  line({ t: 'start', request: received, dropped });
  try {
    const out = await research(r, { onStep: (s) => line({ t: 'step', ...s }) });
    line({ t: 'done', ...out });
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    line({ t: 'error', message: e instanceof HttpError ? e.message : 'The Researcher couldn’t finish.' });
  }
  res.end();
});
