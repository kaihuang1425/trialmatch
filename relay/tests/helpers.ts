import { runAgent, type RunAgentOptions } from '../src/engine/agent';
import { assessAll } from '../src/engine/assess';
import { TRIALS } from '../src/engine/data';
import type { AgentEvent } from '../src/engine/events';
import { extractWithRules } from '../src/engine/extract/rules';
import { verifyCandidates } from '../src/engine/extract/verify';
import { createPatientState } from '../src/engine/state';
import type { Fact, FactKey, FactValue, RelayState, SourceDoc } from '../src/engine/types';

export const FIXED_CLOCK = () => '2026-11-08T10:00:00.000Z';

export async function collect(opts: RunAgentOptions): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of runAgent({ clock: FIXED_CLOCK, ...opts })) out.push(e);
  return out;
}

export function done(events: AgentEvent[]): Extract<AgentEvent, { type: 'done' }> {
  const d = events.find((e) => e.type === 'done');
  if (!d || d.type !== 'done') throw new Error('no done event');
  return d;
}

/** State with the given documents read by the rules extractor and assessed (no agent). */
export function assessedState(patientId: string, documents: 'initial' | 'all', extraDocs: SourceDoc[] = []): RelayState {
  const s = createPatientState(patientId, { documents });
  s.documents.push(...extraDocs);
  for (const d of s.documents) {
    s.facts.push(...verifyCandidates(d, extractWithRules(d), 'rules').accepted);
    s.extractedDocIds.push(d.id);
  }
  s.assessments = assessAll(s, TRIALS, FIXED_CLOCK());
  return s;
}

export function fact(key: FactKey, value: FactValue, extra: Partial<Fact> = {}): Fact {
  return {
    id: `T#${key}@${Math.random().toString(36).slice(2)}`,
    key,
    value,
    observedOn: '2026-11-01',
    source: { docId: 'TEST', quote: `${key}: ${String(value)}`, start: 0, end: 1 },
    extractedBy: 'rules',
    verified: true,
    ...extra,
  };
}

export const ACRONYM = Object.fromEntries(TRIALS.map((t) => [t.acronym, t.id]));
export function statusByAcronym(s: RelayState): Record<string, string> {
  return Object.fromEntries(TRIALS.map((t) => [t.acronym, s.assessments[t.id]?.status]));
}
