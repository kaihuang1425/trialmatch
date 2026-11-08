// What changed between two assessments of the same trial: status, and per criterion old -> new state.

import type { Assessment, CriterionState, TrialStatus } from './types';

export interface CriterionChange {
  criterionId: string;
  from: CriterionState | null;
  to: CriterionState;
  kind: 'state' | 'evidence'; // evidence = same state, different cited facts
  reason: string;
  evidence: { factId: string; docId: string; quote: string }[];
}

export interface TrialDiff {
  trialId: string;
  statusFrom: TrialStatus | null;
  statusTo: TrialStatus;
  statusChanged: boolean;
  changes: CriterionChange[];
}

export function diffAssessments(prev: Assessment | undefined, next: Assessment): TrialDiff {
  const before = new Map((prev?.results ?? []).map((r) => [r.criterionId, r]));
  const changes: CriterionChange[] = [];
  for (const r of next.results) {
    const p = before.get(r.criterionId);
    const ev = r.evidence.map((f) => ({ factId: f.id, docId: f.source.docId, quote: f.source.quote }));
    if (!p || p.state !== r.state) {
      changes.push({ criterionId: r.criterionId, from: p?.state ?? null, to: r.state, kind: 'state', reason: r.reason, evidence: ev });
    } else {
      const a = p.evidence.map((f) => f.id).sort().join('|');
      const b = r.evidence.map((f) => f.id).sort().join('|');
      if (a !== b) changes.push({ criterionId: r.criterionId, from: p.state, to: r.state, kind: 'evidence', reason: r.reason, evidence: ev });
    }
  }
  return {
    trialId: next.trialId,
    statusFrom: prev?.status ?? null,
    statusTo: next.status,
    statusChanged: !prev || prev.status !== next.status,
    changes,
  };
}

export function hasChanges(d: TrialDiff): boolean {
  return d.statusChanged || d.changes.length > 0;
}
