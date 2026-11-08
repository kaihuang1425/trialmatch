// Gemini API, called natively (generateContent with a Google AI Studio key). Used when no MedGemma server is set.
// Native rather than through the OpenAI-compatible route because it gives us three things that route doesn't:
//  - structured output: the reply must match a JSON Schema, so the Records Reader and the pre-check always parse;
//  - function calling, with Gemini's thought signatures passed back unchanged (the chat agent's live-trial tools);
//  - a system instruction kept apart from the user's text.
import { HttpError, fetchJson } from './http.js';

// Pinned, so nothing else on the machine can reroute the key.
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export function geminiConfig() {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) return null;
  return { key, model: (process.env.GEMINI_MODEL || '').trim() || DEFAULT_GEMINI_MODEL };
}

// One generateContent call. `contents` is the whole conversation so far; a model turn that asked for tools must be
// passed back exactly as it came (it carries the thought signature), followed by a user turn of functionResponse parts.
export async function generate({ system, contents, schema, tools, toolMode = 'AUTO', maxTokens = 4096, thinking = 'LOW', timeoutMs = 25000 }) {
  const c = geminiConfig();
  if (!c) throw new HttpError(503, 'medgemma_not_configured', 'No AI model is connected on this site.');
  if (!/^[a-z0-9][a-z0-9.\-]*$/i.test(c.model)) throw new HttpError(500, 'bad_model', 'GEMINI_MODEL is not a valid model name.');
  const body = {
    contents,
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    ...(tools && tools.length ? { tools: [{ functionDeclarations: tools }], toolConfig: { functionCallingConfig: { mode: toolMode } } } : {}),
    // No temperature: Gemini 3 models are tuned for the default. maxOutputTokens includes the thinking tokens.
    generationConfig: {
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingLevel: thinking },
      ...(schema ? { responseMimeType: 'application/json', responseJsonSchema: schema } : {})
    }
  };
  const out = await fetchJson(BASE + encodeURIComponent(c.model) + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
    body: JSON.stringify(body)
  }, timeoutMs);
  const cand = out && Array.isArray(out.candidates) ? out.candidates[0] : null;
  if (!cand) {
    const why = out && out.promptFeedback && out.promptFeedback.blockReason;
    throw new HttpError(502, 'medgemma_empty', why ? 'Gemini declined to answer (' + why + ').' : 'Gemini returned no answer.');
  }
  const parts = (cand.content && Array.isArray(cand.content.parts)) ? cand.content.parts : [];
  return {
    content: { role: 'model', parts },
    text: parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim(),
    calls: parts.filter((p) => p.functionCall).map((p) => ({ id: p.functionCall.id, name: p.functionCall.name, args: p.functionCall.args || {} })),
    finish: cand.finishReason || null,
    model: out.modelVersion || c.model
  };
}
