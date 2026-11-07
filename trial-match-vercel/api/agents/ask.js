// POST /api/agents/ask { question, context }  ->  { text, model }
// "Ask your agent" through MedGemma on this site's server. The browser sends the question plus the synthetic demo facts
// for the trials in question; the instructions stay here, and the answer is checked for eligibility claims.
import { HttpError, clientIp, readJson, route, send } from '../../lib/http.js';
import { rateLimit } from '../../lib/redis.js';
import { chat } from '../../lib/medgemma.js';

const SYSTEM = 'You are the Trial Match assistant in a demo where every patient and trial is synthetic. Answer using only the JSON context. ' +
  'If the answer is not in it, say so and suggest asking the trial team. Never say someone is eligible or qualifies; the trial team decides. ' +
  'Do not give medical advice. Plain British English, at most 120 words.';
const CLAIM = /\b(you are|you're|you would be|you'd be|they are|they're|s?he is) (definitely |likely |probably )?(eligible|qualified)\b|\b(you|they|s?he) qualif(y|ies)\b/i;

export default route(['POST'], async (req, res) => {
  const body = await readJson(req, 24 * 1024);
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : '';
  if (question.length < 2) throw new HttpError(400, 'too_short', 'Ask a question first.');
  const context = JSON.stringify(body.context && typeof body.context === 'object' ? body.context : {}).slice(0, 9000);
  await rateLimit('agent:' + clientIp(req), 30, 600);
  const r = await chat({ system: SYSTEM, user: 'Context (JSON):\n' + context + '\n\nQuestion: ' + question, maxTokens: 1500 });
  let text = r.text;
  if (!text) throw new HttpError(502, 'medgemma_empty', 'MedGemma ran out of room before answering.');
  if (CLAIM.test(text)) text += '\n\n(Only the trial team can decide eligibility.)';
  send(res, 200, { text, model: r.model, provider: r.provider });
});
