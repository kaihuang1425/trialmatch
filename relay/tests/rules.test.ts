import { describe, expect, it } from 'vitest';
import { TRIALS } from '../src/engine/data';
import { evalRule, evaluateCriterion } from '../src/engine/rules';
import { FACT_KEYS, type Rule } from '../src/engine/types';
import { convert } from '../src/engine/units';
import { fact } from './helpers';

const ctx = (facts = [] as ReturnType<typeof fact>[]) => ({ facts, asOf: '2026-11-08' });
const ecogLe1: Rule = { op: 'cmp', key: 'ecog', cmp: '<=', value: 1 };
const krasG12c: Rule = { op: 'is', key: 'kras', value: 'G12C' };

describe('three-valued AND / OR', () => {
  it('AND with an established conflict is conflicting even when another input is missing', () => {
    const r = evalRule({ op: 'and', args: [ecogLe1, krasG12c] }, ctx([fact('ecog', 2)]));
    expect(r.state).toBe('conflicting');
  });
  it('OR with any supported input is supported even when another input is missing', () => {
    const r = evalRule({ op: 'or', args: [ecogLe1, krasG12c] }, ctx([fact('ecog', 0)]));
    expect(r.state).toBe('supported');
  });
  it('AND of supported and missing is unknown; OR of conflicting and missing is unknown', () => {
    expect(evalRule({ op: 'and', args: [ecogLe1, krasG12c] }, ctx([fact('ecog', 1)])).state).toBe('unknown');
    expect(evalRule({ op: 'or', args: [ecogLe1, krasG12c] }, ctx([fact('ecog', 3)])).state).toBe('unknown');
  });
  it('NOT of a missing fact stays unknown', () => {
    expect(evalRule({ op: 'not', arg: krasG12c }, ctx()).state).toBe('unknown');
  });
});

describe('numeric thresholds with units', () => {
  const hb: Rule = { op: 'cmp', key: 'lab_hemoglobin', cmp: '>=', value: 9.0, unit: 'g/dL' };
  it('converts g/L to g/dL', () => {
    expect(evalRule(hb, ctx([fact('lab_hemoglobin', 128, { unit: 'g/L' })])).state).toBe('supported');
    expect(evalRule(hb, ctx([fact('lab_hemoglobin', 85, { unit: 'g/L' })])).state).toBe('conflicting');
  });
  it('converts /mm3 to 10^9/L and handles x ULN with the printed reference limit', () => {
    expect(convert(1500, '/mm3', '10^9/L')).toBe(1.5);
    const bili: Rule = { op: 'cmp', key: 'lab_bilirubin', cmp: '<=', value: 1.5, unit: 'xULN' };
    expect(evalRule(bili, ctx([fact('lab_bilirubin', 30, { unit: 'umol/L', refHigh: 21 })])).state).toBe('supported');
    expect(evalRule(bili, ctx([fact('lab_bilirubin', 40, { unit: 'umol/L', refHigh: 21 })])).state).toBe('conflicting');
    expect(evalRule(bili, ctx([fact('lab_bilirubin', 40, { unit: 'umol/L' })])).state).toBe('needs_review');
  });
  it('an unknown unit is needs_review, never a comparison of mismatched numbers', () => {
    expect(evalRule(hb, ctx([fact('lab_hemoglobin', 12, { unit: 'furlongs' })])).state).toBe('needs_review');
  });
  it('keeps decimals: TPS 0.5% is below 1%', () => {
    const r: Rule = { op: 'cmp', key: 'pdl1_tps', cmp: '<', value: 1, unit: '%' };
    expect(evalRule(r, ctx([fact('pdl1_tps', 0.5, { unit: '%' })])).state).toBe('supported');
  });
});

describe('missing evidence never becomes a conflict', () => {
  it('no criterion of any trial is conflicting on an empty record', () => {
    for (const t of TRIALS) for (const c of t.criteria) expect(evaluateCriterion(c, ctx()).state, c.id).not.toBe('conflicting');
  });
  it('no criterion is conflicting when every fact is "not_tested", and not_tested is reported as such', () => {
    const facts = FACT_KEYS.map((k) => fact(k, 'not_tested'));
    for (const t of TRIALS) for (const c of t.criteria) expect(evaluateCriterion(c, ctx(facts)).state, c.id).not.toBe('conflicting');
    const r = evaluateCriterion(TRIALS[0].criteria.find((c) => c.id === 'cb202-kras')!, ctx([fact('kras', 'not_tested')]));
    expect(r.state).toBe('unknown');
    expect(r.unknownReasons).toEqual(['not_tested']);
    const m = evaluateCriterion(TRIALS[0].criteria.find((c) => c.id === 'cb202-kras')!, ctx());
    expect(m.unknownReasons).toEqual(['missing']);
  });
});

describe('time windows', () => {
  it('labs older than the Relay policy window are unknown / stale', () => {
    const kr = TRIALS.find((t) => t.acronym === 'Krascendo 2')!.criteria.find((c) => c.id === 'kr2-organ')!;
    const old = ['lab_anc', 'lab_hemoglobin', 'lab_platelets', 'lab_bilirubin', 'lab_alt', 'lab_ast', 'lab_creatinine'].map((k) =>
      fact(k as never, 1, { observedOn: '2026-09-20' }),
    );
    const r = evaluateCriterion(kr, ctx(old));
    expect(r.state).toBe('unknown');
    expect(r.stale?.windowDays).toBe(28);
    expect(r.stale?.windowSource).toBe('relay_policy');
    expect(r.unknownReasons).toContain('stale');
  });
  it('protocol windows come from the registry text (Lung-MAP brain imaging, 42 days)', () => {
    const lm = TRIALS.find((t) => t.acronym === 'Lung-MAP S1900G')!.criteria.find((c) => c.id === 'lm-brain-imaging')!;
    expect(evaluateCriterion(lm, ctx([fact('brain_mets', 'none', { observedOn: '2026-09-12' })])).stale?.windowSource).toBe('protocol');
    expect(evaluateCriterion(lm, ctx([fact('brain_mets', 'none', { observedOn: '2026-10-20' })])).state).toBe('supported');
  });
});

describe('HER2 negatives are assay-specific (Beamion LUNG-1)', () => {
  const her2 = TRIALS.find((t) => t.acronym === 'Beamion LUNG-1')!.criteria.find((c) => c.id === 'bm1-her2')!;
  it('negative NGS for mutation and amplification is needs_review, not a conflict', () => {
    const r = evaluateCriterion(her2, ctx([fact('her2_mutation', 'not_detected'), fact('her2_amplification', 'not_detected'), fact('nrg1', 'not_detected')]));
    expect(r.state).toBe('needs_review');
  });
  it('documented overexpression is supported; no report at all is unknown', () => {
    expect(evaluateCriterion(her2, ctx([fact('her2_overexpression', 'ihc_3plus')])).state).toBe('supported');
    expect(evaluateCriterion(her2, ctx()).state).toBe('unknown');
  });
});

describe('coordinator verification binding', () => {
  it('is void when the value, document or quote span changes', async () => {
    const { isVerified } = await import('../src/engine/rules');
    const f = fact('ecog', 1, { source: { docId: 'D1', quote: 'ECOG 1', start: 10, end: 16 } });
    const v = [{ factId: f.id, docId: 'D1', value: 1, start: 10, end: 16, at: '2026-11-08', by: 'coordinator' as const }];
    expect(isVerified(f, v)).toBe(true);
    expect(isVerified({ ...f, value: 2 }, v)).toBe(false);
    expect(isVerified({ ...f, source: { ...f.source, start: 11 } }, v)).toBe(false);
    expect(isVerified({ ...f, source: { ...f.source, docId: 'D2' } }, v)).toBe(false);
  });
});
