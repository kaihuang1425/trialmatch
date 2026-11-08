// Live mode (Gemini) without a network: fake provider for the loop, and a key-less failure check.
import { afterEach, describe, expect, it } from 'vitest';
import { LLM_CONFIG } from '../src/engine/config';
import { createLlmExtractor, parseExtraction } from '../src/engine/extract/llm';
import { FakeProvider } from '../src/engine/llm/fake';
import { GeminiProvider, createGeminiClient } from '../src/engine/llm/gemini';
import { LiveModeUnavailableError } from '../src/engine/llm/provider';
import { createPatientState } from '../src/engine/state';
import { DEFAULT_DEMO_MOLECULAR, makeMolecularReport } from '../src/engine/synthetic/templates';
import { collect, done } from './helpers';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('Gemini provider configuration', () => {
  it('fails with a clear message when no key is set', async () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => new GeminiProvider()).toThrow(LiveModeUnavailableError);
    expect(() => new GeminiProvider()).toThrow(/GEMINI_API_KEY/);
    const events = await collect({ mode: 'live', state: createPatientState('SYN-0417'), trigger: { type: 'start' } });
    expect(events.map((e) => e.type)).toEqual(['error', 'done']);
    expect(events[0].type === 'error' && events[0].message).toMatch(/Live mode needs a Gemini API key/);
  });

  it('pins the Gemini endpoint even when GOOGLE_GEMINI_BASE_URL is set on the machine', () => {
    process.env.GOOGLE_GEMINI_BASE_URL = 'https://example.invalid/';
    const client = createGeminiClient('test-key-not-real');
    const base = (client as unknown as { apiClient: { getBaseUrl(): string } }).apiClient.getBaseUrl();
    expect(base.startsWith(LLM_CONFIG.geminiBaseUrl)).toBe(true);
  });
});

describe('live loop with a fake model emits the same event shapes as replay', () => {
  it('extract → assess → plan → draft → propose, chosen by the model', async () => {
    const s0 = done(await collect({ mode: 'replay', state: createPatientState('SYN-0417'), trigger: { type: 'start' } })).state;
    const mol = makeMolecularReport(DEFAULT_DEMO_MOLECULAR);
    // extraction (structured output): one real quote, one fabricated quote
    const extractor = createLlmExtractor(
      new FakeProvider([
        [
          {
            type: 'text',
            text: JSON.stringify({
              facts: [
                { key: 'kras', value: 'G12C', value_type: 'string', quote: 'KRAS: c.34G>T p.(G12C) mutation detected.' },
                { key: 'egfr', value: 'L858R', value_type: 'string', quote: 'EGFR: p.(L858R) detected.' },
              ],
            }),
          },
        ],
      ]),
    );
    // the agent loop: the model picks the tools
    const loop = new FakeProvider([
      [{ type: 'tool_use', id: 't1', name: 'extract_facts', input: { docId: mol.id } }],
      [{ type: 'tool_use', id: 't2', name: 'assess', input: {} }],
      [{ type: 'tool_use', id: 't3', name: 'plan_next_action', input: {} }],
      [{ type: 'text', text: 'KRAS G12C recorded; studies re-assessed.' }],
    ]);
    const events = await collect({ mode: 'live', state: s0, provider: loop, extractor, trigger: { type: 'document_added', doc: mol } });
    const types = new Set(events.map((e) => e.type));
    for (const t of ['plan', 'tool_call', 'tool_result', 'fact_rejected', 'assessment_changed', 'message', 'done']) expect(types.has(t as never), t).toBe(true);
    const rejected = events.find((e) => e.type === 'fact_rejected');
    expect(rejected && rejected.type === 'fact_rejected' && rejected.key).toBe('egfr');
    const after = done(events).state;
    expect(after.facts.some((f) => f.key === 'kras' && f.value === 'G12C' && f.extractedBy === 'llm')).toBe(true);
    expect(after.audit.some((a) => a.type === 'fact_rejected')).toBe(true);
  });

  it('parses structured extraction output and keeps decimals', () => {
    const c = parseExtraction(JSON.stringify({ facts: [{ key: 'pdl1_tps', value: '0.5', value_type: 'number', unit: '%', quote: 'TPS 0.5%' }] }));
    expect(c[0].value).toBe(0.5);
  });
});
