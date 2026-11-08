// The SYN-0417 demo story, end to end through the replay agent.
import { describe, expect, it } from 'vitest';
import { TRIALS } from '../src/engine/data';
import { createPatientState } from '../src/engine/state';
import { DEFAULT_DEMO_MOLECULAR } from '../src/engine/synthetic/templates';
import type { RelayState } from '../src/engine/types';
import { ACRONYM, collect, done, statusByAcronym } from './helpers';

const row = (s: RelayState, acronym: string, id: string) => s.assessments[ACRONYM[acronym]].results.find((r) => r.criterionId === id)!;

async function start(): Promise<RelayState> {
  return done(await collect({ mode: 'replay', state: createPatientState('SYN-0417'), trigger: { type: 'start' } })).state;
}

describe('SYN-0417 before the molecular report', () => {
  it('biomarker rows are unknown, RASolve 301 and Lung-MAP already conflict, nothing else does', async () => {
    const s = await start();
    expect(statusByAcronym(s)).toEqual({
      'CodeBreaK 202': 'needs_evidence',
      'KANDLELIT-007': 'needs_evidence',
      'Krascendo 2': 'needs_evidence',
      'RASolve 301': 'not_match',
      ALPACCA: 'needs_evidence',
      COPERNICUS: 'needs_evidence',
      ALKAZAR: 'needs_evidence',
      'Beamion LUNG-1': 'needs_evidence',
      'Lung-MAP S1900G': 'not_match',
    });
    for (const [a, id] of [
      ['CodeBreaK 202', 'cb202-kras'],
      ['KANDLELIT-007', 'kl007-kras'],
      ['Krascendo 2', 'kr2-kras'],
      ['ALPACCA', 'alp-pacc'],
      ['COPERNICUS', 'cop-egfr'],
      ['ALKAZAR', 'alk-alk'],
      ['Beamion LUNG-1', 'bm1-her2'],
      ['Lung-MAP S1900G', 'lm-met'],
    ] as const) {
      expect(row(s, a, id).state, id).toBe('unknown');
      expect(row(s, a, id).unknownReasons, id).toEqual(['missing']);
    }
    expect(row(s, 'RASolve 301', 'rs301-prior-lines').state).toBe('conflicting');
  });

  it('the top next action is one molecular pathology report, and it needs approval', async () => {
    const events = await collect({ mode: 'replay', state: createPatientState('SYN-0417'), trigger: { type: 'start' } });
    const action = done(events).nextAction!;
    expect(action.kind).toBe('request_document');
    expect(action.documentKind).toBe('molecular');
    expect(action.requiresApproval).toBe(true);
    expect(action.unblocks.length).toBe(7);
    expect(action.openCount).toBeGreaterThanOrEqual(12);
    expect(action.headline).toMatch(/^A molecular pathology report would resolve \d+ open requirements across 7 studies$/);
    expect(events.some((e) => e.type === 'proposal' && e.proposal.kind === 'send_request' && e.proposal.status === 'pending')).toBe(true);
  });
});

describe('SYN-0417 after the default molecular report (KRAS G12C, PD-L1 0%)', () => {
  it('EGFR/ALK/MET studies conflict, KRAS first-line studies move forward, labs stay unknown/stale', async () => {
    const before = await start();
    const s = done(await collect({ mode: 'replay', state: before, trigger: { type: 'document_added', molecular: DEFAULT_DEMO_MOLECULAR } })).state;
    expect(statusByAcronym(s)).toEqual({
      'CodeBreaK 202': 'ready',
      'KANDLELIT-007': 'needs_review',
      'Krascendo 2': 'needs_evidence',
      'RASolve 301': 'not_match',
      ALPACCA: 'not_match',
      COPERNICUS: 'not_match',
      ALKAZAR: 'not_match',
      'Beamion LUNG-1': 'needs_evidence',
      'Lung-MAP S1900G': 'not_match',
    });
    // CodeBreaK 202: local PD-L1 supported, central confirmation left to the study team at screening
    expect(row(s, 'CodeBreaK 202', 'cb202-pdl1-local').state).toBe('supported');
    const central = row(s, 'CodeBreaK 202', 'cb202-pdl1-central');
    expect(central.atScreening).toBe(true);
    expect(s.assessments[ACRONYM['CodeBreaK 202']].statusLabel).toMatch(/Ready for prescreening review \(1 item checked by the study team at screening\)/);
    // labs 49 days old: unknown with stale, not conflicting
    const organ = row(s, 'Krascendo 2', 'kr2-organ');
    expect(organ.state).toBe('unknown');
    expect(organ.stale?.observedOn).toBe('2026-09-20');
    // HER2 negative on NGS does not rule out overexpression: needs_review, not a conflict
    expect(row(s, 'Beamion LUNG-1', 'bm1-her2').state).toBe('needs_review');
  });

  it('PD-L1 60% flips CodeBreaK 202 to conflict and changes nothing else', async () => {
    const before = await start();
    const zero = done(await collect({ mode: 'replay', state: before, trigger: { type: 'document_added', molecular: DEFAULT_DEMO_MOLECULAR } })).state;
    const sixty = done(await collect({ mode: 'replay', state: before, trigger: { type: 'document_added', molecular: { ...DEFAULT_DEMO_MOLECULAR, pdl1Tps: 60 } } })).state;
    const changed: string[] = [];
    for (const t of TRIALS) {
      const a = zero.assessments[t.id];
      const b = sixty.assessments[t.id];
      if (a.status !== b.status) changed.push(`${t.acronym}:status`);
      for (const r of a.results) {
        const r2 = b.results.find((x) => x.criterionId === r.criterionId)!;
        if (r.state !== r2.state) changed.push(r.criterionId);
      }
    }
    expect(changed).toEqual(['CodeBreaK 202:status', 'cb202-pdl1-local']);
    expect(sixty.assessments[ACRONYM['CodeBreaK 202']].status).toBe('not_match');
  });

  it('a judge value of TPS 0.5 stays 0.5 end to end', async () => {
    const before = await start();
    const s = done(await collect({ mode: 'replay', state: before, trigger: { type: 'document_added', molecular: { ...DEFAULT_DEMO_MOLECULAR, pdl1Tps: 0.5 } } })).state;
    const f = s.facts.find((x) => x.key === 'pdl1_tps')!;
    expect(f.value).toBe(0.5);
    expect(f.source.quote).toContain('0.5%');
    expect(row(s, 'CodeBreaK 202', 'cb202-pdl1-local').state).toBe('supported');
  });
});
