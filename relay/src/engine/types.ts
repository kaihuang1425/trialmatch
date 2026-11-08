// Relay engine data model. Follows SPEC.md "Data model"; extensions are marked EXT.
// Plain TypeScript: no framework imports anywhere under src/engine. Every persisted shape is plain
// JSON (rules included) so a Python port can read the same files.

export type CriterionState = 'supported' | 'conflicting' | 'unknown' | 'needs_review';

/**
 * Every fact Relay can read from a document. Preferences (home city, travel, days) are a separate lane.
 * Special values (allowed for any key, always with a verbatim quote):
 *   'uncertain'  — the document is ambiguous about it → needs_review
 *   'not_tested' — the document says the test was not performed → unknown (not_tested)
 * "Not documented" is NOT a value: it is the absence of a fact → unknown (missing).
 */
export const FACT_KEYS = [
  // diagnosis and staging
  'age',
  'histology', // nonsquamous_adenocarcinoma | squamous | mixed_small_cell | small_cell
  'stage', // IIIA | IIIB | IIIC | IV | IVA | IVB | IVC
  'curative_option', // not_amenable | amenable  (curative surgery / radical (chemo)radiotherapy)
  'ecog',
  // treatment history (any setting unless named)
  'prior_systemic_advanced', // boolean: any systemic therapy for advanced/metastatic disease
  'prior_lines_advanced', // number of lines for advanced disease
  'prior_immunotherapy', // anti-PD-1/PD-L1
  'prior_platinum_chemo',
  'prior_kras_g12c_inhibitor',
  'prior_pan_ras_inhibitor',
  'prior_egfr_tki',
  'prior_osimertinib',
  'prior_alk_tki',
  'prior_docetaxel',
  'prior_her2_adc',
  'prior_anti_vegf',
  'prior_met_inhibitor',
  'prior_zongertinib',
  'last_systemic_therapy_end', // ISO date | 'none'
  'adjuvant_therapy_end', // ISO date | 'none'  (neoadjuvant/adjuvant/chemoradiotherapy for early disease)
  'recovered_from_toxicity', // boolean: prior-therapy toxicity ≤ grade 1
  'in_investigational_study', // boolean
  'last_radiotherapy', // ISO date | 'none'
  'major_surgery_recent', // boolean: major surgery in the last 4 weeks / not recovered
  // CNS — kept as separate predicates
  'brain_mets', // none | present
  'cns_symptomatic',
  'cns_untreated',
  'cns_progressing',
  'leptomeningeal',
  'spinal_cord_compression', // none | treated_stable | untreated
  // disease burden
  'measurable_disease',
  'measurable_unirradiated', // boolean: a measurable lesion that has not been irradiated
  // medical history
  'ild_history',
  'ibd_history',
  'gi_absorption_issue', // swallowing, oral intake or absorption problem, chronic diarrhoea, short bowel, malabsorption
  'cv_disease', // none | controlled | significant (uncontrolled, MI ≤ 6 months, unstable angina/arrhythmia)
  'uncontrolled_hypertension',
  'qtcf_ms',
  'hiv', // negative | positive
  'hepatitis_active',
  'tb_active',
  'active_infection', // needing systemic therapy
  'autoimmune_active', // needing systemic treatment in the last 2 years
  'transplant_history',
  'other_malignancy', // none | present
  'pregnant_or_breastfeeding',
  'uncontrolled_pain',
  'effusion_drainage', // recurrent drainage of pleural/pericardial effusion or ascites
  'immunosuppressive_meds',
  'qt_prolonging_meds',
  'strong_cyp3a_meds',
  'growth_factor_4w', // haematopoietic growth factors in the last 4 weeks
  'recent_antibiotics', // therapeutic antibiotics in the last 2 weeks
  'live_vaccine_recent', // live vaccine in the last 28 days
  'tumour_sample_available',
  // molecular (assay-specific; 'not_detected' is a negative on THAT assay only)
  'kras',
  'nras',
  'hras',
  'egfr', // Ex19del | L858R | ex20ins | <protein change> | not_detected
  'alk', // rearranged | not_detected
  'ros1',
  'braf',
  'met_ex14', // detected | not_detected
  'met_amp',
  'ret', // fusion | not_detected
  'nrg1', // fusion | not_detected
  'her2_mutation', // mutation_tkd | mutation_non_tkd | not_detected
  'her2_amplification', // detected | not_detected
  'her2_overexpression', // ihc_3plus | ihc_2plus | negative  (IHC)
  'pdl1_tps', // number, % (decimals kept)
  'molecular_lab_accredited', // boolean: validated test in an accredited laboratory
  // labs
  'lab_anc',
  'lab_hemoglobin',
  'lab_platelets',
  'lab_bilirubin',
  'lab_alt',
  'lab_ast',
  'lab_alp',
  'lab_creatinine',
  'lab_egfr_renal',
  'lab_inr',
  'lab_amylase',
  'lab_lipase',
  'urine_protein', // dipstick, e.g. negative | trace | 1+ | 2+
] as const;
export type FactKey = (typeof FACT_KEYS)[number];

export const LAB_KEYS: FactKey[] = [
  'lab_anc',
  'lab_hemoglobin',
  'lab_platelets',
  'lab_bilirubin',
  'lab_alt',
  'lab_ast',
  'lab_alp',
  'lab_creatinine',
  'lab_egfr_renal',
];

export const PRIOR_AGENT_KEYS: FactKey[] = [
  'prior_immunotherapy',
  'prior_platinum_chemo',
  'prior_kras_g12c_inhibitor',
  'prior_pan_ras_inhibitor',
  'prior_egfr_tki',
  'prior_osimertinib',
  'prior_alk_tki',
  'prior_docetaxel',
  'prior_her2_adc',
  'prior_anti_vegf',
  'prior_met_inhibitor',
  'prior_zongertinib',
];

export const MOLECULAR_GENE_KEYS: FactKey[] = [
  'kras',
  'nras',
  'hras',
  'egfr',
  'alk',
  'ros1',
  'braf',
  'met_ex14',
  'met_amp',
  'ret',
  'nrg1',
  'her2_mutation',
  'her2_amplification',
];

export type FactValue = string | number | boolean;

export type DocKind = 'referral_summary' | 'pathology' | 'molecular' | 'labs' | 'imaging' | 'letter';

export interface SourceDoc {
  id: string;
  patientId: string;
  kind: DocKind;
  title: string;
  date: string; // ISO date
  version: number;
  synthetic: true;
  text: string;
}

export interface FactSource {
  docId: string;
  quote: string; // MUST occur verbatim in doc text
  start: number;
  end: number;
}

export interface Fact {
  id: string; // EXT: `${docId}#${key}@${start}`
  key: FactKey;
  value: FactValue;
  unit?: string;
  refHigh?: number; // EXT: upper reference limit printed on the lab report, for "x ULN" rules
  observedOn?: string;
  source: FactSource;
  extractedBy: 'rules' | 'llm' | 'human';
  verified: boolean; // machine: quote found verbatim. Coordinator sign-off is separate (Verification).
  correctedFrom?: { value: FactValue; unit?: string; factId: string }; // EXT
}

/** EXT: coordinator verification, bound to the exact evidence. Any change to doc, value or span voids it. */
export interface Verification {
  factId: string;
  docId: string;
  value: FactValue;
  start: number;
  end: number;
  at: string;
  by: 'coordinator';
}

// ---------- Rules (plain JSON, see data/DATA.md "Rule language") ----------

export type Cmp = '<' | '<=' | '>' | '>=' | '==' | '!=';

/** 'protocol' windows come from registry text; 'relay_policy' windows read data/policy/relay-policy.json. */
export type Window =
  | { source: 'protocol'; days: number; text: string }
  | { source: 'relay_policy'; policy: 'labRecencyDays' };

export type Rule =
  | { op: 'and'; args: Rule[] }
  | { op: 'or'; args: Rule[] }
  | { op: 'not'; arg: Rule }
  | { op: 'cmp'; key: FactKey; cmp: Cmp; value: number; unit?: string; window?: Window; note?: string }
  | { op: 'is'; key: FactKey; value: string | number | boolean; window?: Window }
  | { op: 'in'; key: FactKey; values: string[]; window?: Window; note?: string }
  | { op: 'present'; key: FactKey; window?: Window }
  | { op: 'current'; keys: FactKey[]; window: Window }
  | { op: 'not_within'; key: FactKey; days: number; what: string } // value 'none' or an ISO date older than `days`
  | { op: 'table'; table: 'alterations'; column: 'ukFirstLine' | 'ukAnyLine' | 'driver'; genes: FactKey[] }
  // supported if ANY check is documented positive; otherwise evaluate `otherwise` (negatives stay assay-specific)
  | { op: 'any_positive'; checks: { key: FactKey; values: string[] }[]; otherwise: Rule }
  | { op: 'review'; reason: string }
  | { op: 'at_screening'; reason: string }
  | { op: 'unparseable'; reason: string };

export type DerivedFrom = 'criteria' | 'title' | 'conditions' | 'structured_fields';

export interface Criterion {
  id: string;
  trialId: string;
  kind: 'inclusion' | 'exclusion';
  text: string; // verbatim from the registry snapshot (markdown escapes kept as in the record)
  plain: string;
  logic: Rule; // "requirement satisfied" for inclusions and exclusions alike
  needsFacts: FactKey[];
  mandatory: boolean;
  derivedFrom: DerivedFrom;
  checkable: boolean; // EXT: reads at least one fact
  atScreening?: boolean; // EXT: done by the study team at screening (never resolvable at prescreening)
  completeness?: boolean; // EXT: the registry list is "not limited to" / "further criteria apply"
  section?: string;
  detail?: string[]; // EXT: verbatim sub-bullets / lists that belong to this row
}

export interface StaleInfo {
  key: FactKey;
  observedOn: string;
  windowDays: number;
  windowSource: 'protocol' | 'relay_policy';
}

export type UnknownReason = 'missing' | 'stale' | 'not_tested' | 'at_screening';

export interface CriterionResult {
  criterionId: string;
  state: CriterionState;
  reason: string;
  evidence: Fact[];
  missing?: FactKey[]; // not documented
  notTested?: FactKey[]; // EXT: document says the test was not performed
  stale?: StaleInfo;
  staleAll?: StaleInfo[]; // EXT
  unknownReasons?: UnknownReason[]; // EXT
  atScreening?: boolean; // EXT
  pendingVerification?: boolean;
}

export type TrialStatus = 'not_match' | 'needs_evidence' | 'needs_review' | 'ready';

export const TRIAL_STATUS_LABEL: Record<TrialStatus, string> = {
  not_match: 'Not a match on current evidence',
  needs_evidence: 'Potential match — needs evidence',
  needs_review: 'Potential match — needs clinical review',
  ready: 'Ready for prescreening review',
};

export interface Assessment {
  patientId: string;
  trialId: string;
  patientVersion: number;
  trialSnapshot: string;
  results: CriterionResult[];
  status: TrialStatus;
  statusLabel: string; // EXT: SPEC wording, plus "(N checks at screening)" when relevant
  computedAt: string;
  asOf: string; // EXT
  blocking: string[]; // EXT: criterion ids that decide the status
  atScreening: string[]; // EXT: open rows the study team completes at screening
}

export interface NextAction {
  id: string;
  kind: 'request_document' | 'ask_patient' | 'clinical_review' | 'find_alternatives';
  documentKind?: DocKind;
  target: FactKey[];
  notTested?: FactKey[]; // EXT: the document said these were not tested → a test must be requested
  unblocks: { trialId: string; criterionIds: string[] }[];
  openCount: number;
  headline: string;
  draft: string;
  requiresApproval: true;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: 'agent' | 'coordinator' | 'patient' | 'system';
  type: string;
  detail: object;
  patientVersion?: number;
  trialSnapshot?: string;
}

// ---------- Trials ----------

export interface SiteAvailability {
  open: boolean;
  simulated: true;
  basis: string;
}

export interface Site {
  id: string;
  facility: string;
  city: string;
  country: string;
  recruitmentStatus: string;
  lat: number;
  lon: number;
  geoSource: 'relay_city_table_approx';
  availability: SiteAvailability; // SIMULATED
}

export interface Trial {
  id: string;
  nct: string;
  acronym: string;
  briefTitle: string;
  officialTitle: string;
  phase: string[];
  sponsor: string;
  status: string;
  conditions: string[];
  minimumAge?: string;
  maximumAge?: string;
  briefSummary: string;
  arms: { label: string; type?: string; description?: string; interventionNames: string[] }[];
  interventions: { type: string; name: string }[];
  sites: Site[];
  snapshotDate: string;
  source: { url: string; api: string; licence: string };
  criteria: Criterion[];
  encodingNotes: string[];
}

// ---------- Patient-side lanes and state ----------

export interface Preferences {
  homeCity: string;
  travelLimitMiles: number;
  daysAvailable?: string[];
  setBy: 'patient';
  updatedAt: string;
}

export interface Proposal {
  id: string;
  kind: 'send_request' | 'invite_prescreening';
  patientId: string;
  trialIds: string[];
  siteId?: string;
  nextAction?: NextAction;
  draft: string;
  recipient: string; // SIMULATED
  status: 'pending' | 'approved' | 'rejected' | 'sent';
  createdAt: string;
  decidedAt?: string;
  decidedBy?: 'coordinator';
  note?: string;
}

export interface SiteOverride {
  trialId: string;
  siteId: string | '*';
  open: false;
  reason: 'cohort_full' | 'site_unavailable';
  note?: string;
  at: string;
  simulated: true;
}

export interface RelayState {
  schema: 'relay.state.v1';
  patientId: string;
  synthetic: true;
  version: number;
  asOf: string;
  trialSnapshot: string;
  documents: SourceDoc[];
  extractedDocIds: string[];
  facts: Fact[];
  verifications: Verification[];
  preferences: Preferences;
  assessments: Record<string, Assessment>;
  proposals: Proposal[];
  siteOverrides: SiteOverride[];
  outbox: { proposalId: string; kind: Proposal['kind']; sentAt: string; simulated: true; to: string }[];
  audit: AuditEvent[];
  seq: number;
}

export type ExtractorKind = 'rules' | 'llm';
