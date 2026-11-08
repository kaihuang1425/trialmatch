// MedGemma client. One OpenAI-compatible chat call covers every way MedGemma is usually served:
//
//  1. Vertex AI (Model Garden deployment). Set MEDGEMMA_VERTEX_BASE_URL to
//       https://{DEDICATED_ENDPOINT_DNS}/v1beta1/projects/{PROJECT}/locations/{REGION}/endpoints/{ENDPOINT_ID}
//     (or https://{REGION}-aiplatform.googleapis.com/v1beta1/... for a shared endpoint) and
//     GOOGLE_SERVICE_ACCOUNT_JSON to a service-account key (raw JSON or base64) with the Vertex AI User role.
//  2. Hugging Face Inference Endpoints, vLLM, TGI or any OpenAI-compatible server. Set MEDGEMMA_BASE_URL
//     (ending in /v1), MEDGEMMA_API_KEY and MEDGEMMA_MODEL (for example google/medgemma-27b-text-it).
//  3. No MedGemma server yet: Gemini, called natively (lib/gemini.js) with structured output. Set GEMINI_API_KEY
//     (Google AI Studio) and optionally GEMINI_MODEL. Gemini runs in Google's cloud, so the app labels it as such and
//     points people to MedGemma on their own computer for privacy. MedGemma always wins when both are set.
import crypto from 'node:crypto';
import { HttpError, fetchJson } from './http.js';
import { generate, geminiConfig } from './gemini.js';

export function medgemmaConfig() {
  const env = process.env;
  if (env.MEDGEMMA_VERTEX_BASE_URL && env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    // Vertex's OpenAI-compatible route takes an empty model name (the endpoint already fixes the model).
    return { provider: 'vertex', base: env.MEDGEMMA_VERTEX_BASE_URL.replace(/\/+$/, ''), model: env.MEDGEMMA_VERTEX_MODEL || '' };
  }
  if (env.MEDGEMMA_BASE_URL) {
    return { provider: 'openai', base: env.MEDGEMMA_BASE_URL.replace(/\/+$/, ''), key: env.MEDGEMMA_API_KEY || '',
      model: env.MEDGEMMA_MODEL || 'google/medgemma-27b-text-it' };
  }
  const g = geminiConfig();
  if (g) return { provider: 'gemini', model: g.model };
  return null;
}

export function medgemmaLabel() {
  const c = medgemmaConfig();
  if (!c) return null;
  // agent: the chat can call tools (live ClinicalTrials.gov lookups); only the Gemini path has them
  if (c.provider === 'gemini') return { provider: 'Gemini API (Google cloud)', model: c.model, family: 'Gemini', cloud: true, agent: true };
  return { provider: c.provider === 'vertex' ? 'Vertex AI' : 'OpenAI-compatible endpoint', model: c.model || 'MedGemma (Vertex deployment)', family: 'MedGemma', cloud: false };
}

// ---- Google service-account token (JWT bearer grant), cached per instance
let tok = null;
function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function serviceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim();
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const sa = JSON.parse(json);
  if (!sa.client_email || !sa.private_key) throw new HttpError(500, 'bad_service_account', 'GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.');
  return sa;
}
async function googleToken() {
  if (tok && tok.exp > Date.now() + 60000) return tok.value;
  const sa = serviceAccount();
  const aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const iat = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud, iat, exp: iat + 3600 }));
  const sig = b64url(crypto.createSign('RSA-SHA256').update(head + '.' + claims).sign(sa.private_key));
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claims + '.' + sig });
  const out = await fetchJson(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, 15000);
  tok = { value: out.access_token, exp: Date.now() + (out.expires_in || 3600) * 1000 };
  return tok.value;
}

// MedGemma 1.5 and 27B can "think" first; the answer follows the <unused95> marker.
function stripThinking(text) {
  if (text.includes('<unused94>') && !text.includes('<unused95>')) return '';   // still thinking when it hit the token limit
  const i = text.lastIndexOf('<unused95>');
  return (i >= 0 ? text.slice(i + '<unused95>'.length) : text).replace(/<unused\d+>/g, '').trim();
}

// `schema` (a JSON Schema) makes Gemini's reply match it exactly. MedGemma servers get the same shape described in the
// prompt, and parseJson reads their reply leniently.
export async function chat({ system, user, maxTokens = 1500, schema }) {
  const c = medgemmaConfig();
  if (!c) throw new HttpError(503, 'medgemma_not_configured', 'No AI model is connected on this site.');
  if (c.provider === 'gemini') {
    // maxOutputTokens counts Gemini's thinking too, so give it room on top of the answer
    const r = await generate({ system, contents: [{ role: 'user', parts: [{ text: user }] }], schema, maxTokens: maxTokens + 2048, timeoutMs: 50000 });
    if (!r.text) throw new HttpError(502, 'medgemma_empty', r.finish === 'MAX_TOKENS' ? 'Gemini ran out of room before answering.' : 'Gemini returned no text.');
    return { text: r.text, model: r.model, provider: 'gemini', family: 'Gemini' };
  }
  const name = 'MedGemma';
  const auth = c.provider === 'vertex' ? await googleToken() : c.key;
  // One user turn: some MedGemma servers reject a separate system role.
  const messages = [{ role: 'user', content: (system ? system + '\n\n' : '') + user }];
  const out = await fetchJson(c.base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) },
    body: JSON.stringify({ model: c.model, messages, max_tokens: maxTokens, temperature: 0 })
  }, 55000);
  const msg = out && out.choices && out.choices[0] && out.choices[0].message;
  let content = msg && msg.content;
  if (Array.isArray(content)) content = content.map((p) => (typeof p === 'string' ? p : p.text || '')).join('');
  if (typeof content !== 'string') throw new HttpError(502, 'medgemma_empty', name + ' returned no text.');
  return { text: stripThinking(content), model: out.model || c.model || 'medgemma', provider: c.provider, family: name };
}

// Pulls the first JSON object out of a model reply (tolerates ```json fences and stray prose).
export function parseJson(text) {
  const t = text.replace(/```(?:json)?/gi, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new HttpError(502, 'medgemma_bad_json', 'MedGemma did not reply with JSON.');
  try { return JSON.parse(t.slice(start, end + 1)); } catch { throw new HttpError(502, 'medgemma_bad_json', 'MedGemma did not reply with valid JSON.'); }
}
