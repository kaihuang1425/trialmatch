import type { DocKind, FactKey, FactValue } from './types';

export const FACT_LABEL: Record<FactKey, string> = {
  age: 'Age',
  histology: 'Histology',
  stage: 'Stage',
  curative_option: 'Curative surgery / radical radiotherapy option',
  ecog: 'ECOG performance status',
  prior_systemic_advanced: 'Prior systemic therapy (advanced disease)',
  prior_lines_advanced: 'Prior lines of therapy (advanced disease)',
  prior_immunotherapy: 'Prior anti-PD-1/PD-L1 immunotherapy',
  prior_platinum_chemo: 'Prior platinum chemotherapy',
  prior_kras_g12c_inhibitor: 'Prior KRAS G12C inhibitor',
  prior_pan_ras_inhibitor: 'Prior pan-KRAS/RAS inhibitor',
  prior_egfr_tki: 'Prior EGFR-targeted therapy',
  prior_osimertinib: 'Prior osimertinib',
  prior_alk_tki: 'Prior ALK inhibitor',
  prior_docetaxel: 'Prior docetaxel',
  prior_her2_adc: 'Prior HER2-directed antibody-drug conjugate',
  prior_anti_vegf: 'Prior anti-VEGF/VEGFR therapy',
  prior_met_inhibitor: 'Prior MET inhibitor',
  prior_zongertinib: 'Prior zongertinib',
  last_systemic_therapy_end: 'Last dose of systemic anticancer therapy',
  adjuvant_therapy_end: 'Neoadjuvant/adjuvant therapy end',
  recovered_from_toxicity: 'Recovered from prior-therapy toxicity (≤ grade 1)',
  in_investigational_study: 'In another investigational study',
  last_radiotherapy: 'Last radiotherapy',
  major_surgery_recent: 'Major surgery in the last 4 weeks',
  brain_mets: 'Brain metastases',
  cns_symptomatic: 'CNS metastases symptomatic',
  cns_untreated: 'CNS metastases untreated',
  cns_progressing: 'CNS metastases progressing',
  leptomeningeal: 'Leptomeningeal disease',
  spinal_cord_compression: 'Spinal cord compression',
  measurable_disease: 'Measurable disease (RECIST 1.1)',
  measurable_unirradiated: 'Measurable lesion not previously irradiated',
  ild_history: 'ILD / pneumonitis history',
  ibd_history: 'Inflammatory bowel disease history',
  gi_absorption_issue: 'Swallowing / GI absorption problem',
  cv_disease: 'Cardiovascular disease',
  uncontrolled_hypertension: 'Uncontrolled hypertension',
  qtcf_ms: 'QTcF',
  hiv: 'HIV status',
  hepatitis_active: 'Active hepatitis B or C',
  tb_active: 'Active tuberculosis',
  active_infection: 'Active infection needing systemic therapy',
  autoimmune_active: 'Active autoimmune disease (systemic treatment, last 2 years)',
  transplant_history: 'Stem cell / organ transplant',
  other_malignancy: 'Other malignancy',
  pregnant_or_breastfeeding: 'Pregnant or breastfeeding',
  uncontrolled_pain: 'Uncontrolled tumour-related pain',
  effusion_drainage: 'Effusion needing recurrent drainage',
  immunosuppressive_meds: 'Systemic immunosuppressive medication',
  qt_prolonging_meds: 'QT-prolonging medication',
  strong_cyp3a_meds: 'Strong CYP3A inhibitor/inducer',
  growth_factor_4w: 'Haematopoietic growth factors (last 4 weeks)',
  recent_antibiotics: 'Therapeutic antibiotics (last 2 weeks)',
  live_vaccine_recent: 'Live vaccine (last 28 days)',
  tumour_sample_available: 'Tumour sample available',
  kras: 'KRAS',
  nras: 'NRAS',
  hras: 'HRAS',
  egfr: 'EGFR',
  alk: 'ALK',
  ros1: 'ROS1',
  braf: 'BRAF',
  met_ex14: 'MET exon 14 skipping',
  met_amp: 'MET amplification',
  ret: 'RET',
  nrg1: 'NRG1',
  her2_mutation: 'HER2 (ERBB2) mutation',
  her2_amplification: 'HER2 (ERBB2) amplification',
  her2_overexpression: 'HER2 protein overexpression (IHC)',
  pdl1_tps: 'PD-L1 TPS (local)',
  molecular_lab_accredited: 'Molecular test from an accredited laboratory',
  lab_anc: 'Neutrophils (ANC)',
  lab_hemoglobin: 'Haemoglobin',
  lab_platelets: 'Platelets',
  lab_bilirubin: 'Bilirubin',
  lab_alt: 'ALT',
  lab_ast: 'AST',
  lab_alp: 'Alkaline phosphatase',
  lab_creatinine: 'Creatinine',
  lab_egfr_renal: 'eGFR (kidney)',
  lab_inr: 'INR',
  lab_amylase: 'Amylase',
  lab_lipase: 'Lipase',
  urine_protein: 'Urine protein (dipstick)',
};

const HISTORY_KEYS: FactKey[] = [
  'gi_absorption_issue', 'cv_disease', 'uncontrolled_hypertension', 'qtcf_ms', 'hiv', 'hepatitis_active', 'tb_active', 'active_infection',
  'autoimmune_active', 'transplant_history', 'other_malignancy', 'pregnant_or_breastfeeding', 'uncontrolled_pain', 'effusion_drainage',
  'immunosuppressive_meds', 'qt_prolonging_meds', 'strong_cyp3a_meds', 'growth_factor_4w', 'recent_antibiotics', 'live_vaccine_recent',
  'tumour_sample_available', 'major_surgery_recent', 'last_radiotherapy', 'in_investigational_study', 'spinal_cord_compression',
  'ild_history', 'ibd_history', 'recovered_from_toxicity', 'last_systemic_therapy_end', 'adjuvant_therapy_end',
];

/** Which single document normally supplies each fact (groups missing facts into one request). */
export const FACT_SOURCE_DOC: Record<FactKey, DocKind> = Object.fromEntries(
  (Object.keys(FACT_LABEL) as FactKey[]).map((k) => {
    let d: DocKind = 'referral_summary';
    if (k.startsWith('lab_') || k === 'urine_protein') d = 'labs';
    else if (
      ['kras', 'nras', 'hras', 'egfr', 'alk', 'ros1', 'braf', 'met_ex14', 'met_amp', 'ret', 'nrg1', 'her2_mutation', 'her2_amplification', 'her2_overexpression', 'pdl1_tps', 'molecular_lab_accredited'].includes(k)
    )
      d = 'molecular';
    else if (['brain_mets', 'cns_symptomatic', 'cns_untreated', 'cns_progressing', 'leptomeningeal', 'measurable_disease', 'measurable_unirradiated'].includes(k)) d = 'imaging';
    else if (k === 'histology') d = 'pathology';
    else if (HISTORY_KEYS.includes(k)) d = 'referral_summary';
    return [k, d];
  }),
) as Record<FactKey, DocKind>;

export const DOC_LABEL: Record<DocKind, string> = {
  referral_summary: 'updated referral summary (medical history and treatment history)',
  pathology: 'histopathology report',
  molecular: 'molecular pathology report',
  labs: 'current blood results (full blood count, renal and liver function)',
  imaging: 'imaging report (brain MRI and staging CT)',
  letter: 'clinic letter',
};

const VALUE_LABEL: Record<string, string> = {
  nonsquamous_adenocarcinoma: 'non-squamous adenocarcinoma',
  squamous: 'squamous cell carcinoma',
  mixed_small_cell: 'mixed histology with small-cell component',
  small_cell: 'small-cell carcinoma',
  not_amenable: 'not amenable to curative treatment',
  amenable: 'curative treatment possible',
  not_detected: 'not detected',
  not_tested: 'not tested',
  rearranged: 'rearrangement detected',
  fusion: 'fusion detected',
  detected: 'detected',
  mutation_tkd: 'mutation in tyrosine kinase domain',
  mutation_non_tkd: 'mutation outside tyrosine kinase domain',
  ihc_3plus: 'IHC 3+',
  ihc_2plus: 'IHC 2+',
  negative: 'negative',
  positive: 'positive',
  none: 'none',
  present: 'present',
  controlled: 'controlled',
  significant: 'significant / uncontrolled',
  treated_stable: 'treated and stable',
  untreated: 'untreated',
  uncertain: 'unclear in source',
};

export function formatValue(value: FactValue, unit?: string): string {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return unit ? `${value} ${unit}`.replace(' %', '%') : String(value);
  return VALUE_LABEL[value] ?? value;
}
