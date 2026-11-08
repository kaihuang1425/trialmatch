// The quote verifier: the single gate between any extractor (rules or LLM) and the patient record.
// 1. The quote must occur verbatim in the document text (no fuzzy matching).
// 2. The value must fit the key's vocabulary.
// 3. Semantic guards, because a verbatim quote can still be wrong:
//    subject  — the quote is about a relative ("mother had EGFR-mutant cancer") → rejected
//    polarity — the quote negates the value ("ALK: no fusion detected" as rearranged) → rejected
//    time     — the quote dates the finding ("historical specimen, 12 March 2019") → observedOn
//               is set from the quote, not the report date, so windows see its real age
// Document text is untrusted data: nothing in it is ever executed as an instruction.

import { parseLongDate } from '../synthetic/templates';
import { FACT_KEYS, MOLECULAR_GENE_KEYS, type Fact, type FactKey, type FactValue, type SourceDoc } from '../types';
import type { CandidateFact, ExtractionResult, Rejection } from './types';

const ENUMS: Partial<Record<FactKey, string[]>> = {
  histology: ['nonsquamous_adenocarcinoma', 'squamous', 'mixed_small_cell', 'small_cell'],
  stage: ['IIIA', 'IIIB', 'IIIC', 'IV', 'IVA', 'IVB', 'IVC'],
  curative_option: ['not_amenable', 'amenable'],
  alk: ['rearranged', 'not_detected'],
  ros1: ['rearranged', 'not_detected'],
  met_ex14: ['detected', 'not_detected'],
  met_amp: ['detected', 'not_detected'],
  ret: ['fusion', 'not_detected'],
  nrg1: ['fusion', 'not_detected'],
  her2_mutation: ['mutation_tkd', 'mutation_non_tkd', 'not_detected'],
  her2_amplification: ['detected', 'not_detected'],
  her2_overexpression: ['ihc_3plus', 'ihc_2plus', 'negative'],
  brain_mets: ['none', 'present'],
  spinal_cord_compression: ['none', 'treated_stable', 'untreated'],
  cv_disease: ['none', 'controlled', 'significant'],
  hiv: ['negative', 'positive'],
  other_malignancy: ['none', 'present'],
  urine_protein: ['negative', 'trace', '1+', '2+', '3+', '4+'],
};
const BOOLS: FactKey[] = [
  'prior_systemic_advanced', 'prior_immunotherapy', 'prior_platinum_chemo', 'prior_kras_g12c_inhibitor', 'prior_pan_ras_inhibitor',
  'prior_egfr_tki', 'prior_osimertinib', 'prior_alk_tki', 'prior_docetaxel', 'prior_her2_adc', 'prior_anti_vegf', 'prior_met_inhibitor',
  'prior_zongertinib', 'recovered_from_toxicity', 'in_investigational_study', 'major_surgery_recent', 'cns_symptomatic', 'cns_untreated',
  'cns_progressing', 'leptomeningeal', 'measurable_disease', 'measurable_unirradiated', 'ild_history', 'ibd_history', 'gi_absorption_issue',
  'uncontrolled_hypertension', 'hepatitis_active', 'tb_active', 'active_infection', 'autoimmune_active', 'transplant_history',
  'pregnant_or_breastfeeding', 'uncontrolled_pain', 'effusion_drainage', 'immunosuppressive_meds', 'qt_prolonging_meds', 'strong_cyp3a_meds',
  'growth_factor_4w', 'recent_antibiotics', 'live_vaccine_recent', 'tumour_sample_available', 'molecular_lab_accredited',
];
const NUMS: FactKey[] = [
  'age', 'ecog', 'prior_lines_advanced', 'pdl1_tps', 'qtcf_ms', 'lab_anc', 'lab_hemoglobin', 'lab_platelets', 'lab_bilirubin', 'lab_alt',
  'lab_ast', 'lab_alp', 'lab_creatinine', 'lab_egfr_renal', 'lab_inr', 'lab_amylase', 'lab_lipase',
];
const DATES: FactKey[] = ['last_systemic_therapy_end', 'adjuvant_therapy_end', 'last_radiotherapy'];

function valueProblem(key: FactKey, value: FactValue): string | null {
  if (value === 'uncertain' || value === 'not_tested') return null;
  if (BOOLS.includes(key) && typeof value !== 'boolean') return `${key} must be true/false`;
  if (NUMS.includes(key) && (typeof value !== 'number' || !Number.isFinite(value))) return `${key} must be a number`;
  if (DATES.includes(key) && !(value === 'none' || value === 'ongoing' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)))) {
    return `${key} must be an ISO date, "none" or "ongoing"`;
  }
  const allowed = ENUMS[key];
  if (allowed && !allowed.includes(String(value))) return `${key} value "${String(value)}" is not one of ${allowed.join(', ')}`;
  return null;
}

// ---------- semantic guards ----------

const RELATIVE = /\b(mother|father|sister|brother|son|daughter|aunt|uncle|cousin|grandmother|grandfather|niece|nephew|family history|relative)\b/i;
const NEGATION = /\b(no|not|negative|without|absence of|ruled out)\b/i;

const GENE_TERMS: Partial<Record<FactKey, RegExp>> = {
  kras: /\bKRAS\b/i,
  nras: /\bNRAS\b/i,
  hras: /\bHRAS\b/i,
  egfr: /\bEGFR\b/i,
  alk: /\bALK\b/i,
  ros1: /\bROS1\b/i,
  braf: /\bBRAF\b/i,
  met_ex14: /exon 14/i,
  met_amp: /amplification/i,
  ret: /\bRET\b/i,
  nrg1: /\bNRG1\b/i,
  her2_mutation: /variant|mutation|insertion/i,
  her2_amplification: /amplification/i,
};

function isNegativeValue(v: FactValue): boolean {
  return v === false || v === 'not_detected' || v === 'negative' || v === 'none';
}

/** Returns a rejection reason, or null. */
function semanticProblem(key: FactKey, value: FactValue, quote: string): string | null {
  if (RELATIVE.test(quote)) return 'quote is about a relative, not the patient';
  const term = GENE_TERMS[key];
  if (term && MOLECULAR_GENE_KEYS.includes(key) && value !== 'uncertain' && value !== 'not_tested') {
    const clauses = quote.split(/[;.]/).filter((c) => term.test(c) || key === 'her2_mutation' || key === 'her2_amplification');
    const relevant = clauses.length ? clauses : [quote];
    const negated = relevant.filter((c) => NEGATION.test(c));
    if (!isNegativeValue(value) && negated.length === relevant.length) return 'quote negates the value (polarity)';
    if (isNegativeValue(value) && negated.length === 0) return 'quote does not state a negative result (polarity)';
  }
  return null;
}

/** An explicit date inside the quote that is older than the report wins over the report date. */
function quotedDate(quote: string): string | undefined {
  const long = parseLongDate(quote);
  if (long) return long;
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(quote);
  return iso?.[1];
}

function factId(docId: string, key: string, start: number, by: string): string {
  return `${docId}#${key}@${start}${by === 'llm' ? '~llm' : ''}`;
}

export function verifyCandidates(doc: SourceDoc, candidates: CandidateFact[], extractedBy: 'rules' | 'llm'): ExtractionResult {
  const accepted: Fact[] = [];
  const rejected: Rejection[] = [];
  for (const c of candidates) {
    const reject = (reason: string) => rejected.push({ docId: doc.id, key: String(c.key), quote: String(c.quote ?? ''), value: c.value, reason, extractedBy });
    if (!(FACT_KEYS as readonly string[]).includes(c.key)) {
      reject(`unknown fact key "${c.key}"`);
      continue;
    }
    const key = c.key as FactKey;
    if (typeof c.quote !== 'string' || c.quote.trim().length < 3) {
      reject('no quote');
      continue;
    }
    let start = -1;
    if (typeof c.start === 'number' && typeof c.end === 'number' && doc.text.slice(c.start, c.end) === c.quote) start = c.start;
    else start = doc.text.indexOf(c.quote);
    if (start < 0) {
      reject('quote not found verbatim in the document');
      continue;
    }
    const problem = valueProblem(key, c.value) ?? semanticProblem(key, c.value, c.quote);
    if (problem) {
      reject(problem);
      continue;
    }
    let observedOn = c.observedOn ?? doc.date;
    const qd = quotedDate(c.quote);
    if (qd && qd < doc.date && (!c.observedOn || c.observedOn === doc.date) && MOLECULAR_GENE_KEYS.concat(['pdl1_tps', 'histology']).includes(key)) {
      observedOn = qd; // historical specimen: keep its own date
    }
    accepted.push({
      id: factId(doc.id, key, start, extractedBy),
      key,
      value: c.value,
      ...(c.unit ? { unit: c.unit } : {}),
      ...(typeof c.refHigh === 'number' ? { refHigh: c.refHigh } : {}),
      observedOn,
      source: { docId: doc.id, quote: c.quote, start, end: start + c.quote.length },
      extractedBy,
      verified: true,
    });
  }
  return { accepted, rejected };
}
