// Scripted provider for tests. No network, no key. Each call pops the next scripted response,
// or calls a handler that can inspect the request.

import type { LlmBlock, LlmProvider, LlmRequest, LlmResponse } from './provider';

export type FakeStep = LlmBlock[] | ((req: LlmRequest) => LlmBlock[]);

export class FakeProvider implements LlmProvider {
  readonly name = 'fake';
  readonly calls: LlmRequest[] = [];
  private steps: FakeStep[];

  constructor(steps: FakeStep[]) {
    this.steps = [...steps];
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.calls.push(JSON.parse(JSON.stringify(req)));
    const step = this.steps.shift();
    if (!step) return done([{ type: 'text', text: 'Done.' }]);
    const content = typeof step === 'function' ? step(req) : step;
    return done(content);
  }
}

function done(content: LlmBlock[]): LlmResponse {
  const stopReason = content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn';
  return { content, stopReason, model: 'fake', assistantMessage: { role: 'assistant', content } };
}
