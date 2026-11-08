// Generates synthetic documents FROM the hand-written facts (data/patients/<id>/facts.gold.json),
// records the gold passage for each fact, and writes labels.gold.json from scripts/gold-labels.ts.
// Usage: npm run synth   (run `npm run encode` first)

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type DocSpec,
  type GoldFact,
  type MolecularReportInput,
  type Rendered,
  makeMolecularReportWithPassages,
  molecularFacts,
  renderLabs,
  renderPathology,
  renderReferral,
} from '../src/engine/synthetic/templates';
import type { CriterionState, SourceDoc, Trial, TrialStatus } from '../src/engine/types';
import { GOLD_LABELS, type L } from './gold-labels';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const PATIENTS = path.join(ROOT, 'data', 'patients');
const ENCODED = path.join(ROOT, 'data', 'trials', 'encoded');

interface GoldFile {
  patientId: string;
  synthetic: true;
  note: string;
  summary: string;
  profile: Record<string, string>;
  preferences: { homeCity: string; travelLimitMiles: number; daysAvailable?: string[] };
  documents: DocSpec[];
  facts: GoldFact[];
}

function molecularInput(patientId: string, spec: DocSpec, facts: GoldFact[]): MolecularReportInput {
  const v = (k: string) => {
    const f = facts.find((x) => x.doc === spec.id && x.key === k);
    if (!f) throw new Error(`${patientId}: molecular doc ${spec.id} lacks gold fact ${k}`);
    return f.value;
  };
  const opt = (k: string) => facts.find((x) => x.doc === spec.id && x.key === k)?.value;
  const her2Input = () => {
    const m = v('her2_mutation');
    if (m === 'mutation_tkd' || m === 'mutation_non_tkd') return String(m);
    if (v('her2_amplification') === 'detected') return 'amplification';
    if (opt('her2_overexpression') === 'ihc_3plus') return 'overexpression';
    return 'not_detected';
  };
  const metEx14 = v('met_ex14');
  const metAmp = v('met_amp');
  if (metEx14 === 'detected' && metAmp === 'detected') throw new Error('template supports one MET alteration at a time');
  return {
    kras: String(v('kras')),
    nras: String(v('nras')),
    hras: String(v('hras')),
    egfr: String(v('egfr')),
    alk: String(v('alk')),
    ros1: String(v('ros1')),
    braf: String(v('braf')),
    met: metEx14 === 'detected' ? 'exon14_skipping' : metAmp === 'detected' ? 'amplification' : 'not_detected',
    ret: String(v('ret')),
    her2: her2Input(),
    nrg1: String(v('nrg1')),
    pdl1Tps: Number(v('pdl1_tps')),
    reportDate: spec.date,
    patientId,
    docId: spec.id,
  };
}

function render(patientId: string, spec: DocSpec, facts: GoldFact[]): Rendered {
  switch (spec.kind) {
    case 'referral_summary':
      return renderReferral(patientId, spec, facts);
    case 'labs':
      return renderLabs(patientId, spec, facts);
    case 'pathology':
      return renderPathology(patientId, spec, facts);
    case 'molecular': {
      const input = molecularInput(patientId, spec, facts);
      // facts -> input -> facts must round-trip exactly
      const back = molecularFacts(input, spec.id);
      for (const b of back) {
        const g = facts.find((f) => f.doc === spec.id && f.key === b.key);
        if (!g || g.value !== b.value) throw new Error(`${patientId}: molecular round-trip mismatch on ${b.key}`);
      }
      return makeMolecularReportWithPassages(input);
    }
    default:
      throw new Error(`no template for ${spec.kind}`);
  }
}

const STATE: Record<L, CriterionState> = { S: 'supported', C: 'conflicting', U: 'unknown', R: 'needs_review' };

function deriveStatus(trial: Trial, states: Record<string, CriterionState>): TrialStatus {
  const rows = trial.criteria.filter((c) => !c.atScreening).map((c) => ({ c, s: states[c.id] }));
  if (rows.some((r) => r.c.mandatory && r.s === 'conflicting')) return 'not_match';
  if (rows.some((r) => r.s === 'unknown')) return 'needs_evidence';
  if (rows.some((r) => r.s === 'needs_review')) return 'needs_review';
  return 'ready';
}

function main() {
  const trials: Trial[] = readdirSync(ENCODED)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(ENCODED, f), 'utf8')));
  const allIds = new Set(trials.flatMap((t) => t.criteria.map((c) => c.id)));

  for (const pid of Object.keys(GOLD_LABELS)) {
    const dir = path.join(PATIENTS, pid);
    const gold: GoldFile = JSON.parse(readFileSync(path.join(dir, 'facts.gold.json'), 'utf8'));
    if (gold.patientId !== pid || gold.synthetic !== true) throw new Error(`${pid}: bad gold header`);

    const docs: SourceDoc[] = [];
    const passages: Record<string, { docId: string; quote: string }> = {};
    for (const spec of gold.documents) {
      const r = render(pid, spec, gold.facts);
      if (!r.doc.text.startsWith('SYNTHETIC')) throw new Error('missing SYNTHETIC banner');
      docs.push(r.doc);
      for (const f of gold.facts.filter((x) => x.doc === spec.id)) {
        const q = r.passages[f.key];
        if (!q) throw new Error(`${pid}: fact ${f.key} not rendered in ${spec.id}`);
        if (!r.doc.text.includes(q)) throw new Error('passage not in text');
        passages[f.key] = { docId: spec.id, quote: q };
      }
    }
    mkdirSync(path.join(dir, 'docs'), { recursive: true });
    for (const d of docs) writeFileSync(path.join(dir, 'docs', `${d.id}.txt`), d.text, 'utf8');
    writeFileSync(path.join(dir, 'documents.json'), JSON.stringify(docs, null, 2) + '\n', 'utf8');
    writeFileSync(path.join(dir, 'passages.gold.json'), JSON.stringify({ patientId: pid, synthetic: true, passages }, null, 2) + '\n', 'utf8');
    writeFileSync(
      path.join(dir, 'patient.json'),
      JSON.stringify(
        {
          patientId: pid,
          synthetic: true,
          summary: gold.summary,
          profile: gold.profile,
          preferences: gold.preferences,
          documents: gold.documents.map((d) => ({ id: d.id, kind: d.kind, date: d.date, initial: d.initial })),
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    // Labels
    const out: Record<string, unknown> = {
      patientId: pid,
      synthetic: true,
      label: 'Hand-written gold labels (scripts/gold-labels.ts), decided from facts.gold.json and registry text before running the engine.',
      asOf: '2026-11-08',
      stages: {},
    };
    for (const stage of ['initial', 'final'] as const) {
      const spec = GOLD_LABELS[pid][stage];
      if (!spec) continue;
      for (const id of Object.keys(spec.exceptions)) if (!allIds.has(id)) throw new Error(`${pid}/${stage}: unknown criterion id ${id}`);
      const trialsOut: Record<string, unknown> = {};
      for (const t of trials) {
        const states: Record<string, CriterionState> = {};
        for (const c of t.criteria) {
          const ex = spec.exceptions[c.id];
          if (ex) {
            if (!c.checkable) throw new Error(`${c.id} is not checkable; its label is fixed by its row type`);
            states[c.id] = STATE[ex];
          } else states[c.id] = c.atScreening ? 'unknown' : c.checkable ? 'supported' : 'needs_review';
        }
        const derived = deriveStatus(t, states);
        if (derived !== spec.status[t.id]) {
          throw new Error(`${pid}/${stage}/${t.acronym}: hand status ${spec.status[t.id]} but labels imply ${derived}`);
        }
        trialsOut[t.id] = { acronym: t.acronym, status: spec.status[t.id], criteria: states };
      }
      (out.stages as Record<string, unknown>)[stage] = {
        description: spec.description,
        documents: gold.documents.filter((d) => spec.docs === 'all' || d.initial).map((d) => d.id),
        trials: trialsOut,
      };
    }
    writeFileSync(path.join(dir, 'labels.gold.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(`${pid}: ${docs.length} documents, ${Object.keys(passages).length} gold passages, labels for ${Object.keys(out.stages as object).join('+')}`);
  }
}

main();
