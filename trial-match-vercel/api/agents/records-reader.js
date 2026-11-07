// POST /api/agents/records-reader { text }  ->  { facts, evidence, rejected, model }
// MedGemma reads a clinic letter or report; each fact comes back with the words that state it, and facts whose
// quote is not in the letter (or does not state the value) are dropped before the app sees them.
import { HttpError, clientIp, readJson, route, send } from '../../lib/http.js';
import { rateLimit } from '../../lib/redis.js';
import { readRecord } from '../../lib/records.js';

export default route(['POST'], async (req, res) => {
  const body = await readJson(req, 32 * 1024);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < 20) throw new HttpError(400, 'too_short', 'Paste a little more of the letter first.');
  if (text.length > 12000) throw new HttpError(413, 'too_large', 'That letter is too long. Paste up to 12,000 characters.');
  await rateLimit('agent:' + clientIp(req), 30, 600);
  const out = await readRecord(text, 'a clinic letter or clinical report');
  send(res, 200, out);
});
