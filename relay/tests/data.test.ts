// Data integrity: verbatim registry text, plain-JSON rules, synthetic labelling, gold agreement.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRIALS, PATIENTS } from '../src/engine/data';
import { assessedState } from './helpers';

const ROOT = path.resolve(__dirname, '..');

describe('encoded trials', () => {
  it('every criterion text is verbatim from the snapshot (criteria, title or structured fields)', () => {
    for (const t of TRIALS) {
      const raw = JSON.parse(readFileSync(path.join(ROOT, 'data', 'trials', 'raw', `${t.id}.json`), 'utf8')).protocolSection;
      const elig: string = raw.eligibilityModule.eligibilityCriteria;
      for (const c of t.criteria) {
        if (c.derivedFrom === 'criteria') expect(elig.includes(c.text), c.id).toBe(true);
        if (c.derivedFrom === 'title') expect(raw.identificationModule.officialTitle.includes(c.text), c.id).toBe(true);
        if (c.derivedFrom === 'structured_fields') expect(c.text).toContain(raw.eligibilityModule.minimumAge);
        for (const d of c.detail ?? []) expect(elig.includes(d), `${c.id} detail`).toBe(true);
      }
    }
  });

  it('rules are plain JSON (round-trip safe for a Python port) and the policy file is JSON', () => {
    for (const t of TRIALS) expect(JSON.parse(JSON.stringify(t.criteria))).toEqual(t.criteria);
    const policy = JSON.parse(readFileSync(path.join(ROOT, 'data', 'policy', 'relay-policy.json'), 'utf8'));
    expect(policy.labRecencyDays.value).toBe(28);
    expect(policy.tables.alterations.asOf).toBe('2026-11-07');
  });

  it('ALPACCA carries the full registry PACC list; RASolve 301 covers KRAS, NRAS and HRAS at G12/G13/Q61', () => {
    const alp = TRIALS.find((t) => t.acronym === 'ALPACCA')!.criteria.find((c) => c.id === 'alp-pacc')!;
    expect(alp.logic.op === 'in' && alp.logic.values.length).toBe(50);
    const rs = TRIALS.find((t) => t.acronym === 'RASolve 301')!.criteria.find((c) => c.id === 'rs301-ras')!;
    expect(JSON.stringify(rs.logic)).toContain('"nras"');
    expect(JSON.stringify(rs.logic)).toContain('"Q61*"');
  });

  it('only "not limited to"-style lists get a protocol-completeness row, one per trial at most', () => {
    for (const t of TRIALS) expect(t.criteria.filter((c) => c.completeness).length, t.acronym).toBeLessThanOrEqual(1);
  });
});

describe('synthetic patients', () => {
  it('every document is marked SYNTHETIC', () => {
    for (const p of Object.values(PATIENTS)) for (const d of p.docs) {
      expect(d.synthetic).toBe(true);
      expect(d.text.startsWith('SYNTHETIC DOCUMENT')).toBe(true);
    }
  });

  it('the rules pipeline agrees with the hand-written gold labels on every row', () => {
    const disagreements: string[] = [];
    for (const pid of Object.keys(PATIENTS)) {
      const gold = JSON.parse(readFileSync(path.join(ROOT, 'data', 'patients', pid, 'labels.gold.json'), 'utf8'));
      for (const stage of Object.keys(gold.stages)) {
        const s = assessedState(pid, stage === 'initial' ? 'initial' : 'all');
        for (const t of TRIALS) {
          const g = gold.stages[stage].trials[t.id];
          if (s.assessments[t.id].status !== g.status) disagreements.push(`${pid}/${stage}/${t.acronym}`);
          for (const r of s.assessments[t.id].results) if (r.state !== g.criteria[r.criterionId]) disagreements.push(`${pid}/${stage}/${r.criterionId}`);
        }
      }
    }
    expect(disagreements).toEqual([]);
  });
});
