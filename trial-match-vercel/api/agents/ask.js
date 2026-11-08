// POST /api/agents/ask { question, context }  ->  { text, model, steps?, sources?, actions? }
// "Ask your agent" through the site's model. The browser sends the question plus the synthetic demo facts for the
// trials in question; the instructions stay here, and the answer is checked for eligibility claims.
// With Gemini it is a tool-using agent (lib/agent.js) that can look up live trials on ClinicalTrials.gov; MedGemma
// servers answer in one step from the context.
import { HttpError, clientIp, readJson, route, send } from '../../lib/http.js';
import { rateLimit } from '../../lib/redis.js';
import { chat, medgemmaConfig } from '../../lib/medgemma.js';
import { askAgent, plainText } from '../../lib/agent.js';

const SYSTEM = 'You are the Trial Match assistant in a demo where every patient and trial is synthetic. Answer using only the JSON context. ' +
  'If the answer is not in it, say so and suggest asking the trial team. Never say someone is eligible or qualifies; the trial team decides. ' +
  'Do not give medical advice. Plain British English, at most 120 words.';
const WHO = "(you are|you're|you would be|you'd be|they are|they're|s?he is)";
const CLAIM = new RegExp('\\b' + WHO + ' (definitely |likely |probably )?(eligible|qualified)\\b|\\b(you|they|s?he) qualif(y|ies)\\b', 'i');
// "Only the trial team can confirm if you are eligible" is the disclaimer we want, not a claim, so it doesn't count.
const HEDGED = new RegExp('\\b(if|whether|whether or not)\\s+' + WHO + '\\s+(definitely |likely |probably )?(eligible|qualified)\\b|\\b(if|whether)\\s+(you|they|s?he)\\s+qualif(y|ies)\\b', 'gi');
export const claimsEligibility = (text) => CLAIM.test(String(text).replace(HEDGED, ''));

export default route(['POST'], async (req, res) => {
  const body = await readJson(req, 24 * 1024);
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : '';
  if (question.length < 2) throw new HttpError(400, 'too_short', 'Ask a question first.');
  const context = JSON.stringify(body.context && typeof body.context === 'object' ? body.context : {}).slice(0, 9000);
  await rateLimit('agent:' + clientIp(req), 30, 600);
  const prompt = 'Context (JSON):\n' + context + '\n\nQuestion: ' + question;
  const c = medgemmaConfig();
  let out;
  if (c && c.provider === 'gemini') {
    const a = await askAgent(prompt);
    out = { text: a.text, model: a.model, provider: 'gemini', family: 'Gemini', steps: a.steps, sources: a.sources, actions: a.actions };
  } else {
    const r = await chat({ system: SYSTEM, user: prompt, maxTokens: 1500 });
    if (!r.text) throw new HttpError(502, 'medgemma_empty', (r.family || 'The model') + ' ran out of room before answering.');
    out = { text: plainText(r.text), model: r.model, provider: r.provider, family: r.family };
  }
  if (claimsEligibility(out.text)) out.text += '\n\n(Only the trial team can decide eligibility.)';
  send(res, 200, out);
});
