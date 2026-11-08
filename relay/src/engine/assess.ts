// Assessment per trial, and the derived trial status exactly as SPEC.md defines it, with one
// extension: rows the study team completes at screening (atScreening) never block the status.
//   any mandatory conflicting      -> not_match       "Not a match on current evidence"
//   else any unknown               -> needs_evidence  "Potential match — needs evidence"
//   else any needs_review          -> needs_review    "Potential match — needs clinical review"
//   else                           -> ready           "Ready for prescreening review"

import { evaluateCriterion, type EvalContext } from './rules';
import type { Assessment, CriterionResult, RelayState, Trial, TrialStatus } from './types';
import { TRIAL_STATUS_LABEL } from './types';

export function deriveStatus(trial: Trial, results: CriterionResult[]): { status: TrialStatus; blocking: string[]; atScreening: string[] } {
  const byId = new Map(trial.criteria.map((c) => [c.id, c]));
  const atScreening = results.filter((r) => r.atScreening).map((r) => r.criterionId);
  const rows = results.filter((r) => !r.atScreening);
  const conflicts = rows.filter((r) => r.state === 'conflicting' && byId.get(r.criterionId)?.mandatory);
  if (conflicts.length) return { status: 'not_match', blocking: conflicts.map((r) => r.criterionId), atScreening };
  const unknown = rows.filter((r) => r.state === 'unknown');
  if (unknown.length) return { status: 'needs_evidence', blocking: unknown.map((r) => r.criterionId), atScreening };
  const review = rows.filter((r) => r.state === 'needs_review');
  if (review.length) return { status: 'needs_review', blocking: review.map((r) => r.criterionId), atScreening };
  return { status: 'ready', blocking: [], atScreening };
}

export function statusLabel(status: TrialStatus, atScreeningCount: number): string {
  const base = TRIAL_STATUS_LABEL[status];
  if (status === 'ready' && atScreeningCount > 0) {
    return `${base} (${atScreeningCount} item${atScreeningCount === 1 ? '' : 's'} checked by the study team at screening)`;
  }
  return base;
}

export function assessTrial(state: RelayState, trial: Trial, computedAt: string = new Date().toISOString()): Assessment {
  const ctx: EvalContext = { facts: state.facts, asOf: state.asOf, verifications: state.verifications };
  const results = trial.criteria.map((c) => evaluateCriterion(c, ctx));
  const { status, blocking, atScreening } = deriveStatus(trial, results);
  return {
    patientId: state.patientId,
    trialId: trial.id,
    patientVersion: state.version,
    trialSnapshot: trial.snapshotDate,
    results,
    status,
    statusLabel: statusLabel(status, atScreening.length),
    computedAt,
    asOf: state.asOf,
    blocking,
    atScreening,
  };
}

export function assessAll(state: RelayState, trials: Trial[], computedAt?: string): Record<string, Assessment> {
  const out: Record<string, Assessment> = {};
  for (const t of trials) out[t.id] = assessTrial(state, t, computedAt);
  return out;
}
