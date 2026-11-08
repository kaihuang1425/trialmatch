// planNextAction: which single document would resolve the most open requirements across the
// portfolio. Open = `unknown` rows (missing, not tested or stale) in trials that are not already a
// documented non-match. At-screening rows never count: no document can resolve them.

import { draftRequestTemplate } from './draft';
import { FACT_SOURCE_DOC } from './labels';
import type { DocKind, FactKey, NextAction, RelayState, Trial } from './types';

export interface ActionCandidate {
  documentKind: DocKind;
  target: FactKey[];
  notTested: FactKey[];
  unblocks: { trialId: string; criterionIds: string[] }[];
  openCount: number;
}

function openKeys(r: { missing?: FactKey[]; notTested?: FactKey[]; staleAll?: { key: FactKey }[] }): FactKey[] {
  return [...new Set([...(r.missing ?? []), ...(r.notTested ?? []), ...(r.staleAll ?? []).map((s) => s.key)])];
}

/** Every document request that would fully resolve at least one open row, best first. */
export function rankActions(state: RelayState, trials: Trial[]): ActionCandidate[] {
  const byDoc = new Map<DocKind, ActionCandidate>();
  for (const t of trials) {
    const a = state.assessments[t.id];
    if (!a || a.status === 'not_match') continue;
    for (const r of a.results) {
      if (r.state !== 'unknown' || r.atScreening) continue;
      const keys = openKeys(r);
      if (!keys.length) continue;
      const docs = new Set(keys.map((k) => FACT_SOURCE_DOC[k]));
      if (docs.size !== 1) continue; // needs more than one document: not resolved by any single request
      const doc = [...docs][0];
      const c = byDoc.get(doc) ?? { documentKind: doc, target: [], notTested: [], unblocks: [], openCount: 0 };
      for (const k of keys) if (!c.target.includes(k)) c.target.push(k);
      for (const k of r.notTested ?? []) if (!c.notTested.includes(k)) c.notTested.push(k);
      let u = c.unblocks.find((x) => x.trialId === t.id);
      if (!u) {
        u = { trialId: t.id, criterionIds: [] };
        c.unblocks.push(u);
      }
      u.criterionIds.push(r.criterionId);
      c.openCount += 1;
      byDoc.set(doc, c);
    }
  }
  return [...byDoc.values()].sort((a, b) => b.openCount - a.openCount || b.unblocks.length - a.unblocks.length);
}

const DOC_PHRASE: Record<DocKind, string> = {
  molecular: 'A molecular pathology report',
  labs: 'Current blood results',
  referral_summary: 'An updated referral summary',
  imaging: 'An imaging report',
  pathology: 'A histopathology report',
  letter: 'A clinic letter',
};

export function headlineFor(c: ActionCandidate): string {
  const n = c.openCount;
  const t = c.unblocks.length;
  const what = c.notTested.length && c.notTested.length === c.target.length ? 'Molecular testing (the record says it was not performed)' : DOC_PHRASE[c.documentKind];
  return `${what} would resolve ${n} open requirement${n === 1 ? '' : 's'} across ${t} stud${t === 1 ? 'y' : 'ies'}`;
}

export function planNextAction(state: RelayState, trials: Trial[]): NextAction | null {
  const ranked = rankActions(state, trials);
  const top = ranked[0];
  if (top) {
    const action: NextAction = {
      id: `NA-${top.documentKind}-v${state.version}`,
      kind: 'request_document',
      documentKind: top.documentKind,
      target: top.target,
      ...(top.notTested.length ? { notTested: top.notTested } : {}),
      unblocks: top.unblocks,
      openCount: top.openCount,
      headline: headlineFor(top),
      draft: '',
      requiresApproval: true,
    };
    action.draft = draftRequestTemplate(state, action, trials);
    return action;
  }
  // No evidence gap left: point at the clinician review that remains (never a send).
  const review = trials
    .map((t) => ({ t, a: state.assessments[t.id] }))
    .filter((x) => x.a?.status === 'needs_review')
    .map((x) => ({ trialId: x.t.id, criterionIds: x.a!.results.filter((r) => r.state === 'needs_review').map((r) => r.criterionId) }));
  if (!review.length) return null;
  const count = review.reduce((s, r) => s + r.criterionIds.length, 0);
  const action: NextAction = {
    id: `NA-review-v${state.version}`,
    kind: 'clinical_review',
    target: [],
    unblocks: review,
    openCount: count,
    headline: `${review.length} stud${review.length === 1 ? 'y needs' : 'ies need'} a clinician's review of ${count} item${count === 1 ? '' : 's'}`,
    draft: '',
    requiresApproval: true,
  };
  action.draft = draftRequestTemplate(state, action, trials);
  return action;
}
