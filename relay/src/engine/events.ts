// The agent event stream. Both modes (replay and live) emit exactly these shapes; the UI animates them.

import type { TrialDiff } from './diff';
import type { MolecularReportInput } from './synthetic/templates';
import type { Assessment, FactValue, NextAction, Preferences, Proposal, RelayState, SourceDoc } from './types';

export type ToolName =
  | 'add_document'
  | 'extract_facts'
  | 'assess'
  | 'plan_next_action'
  | 'draft_request'
  | 'propose_request'
  | 'propose_invitations'
  | 'find_alternatives'
  | 'explain_for_patient'
  | 'flag_needs_review'
  | 'record_correction'
  | 'record_verification'
  | 'record_site_unavailable'
  | 'update_preferences'
  | 'record_decision'
  | 'send_request'
  | 'send_invitation';

export type Trigger =
  | { type: 'start' } // extract every document not yet read, assess, plan
  | { type: 'document_added'; doc?: SourceDoc; molecular?: MolecularReportInput }
  | { type: 'fact_corrected'; factId: string; value: FactValue; unit?: string; note?: string }
  | { type: 'fact_verified'; factId: string }
  | { type: 'site_unavailable'; trialId: string; siteId?: string; reason: 'cohort_full' | 'site_unavailable'; note?: string }
  | { type: 'preference_changed'; preferences: Partial<Pick<Preferences, 'homeCity' | 'travelLimitMiles' | 'daysAvailable'>> }
  | { type: 'approve'; proposalId: string }
  | { type: 'reject'; proposalId: string; note?: string };

interface Base {
  seq: number;
  at: string;
}

export type AgentEvent =
  | (Base & { type: 'plan'; mode: 'replay' | 'live'; trigger: Trigger['type']; steps: string[]; source: 'policy' | 'model' })
  | (Base & { type: 'tool_call'; callId: string; tool: ToolName | string; input: unknown; by: 'agent' | 'model' | 'coordinator' | 'patient' })
  | (Base & { type: 'tool_result'; callId: string; tool: ToolName | string; ok: boolean; summary: string; output?: unknown; error?: string })
  | (Base & { type: 'fact_rejected'; docId: string; key: string; quote: string; value: FactValue; reason: string; extractedBy: 'rules' | 'llm' })
  | (Base & { type: 'needs_review'; reason: string; docId?: string; factKeys?: string[]; trialId?: string })
  | (Base & { type: 'assessment_changed'; patientId: string; trialId: string; acronym: string; statusLabel: string; diff: TrialDiff; assessment: Assessment })
  | (Base & { type: 'proposal'; proposal: Proposal; requiresApproval: true })
  | (Base & { type: 'message'; text: string; source: 'agent' | 'model' })
  | (Base & { type: 'error'; message: string; recoverable: boolean; tool?: string })
  | (Base & { type: 'done'; state: RelayState; summary: string; nextAction: NextAction | null });

/** Distributive Omit so each variant keeps its own fields. */
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type AgentEventInput = DistributiveOmit<AgentEvent, 'seq' | 'at'>;
