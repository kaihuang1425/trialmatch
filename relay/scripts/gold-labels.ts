// HAND-WRITTEN gold labels, decided from facts.gold.json and the registry text, not by running the engine.
// Written by the same team that built the engine (a limitation; see eval/results.md). A second
// reviewer can record agreement in data/patients/<id>/labels.review.json (slot left empty).
// Convention: every checkable criterion is `supported` unless listed; review-only rows are
// `needs_review`; at-screening rows are `unknown` and never count toward the trial status.
// As-of date for all windows: 2026-11-08.
//   S supported · C conflicting · U unknown (missing, not tested or stale) · R needs_review

import type { TrialStatus } from '../src/engine/types';

export type L = 'S' | 'C' | 'U' | 'R';

export interface StageLabels {
  description: string;
  docs: 'initial' | 'all';
  status: Record<string, TrialStatus>;
  exceptions: Record<string, L>;
}

const CB = 'NCT05920356';
const KL = 'NCT07190248';
const KR = 'NCT06793215';
const RS = 'NCT06881784';
const AP = 'NCT07185997';
const CO = 'NCT06667076';
const AK = 'NCT06765109';
const BM = 'NCT04886804';
const LM = 'NCT05642572';

// Lung-MAP rows no referral pack here documents (urinalysis, amylase/lipase, and INR except SYN-0610)
const LM_UNDOCUMENTED: Record<string, L> = { 'lm-urine': 'U', 'lm-pancreas': 'U', 'lm-coag': 'U' };
// SYN-0417 labs (2026-09-20), ECG (2026-09-18) and MRI (2026-09-12) are outside the windows on 2026-11-08
const SYN0417_STALE: Record<string, L> = {
  'kr2-organ': 'U',
  'rs301-organ': 'U',
  'bm1-organ': 'U',
  'lm-brain-imaging': 'U',
  'lm-anc': 'U',
  'lm-plt': 'U',
  'lm-bili': 'U',
  'lm-transaminases': 'U',
  'lm-creat': 'U',
  'lm-zubrod': 'U',
  'lm-ecg': 'U',
};
const HER2_NEGATIVE_NGS: Record<string, L> = {
  'bm1-her2': 'R',
  'bm1-cohort-1': 'C',
  'bm1-cohort-2': 'C',
  'bm1-cohort-3': 'C',
  'bm1-cohort-4': 'C',
  'bm1-cohort-5': 'C',
};

export const GOLD_LABELS: Record<string, Record<'final' | 'initial', StageLabels | undefined>> = {
  'SYN-0417': {
    initial: {
      description: 'Referral summary + labs (2026-09-20) only; no molecular report yet.',
      docs: 'initial',
      status: { [CB]: 'needs_evidence', [KL]: 'needs_evidence', [KR]: 'needs_evidence', [RS]: 'not_match', [AP]: 'needs_evidence', [CO]: 'needs_evidence', [AK]: 'needs_evidence', [BM]: 'needs_evidence', [LM]: 'not_match' },
      exceptions: {
        ...SYN0417_STALE,
        ...LM_UNDOCUMENTED,
        'cb202-kras': 'U', 'cb202-pdl1-local': 'U', 'cb202-x-targetable': 'U',
        'kl007-kras': 'U',
        'kr2-kras': 'U', 'kr2-pdl1': 'U', 'kr2-x-driver': 'U',
        'rs301-prior-lines': 'C', 'rs301-ras': 'U',
        'alp-pacc': 'U',
        'cop-egfr': 'U', 'cop-egfr-test': 'U',
        'alk-alk': 'U', 'alk-x-driver': 'U',
        'bm1-her2': 'U', 'bm1-cohort-ia': 'U', 'bm1-cohort-1': 'C', 'bm1-cohort-2': 'U', 'bm1-cohort-3': 'U', 'bm1-cohort-4': 'C', 'bm1-cohort-5': 'C',
        'lm-egfr': 'U', 'lm-osimertinib': 'C', 'lm-met': 'U', 'lm-met-lab': 'U',
      },
    },
    final: {
      description: 'After the default demo molecular report (KRAS G12C, others not detected, PD-L1 TPS 0%). Labs, ECG and MRI still outside their windows.',
      docs: 'all',
      status: { [CB]: 'ready', [KL]: 'needs_review', [KR]: 'needs_evidence', [RS]: 'not_match', [AP]: 'not_match', [CO]: 'not_match', [AK]: 'not_match', [BM]: 'needs_evidence', [LM]: 'not_match' },
      exceptions: {
        ...SYN0417_STALE,
        ...LM_UNDOCUMENTED,
        ...HER2_NEGATIVE_NGS,
        'rs301-prior-lines': 'C',
        'alp-pacc': 'C',
        'cop-egfr': 'C',
        'alk-alk': 'C', 'alk-x-driver': 'C',
        'bm1-cohort-ia': 'R',
        'lm-egfr': 'C', 'lm-osimertinib': 'C', 'lm-met': 'C',
      },
    },
  },
  'SYN-0288': {
    initial: undefined,
    final: {
      description: 'EGFR exon 19 deletion, untreated advanced disease, ECOG 0, current labs; no INR.',
      docs: 'all',
      status: { [CB]: 'not_match', [KL]: 'not_match', [KR]: 'not_match', [RS]: 'not_match', [AP]: 'not_match', [CO]: 'ready', [AK]: 'not_match', [BM]: 'needs_review', [LM]: 'not_match' },
      exceptions: {
        ...LM_UNDOCUMENTED,
        ...HER2_NEGATIVE_NGS,
        'cb202-kras': 'C', 'cb202-pdl1-local': 'C', 'cb202-x-targetable': 'C',
        'kl007-kras': 'C',
        'kr2-kras': 'C', 'kr2-x-driver': 'C', 'kr2-organ': 'R',
        'rs301-organ': 'U', 'rs301-prior-lines': 'C', 'rs301-ras': 'C',
        'alp-pacc': 'C',
        'alk-alk': 'C', 'alk-x-driver': 'C',
        'bm1-cohort-ia': 'R',
        'lm-osimertinib': 'C', 'lm-met': 'C',
      },
    },
  },
  'SYN-0532': {
    initial: undefined,
    final: {
      description: 'Squamous histology (documented conflict for non-squamous studies); PD-L1 80% by IHC; pathology says molecular testing was NOT performed.',
      docs: 'all',
      status: { [CB]: 'not_match', [KL]: 'not_match', [KR]: 'not_match', [RS]: 'not_match', [AP]: 'needs_evidence', [CO]: 'needs_evidence', [AK]: 'needs_evidence', [BM]: 'needs_evidence', [LM]: 'not_match' },
      exceptions: {
        ...LM_UNDOCUMENTED,
        'cb202-histology': 'C', 'cb202-kras': 'U', 'cb202-pdl1-local': 'C', 'cb202-x-histology': 'C', 'cb202-x-targetable': 'U',
        'kl007-kras': 'U', 'kl007-histology': 'C',
        'kr2-histology': 'C', 'kr2-kras': 'U', 'kr2-organ': 'R', 'kr2-x-driver': 'U',
        'rs301-organ': 'U', 'rs301-prior-lines': 'C', 'rs301-ras': 'U',
        'alp-pacc': 'U',
        'cop-egfr': 'U', 'cop-egfr-test': 'U',
        'alk-alk': 'U', 'alk-x-driver': 'U',
        'bm1-her2': 'U', 'bm1-cohort-ia': 'U', 'bm1-cohort-1': 'C', 'bm1-cohort-2': 'C', 'bm1-cohort-3': 'C', 'bm1-cohort-4': 'C', 'bm1-cohort-5': 'C',
        'lm-egfr': 'U', 'lm-osimertinib': 'C', 'lm-met': 'U', 'lm-met-lab': 'U',
      },
    },
  },
  'SYN-0610': {
    initial: undefined,
    final: {
      description: 'KRAS G12C after one line of carboplatin-pemetrexed-pembrolizumab (last dose 2026-10-08), treated stable brain metastases (SRS 2026-05-02), controlled AF, INR documented.',
      docs: 'all',
      status: { [CB]: 'not_match', [KL]: 'not_match', [KR]: 'not_match', [RS]: 'needs_review', [AP]: 'not_match', [CO]: 'not_match', [AK]: 'not_match', [BM]: 'needs_review', [LM]: 'not_match' },
      exceptions: {
        'lm-urine': 'U', 'lm-pancreas': 'U', 'lm-coag': 'R',
        ...HER2_NEGATIVE_NGS,
        'cb202-prior': 'C', 'cb202-pdl1-local': 'C', 'cb202-x-cardiac': 'R',
        'kl007-x-prior': 'C',
        'kr2-prior': 'C', 'kr2-organ': 'R', 'kr2-x-immune': 'C', 'kr2-x-cv': 'R',
        'rs301-organ': 'R', 'rs301-x-comorbid': 'R',
        'alp-pacc': 'C', 'alp-prior': 'C',
        'cop-egfr': 'C', 'cop-line': 'R',
        'alk-alk': 'C', 'alk-prior': 'C', 'alk-x-driver': 'C', 'alk-x-radiotherapy': 'R', 'alk-x-cv': 'R',
        'bm1-cohort-ia': 'R',
        'lm-egfr': 'C', 'lm-osimertinib': 'C', 'lm-met': 'C', 'lm-cardiac': 'R',
      },
    },
  },
  'SYN-0745': {
    initial: undefined,
    final: {
      description: 'ALK rearranged, ECOG 2, untreated asymptomatic brain metastases, prior therapy ambiguous in the referral (all treatment-history facts "uncertain").',
      docs: 'all',
      status: { [CB]: 'not_match', [KL]: 'not_match', [KR]: 'not_match', [RS]: 'not_match', [AP]: 'not_match', [CO]: 'not_match', [AK]: 'needs_review', [BM]: 'needs_review', [LM]: 'not_match' },
      exceptions: {
        ...LM_UNDOCUMENTED,
        ...HER2_NEGATIVE_NGS,
        'cb202-kras': 'C', 'cb202-pdl1-local': 'C', 'cb202-prior': 'R', 'cb202-ecog': 'C', 'cb202-x-targetable': 'C', 'cb202-x-priorg12c': 'R',
        'kl007-kras': 'C', 'kl007-x-prior': 'R', 'kl007-x-cns': 'R',
        'kr2-ecog': 'C', 'kr2-prior': 'R', 'kr2-kras': 'C', 'kr2-organ': 'R', 'kr2-x-driver': 'C', 'kr2-x-cns': 'C', 'kr2-x-recent-therapy': 'R', 'kr2-x-priorkras': 'R', 'kr2-x-immune': 'R',
        'rs301-ecog': 'C', 'rs301-organ': 'U', 'rs301-prior-lines': 'R', 'rs301-ras': 'C', 'rs301-x-prior': 'R', 'rs301-x-cns': 'C', 'rs301-x-ongoing': 'R',
        'alp-pacc': 'C', 'alp-prior': 'R', 'alp-adjuvant': 'R',
        'cop-egfr': 'C', 'cop-ecog': 'C', 'cop-line': 'R', 'cop-tox': 'R',
        'alk-prior': 'R',
        'bm1-ecog': 'R', 'bm1-tox': 'R', 'bm1-cohort-ia': 'R', 'bm1-x-recent-therapy': 'R', 'bm1-x-zongertinib': 'R',
        'lm-egfr': 'C', 'lm-osimertinib': 'R', 'lm-met': 'C', 'lm-tox': 'R', 'lm-zubrod': 'C', 'lm-x-vegf-met': 'R', 'lm-x-recent-therapy': 'R',
      },
    },
  },
};
