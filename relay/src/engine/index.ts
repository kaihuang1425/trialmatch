// Public API of the Relay engine (framework-free). The UI and the API route import from here.

export { runAgent, summarize, type RunAgentOptions } from './agent';
export type { AgentEvent, AgentEventInput, ToolName, Trigger } from './events';
export { assessAll, assessTrial, deriveStatus, statusLabel } from './assess';
export { diffAssessments, type TrialDiff, type CriterionChange } from './diff';
export { planNextAction, rankActions } from './plan';
export { draftRequestTemplate } from './draft';
export { findAlternatives, siteOpen, type AlternativesResult, type Alternative } from './alternatives';
export { explainForPatient, type PatientExplanation } from './explain';
export { appendAudit, isAppendOnly } from './audit';
export { createPatientState, cloneState, availableDocuments } from './state';
export { store, StateStore } from './store';
export { TRIALS, PATIENTS, getTrial, listPatients } from './data';
export { RELAY_POLICY } from './policy';
export { DEMO_AS_OF, LLM_CONFIG, TRIAL_SNAPSHOT_DATE } from './config';
export { FACT_LABEL, DOC_LABEL, formatValue } from './labels';
export { makeMolecularReport, DEFAULT_DEMO_MOLECULAR, MOLECULAR_OPTIONS, type MolecularReportInput } from './synthetic/templates';
export { ApprovalRequiredError } from './tools';
export { LiveModeUnavailableError, type LlmProvider } from './llm/provider';
export * from './types';
