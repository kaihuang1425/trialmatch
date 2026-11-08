// npm test. Checks the demo app's matching rules (public/app/index.html) never guess a missing fact:
// an unknown value may only give "met" or "not met" when every real value would give the same answer.
// Otherwise it must give "to check". All patients here are synthetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMatcher } from '../scripts/matcher.mjs';

const M = loadMatcher();

const NONE = { histology: 'adeno', stage: 'IV', egfr: 'neg', alk: 'neg', ros1: 'neg', kras: 'neg', pdl1: 20, priorChemo: false, priorIO: false, priorEGFR: false, priorALK: false, priorCRT: false, progressed: 'na', lastTxWeeks: null, crtWeeks: null, ecog: 1, brain: 'none', autoimmune: false, ild: false, infection: false, anc: 3.5, plt: 230, crcl: 80, bili: 0.6 };
const P = (o) => ({ ...NONE, ...o });
// One synthetic patient per kind of trial, so every rule is met by at least one of them.
const BASE = {
  'EGFR, grew on a tablet, treated brain spread': P({ egfr: 'ex19del', priorEGFR: true, progressed: 'yes', lastTxWeeks: 4, brain: 'treated_stable' }),
  'ALK, untreated': P({ alk: 'pos' }),
  'KRAS G12C, after chemo-immunotherapy': P({ kras: 'G12C', priorChemo: true, priorIO: true, progressed: 'yes', lastTxWeeks: 4 }),
  'No driver, PD-L1 70%, untreated': P({ pdl1: 70 }),
  'No driver, PD-L1 20%, untreated': P({ pdl1: 20 }),
  'Stage III after chemoradiotherapy': P({ stage: 'III_unres', priorCRT: true, crtWeeks: 4, lastTxWeeks: 4, progressed: 'no' }),
  'Operable stage II': P({ stage: 'early' }),
  'Extensive small cell, untreated': P({ histology: 'sclc', stage: 'es' })
};
// How the app writes "unknown" for each field, and the real values it could have instead.
const FIELDS = {
  histology: ['unk', ['adeno', 'squamous', 'sclc']],
  stage: ['unk', ['IV', 'III_unres', 'IIIA_res', 'early', 'es']],
  egfr: ['unk', ['neg', 'ex19del', 'L858R', 'ex20ins', 'other']],
  alk: ['unk', ['neg', 'pos']], ros1: ['unk', ['neg', 'pos']], kras: ['unk', ['neg', 'G12C']],
  brain: ['unk', ['none', 'treated_stable', 'untreated']],
  progressed: ['unk', ['yes', 'no']],
  pdl1: [null, [0, 1, 49, 50, 100]], ecog: [null, [0, 1, 2, 3, 4]],
  lastTxWeeks: [null, [0, 1, 2, 3, 4, 52]], crtWeeks: [null, [1, 6, 7, 52]],
  anc: [null, [0.5, 1.5, 5]], plt: [null, [50, 100, 300]], crcl: [null, [10, 30, 45, 50, 120]], bili: [null, [0.5, 1.5, 3]]
};

test('every rule is met by at least one synthetic patient here, so the next test covers it', () => {
  for (const t of M.trials) for (const c of t.crit) {
    assert.ok(Object.values(BASE).some((p) => c.f(p) === M.OK), `${t.code} "${c.text}": add a patient to BASE that meets it`);
  }
});

test('an unknown value never decides a rule that a real value could decide the other way', () => {
  const bad = [];
  for (const [who, p] of Object.entries(BASE)) for (const t of M.trials) for (const c of t.crit) for (const [k, [unknown, values]] of Object.entries(FIELDS)) {
    const got = c.f({ ...p, [k]: unknown });
    if (got === M.U) continue;
    const real = values.map((v) => c.f({ ...p, [k]: v }));
    if (real.some((r) => r !== got)) bad.push(`${t.code} "${c.text}" gives "${got}" for ${who} with ${k} unknown, but ${k} = ${values[real.findIndex((r) => r !== got)]} gives "${real.find((r) => r !== got)}"`);
  }
  assert.deepEqual([...new Set(bad)], []);
});

test('an unknown stage or tumour type gives "to check", not "not met"', () => {
  const egfr = BASE['EGFR, grew on a tablet, treated brain spread'], lt301 = M.trials.find((t) => t.code === 'LT-301');
  assert.equal(M.evaluate({ ...egfr, stage: 'unk', city: 'London' }, lt301).tier, 'possible');
  assert.equal(M.evaluate({ ...egfr, histology: 'unk', city: 'London' }, lt301).tier, 'possible');
  const sclc = BASE['Extensive small cell, untreated'], lt308 = M.trials.find((t) => t.code === 'LT-308');
  assert.equal(M.evaluate({ ...sclc, histology: 'unk', city: 'London' }, lt308).tier, 'possible');
  assert.equal(M.evaluate({ ...sclc, stage: 'early', city: 'London' }, lt308).tier, 'not');   // a recorded stage still rules it out
});
