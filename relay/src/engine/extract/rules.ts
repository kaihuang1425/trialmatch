// Deterministic extractor for Relay's synthetic document templates (replay mode, tests, evaluation).
// It is tuned to those templates on purpose; free-text documents go through the LLM extractor.
// Every candidate quotes the full source line, so the verifier can always find it. Lines are
// anchored ("^KRAS:"), so a family-history sentence that mentions KRAS is never read as the patient's.

import { CNS_KEYS, MEDICINE_KEYS, NO_PRIOR_THERAPY_KEYS, UNCERTAIN_HISTORY_KEYS, parseLongDate } from '../synthetic/templates';
import { MOLECULAR_GENE_KEYS, PRIOR_AGENT_KEYS, type FactKey, type FactValue, type SourceDoc } from '../types';
import type { CandidateFact, Extractor } from './types';

interface Line {
  text: string;
  start: number;
}

function lines(text: string): Line[] {
  const out: Line[] = [];
  let pos = 0;
  for (const raw of text.split('\n')) {
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t) out.push({ text: t, start: pos + lead });
    pos += raw.length + 1;
  }
  return out;
}

const AGENT_PATTERNS: [RegExp, FactKey][] = [
  [/platinum/i, 'prior_platinum_chemo'],
  [/anti-PD-?1|anti-PD-?L1|immunotherapy|checkpoint/i, 'prior_immunotherapy'],
  [/KRAS G12C inhibitor/i, 'prior_kras_g12c_inhibitor'],
  [/pan-RAS|pan-KRAS/i, 'prior_pan_ras_inhibitor'],
  [/docetaxel/i, 'prior_docetaxel'],
  [/EGFR tyrosine kinase inhibitor|EGFR TKI/i, 'prior_egfr_tki'],
  [/osimertinib/i, 'prior_osimertinib'],
  [/ALK tyrosine kinase inhibitor|ALK inhibitor/i, 'prior_alk_tki'],
  [/HER2-directed antibody-drug conjugate|trastuzumab deruxtecan/i, 'prior_her2_adc'],
  [/anti-VEGF|ramucirumab|bevacizumab/i, 'prior_anti_vegf'],
  [/MET inhibitor/i, 'prior_met_inhibitor'],
  [/zongertinib/i, 'prior_zongertinib'],
];

const LAB_NAMES: Record<string, FactKey> = {
  Neutrophils: 'lab_anc',
  Haemoglobin: 'lab_hemoglobin',
  Hemoglobin: 'lab_hemoglobin',
  Platelets: 'lab_platelets',
  Bilirubin: 'lab_bilirubin',
  ALT: 'lab_alt',
  AST: 'lab_ast',
  'Alkaline phosphatase': 'lab_alp',
  Creatinine: 'lab_creatinine',
  'eGFR (CKD-EPI)': 'lab_egfr_renal',
  INR: 'lab_inr',
};

function pointValue(rest: string): FactValue | null {
  if (/no pathogenic variant detected/i.test(rest)) return 'not_detected';
  const m = /p\.\(([A-Z]\d+[A-Z])\)/.exec(rest);
  return m ? m[1] : null;
}

function fusionValue(rest: string, positive: string): FactValue | null {
  if (/no fusion detected/i.test(rest)) return 'not_detected';
  if (/fusion detected/i.test(rest)) return positive;
  return null;
}

export function extractWithRules(doc: SourceDoc): CandidateFact[] {
  const out: CandidateFact[] = [];
  const all = lines(doc.text);
  let sampleDate: string | undefined;
  const add = (l: Line, key: FactKey, value: FactValue, extra: Partial<CandidateFact> = {}) =>
    out.push({ key, value, quote: l.text, start: l.start, end: l.start + l.text.length, ...extra });
  const addAll = (l: Line, keys: FactKey[], value: FactValue) => keys.forEach((k) => add(l, k, value));

  for (const l of all) {
    const t = l.text;
    let m: RegExpExecArray | null;

    if ((m = /^Sample collected: (.+)$/.exec(t))) sampleDate = parseLongDate(m[1]);
    if ((m = /^Age: (\d{1,3}) years/.exec(t))) add(l, 'age', parseInt(m[1], 10), { unit: 'years' });

    if (/^Diagnosis: /.test(t)) {
      if (/small[- ]cell component/i.test(t)) add(l, 'histology', 'mixed_small_cell');
      else if (/adenocarcinoma/i.test(t)) add(l, 'histology', 'nonsquamous_adenocarcinoma');
      else if (/(?<!non-)squamous cell carcinoma/i.test(t)) add(l, 'histology', 'squamous');
    }

    if ((m = /^Stage: (IIIA|IIIB|IIIC|IVA|IVB|IVC|IV)\b/.exec(t))) {
      add(l, 'stage', m[1]);
      if (/not suitable for curative/i.test(t)) add(l, 'curative_option', 'not_amenable');
      else if (/curative-intent treatment under consideration|resectable/i.test(t)) add(l, 'curative_option', 'amenable');
    }

    if ((m = /^Performance status: ECOG ([0-4])(?: \(assessed ([^)]+)\))?/.exec(t))) {
      add(l, 'ecog', parseInt(m[1], 10), { observedOn: m[2] ? parseLongDate(m[2]) : undefined });
    }

    // Treatment history
    if (/^Treatment history: /.test(t)) {
      if (/^Treatment history: No prior systemic anticancer therapy/i.test(t)) {
        for (const k of NO_PRIOR_THERAPY_KEYS) {
          add(l, k, k === 'prior_lines_advanced' ? 0 : k === 'last_systemic_therapy_end' || k === 'adjuvant_therapy_end' ? 'none' : false);
        }
      } else if (/not documented|unclear|unknown|unconfirmed/i.test(t)) {
        addAll(l, UNCERTAIN_HISTORY_KEYS, 'uncertain'); // Relay records the ambiguity and never guesses
      } else {
        add(l, 'prior_systemic_advanced', true);
      }
    }
    if ((m = /^Lines of systemic therapy for advanced disease: (\d+)/.exec(t))) add(l, 'prior_lines_advanced', parseInt(m[1], 10));
    if ((m = /^Agents (not )?received: (.+)$/.exec(t))) {
      const value = !m[1];
      for (const item of m[2].split(';')) {
        const hit = AGENT_PATTERNS.find(([re]) => re.test(item));
        if (hit && PRIOR_AGENT_KEYS.includes(hit[1])) add(l, hit[1], value);
      }
    }
    if ((m = /^Last dose of systemic anticancer therapy: (.+)\.$/.exec(t))) {
      const d = /ongoing/i.test(m[1]) ? 'ongoing' : parseLongDate(m[1]);
      if (d) add(l, 'last_systemic_therapy_end', d);
    }
    if (/^Neoadjuvant\/adjuvant therapy: None/i.test(t)) add(l, 'adjuvant_therapy_end', 'none');
    if (/^Toxicity from prior therapy: Resolved/i.test(t)) add(l, 'recovered_from_toxicity', true);
    else if (/^Toxicity from prior therapy: Ongoing/i.test(t)) add(l, 'recovered_from_toxicity', false);
    if (/^Clinical trials: Not in another study/i.test(t)) add(l, 'in_investigational_study', false);
    else if (/^Clinical trials: Currently in another/i.test(t)) add(l, 'in_investigational_study', true);

    // CNS: separate predicates from one line
    if ((m = /^Brain imaging: MRI brain on (\d{1,2} \w+ \d{4})[: ](.*)$/.exec(t))) {
      const on = parseLongDate(m[1]);
      const rest = m[2];
      if (/no intracranial metastases/i.test(rest)) {
        for (const k of CNS_KEYS) add(l, k, k === 'brain_mets' ? 'none' : false, { observedOn: on });
      } else {
        add(l, 'brain_mets', 'present', { observedOn: on });
        if (/untreated/i.test(rest)) add(l, 'cns_untreated', true, { observedOn: on });
        else if (/treated with|radiosurgery|radiotherapy/i.test(rest)) add(l, 'cns_untreated', false, { observedOn: on });
        if (/enlarging|progress/i.test(rest)) add(l, 'cns_progressing', true, { observedOn: on });
        else if (/stable/i.test(rest)) add(l, 'cns_progressing', false, { observedOn: on });
        if (/no leptomeningeal/i.test(rest)) add(l, 'leptomeningeal', false, { observedOn: on });
        else if (/leptomeningeal/i.test(rest)) add(l, 'leptomeningeal', true, { observedOn: on });
        if (/asymptomatic/i.test(rest)) add(l, 'cns_symptomatic', false, { observedOn: on });
        else if (/symptomatic/i.test(rest)) add(l, 'cns_symptomatic', true, { observedOn: on });
      }
    }

    if (/^Disease burden: Measurable disease per RECIST/i.test(t)) {
      add(l, 'measurable_disease', true);
      if (/not previously irradiated/i.test(t)) add(l, 'measurable_unirradiated', true);
      else if (/previously irradiated/i.test(t)) add(l, 'measurable_unirradiated', false);
    } else if (/^Disease burden: No measurable disease/i.test(t)) add(l, 'measurable_disease', false);

    if (/^Spinal cord: No spinal cord compression/i.test(t)) add(l, 'spinal_cord_compression', 'none');
    else if (/^Spinal cord: .*treated.*stable/i.test(t)) add(l, 'spinal_cord_compression', 'treated_stable');

    // Medical history checklist
    if (/^Lung history: No history of interstitial lung disease or pneumonitis/i.test(t)) add(l, 'ild_history', false);
    else if (/^Lung history: History of .*(pneumonitis|interstitial)/i.test(t)) add(l, 'ild_history', true);
    if (/^Bowel history: No history of inflammatory bowel disease/i.test(t)) add(l, 'ibd_history', false);
    else if (/^Bowel history: History of .*(Crohn|colitis|inflammatory bowel)/i.test(t)) add(l, 'ibd_history', true);
    if (/^Gastrointestinal: Swallows tablets; no condition affecting oral intake or absorption/i.test(t)) add(l, 'gi_absorption_issue', false);
    else if (/^Gastrointestinal: .*(difficulty|malabsorption|short bowel|chronic diarrhoea)/i.test(t)) add(l, 'gi_absorption_issue', true);
    if (/^Cardiovascular: /.test(t)) {
      if (/^Cardiovascular: No myocardial infarction, angina, arrhythmia/i.test(t)) add(l, 'cv_disease', 'none');
      else if (/within the last 6 months|uncontrolled|unstable/i.test(t)) add(l, 'cv_disease', 'significant');
      else if (/controlled/i.test(t)) add(l, 'cv_disease', 'controlled');
      if (/blood pressure controlled/i.test(t)) add(l, 'uncontrolled_hypertension', false);
      else if (/uncontrolled (blood pressure|hypertension)/i.test(t)) add(l, 'uncontrolled_hypertension', true);
    }
    if ((m = /^ECG on (\d{1,2} \w+ \d{4}):.*QTcF (\d{3}) ms/.exec(t))) add(l, 'qtcf_ms', parseInt(m[2], 10), { unit: 'ms', observedOn: parseLongDate(m[1]) });
    if (/^Infection screen: /.test(t)) {
      if (/HIV negative/i.test(t)) add(l, 'hiv', 'negative');
      else if (/HIV positive/i.test(t)) add(l, 'hiv', 'positive');
      if (/no active hepatitis/i.test(t)) add(l, 'hepatitis_active', false);
      else if (/active hepatitis/i.test(t)) add(l, 'hepatitis_active', true);
      if (/no active tuberculosis/i.test(t)) add(l, 'tb_active', false);
      else if (/active tuberculosis/i.test(t)) add(l, 'tb_active', true);
      if (/no current infection/i.test(t)) add(l, 'active_infection', false);
      else if (/current infection/i.test(t)) add(l, 'active_infection', true);
    }
    if ((m = /^Autoimmune disease: (.+)$/.exec(t))) add(l, 'autoimmune_active', !/^None/i.test(m[1]));
    if ((m = /^Transplant: (.+)$/.exec(t))) add(l, 'transplant_history', !/^None/i.test(m[1]));
    if ((m = /^Other cancers: (.+)$/.exec(t))) add(l, 'other_malignancy', /^None/i.test(m[1]) ? 'none' : 'present');
    if ((m = /^Pain: (.+)$/.exec(t))) add(l, 'uncontrolled_pain', /^Uncontrolled/i.test(m[1]));
    if ((m = /^Effusions: (.+)$/.exec(t))) add(l, 'effusion_drainage', !/^None/i.test(m[1]));
    if (/^Surgery: No major surgery/i.test(t)) add(l, 'major_surgery_recent', false);
    else if (/^Surgery: /.test(t)) add(l, 'major_surgery_recent', true);
    if (/^Radiotherapy: None/i.test(t)) add(l, 'last_radiotherapy', 'none');
    else if ((m = /^Radiotherapy: .*completed (\d{1,2} \w+ \d{4})/.exec(t))) {
      const d = parseLongDate(m[1]);
      if (d) add(l, 'last_radiotherapy', d);
    }
    if (/^Current medicines: .*No immunosuppressants, QT-prolonging drugs, strong CYP3A inhibitors or inducers, haematopoietic growth factors, antibiotics or live vaccines/i.test(t)) {
      addAll(l, MEDICINE_KEYS, false);
    }
    if (/^Pregnancy: Not pregnant or breastfeeding/i.test(t)) add(l, 'pregnant_or_breastfeeding', false);
    if (/^Tumour tissue: Archival tumour block available/i.test(t)) add(l, 'tumour_sample_available', true);
    else if (/^Tumour tissue: No tissue/i.test(t)) add(l, 'tumour_sample_available', false);

    // Labs
    if ((m = /^([A-Za-z ()-]+?): ([\d.]+) (\S+) \(reference (?:[\d.]+[–-]([\d.]+)|>[\d.]+)\)$/.exec(t))) {
      const key = LAB_NAMES[m[1]];
      if (key) add(l, key, parseFloat(m[2]), { unit: m[3], ...(m[4] ? { refHigh: parseFloat(m[4]) } : {}), observedOn: sampleDate ?? doc.date });
    }

    // Molecular pathology. "Not performed" is recorded as not_tested, never as negative.
    if (/^Molecular testing: Not performed/i.test(t)) addAll(l, MOLECULAR_GENE_KEYS, 'not_tested');
    if (/^Accreditation: .*accredited/i.test(t)) add(l, 'molecular_lab_accredited', true);
    if ((m = /^(KRAS|NRAS|HRAS|BRAF): (.+)$/.exec(t))) {
      const v = pointValue(m[2]);
      if (v) add(l, m[1].toLowerCase() as FactKey, v);
    }
    if ((m = /^EGFR: (.+)$/.exec(t))) {
      const rest = m[1];
      let v: FactValue | null = null;
      if (/no pathogenic variant detected/i.test(rest)) v = 'not_detected';
      else if (/exon 19 deletion/i.test(rest)) v = 'Ex19del';
      else if (/exon 20 insertion/i.test(rest)) v = 'ex20ins';
      else v = pointValue(rest);
      if (v) add(l, 'egfr', v);
    }
    for (const [gene, key, pos] of [
      ['ALK', 'alk', 'rearranged'],
      ['ROS1', 'ros1', 'rearranged'],
      ['RET', 'ret', 'fusion'],
      ['NRG1', 'nrg1', 'fusion'],
    ] as const) {
      if ((m = new RegExp(`^${gene}: (.+)$`).exec(t))) {
        const v = fusionValue(m[1], pos);
        if (v) add(l, key, v);
      }
    }
    if ((m = /^MET: (.+)$/.exec(t))) {
      const rest = m[1];
      add(l, 'met_ex14', /no exon 14 skipping/i.test(rest) ? 'not_detected' : /exon 14 skipping variant detected/i.test(rest) ? 'detected' : 'uncertain');
      add(l, 'met_amp', /no amplification/i.test(rest) ? 'not_detected' : /amplification detected/i.test(rest) ? 'detected' : 'uncertain');
    }
    if ((m = /^HER2 \(ERBB2\): (.+)$/.exec(t))) {
      const rest = m[1];
      if (/no pathogenic variant or amplification detected/i.test(rest)) {
        add(l, 'her2_mutation', 'not_detected');
        add(l, 'her2_amplification', 'not_detected');
      } else {
        if (/outside the tyrosine kinase domain/i.test(rest)) add(l, 'her2_mutation', 'mutation_non_tkd');
        else if (/tyrosine kinase domain/i.test(rest)) add(l, 'her2_mutation', 'mutation_tkd');
        else if (/no pathogenic variant detected/i.test(rest)) add(l, 'her2_mutation', 'not_detected');
        if (/no amplification detected/i.test(rest)) add(l, 'her2_amplification', 'not_detected');
        else if (/amplification detected/i.test(rest)) add(l, 'her2_amplification', 'detected');
      }
    }
    if ((m = /^HER2 protein \(IHC\): (3\+|2\+|1\+|0)/.exec(t))) {
      add(l, 'her2_overexpression', m[1] === '3+' ? 'ihc_3plus' : m[1] === '2+' ? 'ihc_2plus' : 'negative');
    }
    // Decimals are kept exactly as written (0.5 stays 0.5).
    if ((m = /PD-L1 \(22C3\) tumour proportion score \(TPS\): (\d{1,3}(?:\.\d+)?)%/.exec(t))) add(l, 'pdl1_tps', parseFloat(m[1]), { unit: '%' });
  }
  return out;
}

export const rulesExtractor: Extractor = {
  kind: 'rules',
  async propose(doc: SourceDoc) {
    return extractWithRules(doc);
  },
};
