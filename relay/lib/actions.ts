// The deck action log. State is never sent between tabs or to the server: only these small,
// allowlisted actions are. `state = fold(fixture, actions)` (see lib/fold.ts).
// Pure module: no React, no browser APIs.

import { siteOpen } from '@/src/engine/alternatives';
import { MOLECULAR_OPTIONS, makeMolecularReport, type MolecularReportInput } from '@/src/engine/synthetic/templates';
import type { Trigger } from '@/src/engine/events';
import type { DocKind, Proposal, RelayState, Trial } from '@/src/engine/types';

export const CLOSE_REASONS = ['Protocol requirement not met', 'Cohort full (simulated)', 'Travel not manageable', 'Patient prefers another option'] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];
export const INVITE_REASONS = ['Checked at screening anyway', 'I have reviewed the evidence'] as const;
export const PATIENT_NO_REASONS = ['Too far to travel', 'I prefer another option', "The timing doesn't work", 'Something else'] as const;

/** Fixed report date for judge-set synthetic reports (the demo's "today" is 8 Nov). */
export const REPORT_DATE = '2026-11-07';

export type DeckActionBody =
  | { type: 'request.approved'; documentKind: DocKind }
  | { type: 'doc.generated'; molecular: MolecularReportInput }
  | { type: 'invite'; trialId: string; reason?: string; openItems?: string[]; recordVersion?: number }
  | { type: 'close'; trialId: string; reason: CloseReason; siteId?: string }
  | { type: 'later'; trialId: string }
  | { type: 'interest'; trialId: string; kind: 'interested' | 'not_for_me' | 'saved'; reason?: string }
  | { type: 'undo'; target: string };

export type DeckAction = DeckActionBody & { id: string; at: string; by: 'staff' | 'patient' };

const DOC_KINDS: DocKind[] = ['referral_summary', 'pathology', 'molecular', 'labs', 'imaging', 'letter'];
const MAX_LOG = 400;

let counter = 0;
export function newActionId(): string {
  counter = (counter + 1) % 1e6;
  return `A-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}${counter.toString(36)}`;
}

export function makeAction(body: DeckActionBody, by: 'staff' | 'patient'): DeckAction {
  return { ...body, id: newActionId(), at: new Date().toISOString(), by } as DeckAction;
}

const str = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** Synthetic molecular values: every field must be one of MOLECULAR_OPTIONS; PD-L1 0–100 (decimals kept). */
export function cleanMolecular(raw: unknown): MolecularReportInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of ['kras', 'egfr', 'alk', 'ros1', 'braf', 'met', 'ret', 'her2'] as const) {
    const v = r[field] ?? 'not_detected';
    if (!(MOLECULAR_OPTIONS[field] as readonly string[]).includes(String(v))) return null;
    out[field] = String(v);
  }
  for (const field of ['nras', 'hras', 'nrg1'] as const) {
    if (r[field] === undefined) continue;
    if (!(MOLECULAR_OPTIONS[field] as readonly string[]).includes(String(r[field]))) return null;
    out[field] = String(r[field]);
  }
  const tps = typeof r.pdl1Tps === 'number' ? r.pdl1Tps : Number(r.pdl1Tps);
  if (!Number.isFinite(tps) || tps < 0 || tps > 100) return null;
  out.pdl1Tps = Math.round(tps * 10) / 10;
  out.reportDate = REPORT_DATE;
  return out as unknown as MolecularReportInput;
}

/** Validate one action from storage, another tab or a request body. Unknown shapes are dropped. */
export function cleanAction(raw: unknown): DeckAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (!str(a.id, 80) || !str(a.at, 40) || (a.by !== 'staff' && a.by !== 'patient')) return null;
  const base = { id: a.id, at: a.at, by: a.by } as const;
  switch (a.type) {
    case 'request.approved':
      return DOC_KINDS.includes(a.documentKind as DocKind) ? { ...base, type: a.type, documentKind: a.documentKind as DocKind } : null;
    case 'doc.generated': {
      const m = cleanMolecular(a.molecular);
      return m ? { ...base, type: a.type, molecular: m } : null;
    }
    case 'invite':
      if (!str(a.trialId, 40)) return null;
      return {
        ...base,
        type: a.type,
        trialId: a.trialId,
        ...(str(a.reason) ? { reason: a.reason } : {}),
        ...(Array.isArray(a.openItems) ? { openItems: a.openItems.filter((x): x is string => str(x, 80)).slice(0, 80) } : {}),
        ...(typeof a.recordVersion === 'number' ? { recordVersion: a.recordVersion } : {}),
      };
    case 'close':
      if (!str(a.trialId, 40) || !(CLOSE_REASONS as readonly string[]).includes(String(a.reason))) return null;
      return { ...base, type: a.type, trialId: a.trialId, reason: a.reason as CloseReason, ...(str(a.siteId, 80) ? { siteId: a.siteId } : {}) };
    case 'later':
      return str(a.trialId, 40) ? { ...base, type: a.type, trialId: a.trialId } : null;
    case 'interest':
      if (!str(a.trialId, 40) || !['interested', 'not_for_me', 'saved'].includes(String(a.kind))) return null;
      return { ...base, type: a.type, trialId: a.trialId, kind: a.kind as 'interested', ...(str(a.reason) ? { reason: a.reason } : {}) };
    case 'undo':
      return str(a.target, 80) ? { ...base, type: a.type, target: a.target } : null;
    default:
      return null;
  }
}

export function cleanLog(raw: unknown): DeckAction[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DeckAction[] = [];
  for (const r of raw.slice(-MAX_LOG)) {
    const a = cleanAction(r);
    if (a && !seen.has(a.id)) {
      seen.add(a.id);
      out.push(a);
    }
  }
  return out;
}

/** The log without undo entries and without the actions they undid. */
export function effectiveActions(log: DeckAction[]): DeckAction[] {
  const undone = new Set(log.filter((a): a is Extract<DeckAction, { type: 'undo' }> => a.type === 'undo').map((a) => a.target));
  return log.filter((a) => a.type !== 'undo' && !undone.has(a.id));
}

/** True when `next` is `prev` plus more actions at the end (same ids, same order). */
export function isExtension(prev: DeckAction[], next: DeckAction[]): boolean {
  if (next.length < prev.length) return false;
  for (let i = 0; i < prev.length; i++) if (prev[i].id !== next[i].id) return false;
  return true;
}

export type StaffDecision = Extract<DeckAction, { type: 'invite' | 'close' | 'later' }>;
export type PatientDecision = Extract<DeckAction, { type: 'interest' }>;

export interface Decisions {
  staff: Record<string, StaffDecision>;
  patient: Record<string, PatientDecision>;
  /** Trial ids moved to the back with "Later", oldest first. */
  later: string[];
  saved: string[];
}

/** Last staff and patient decision per trial (effective actions only). */
export function decisionsOf(effective: DeckAction[]): Decisions {
  const staff: Record<string, StaffDecision> = {};
  const patient: Record<string, PatientDecision> = {};
  let later: string[] = [];
  let saved: string[] = [];
  for (const a of effective) {
    if (a.type === 'invite' || a.type === 'close' || a.type === 'later') {
      staff[a.trialId] = a;
      later = later.filter((x) => x !== a.trialId);
      if (a.type === 'later') later.push(a.trialId);
    } else if (a.type === 'interest') {
      patient[a.trialId] = a;
      saved = saved.filter((x) => x !== a.trialId);
      if (a.kind === 'saved') saved.push(a.trialId);
    }
  }
  return { staff, patient, later, saved };
}

/** The newest pending invitation for a trial whose (simulated) site is still open. */
export function pendingInvite(state: RelayState, trial: Trial): Proposal | undefined {
  return state.proposals
    .filter((p) => p.kind === 'invite_prescreening' && p.status === 'pending' && p.trialIds.includes(trial.id))
    .filter((p) => {
      const s = trial.sites.find((x) => x.id === p.siteId);
      return !s || siteOpen(state, trial, s);
    })
    .at(-1);
}

/** Invitation already approved and sent (simulated) for a trial. */
export function sentInvite(state: RelayState, trialId: string): Proposal | undefined {
  return state.proposals.filter((p) => p.kind === 'invite_prescreening' && (p.status === 'approved' || p.status === 'sent') && p.trialIds.includes(trialId)).at(-1);
}

export function pendingRequest(state: RelayState, kind?: DocKind): Proposal | undefined {
  return state.proposals.filter((p) => p.kind === 'send_request' && p.status === 'pending' && (!kind || p.nextAction?.documentKind === kind)).at(-1);
}

/**
 * The engine trigger an action causes, given the state it is applied to. Decision-only actions
 * (later, interest, a close for a reason other than cohort full, an invite with no drafted
 * invitation) change no engine state and return null.
 */
export function triggerFor(state: RelayState, trials: Trial[], a: DeckAction): Trigger | null {
  switch (a.type) {
    case 'request.approved': {
      const p = pendingRequest(state, a.documentKind);
      return p ? { type: 'approve', proposalId: p.id } : null;
    }
    case 'doc.generated':
      return { type: 'document_added', doc: makeMolecularReport({ ...a.molecular, reportDate: REPORT_DATE, patientId: state.patientId }) };
    case 'invite': {
      const t = trials.find((x) => x.id === a.trialId);
      const p = t ? pendingInvite(state, t) : undefined;
      return p ? { type: 'approve', proposalId: p.id } : null;
    }
    case 'close':
      return a.reason === 'Cohort full (simulated)' && a.siteId ? { type: 'site_unavailable', trialId: a.trialId, siteId: a.siteId, reason: 'cohort_full' } : null;
    default:
      return null;
  }
}
