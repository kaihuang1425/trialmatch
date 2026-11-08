// npm test. Checks the Skeptic step: a fact from MedGemma only survives if the letter states it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ground, cleanRecord } from '../lib/records.js';
import { parseJson } from '../lib/medgemma.js';

const LETTER = 'She has stage IV adenocarcinoma of the lung. Molecular testing showed an EGFR exon 19 deletion; ALK and ROS1 negative. ' +
  'PD-L1 TPS 10%. ECOG performance status 1. Bloods: neutrophils 3.10, platelets 214.';

test('keeps facts whose quote is in the letter and states the value', () => {
  const g = ground([
    { key: 'egfr', value: 'ex19del', quote: 'EGFR exon 19 deletion' },
    { key: 'stage', value: 'IV', quote: 'stage IV adenocarcinoma' },
    { key: 'pdl1', value: 10, quote: 'PD-L1 TPS 10%' },
    { key: 'anc', value: 3.1, quote: 'neutrophils 3.10' },
    { key: 'alk', value: 'neg', quote: 'ALK and ROS1 negative' }
  ], LETTER);
  assert.deepEqual(g.facts, { egfr: 'ex19del', stage: 'IV', pdl1: 10, anc: 3.1, alk: 'neg' });
  assert.equal(g.rejected.length, 0);
});

test('drops invented quotes, wrong values and unknown keys', () => {
  const g = ground([
    { key: 'kras', value: 'G12C', quote: 'KRAS G12C mutation detected' },     // not in the letter
    { key: 'egfr', value: 'L858R', quote: 'EGFR exon 19 deletion' },           // quote does not state L858R
    { key: 'plt', value: 250, quote: 'platelets 214' },                        // number not in the quote
    { key: 'ecog', value: 7, quote: 'ECOG performance status 1' },             // out of range
    { key: 'smoker', value: true, quote: 'adenocarcinoma' },                   // not a field
    { key: 'histology', value: 'adeno' }                                       // no quote
  ], LETTER);
  assert.deepEqual(g.facts, {});
  assert.equal(g.rejected.length, 6);
});

test('matches quotes despite spacing, case and curly quotes', () => {
  const g = ground([{ key: 'ecog', value: 1, quote: 'ecog  performance\nstatus 1' }], LETTER);
  assert.equal(g.facts.ecog, 1);
});

test('cleanRecord keeps only valid known fields', () => {
  assert.deepEqual(cleanRecord({ egfr: 'L858R', alk: 'maybe', ecog: '1', priorIO: false, priorEGFR: true, name: 'x' }),
    { egfr: 'L858R', ecog: 1, priorEGFR: true });
});

test('parseJson reads fenced JSON with prose around it', () => {
  assert.deepEqual(parseJson('Here you go:\n```json\n{"facts":[]}\n```'), { facts: [] });
  assert.throws(() => parseJson('no json here'));
});
