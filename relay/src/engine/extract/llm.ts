// LLM extractor (structured output through the LlmProvider interface). It only proposes:
// every candidate still goes through verifyCandidates(), which drops any quote not found verbatim.

import { LLM_CONFIG } from '../config';
import { FACT_LABEL } from '../labels';
import type { LlmProvider } from '../llm/provider';
import { textOf } from '../llm/provider';
import { FACT_KEYS, type FactValue, type SourceDoc } from '../types';
import type { CandidateFact, Extractor } from './types';

const VALUE_HINTS: Record<string, string> = {
  histology: 'nonsquamous_adenocarcinoma | squamous | mixed_small_cell | small_cell',
  stage: 'IIIA | IIIB | IIIC | IV | IVA | IVB | IVC',
  setting: 'advanced_metastatic (not for curative treatment) | resectable',
  kras: 'variant like G12C, or not_detected',
  nras: 'variant like Q61K, or not_detected',
  hras: 'variant, or not_detected',
  egfr: 'Ex19del | L858R | ex20ins | protein change like G719A | not_detected',
  alk: 'rearranged | not_detected',
  ros1: 'rearranged | not_detected',
  braf: 'variant like V600E, or not_detected',
  met_ex14: 'detected | not_detected',
  met_amp: 'detected | not_detected',
  ret: 'fusion | not_detected',
  nrg1: 'fusion | not_detected',
  her2: 'mutation_tkd | mutation_non_tkd | amplification | overexpression | not_detected',
  brain_mets: 'none | treated_stable | untreated_asymptomatic | symptomatic',
  pdl1_tps: 'number (percent)',
  ecog: 'number 0-4',
  age: 'number (years)',
  prior_lines_advanced: 'number',
};

export const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', enum: [...FACT_KEYS] },
          value: { type: 'string', description: 'Value as text. Use "true"/"false" for yes/no facts, digits for numbers, "uncertain" if the text is ambiguous.' },
          value_type: { type: 'string', enum: ['string', 'number', 'boolean'] },
          unit: { type: 'string' },
          ref_high: { type: 'number' },
          observed_on: { type: 'string', description: 'YYYY-MM-DD date the value was observed, if stated' },
          quote: { type: 'string', description: 'Exact, contiguous text copied from the document that states this fact' },
        },
        required: ['key', 'value', 'value_type', 'quote'],
        additionalProperties: false,
      },
    },
  },
  required: ['facts'],
  additionalProperties: false,
} as const;

const SYSTEM = `You extract clinical facts from SYNTHETIC lung-cancer referral documents for trial prescreening.
Rules:
- Only report a fact the document states. Do not infer or guess. If the text is ambiguous about a fact, report value "uncertain" with the ambiguous sentence as the quote.
- Every fact needs "quote": text copied character-for-character from the document (a full line is best). Quotes that do not match the document exactly are discarded.
- Lab values: report the number and unit as written, and the upper reference limit as ref_high when the report shows a range.
- "No prior systemic anticancer therapy" means prior_systemic_advanced=false, prior_lines_advanced=0 and each prior_* agent fact false.
- Never output patient-identifying details beyond the facts listed.`;

function coerce(value: string, type: string): FactValue {
  if (value === 'uncertain') return 'uncertain';
  if (type === 'boolean') return value.trim().toLowerCase() === 'true';
  if (type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  return value;
}

export function parseExtraction(json: string): CandidateFact[] {
  let data: { facts?: Array<Record<string, unknown>> };
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  return (data.facts ?? []).map((f) => ({
    key: String(f.key),
    value: coerce(String(f.value), String(f.value_type)),
    ...(f.unit ? { unit: String(f.unit) } : {}),
    ...(typeof f.ref_high === 'number' ? { refHigh: f.ref_high } : {}),
    ...(f.observed_on ? { observedOn: String(f.observed_on) } : {}),
    quote: String(f.quote ?? ''),
  }));
}

export function createLlmExtractor(provider: LlmProvider): Extractor {
  return {
    kind: 'llm',
    async propose(doc: SourceDoc) {
      const keyList = FACT_KEYS.map((k) => `- ${k}: ${FACT_LABEL[k]}${VALUE_HINTS[k] ? ` (${VALUE_HINTS[k]})` : ''}`).join('\n');
      const res = await provider.complete({
        purpose: 'extract',
        model: LLM_CONFIG.extractionModel,
        system: SYSTEM,
        jsonSchema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 8000,
        messages: [
          {
            role: 'user',
            content: `Fact keys:\n${keyList}\n\nDocument id: ${doc.id}\nDocument kind: ${doc.kind}\nDocument date: ${doc.date}\n\n<document>\n${doc.text}\n</document>`,
          },
        ],
      });
      if (res.stopReason === 'refusal') return [];
      return parseExtraction(textOf(res));
    },
  };
}
