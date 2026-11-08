// Provider-neutral LLM interface. The Gemini adapter lives in ./gemini.ts; another provider can
// implement the same interface without touching the agent or the extractor.

export interface LlmToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema object
}

export type LlmBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

export type LlmInputBlock = LlmBlock | { type: 'tool_result'; toolUseId: string; name: string; content: string; isError?: boolean };

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string | LlmInputBlock[];
  /** Provider-native assistant content, replayed verbatim (keeps thinking blocks intact). */
  providerRaw?: unknown;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  /** Ask for JSON matching this schema (structured output). */
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
  model?: string;
  purpose: 'extract' | 'agent' | 'draft';
}

export interface LlmResponse {
  content: LlmBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'pause_turn' | 'other';
  assistantMessage: LlmMessage; // append this to continue the conversation
  model: string;
}

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export class LiveModeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveModeUnavailableError';
  }
}

export function textOf(res: LlmResponse): string {
  return res.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
