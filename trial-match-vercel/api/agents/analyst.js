// POST /api/agents/analyst { question, brief, sources, context }  ->  { text, model, family }
// The Analyst on this site's own MedGemma server (npm run demo on this laptop, or a private MedGemma deployment).
// It reads the Researcher's public brief against the synthetic record. It refuses to run on a cloud model: on a site
// whose only model is Gemini, the record stays in the browser and the Analyst runs there (Ollama) or as fixed rules.
import { HttpError, clientIp, readJson, route, send } from '../../lib/http.js';
import { rateLimit } from '../../lib/redis.js';
import { chat, medgemmaConfig } from '../../lib/medgemma.js';
import { analystClean, analystPrompt, analystSystem, analystText } from '../../lib/analyst.js';

const NOTE = '(Only the trial team can decide eligibility.)';

export default route(['POST'], async (req, res) => {
  const c = medgemmaConfig();
  if (!c) throw new HttpError(503, 'medgemma_not_configured', 'No MedGemma is connected on this site.');
  if (c.provider === 'gemini') throw new HttpError(409, 'record_stays_local', 'This site’s only model runs in Google’s cloud, so the Analyst won’t send your record to it.');
  const body = await readJson(req, 32 * 1024);
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : '';
  if (!body.brief || !Array.isArray(body.brief.sentences) || !body.brief.sentences.length) throw new HttpError(400, 'no_brief', 'The Analyst needs the Researcher’s brief.');
  await rateLimit('agent:' + clientIp(req), 30, 600);
  const team = body.context && body.context.role === 'trial team';
  const r = await chat({ system: analystSystem(team), user: analystPrompt(question, body.brief, body.sources, body.context), maxTokens: 900 });
  const out = analystClean(analystText(r.text));
  if (!out.text) throw new HttpError(502, 'medgemma_empty', 'MedGemma ran out of room before answering.');
  send(res, 200, { text: out.text + (out.claims ? '\n\n' + NOTE : ''), model: r.model, family: r.family || 'MedGemma', provider: r.provider });
});
