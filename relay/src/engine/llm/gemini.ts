// Gemini adapter for the LlmProvider interface (Google Gen AI SDK, @google/genai).
// API key mode: GEMINI_API_KEY, endpoint pinned in config. Vertex AI mode: see LLM_CONFIG notes.

import { type Content, GoogleGenAI, type Part } from '@google/genai';
import { LLM_CONFIG } from '../config';
import { LiveModeUnavailableError, type LlmBlock, type LlmMessage, type LlmProvider, type LlmRequest, type LlmResponse } from './provider';

export function readGeminiKey(): string | undefined {
  const v = typeof process !== 'undefined' ? process.env[LLM_CONFIG.apiKeyEnv] : undefined;
  return v && v.trim() ? v.trim() : undefined;
}

export function createGeminiClient(apiKey?: string): GoogleGenAI {
  if (LLM_CONFIG.useVertexAI) {
    if (!LLM_CONFIG.vertexProject) {
      throw new LiveModeUnavailableError('Vertex AI mode needs GOOGLE_CLOUD_PROJECT (and GOOGLE_CLOUD_LOCATION). Use mode "replay" or set them.');
    }
    return new GoogleGenAI({ vertexai: true, project: LLM_CONFIG.vertexProject, location: LLM_CONFIG.vertexLocation });
  }
  const key = apiKey ?? readGeminiKey();
  if (!key) {
    throw new LiveModeUnavailableError(
      `Live mode needs a Gemini API key in ${LLM_CONFIG.apiKeyEnv} (or RELAY_USE_VERTEXAI=true with GOOGLE_CLOUD_PROJECT). None is set, so use mode "replay" (deterministic, no network) or set the key and retry.`,
    );
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: { baseUrl: LLM_CONFIG.geminiBaseUrl, timeout: LLM_CONFIG.timeoutMs },
  });
}

let callSeq = 0;

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(opts: { apiKey?: string; model?: string; client?: GoogleGenAI } = {}) {
    this.client = opts.client ?? createGeminiClient(opts.apiKey);
    this.model = opts.model ?? LLM_CONFIG.model;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const model = req.model ?? this.model;
    let res;
    try {
      res = await this.client.models.generateContent({
        model,
        contents: req.messages.map(toContent),
        config: {
          systemInstruction: req.system,
          maxOutputTokens: req.maxTokens ?? LLM_CONFIG.maxTokens,
          ...(req.tools?.length
            ? {
                tools: [
                  {
                    functionDeclarations: req.tools.map((t) => ({
                      name: t.name,
                      description: t.description,
                      parametersJsonSchema: t.inputSchema,
                    })),
                  },
                ],
                automaticFunctionCalling: { disable: true }, // Relay runs every tool itself, with guardrails
              }
            : {}),
          ...(req.jsonSchema ? { responseMimeType: 'application/json', responseJsonSchema: req.jsonSchema } : {}),
        },
      });
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      if (/API key|401|403|PERMISSION_DENIED|UNAUTHENTICATED/i.test(msg)) throw new LiveModeUnavailableError(`Gemini rejected the credentials: ${msg}`);
      if (/404|not found/i.test(msg)) throw new LiveModeUnavailableError(`Model "${model}" was not found; set RELAY_MODEL to a model id your key can use.`);
      throw new Error(`Gemini call failed (${msg}); use replay mode offline.`);
    }

    const cand = res.candidates?.[0];
    const parts: Part[] = cand?.content?.parts ?? [];
    const content: LlmBlock[] = [];
    for (const p of parts) {
      if (p.thought) continue;
      if (p.functionCall) {
        callSeq += 1;
        content.push({ type: 'tool_use', id: p.functionCall.id ?? `gcall-${callSeq}`, name: p.functionCall.name ?? '', input: p.functionCall.args ?? {} });
      } else if (typeof p.text === 'string') {
        content.push({ type: 'text', text: p.text });
      }
    }
    const fr = String(cand?.finishReason ?? '');
    let stopReason: LlmResponse['stopReason'] = 'other';
    if (res.promptFeedback?.blockReason || /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/.test(fr)) stopReason = 'refusal';
    else if (content.some((b) => b.type === 'tool_use')) stopReason = 'tool_use';
    else if (fr === 'MAX_TOKENS') stopReason = 'max_tokens';
    else if (fr === 'STOP' || fr === '') stopReason = 'end_turn';
    return {
      content,
      stopReason,
      model: res.modelVersion ?? model,
      // Replay the model's own parts (keeps thought signatures intact for multi-turn function calling).
      assistantMessage: { role: 'assistant', content, providerRaw: cand?.content },
    };
  }
}

function toContent(m: LlmMessage): Content {
  if (m.role === 'assistant' && m.providerRaw) return m.providerRaw as Content;
  const role = m.role === 'assistant' ? 'model' : 'user';
  if (typeof m.content === 'string') return { role, parts: [{ text: m.content }] };
  const parts: Part[] = m.content.map((b): Part => {
    if (b.type === 'text') return { text: b.text };
    if (b.type === 'tool_use') return { functionCall: { id: b.id, name: b.name, args: (b.input ?? {}) as Record<string, unknown> } };
    return {
      functionResponse: {
        id: b.toolUseId,
        name: b.name,
        response: b.isError ? { error: b.content } : { output: b.content },
      },
    };
  });
  return { role, parts };
}
