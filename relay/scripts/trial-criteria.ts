// Hand-encoded criteria for the 9-trial portfolio. EVERY registry line is covered by a def: the
// encoder (scripts/encode-trials.ts) fails if any bullet is left out, and copies each line verbatim.
// Row kinds:
//   checkable          — reads facts; missing evidence stays `unknown`
//   atScreening        — a study-team step at screening (consent, central testing, assignment); shown,
//                        never blocks "Ready for prescreening review"
//   completeness       — the registry says its list is "not limited to" / "further criteria apply"
// All logic is plain JSON (data/DATA.md "Rule language").

import type { FactKey, Rule, Window } from '../src/engine/types';

// ---------- rule helpers ----------
export const and = (...args: Rule[]): Rule => ({ op: 'and', args });
export const or = (...args: Rule[]): Rule => ({ op: 'or', args });
export const not = (arg: Rule): Rule => ({ op: 'not', arg });
export const is = (key: FactKey, value: string | number | boolean, window?: Window): Rule => (window ? { op: 'is', key, value, window } : { op: 'is', key, value });
export const no = (key: FactKey): Rule => ({ op: 'is', key, value: false });
export const isIn = (key: FactKey, values: string[], note?: string, window?: Window): Rule => {
  const r: Rule = { op: 'in', key, values };
  if (note) r.note = note;
  if (window) r.window = window;
  return r;
};
export const cmp = (key: FactKey, c: '<' | '<=' | '>' | '>=' | '==' | '!=', value: number, unit?: string, window?: Window, note?: string): Rule => {
  const r: Rule = { op: 'cmp', key, cmp: c, value };
  if (unit) r.unit = unit;
  if (window) r.window = window;
  if (note) r.note = note;
  return r;
};
export const present = (key: FactKey, window?: Window): Rule => (window ? { op: 'present', key, window } : { op: 'present', key });
export const current = (keys: FactKey[], window: Window): Rule => ({ op: 'current', keys, window });
export const notWithin = (key: FactKey, days: number, what: string): Rule => ({ op: 'not_within', key, days, what });
export const table = (column: 'ukFirstLine' | 'ukAnyLine' | 'driver', genes: FactKey[]): Rule => ({ op: 'table', table: 'alterations', column, genes });
export const review = (reason: string): Rule => ({ op: 'review', reason });
export const screening = (reason: string): Rule => ({ op: 'at_screening', reason });
export const unparseable = (reason: string): Rule => ({ op: 'unparseable', reason });

const W_LAB: Window = { source: 'relay_policy', policy: 'labRecencyDays' };
const P28: Window = { source: 'protocol', days: 28, text: 'within 28 days prior to sub-study randomization' };
const P42: Window = { source: 'protocol', days: 42, text: 'within 42 days prior to sub-study randomization' };

const NSCLC = ['nonsquamous_adenocarcinoma', 'squamous'];
const NONSQ = isIn('histology', ['nonsquamous_adenocarcinoma']);
const STAGE_ADV = isIn('stage', ['IIIB', 'IIIC', 'IV', 'IVA', 'IVB', 'IVC']);
const STAGE_LA_OR_MET = isIn('stage', ['IIIA', 'IIIB', 'IIIC', 'IV', 'IVA', 'IVB', 'IVC']);
const NOT_CURATIVE = is('curative_option', 'not_amenable');
const LABS_CORE: FactKey[] = ['lab_anc', 'lab_hemoglobin', 'lab_platelets', 'lab_bilirubin', 'lab_alt', 'lab_ast', 'lab_creatinine'];
const RAS_CODONS = ['G12*', 'G13*', 'Q61*'];
const NO_BRAIN = is('brain_mets', 'none');
const CV_OK_OR_REVIEW = (why: string) => or(is('cv_disease', 'none'), and(is('cv_disease', 'controlled'), review(why)));
const OTHER_CANCER = (why: string) => or(is('other_malignancy', 'none'), and(is('other_malignancy', 'present'), review(why)));
const ILD_OR_REVIEW = (why: string) => or(no('ild_history'), and(is('ild_history', true), review(why)));
const HIV_OK_OR_REVIEW = (why: string) => or(is('hiv', 'negative'), and(is('hiv', 'positive'), review(why)));
const HER2_ANY: Rule = {
  op: 'any_positive',
  checks: [
    { key: 'her2_mutation', values: ['mutation_tkd', 'mutation_non_tkd'] },
    { key: 'her2_amplification', values: ['detected'] },
    { key: 'her2_overexpression', values: ['ihc_3plus'] },
    { key: 'nrg1', values: ['fusion'] },
  ],
  otherwise: and(
    present('her2_mutation'),
    present('her2_amplification'),
    review('No qualifying HER2/NRG1 aberration documented; negative NGS results do not rule out HER2 overexpression (IHC) or a rearrangement'),
  ),
};
const SCREEN = 'Done by the study team at screening; not available at prescreening';

export interface Def {
  find: string; // unique substring of one registry line
  id: string;
  plain: string;
  logic: Rule;
  kind?: 'inclusion' | 'exclusion';
  mandatory?: boolean;
  atScreening?: boolean;
  completeness?: boolean;
  detailFind?: string[]; // extra registry lines folded into this row (marked as covered)
  sectionDetail?: boolean; // heading line: fold every bullet of its section into this row
}

export interface TitleDef {
  id: string;
  text: string;
  plain: string;
  logic: Rule;
  kind: 'inclusion' | 'exclusion';
}

export interface TrialSpec {
  nct: string;
  prefix: string;
  acronym: string;
  acronymSource: string;
  structuredAge: boolean;
  defs: Def[];
  titleDefs?: TitleDef[];
  notes: string[];
}

const scr = (find: string, id: string, plain: string, kind?: 'inclusion' | 'exclusion', reason = SCREEN): Def => ({
  find,
  id,
  plain,
  logic: screening(reason),
  atScreening: true,
  ...(kind ? { kind } : {}),
});

export const TRIAL_SPECS: TrialSpec[] = [
  {
    nct: 'NCT05920356',
    prefix: 'cb202',
    acronym: 'CodeBreaK 202',
    acronymSource: 'official title',
    structuredAge: true,
    defs: [
      { find: 'confirmed diagnosis of nonsquamous stage IV', id: 'cb202-histology', plain: 'Non-squamous NSCLC', logic: NONSQ },
      { find: 'confirmed diagnosis of nonsquamous stage IV', id: 'cb202-stage', plain: 'Stage IV, or advanced (non-curable) stage IIIB/IIIC', logic: and(STAGE_ADV, NOT_CURATIVE) },
      { find: 'confirmed diagnosis of nonsquamous stage IV', id: 'cb202-kras', plain: 'KRAS G12C mutation', logic: is('kras', 'G12C') },
      {
        find: 'confirmed diagnosis of nonsquamous stage IV',
        id: 'cb202-pdl1-local',
        plain: 'PD-L1 negative on the local test (TPS < 1%, Relay policy)',
        logic: cmp('pdl1_tps', '<', 1, '%', undefined, 'Relay policy: PD-L1 negative read as TPS < 1%; registry gives no cut-off'),
      },
      {
        find: 'confirmed diagnosis of nonsquamous stage IV',
        id: 'cb202-pdl1-central',
        plain: 'PD-L1 negativity confirmed by central testing (study team, at screening)',
        logic: screening('Central PD-L1 testing or central confirmation of the local result is done by the study team at screening. Coordinator verification of the local report never substitutes for it.'),
        atScreening: true,
      },
      { find: 'No history of systemic anticancer therapy', id: 'cb202-prior', plain: 'No systemic therapy for metastatic / non-curable disease', logic: no('prior_systemic_advanced') },
      { find: '(ECOG) ≤ 1', id: 'cb202-ecog', plain: 'ECOG 0–1', logic: cmp('ecog', '<=', 1) },
      {
        find: 'Mixed histology NSCLC',
        id: 'cb202-x-histology',
        plain: 'No small-cell or LCNEC component; not predominantly squamous',
        logic: not(isIn('histology', ['mixed_small_cell', 'small_cell', 'squamous'])),
      },
      {
        find: 'tumors known to harbor molecular alterations',
        id: 'cb202-x-targetable',
        plain: 'No alteration with UK-approved first-line targeted therapy (Relay dated table)',
        logic: table('ukFirstLine', ['egfr', 'alk', 'ros1', 'braf', 'met_ex14', 'ret', 'kras', 'her2_mutation', 'nrg1']),
      },
      { find: 'Symptomatic (treated or untreated) brain metastases', id: 'cb202-x-brain', plain: 'No symptomatic brain metastases (treated or untreated)', logic: or(NO_BRAIN, no('cns_symptomatic')) },
      { find: 'Gastrointestinal (GI) tract disease', id: 'cb202-x-gi', plain: 'No GI disease stopping oral medication', logic: no('gi_absorption_issue') },
      {
        find: 'Myocardial infarction within 6 months',
        id: 'cb202-x-cardiac',
        plain: 'No MI in 6 months, unstable arrhythmia or unstable angina',
        logic: CV_OK_OR_REVIEW('Known cardiovascular disease reported as controlled: confirm no MI within 6 months, unstable arrhythmia or unstable angina'),
      },
      { find: 'Prior therapy with a KRAS G12C inhibitor', id: 'cb202-x-priorg12c', plain: 'No prior KRAS G12C inhibitor', logic: no('prior_kras_g12c_inhibitor') },
    ],
    notes: [
      'The first inclusion bullet is split into five rows that share its verbatim text (histology, stage, KRAS, local PD-L1, central PD-L1).',
      'Central PD-L1 confirmation is an at-screening row: it never blocks "Ready for prescreening review" and coordinator verification never stands in for it.',
      'Acronym CodeBreaK 202 taken from the official title (no acronym field in the record).',
    ],
  },
  {
    nct: 'NCT07190248',
    prefix: 'kl007',
    acronym: 'KANDLELIT-007',
    acronymSource: 'official title',
    structuredAge: true,
    titleDefs: [
      {
        id: 'kl007-kras',
        text: 'KRAS G12C-Mutant, Advanced or Metastatic Nonsquamous NSCLC',
        plain: 'KRAS G12C mutation (from the study title; listed criteria are "not limited to")',
        logic: is('kras', 'G12C'),
        kind: 'inclusion',
      },
    ],
    defs: [
      {
        find: 'The main inclusion criteria include but are not limited to',
        id: 'kl007-completeness',
        plain: 'Protocol completeness: the registry lists the main criteria only ("not limited to")',
        logic: review('The registry lists only the main inclusion and exclusion criteria ("include but are not limited to"); the study team checks the full protocol list'),
        completeness: true,
        detailFind: ['The main exclusion criteria include but are not limited to'],
      },
      { find: 'Has nonsquamous NSCLC (Stage IIIB', id: 'kl007-histology', plain: 'Non-squamous NSCLC', logic: NONSQ },
      { find: 'Has nonsquamous NSCLC (Stage IIIB', id: 'kl007-stage', plain: 'Stage IIIB/IIIC not for curative resection or chemoradiation, or stage IV', logic: and(STAGE_ADV, NOT_CURATIVE) },
      { find: 'If human immunodeficiency virus (HIV) positive', id: 'kl007-hiv', plain: 'If HIV positive, well controlled on ART', logic: HIV_OK_OR_REVIEW('HIV positive: control on antiretroviral therapy is for the study team') },
      { find: 'Has diagnosis of small cell lung cancer', id: 'kl007-x-smallcell', plain: 'No small-cell lung cancer or small-cell elements', logic: not(isIn('histology', ['small_cell', 'mixed_small_cell'])) },
      {
        find: 'Has active inflammatory bowel disease',
        id: 'kl007-x-ibd',
        plain: 'No IBD (active or past) and no chronic diarrhoea',
        logic: and(no('ibd_history'), no('gi_absorption_issue')),
      },
      { find: 'Has uncontrolled, significant cardiovascular disease', id: 'kl007-x-cv', plain: 'No uncontrolled, significant cardiovascular or cerebrovascular disease', logic: isIn('cv_disease', ['none', 'controlled']) },
      { find: 'Has a gastrointestinal disorder affecting absorption', id: 'kl007-x-gi', plain: 'No GI disorder affecting absorption', logic: no('gi_absorption_issue') },
      {
        find: "Is HIV positive and has a history of Kaposi",
        id: 'kl007-x-hiv-kaposi',
        plain: "If HIV positive: no Kaposi's sarcoma or multicentric Castleman's disease",
        logic: HIV_OK_OR_REVIEW("HIV positive: history of Kaposi's sarcoma or Castleman's disease is not captured"),
      },
      { find: 'Has received prior systemic anticancer therapy for their advanced', id: 'kl007-x-prior', plain: 'No systemic therapy for advanced disease', logic: no('prior_systemic_advanced') },
      { find: 'Has known additional malignancy', id: 'kl007-x-malignancy', plain: 'No other malignancy progressing or treated in the last 3 years', logic: OTHER_CANCER('Other malignancy: progression or treatment within the last 3 years decides') },
      {
        find: 'Has known active central nervous system (CNS) metastases',
        id: 'kl007-x-cns',
        plain: 'No active CNS metastases and no carcinomatous meningitis',
        logic: and(
          no('leptomeningeal'),
          or(
            NO_BRAIN,
            and(no('cns_untreated'), no('cns_progressing'), no('cns_symptomatic')),
            and(no('cns_progressing'), review('Untreated or symptomatic but non-progressing CNS metastases: whether they are "active" is for the study team')),
          ),
        ),
      },
      { find: 'Has active autoimmune disease', id: 'kl007-x-autoimmune', plain: 'No autoimmune disease needing systemic treatment in 2 years', logic: no('autoimmune_active') },
      {
        find: 'History of (noninfectious) pneumonitis/interstitial lung disease',
        id: 'kl007-x-ild',
        plain: 'No pneumonitis / ILD that needed steroids, and none current',
        logic: ILD_OR_REVIEW('ILD/pneumonitis history: whether it required steroids or is current'),
      },
      { find: 'Has active infection requiring systemic therapy', id: 'kl007-x-infection', plain: 'No active infection needing systemic therapy', logic: no('active_infection') },
      { find: 'Has history of stem cell/solid organ transplant', id: 'kl007-x-transplant', plain: 'No stem cell or solid organ transplant', logic: no('transplant_history') },
      { find: 'Has not adequately recovered from major surgery', id: 'kl007-x-surgery', plain: 'Recovered from any major surgery', logic: no('major_surgery_recent') },
    ],
    notes: [
      'KRAS G12C requirement derived from the official title: the registry lists only "main" criteria.',
      'One protocol-completeness row (needs_review) covers both "not limited to" statements; every listed criterion has its own row.',
    ],
  },
  {
    nct: 'NCT06793215',
    prefix: 'kr2',
    acronym: 'Krascendo 2',
    acronymSource: 'registry acronym field',
    structuredAge: true,
    defs: [
      { find: '(ECOG) performance status of 0 or 1', id: 'kr2-ecog', plain: 'ECOG 0–1', logic: cmp('ecog', '<=', 1) },
      { find: 'advanced or metastatic non squamous NSCLC', id: 'kr2-histology', plain: 'Non-squamous NSCLC', logic: NONSQ },
      { find: 'advanced or metastatic non squamous NSCLC', id: 'kr2-setting', plain: 'Advanced/metastatic, not for curative surgery or chemoradiotherapy', logic: and(STAGE_LA_OR_MET, NOT_CURATIVE) },
      { find: 'Measurable disease, as defined by RECIST v1.1', id: 'kr2-measurable', plain: 'Measurable disease (RECIST 1.1)', logic: is('measurable_disease', true) },
      { find: 'No prior systemic treatment for advanced or metastatic NSCLC', id: 'kr2-prior', plain: 'No systemic therapy for advanced disease', logic: no('prior_systemic_advanced') },
      { find: 'Documentation of the presence of a KRAS G12C mutation', id: 'kr2-kras', plain: 'KRAS G12C mutation documented', logic: is('kras', 'G12C') },
      { find: 'Documentation of known PD-L1 expression status', id: 'kr2-pdl1', plain: 'PD-L1 status documented (any value)', logic: present('pdl1_tps') },
      { find: 'Availability of a representative tumor specimen', id: 'kr2-specimen', plain: 'Representative tumour specimen available', logic: is('tumour_sample_available', true) },
      {
        find: 'Adequate end-organ function',
        id: 'kr2-organ',
        plain: 'Adequate end-organ function: current labs (Relay policy 28 days), judged by the study team (no thresholds in the registry)',
        logic: and(current(LABS_CORE, W_LAB), review('The registry gives no thresholds for "adequate end-organ function"; the study team judges current results')),
      },
      { find: 'Eligible to receive a platinum-based chemotherapy regimen', id: 'kr2-platinum', plain: 'Fit for platinum-based chemotherapy (clinical judgement)', logic: review('Eligibility for platinum-based chemotherapy is a clinical judgement') },
      {
        find: 'Known concomitant second oncogenic driver',
        id: 'kr2-x-driver',
        plain: 'No second driver with available targeted treatment, HER2 included (Relay dated table)',
        logic: table('ukAnyLine', ['egfr', 'alk', 'ros1', 'braf', 'met_ex14', 'ret', 'her2_mutation', 'nrg1']),
      },
      {
        find: 'Symptomatic, untreated, or actively progressing central nervous system',
        id: 'kr2-x-cns',
        plain: 'No symptomatic, untreated or progressing CNS metastases',
        logic: or(NO_BRAIN, and(no('cns_symptomatic'), no('cns_untreated'), no('cns_progressing'))),
      },
      {
        find: 'Spinal cord compression not definitively treated',
        id: 'kr2-x-spinal',
        plain: 'No untreated spinal cord compression; treated compression stable ≥ 2 weeks',
        logic: or(is('spinal_cord_compression', 'none'), and(is('spinal_cord_compression', 'treated_stable'), review('Treated spinal cord compression: clinical stability for at least 2 weeks'))),
      },
      { find: 'History of leptomeningeal disease', id: 'kr2-x-lepto', plain: 'No leptomeningeal disease', logic: no('leptomeningeal') },
      { find: 'Uncontrolled tumor-related pain', id: 'kr2-x-pain', plain: 'No uncontrolled tumour-related pain', logic: no('uncontrolled_pain') },
      { find: 'Uncontrolled pleural effusion', id: 'kr2-x-effusion', plain: 'No effusion or ascites needing monthly drainage', logic: no('effusion_drainage') },
      {
        find: 'Any anti-cancer systemic therapy, including hormonal therapy',
        id: 'kr2-x-recent-therapy',
        plain: 'No systemic anticancer therapy in the 21 days before randomisation',
        logic: notWithin('last_systemic_therapy_end', 21, 'systemic anticancer therapy'),
      },
      scr('Any anti-cancer systemic therapy, including hormonal therapy', 'kr2-x-future-therapy', 'Not expected to need other antineoplastic therapy during the study (study team)', 'exclusion'),
      {
        find: 'Radiation therapy including palliative RT',
        id: 'kr2-x-radiotherapy',
        plain: 'No radiotherapy in 2 weeks; no lung RT > 30 Gy in 6 months',
        logic: or(
          notWithin('last_radiotherapy', 183, 'any radiotherapy'),
          and(notWithin('last_radiotherapy', 14, 'any radiotherapy'), review('Radiotherapy in the last 6 months: whether it was > 30 Gy to the lung decides')),
        ),
      },
      {
        find: 'Prior treatment with KRAS G12C inhibitors or pan-KRAS/RAS inhibitors',
        id: 'kr2-x-priorkras',
        plain: 'No prior KRAS G12C or pan-RAS inhibitor',
        logic: and(no('prior_kras_g12c_inhibitor'), no('prior_pan_ras_inhibitor')),
      },
      {
        find: 'Treatment with systemic immunosuppressive or immunostimulatory',
        id: 'kr2-x-immune',
        plain: 'No systemic immunosuppressive or immunostimulatory treatment, including checkpoint inhibitors',
        logic: and(no('immunosuppressive_meds'), no('prior_immunotherapy')),
      },
      { find: 'Current treatment with medications that are well known to prolong the QT', id: 'kr2-x-qt', plain: 'No QT-prolonging medication', logic: no('qt_prolonging_meds') },
      { find: 'Treatment with therapeutic oral or IV antibiotics', id: 'kr2-x-antibiotics', plain: 'No therapeutic antibiotics in 2 weeks', logic: no('recent_antibiotics') },
      { find: 'Prior allogeneic stem cell or solid organ transplantation', id: 'kr2-x-transplant', plain: 'No allogeneic stem cell or organ transplant', logic: no('transplant_history') },
      {
        find: 'History of malignancy other than NSCLC within 5 years',
        id: 'kr2-x-malignancy',
        plain: 'No other malignancy within 5 years (low-risk exceptions)',
        logic: OTHER_CANCER('Other malignancy: timing (5 years) and the low-risk exceptions decide'),
      },
      {
        find: 'Individuals with chronic diarrhea, short bowel syndrome',
        id: 'kr2-x-gi',
        plain: 'No IBD, chronic diarrhoea, short bowel, malabsorption or major gastric surgery',
        logic: and(no('ibd_history'), no('gi_absorption_issue')),
      },
      { find: 'History of idiopathic pulmonary fibrosis', id: 'kr2-x-ild', plain: 'No pulmonary fibrosis, organising pneumonia or pneumonitis', logic: no('ild_history') },
      {
        find: 'Significant cardiovascular disease within 3 months',
        id: 'kr2-x-cv',
        plain: 'No significant cardiovascular disease in 3 months',
        logic: CV_OK_OR_REVIEW('Known cardiovascular disease: whether it was significant in the last 3 months'),
      },
    ],
    notes: [
      '"Adequate end-organ function" has no thresholds in the record: Relay checks that labs are current (policy) and the study team judges them.',
      'The second-driver exclusion includes HER2 and uses the dated alteration table in data/policy/relay-policy.json (column ukAnyLine).',
    ],
  },
  {
    nct: 'NCT06881784',
    prefix: 'rs301',
    acronym: 'RASolve 301',
    acronymSource: 'registry acronym field',
    structuredAge: false,
    defs: [
      { find: 'At least 18 years old and has provided informed consent', id: 'rs301-age', plain: 'Aged 18 or over', logic: cmp('age', '>=', 18, 'years') },
      scr('At least 18 years old and has provided informed consent', 'rs301-consent', 'Informed consent (study team)'),
      { find: '(ECOG) performance status of 0 or 1.', id: 'rs301-ecog', plain: 'ECOG 0–1', logic: cmp('ecog', '<=', 1) },
      {
        find: 'Pathologically confirmed NSCLC, either locally advanced or metastatic',
        id: 'rs301-setting',
        plain: 'NSCLC, locally advanced or metastatic, not for curative surgery or radiotherapy',
        logic: and(isIn('histology', NSCLC), STAGE_LA_OR_MET, NOT_CURATIVE),
      },
      { find: 'Measurable disease per RECIST v1.1.', id: 'rs301-measurable', plain: 'Measurable disease (RECIST 1.1)', logic: is('measurable_disease', true) },
      {
        find: 'Adequate organ function (bone marrow, liver, kidney, coagulation)',
        id: 'rs301-organ',
        plain: 'Adequate bone marrow, liver, kidney and coagulation: current labs incl. INR (Relay policy 28 days), judged by the study team',
        logic: and(current([...LABS_CORE, 'lab_inr'], W_LAB), review('The registry names organ systems but gives no thresholds; the study team judges current results')),
      },
      {
        find: 'One to two prior lines of therapy',
        id: 'rs301-prior-lines',
        plain: '1–2 prior lines that include anti-PD-(L)1 AND platinum chemotherapy',
        logic: and(cmp('prior_lines_advanced', '>=', 1), cmp('prior_lines_advanced', '<=', 2), is('prior_immunotherapy', true), is('prior_platinum_chemo', true)),
      },
      {
        find: 'Documented RAS mutation status',
        id: 'rs301-ras',
        plain: 'KRAS, NRAS or HRAS mutation at G12, G13 or Q61 (untested is not negative)',
        logic: or(isIn('kras', RAS_CODONS), isIn('nras', RAS_CODONS), isIn('hras', RAS_CODONS)),
      },
      { find: 'Able to take oral medications.', id: 'rs301-oral', plain: 'Able to take oral medication', logic: no('gi_absorption_issue') },
      {
        find: 'Prior therapy with direct RAS-targeted therapy or docetaxel',
        id: 'rs301-x-prior',
        plain: 'No prior RAS-targeted therapy or docetaxel',
        logic: and(no('prior_kras_g12c_inhibitor'), no('prior_pan_ras_inhibitor'), no('prior_docetaxel')),
      },
      { find: 'Untreated central nervous system (CNS) metastases.', id: 'rs301-x-cns', plain: 'No untreated CNS metastases', logic: or(NO_BRAIN, no('cns_untreated')) },
      {
        find: 'Medically significant comorbidities',
        id: 'rs301-x-comorbid',
        plain: 'No significant cardiovascular disease, lung disease or impaired GI function',
        logic: and(
          CV_OK_OR_REVIEW('Known cardiovascular disease: whether it is medically significant'),
          ILD_OR_REVIEW('Lung disease history: whether it is medically significant'),
          no('gi_absorption_issue'),
        ),
      },
      { find: 'Ongoing anticancer therapy.', id: 'rs301-x-ongoing', plain: 'No ongoing anticancer therapy', logic: not(is('last_systemic_therapy_end', 'ongoing')) },
      { find: 'Pregnant or breastfeeding.', id: 'rs301-x-pregnancy', plain: 'Not pregnant or breastfeeding', logic: no('pregnant_or_breastfeeding') },
    ],
    notes: ['All UK sites are ACTIVE_NOT_RECRUITING in the snapshot; the simulated site lane starts closed.'],
  },
  {
    nct: 'NCT07185997',
    prefix: 'alp',
    acronym: 'ALPACCA',
    acronymSource: 'official title',
    structuredAge: true,
    defs: [
      {
        find: 'Key Eligibility Criteria:',
        id: 'alp-completeness',
        plain: 'Protocol completeness: the registry lists key criteria only',
        logic: review('The registry lists "key" eligibility criteria only; the study team checks the full protocol list'),
        completeness: true,
      },
      {
        find: 'Histologically or cytologically documented, locally advanced or metastatic',
        id: 'alp-setting',
        plain: 'NSCLC, locally advanced or metastatic, not for curative surgery or radiotherapy',
        logic: and(isIn('histology', NSCLC), STAGE_LA_OR_MET, NOT_CURATIVE),
      },
      {
        find: 'Documented results of the presence of an Epidermal Growth Factor Receptor (EGFR) PACC mutation',
        id: 'alp-pacc',
        plain: 'EGFR PACC mutation on the registry list (local testing)',
        logic: isIn('egfr', ['@PACC_LIST'], 'full registry list of eligible PACC mutations'),
        detailFind: ['List of eligible PACC mutations:', 'E709X, E709A'],
      },
      {
        find: 'No prior systemic anticancer therapy regimens received',
        id: 'alp-prior',
        plain: 'No systemic therapy for advanced disease, including any EGFR-targeting agent',
        logic: and(no('prior_systemic_advanced'), no('prior_egfr_tki')),
      },
      {
        find: 'Patients who have received prior neo-adjuvant',
        id: 'alp-adjuvant',
        plain: '(Neo)adjuvant therapy, if any, ended ≥ 12 months ago',
        logic: notWithin('adjuvant_therapy_end', 365, 'neoadjuvant/adjuvant therapy'),
      },
      {
        find: 'Patients with asymptomatic CNS metastases are eligible',
        id: 'alp-cns',
        plain: 'Asymptomatic CNS metastases allowed',
        logic: or(NO_BRAIN, no('cns_symptomatic'), review('The registry only says asymptomatic CNS metastases are eligible; symptomatic disease is for the study team')),
      },
    ],
    notes: [
      'The full eligible PACC variant list is copied from the registry text at encode time (X = any residue, e.g. G719X).',
      'No ECOG requirement is listed in the registry "key" criteria; none is invented.',
    ],
  },
  {
    nct: 'NCT06667076',
    prefix: 'cop',
    acronym: 'COPERNICUS',
    acronymSource: 'registry acronym field',
    structuredAge: true,
    titleDefs: [
      {
        id: 'cop-line',
        text: 'as First-Line Treatment, or Subcutaneous Amivantamab in Combination With Platinum-Based Chemotherapy as Second-line Treatment',
        plain: 'First line (cohort 1) or second line (cohort 2), from the study title',
        logic: or(cmp('prior_lines_advanced', '==', 0), and(cmp('prior_lines_advanced', '==', 1), review('Cohort 2 (second line): prior-therapy requirements are not in the listed criteria'))),
        kind: 'inclusion',
      },
    ],
    defs: [
      {
        find: 'Have histologically or cytologically confirmed advanced or metastatic non-small cell',
        id: 'cop-setting',
        plain: 'Advanced/metastatic NSCLC not amenable to curative-intent therapy',
        logic: and(isIn('histology', NSCLC), STAGE_LA_OR_MET, NOT_CURATIVE),
      },
      { find: 'must be an Ex19del or Ex21 L858R substitution', id: 'cop-egfr', plain: 'Common EGFR mutation (exon 19 deletion or L858R)', logic: isIn('egfr', ['Ex19del', 'L858R']) },
      {
        find: 'must be an Ex19del or Ex21 L858R substitution',
        id: 'cop-egfr-test',
        plain: 'EGFR result from a validated test in an accredited laboratory',
        logic: is('molecular_lab_accredited', true),
      },
      {
        find: 'Have at least 1 measurable lesion',
        id: 'cop-measurable',
        plain: 'At least one measurable lesion (RECIST 1.1) that has not been irradiated',
        logic: and(is('measurable_disease', true), is('measurable_unirradiated', true)),
      },
      {
        find: 'Any toxicities from prior systemic anticancer therapy',
        id: 'cop-tox',
        plain: 'Toxicity from prior systemic therapy resolved to grade ≤ 1 (or no prior therapy)',
        logic: or(no('prior_systemic_advanced'), is('recovered_from_toxicity', true)),
      },
      { find: 'performance status of 0 to 1', id: 'cop-ecog', plain: 'ECOG 0–1', logic: cmp('ecog', '<=', 1) },
      {
        find: 'Medical history of active interstitial lung disease',
        id: 'cop-x-ild',
        plain: 'No active ILD (radiation pneumonitis case by case)',
        logic: ILD_OR_REVIEW('ILD history: active ILD excludes; radiation pneumonitis is assessed case by case'),
      },
      { find: 'Had major surgery excluding placement of vascular access', id: 'cop-x-surgery', plain: 'No major surgery or significant trauma in the last 4 weeks', logic: no('major_surgery_recent') },
      scr('Had major surgery excluding placement of vascular access', 'cop-x-surgery-planned', 'No surgery planned during the study (study team)', 'exclusion'),
      { find: 'Participant has uncontrolled tumor-related pain', id: 'cop-x-pain', plain: 'No uncontrolled tumour-related pain', logic: no('uncontrolled_pain') },
      { find: 'Received an investigational treatment that has not been cleared', id: 'cop-x-investigational', plain: 'Not on, or recently on, an investigational treatment', logic: no('in_investigational_study') },
      { find: 'Has a prior or concurrent second malignancy', id: 'cop-x-malignancy', plain: 'No second malignancy likely to interfere', logic: OTHER_CANCER('Other malignancy: whether it could interfere with study endpoints') },
    ],
    notes: ['The line of therapy per cohort comes from the official title; the validated-test requirement is its own row (accredited laboratory).'],
  },
  {
    nct: 'NCT06765109',
    prefix: 'alk',
    acronym: 'ALKAZAR',
    acronymSource: 'registry acronym field',
    structuredAge: true,
    defs: [
      {
        find: 'Histologically or cytologically confirmed locally advanced',
        id: 'alk-setting',
        plain: 'Locally advanced (not for multimodality treatment) or metastatic NSCLC',
        logic: and(isIn('histology', NSCLC), STAGE_LA_OR_MET, NOT_CURATIVE),
      },
      { find: 'Documented Anaplastic Lymphoma Kinase (ALK) rearrangement', id: 'alk-alk', plain: 'ALK rearrangement documented', logic: is('alk', 'rearranged') },
      {
        find: 'No prior systemic anticancer treatment for NSCLC',
        id: 'alk-prior',
        plain: 'No prior systemic therapy for NSCLC; adjuvant chemo allowed if ≥ 12 months ago; never an ALK inhibitor',
        logic: and(no('prior_systemic_advanced'), notWithin('adjuvant_therapy_end', 365, 'adjuvant/neoadjuvant chemotherapy'), no('prior_alk_tki')),
      },
      { find: 'Measurable disease (1 or more target lesions', id: 'alk-measurable', plain: 'Measurable disease (RECIST 1.1)', logic: is('measurable_disease', true) },
      { find: 'Pretreatment tumor tissue', id: 'alk-tissue', plain: 'Pretreatment tumour tissue available', logic: is('tumour_sample_available', true) },
      {
        find: 'has a known oncogenic driver alteration other than ALK',
        id: 'alk-x-driver',
        plain: 'No other known driver alteration, KRAS included (Relay dated table)',
        logic: table('driver', ['egfr', 'kras', 'ros1', 'braf', 'met_ex14', 'met_amp', 'ret', 'her2_mutation', 'nrg1']),
      },
      scr('Known allergy/hypersensitivity', 'alk-x-allergy', 'No allergy to neladalkib or alectinib excipients (study team)', 'exclusion'),
      {
        find: 'Ongoing or recent radiotherapy',
        id: 'alk-x-radiotherapy',
        plain: 'No ongoing or recent radiotherapy (protocol timeframes)',
        logic: or(is('last_radiotherapy', 'none'), review('Radiotherapy given: the protocol-specified timeframes are not in the registry')),
      },
      { find: 'Major surgery within 4 weeks prior to randomization', id: 'alk-x-surgery', plain: 'No major surgery in the last 4 weeks', logic: no('major_surgery_recent') },
      { find: 'Uncontrolled clinically relevant infection', id: 'alk-x-infection', plain: 'No uncontrolled infection needing systemic therapy', logic: no('active_infection') },
      { find: 'Known active tuberculosis', id: 'alk-x-tb-hep', plain: 'No active tuberculosis, hepatitis B or C', logic: and(no('tb_active'), no('hepatitis_active')) },
      { find: 'QT corrected for heart rate', id: 'alk-x-qtc', plain: 'QTcF ≤ 470 ms', logic: cmp('qtcf_ms', '<=', 470, 'ms', undefined, 'repeated assessments are done at screening') },
      { find: 'Clinically significant cardiovascular disease', id: 'alk-x-cv', plain: 'No clinically significant cardiovascular disease', logic: CV_OK_OR_REVIEW('Known cardiovascular disease: whether it is clinically significant') },
      {
        find: 'Brain metastases associated with progressive neurological symptoms',
        id: 'alk-x-brain',
        plain: 'No brain metastases with progressive symptoms or rising steroids',
        logic: or(NO_BRAIN, no('cns_symptomatic'), review('Symptomatic brain metastases: progressive symptoms or a rising steroid dose decides')),
      },
      { find: 'Active malignancy requiring therapy within 2 years', id: 'alk-x-malignancy', plain: 'No other malignancy needing therapy in 2 years', logic: OTHER_CANCER('Other malignancy: therapy within 2 years decides') },
    ],
    notes: ['No ECOG requirement is listed in the registry criteria; none is invented.', 'Treatment history: adjuvant chemotherapy ended ≥ 12 months before randomisation is allowed.'],
  },
  {
    nct: 'NCT04886804',
    prefix: 'bm1',
    acronym: 'Beamion LUNG-1',
    acronymSource: 'official title',
    structuredAge: false,
    defs: [
      { find: 'confirmed diagnosis of an advanced, unresectable', id: 'bm1-advanced', plain: 'Advanced, unresectable and/or metastatic cancer', logic: NOT_CURATIVE },
      { find: 'confirmed diagnosis of an advanced, unresectable', id: 'bm1-measurable', plain: 'At least one measurable lesion (RECIST 1.1)', logic: is('measurable_disease', true) },
      {
        find: '(ECOG) score of 0, 1 or 2',
        id: 'bm1-ecog',
        plain: 'ECOG 0–1 (ECOG 2 only in cohorts 6, 7, 9)',
        logic: or(cmp('ecog', '<=', 1), and(cmp('ecog', '==', 2), review('ECOG 2 is allowed only in cohorts 6, 7 and 9 (arm descriptions: USA, Japan and China only)'))),
      },
      { find: 'Availability and patient willingness to provide a sample', id: 'bm1-sample', plain: 'Tumour sample available for HER2 confirmation', logic: is('tumour_sample_available', true) },
      scr('Availability and patient willingness to provide a sample', 'bm1-sample-willing', 'Patient willing to provide the sample (study team)'),
      scr('Patient willing and able to comply with the protocol requirements for tumour biopsies', 'bm1-biopsies', 'Willing to have protocol biopsies (study team)'),
      {
        find: 'Adequate organ function defined as all of the following',
        id: 'bm1-organ',
        plain: 'Adequate organ function: ALL of ANC, haemoglobin, platelets (no growth factors 4 weeks), bilirubin, eGFR, AST/ALT, ALP — labs current (Relay policy)',
        logic: and(
          cmp('lab_anc', '>=', 1.5, '10^9/L', W_LAB),
          cmp('lab_hemoglobin', '>=', 9.0, 'g/dL', W_LAB),
          cmp('lab_platelets', '>=', 100, '10^9/L', W_LAB),
          no('growth_factor_4w'),
          or(cmp('lab_bilirubin', '<=', 1.5, 'xULN', W_LAB), and(cmp('lab_bilirubin', '<=', 3, 'xULN', W_LAB), review("Bilirubin above 1.5 x ULN is allowed only with Gilbert's syndrome"))),
          or(cmp('lab_egfr_renal', '>=', 50, 'mL/min', W_LAB), and(cmp('lab_egfr_renal', '>=', 30, 'mL/min', W_LAB), review('eGFR 30–49 is allowed only in cohorts 6, 8 and 9'))),
          or(
            and(cmp('lab_ast', '<=', 3, 'xULN', W_LAB), cmp('lab_alt', '<=', 3, 'xULN', W_LAB)),
            and(cmp('lab_ast', '<=', 5, 'xULN', W_LAB), cmp('lab_alt', '<=', 5, 'xULN', W_LAB), review('AST/ALT above 3 x ULN is allowed only when attributable to liver metastases')),
          ),
          cmp('lab_alp', '<', 5, 'xULN', W_LAB),
        ),
      },
      {
        find: 'Recovered from any previous therapy-related toxicity',
        id: 'bm1-tox',
        plain: 'Prior-therapy toxicity recovered to grade ≤ 1 (or no prior therapy)',
        logic: or(no('prior_systemic_advanced'), is('recovered_from_toxicity', true)),
      },
      scr('Life expectancy of at least 12 weeks', 'bm1-life-expectancy', 'Life expectancy ≥ 12 weeks in the investigator’s opinion (study team)'),
      { find: 'At least 18 years of age at the time of consent', id: 'bm1-age', plain: 'Aged 18 or over', logic: cmp('age', '>=', 18, 'years') },
      scr('Signed and dated written informed consent', 'bm1-consent', 'Informed consent (study team)'),
      scr('Male or female patients.', 'bm1-contraception', 'Contraception agreement where relevant (study team)'),
      {
        find: 'Patients with a documented diagnosis of HER2 aberration',
        id: 'bm1-her2',
        plain: 'Documented HER2 aberration (mutation, amplification, overexpression) or NRG1 rearrangement; negatives are assay-specific',
        logic: HER2_ANY,
        mandatory: true,
      },
      {
        find: 'Additional inclusion criteria for Phase Ia',
        id: 'bm1-cohort-ia',
        plain: 'Phase Ia: any HER2 aberration and standard options exhausted or unsuitable',
        logic: and(HER2_ANY, or(cmp('prior_lines_advanced', '>=', 1), review('No therapy of proven efficacy, or not eligible for established options: clinician judgement'))),
        sectionDetail: true,
        mandatory: false,
      },
      {
        find: 'Additional inclusion criteria for Phase Ib - Cohort 1 only',
        id: 'bm1-cohort-1',
        plain: 'Cohort 1: non-squamous, HER2 TKD mutation, ≥ 1 prior line',
        logic: and(
          NONSQ,
          is('her2_mutation', 'mutation_tkd'),
          cmp('prior_lines_advanced', '>=', 1),
          or(table('ukFirstLine', ['egfr', 'alk', 'ros1', 'braf', 'met_ex14', 'ret']), review('Another targetable aberration: prior approved targeted therapy is required')),
        ),
        sectionDetail: true,
        mandatory: false,
      },
      {
        find: 'Additional inclusion criteria for Phase Ib - Cohort 2 only',
        id: 'bm1-cohort-2',
        plain: 'Cohort 2: non-squamous, HER2 TKD mutation, treatment-naïve',
        logic: and(NONSQ, is('her2_mutation', 'mutation_tkd'), no('prior_systemic_advanced')),
        sectionDetail: true,
        mandatory: false,
      },
      {
        find: 'Additional inclusion criteria for Phase Ib - Cohort 3 only',
        id: 'bm1-cohort-3',
        plain: 'Cohort 3 (CTP v8): non-squamous, HER2 non-TKD mutation, treated or naïve',
        logic: and(NONSQ, is('her2_mutation', 'mutation_non_tkd'), or(cmp('prior_lines_advanced', '>=', 1), no('prior_systemic_advanced'))),
        sectionDetail: true,
        mandatory: false,
      },
      {
        find: 'Additional inclusion criteria for Phase Ib - Cohort 4 only',
        id: 'bm1-cohort-4',
        plain: 'Cohort 4: HER2 TKD mutation with active brain metastases not for immediate local therapy',
        logic: and(isIn('histology', NSCLC), is('her2_mutation', 'mutation_tkd'), is('brain_mets', 'present'), review('Active brain metastases not eligible for immediate local therapy: investigator evaluation')),
        sectionDetail: true,
        mandatory: false,
      },
      {
        find: 'Additional inclusion criteria for Phase Ib - Cohort 5 only',
        id: 'bm1-cohort-5',
        plain: 'Cohort 5: non-squamous, HER2 TKD, prior platinum and prior HER2 ADC with progression',
        logic: and(
          NONSQ,
          is('her2_mutation', 'mutation_tkd'),
          cmp('prior_lines_advanced', '>=', 1),
          is('prior_platinum_chemo', true),
          is('prior_her2_adc', true),
          review('Progression during or after the HER2-directed ADC'),
        ),
        sectionDetail: true,
        mandatory: false,
      },
      ...[6, 7, 8, 9].map(
        (n): Def => ({
          find: `Additional inclusion criteria for Phase Ib - Cohort ${n} only`,
          id: `bm1-cohort-${n}`,
          plain: `Cohort ${n}: not open at UK sites (registry arm description)`,
          logic: review(`Registry arm description: cohort ${n} is ${n === 7 ? 'Japan' : n === 9 ? 'China' : 'USA'} only, so it is not available at UK sites`),
          sectionDetail: true,
          mandatory: false,
        }),
      ),
      {
        find: 'Further inclusion criteria apply.',
        id: 'bm1-completeness',
        plain: 'Protocol completeness: the registry says further criteria apply',
        logic: review('The registry says further inclusion and exclusion criteria apply; the study team checks the full protocol list'),
        completeness: true,
        detailFind: ['Further exclusion criteria apply.'],
      },
      { find: "Major surgery (major according to the investigator", id: 'bm1-x-surgery', plain: 'No major surgery in the last 4 weeks', logic: no('major_surgery_recent') },
      scr("Major surgery (major according to the investigator", 'bm1-x-surgery-planned', 'No major surgery planned in the next 6 months (study team)', 'exclusion'),
      {
        find: 'Previous or concomitant malignancies other than the one treated',
        id: 'bm1-x-malignancy',
        plain: 'No other malignancy in 2 years (listed exceptions)',
        logic: OTHER_CANCER('Other malignancy: timing (2 years) and the listed exceptions decide'),
      },
      {
        find: 'Treatment with a systemic anti-cancer therapy or investigational drug within 21 days',
        id: 'bm1-x-recent-therapy',
        plain: 'No systemic anticancer or investigational therapy within 21 days (or 5 half-lives)',
        logic: and(
          or(notWithin('last_systemic_therapy_end', 21, 'systemic anticancer therapy'), review('Therapy within 21 days: 5 half-lives may be shorter')),
          no('in_investigational_study'),
        ),
      },
      scr('Patients who must or wish to continue the intake of restricted medication', 'bm1-x-restricted-meds', 'No restricted medication (protocol list; study team)', 'exclusion'),
      { find: 'Previous treatment with zongertinib.', id: 'bm1-x-zongertinib', plain: 'No prior zongertinib', logic: no('prior_zongertinib') },
      {
        find: 'Radiotherapy within 2 weeks prior to first study treatment',
        id: 'bm1-x-radiotherapy',
        plain: 'No radiotherapy in 2 weeks (palliative non-chest RT up to 1 week)',
        logic: or(notWithin('last_radiotherapy', 14, 'radiotherapy'), review('Palliative radiotherapy outside the chest is allowed up to 1 week before treatment')),
      },
    ],
    notes: [
      'Organ function is one full conjunction (all components plus growth-factor history); any missing component keeps it unknown.',
      'HER2 negatives are assay-specific: "no mutation or amplification detected" leaves overexpression open, so the HER2 row is needs_review unless a qualifying aberration is documented.',
      'Cohort rows are non-mandatory (a patient needs one cohort); cohorts 6–9 are not open at UK sites per the arm descriptions.',
      'All UK sites are ACTIVE_NOT_RECRUITING in the snapshot; the simulated site lane starts closed.',
    ],
  },
  {
    nct: 'NCT05642572',
    prefix: 'lm',
    acronym: 'Lung-MAP S1900G',
    acronymSource: 'official title (Lung-MAP sub-study S1900G)',
    structuredAge: true,
    defs: [
      {
        find: 'Patients must meet all SCREENING/PRE-SCREENING',
        id: 'lm-completeness',
        plain: 'Protocol completeness: S1400 master-protocol criteria are not in this record',
        logic: review('Eligibility also depends on the S1400 Lung-MAP master protocol, whose criteria are not in this registry record'),
        completeness: true,
      },
      scr('Participants must have been assigned to S1900G', 'lm-assigned', 'Assigned to S1900G by the SWOG SDMC (study team)'),
      { find: 'documentation of NSCLC with a sensitizing EGFR mutation', id: 'lm-egfr', plain: 'Sensitizing EGFR mutation', logic: isIn('egfr', ['Ex19del', 'L858R', 'G719X', 'L861Q', 'S768I'], 'Relay policy list of sensitizing EGFR mutations') },
      {
        find: 'documentation of NSCLC with a sensitizing EGFR mutation',
        id: 'lm-osimertinib',
        plain: 'Progressed on osimertinib as the most recent line',
        logic: and(is('prior_osimertinib', true), review("Progression on osimertinib as the most recent line is the treating physician's judgement")),
      },
      {
        find: 'Participants must have a MET amplification',
        id: 'lm-met',
        plain: 'MET amplification by NGS, on a sample taken after osimertinib progression',
        logic: and(is('met_amp', 'detected'), review('The sample must post-date progression on osimertinib')),
      },
      { find: 'Participants must have a MET amplification', id: 'lm-met-lab', plain: 'MET test from a certified laboratory', logic: is('molecular_lab_accredited', true) },
      scr('Participants must have a MET amplification', 'lm-met-central', 'Tissue submitted for central FMI testing (study team)'),
      { find: 'Participants must have either measurable disease or non-measurable', id: 'lm-disease', plain: 'Measurable or non-measurable disease on CT/MRI', logic: present('measurable_disease') },
      scr('Participants must have either measurable disease or non-measurable', 'lm-baseline-scan', 'Baseline tumour assessment within 28/42 days of randomisation (study team)'),
      { find: 'CT with contrast or MRI scan of the brain', id: 'lm-brain-imaging', plain: 'Brain CT/MRI within 42 days (protocol window)', logic: current(['brain_mets'], P42) },
      {
        find: 'Participants with symptomatic CNS metastasis',
        id: 'lm-cns',
        plain: 'Symptomatic CNS metastases must be stable for 5 days',
        logic: or(NO_BRAIN, no('cns_symptomatic'), review('Symptomatic CNS metastases must be neurologically stable with stable or decreasing steroids for 5 days')),
      },
      { find: 'Participants must have recovered (=\\< grade 1)', id: 'lm-tox', plain: 'Recovered to grade ≤ 1 from prior therapy', logic: or(no('prior_systemic_advanced'), is('recovered_from_toxicity', true)) },
      { find: 'Participants must be able to swallow tablets whole', id: 'lm-swallow', plain: 'Able to swallow tablets', logic: no('gi_absorption_issue') },
      { find: 'Absolute neutrophil count \\>= 1.5', id: 'lm-anc', plain: 'ANC ≥ 1.5 x10^3/µL within 28 days', logic: cmp('lab_anc', '>=', 1.5, '10^3/uL', P28) },
      {
        find: 'Hemoglobin \\< 9.0 g/dL',
        id: 'lm-hb',
        plain: 'Haemoglobin: registry text appears reversed — study team checks',
        logic: unparseable('the registry text reads "Hemoglobin < 9.0 g/dL", the reverse of the usual minimum (≥ 9.0 g/dL); Relay does not guess which is meant'),
      },
      { find: 'Platelets \\>= 100', id: 'lm-plt', plain: 'Platelets ≥ 100 x10^3/µL within 28 days', logic: cmp('lab_platelets', '>=', 100, '10^3/uL', P28) },
      {
        find: 'Total bilirubin =\\< 1.5',
        id: 'lm-bili',
        plain: 'Bilirubin ≤ 1.5 x ULN within 28 days (Gilbert: ≤ 5 x ULN)',
        logic: or(cmp('lab_bilirubin', '<=', 1.5, 'xULN', P28), and(cmp('lab_bilirubin', '<=', 5, 'xULN', P28), review("Above 1.5 x ULN is allowed only with Gilbert's disease"))),
      },
      {
        find: 'Aspartate aminotransferase (AST) and alanine aminotransferase (ALT) =\\< 2.5',
        id: 'lm-transaminases',
        plain: 'AST and ALT ≤ 2.5 x ULN within 28 days (liver metastases: AST ≤ 5 x ULN)',
        logic: or(
          and(cmp('lab_ast', '<=', 2.5, 'xULN', P28), cmp('lab_alt', '<=', 2.5, 'xULN', P28)),
          and(cmp('lab_ast', '<=', 5, 'xULN', P28), review('Above 2.5 x ULN is allowed only with liver metastases')),
        ),
      },
      {
        find: 'serum creatinine =\\< the IULN',
        id: 'lm-creat',
        plain: 'Creatinine ≤ ULN within 28 days (or Cockcroft-Gault clearance ≥ 50 mL/min)',
        logic: or(cmp('lab_creatinine', '<=', 1, 'xULN', P28), review('Cockcroft-Gault creatinine clearance is not captured; the study team calculates it')),
      },
      { find: 'most recent Zubrod performance status must be 0-1', id: 'lm-zubrod', plain: 'Zubrod (ECOG) 0–1 documented within 28 days', logic: cmp('ecog', '<=', 1, undefined, P28) },
      { find: 'Participants must have an electrocardiogram (ECG)', id: 'lm-ecg', plain: 'ECG within 28 days with QTcF ≤ 470 ms', logic: cmp('qtcf_ms', '<=', 470, 'ms', P28) },
      scr('completed medical history and physical exam', 'lm-history-exam', 'History and physical exam within 28 days of randomisation (study team)'),
      {
        find: 'Participants must have a urinalysis',
        id: 'lm-urine',
        plain: 'Urine protein ≤ 1+ within 28 days (2+ needs a 24-hour urine)',
        logic: or(isIn('urine_protein', ['negative', 'trace', '1+'], undefined, P28), and(isIn('urine_protein', ['2+', '3+', '4+'], undefined, P28), review('Proteinuria ≥ 2+: a 24-hour urine < 2000 mg allows entry'))),
      },
      {
        find: 'International Normalized Ratio (INR)',
        id: 'lm-coag',
        plain: 'INR and PTT near normal within 28 days (unless anticoagulated)',
        logic: and(current(['lab_inr'], P28), review('INR/PTT limits are given in seconds above the institutional upper limit; the study team checks')),
      },
      { find: 'Participants with known human immunodeficiency virus (HIV)', id: 'lm-hiv', plain: 'If HIV positive: effective ART, undetectable viral load', logic: HIV_OK_OR_REVIEW('HIV positive: ART and viral load within 6 months') },
      {
        find: 'asymptomatic serum amylase',
        id: 'lm-pancreas',
        plain: 'Amylase ≤ 2 x ULN and lipase ≤ ULN within 28 days',
        logic: and(cmp('lab_amylase', '<=', 2, 'xULN', P28), cmp('lab_lipase', '<=', 1, 'xULN', P28)),
      },
      {
        find: 'Participants must have adequate cardiac function',
        id: 'lm-cardiac',
        plain: 'Adequate cardiac function (NYHA 2B or better if cardiac history)',
        logic: or(is('cv_disease', 'none'), review('Known cardiac history or cardiotoxic treatment: NYHA class 2B or better is required')),
      },
      scr('blood specimens submitted for circulating tumor DNA', 'lm-ctdna', 'Agrees to ctDNA blood specimens (study team)'),
      scr('offered participation in specimen banking', 'lm-banking', 'Offered specimen banking (study team)'),
      scr('Note: As a part of the OPEN registration', 'lm-irb', 'Site IRB approval current (site administration)'),
      scr('Participants must be informed of the investigational nature', 'lm-consent', 'Informed consent (study team)'),
      scr('impaired decision-making capacity', 'lm-capacity', 'Decision-making capacity / legal representative (study team)'),
      {
        find: 'anti-VEGF or VEGFR inhibitor or MET inhibitor',
        id: 'lm-x-vegf-met',
        plain: 'No prior anti-VEGF/VEGFR or MET inhibitor',
        logic: and(no('prior_anti_vegf'), no('prior_met_inhibitor')),
      },
      {
        find: 'must not have received any anti-cancer drug',
        id: 'lm-x-recent-therapy',
        plain: 'No anticancer drug other than osimertinib within 21 days',
        logic: or(notWithin('last_systemic_therapy_end', 21, 'systemic anticancer therapy'), review('Osimertinib may continue; any other agent within 21 days excludes')),
      },
      { find: 'must not have received any radiation therapy within 14 days', id: 'lm-x-radiotherapy', plain: 'No radiotherapy in 14 days', logic: notWithin('last_radiotherapy', 14, 'radiotherapy') },
      scr('must not be planning to receive any concurrent', 'lm-x-concurrent', 'No concurrent anticancer therapy planned (study team)', 'exclusion'),
      { find: 'must not have had a major surgery within 14 days', id: 'lm-x-surgery', plain: 'No major surgery in 14 days', logic: no('major_surgery_recent') },
      { find: 'live attenuated vaccination', id: 'lm-x-vaccine', plain: 'No live vaccine in 28 days', logic: no('live_vaccine_recent') },
      { find: 'strong inducers of CYP3A4', id: 'lm-x-meds', plain: 'No strong CYP3A4 inducers/inhibitors or QT-prolonging drugs', logic: and(no('strong_cyp3a_meds'), no('qt_prolonging_meds')) },
      scr('strong inducers of CYP3A4', 'lm-x-meds-other', 'CYP1A2, P-gp, BCRP and MATE substrates reconciled (study team)', 'exclusion'),
      { find: 'uncontrolled blood pressure', id: 'lm-x-bp', plain: 'No uncontrolled hypertension', logic: no('uncontrolled_hypertension') },
      { find: 'prior or concurrent malignancy whose natural history', id: 'lm-x-malignancy', plain: 'No interfering other malignancy', logic: OTHER_CANCER('Other malignancy: whether it could interfere with safety or efficacy assessment') },
      { find: 'must not be pregnant or breastfeeding', id: 'lm-x-pregnancy', plain: 'Not pregnant or breastfeeding', logic: no('pregnant_or_breastfeeding') },
      scr('must not be pregnant or breastfeeding', 'lm-x-contraception', 'Contraception agreement where relevant (study team)', 'exclusion'),
    ],
    notes: [
      'No UK sites in the snapshot (US network study); it stays in the portfolio to show the site lane separately from eligibility.',
      'Protocol windows ("within 28/42 days prior to sub-study randomization") are measured from the assessment date because the randomisation date is not known at prescreening.',
      'Hemoglobin line reads "< 9.0 g/dL" in the record, probably a typo for ">="; kept as needs_review rather than guessed.',
    ],
  },
];
