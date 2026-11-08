// The agent's tools. They hold the invariants, whichever mode (replay policy or live model) calls them:
//  - no fact without a verbatim quote (verifier), and every rejection is logged
//  - outbound requests and invitations need a coordinator approval recorded in the audit log
//  - ambiguity becomes needs_review, never a guess
//  - preferences and site availability never change eligibility

import { findAlternatives, siteOpen, type AlternativeReason } from './alternatives';
import { assessAll } from './assess';
import { appendAudit, nextId } from './audit';
import { SIMULATED_RECIPIENTS } from './config';
import { diffAssessments, hasChanges } from './diff';
import { draftRequestLlm, draftRequestTemplate } from './draft';
import type { AgentEventInput } from './events';
import { explainForPatient } from './explain';
import type { Extractor } from './extract/types';
import { verifyCandidates } from './extract/verify';
import { milesFromCity } from './geo';
import { FACT_LABEL, formatValue } from './labels';
import type { LlmProvider } from './llm/provider';
import { planNextAction } from './plan';
import { assertSynthetic } from './synthetic/templates';
import type { Fact, FactValue, NextAction, Preferences, Proposal, RelayState, SourceDoc, Trial } from './types';

export class ApprovalRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalRequiredError';
  }
}

export interface ToolContext {
  state: RelayState;
  trials: Trial[];
  mode: 'replay' | 'live';
  extractor: Extractor;
  provider?: LlmProvider;
  emit: (e: AgentEventInput) => void;
  now: () => string;
}

const audit = (ctx: ToolContext, actor: 'agent' | 'coordinator' | 'patient' | 'system', type: string, detail: object) =>
  appendAudit(ctx.state, { actor, type, detail }, ctx.now());

// ---------- documents and facts ----------

export function addDocument(ctx: ToolContext, doc: SourceDoc): { docId: string; version: number } {
  assertSynthetic(doc);
  if (doc.patientId !== ctx.state.patientId) throw new Error(`document ${doc.id} belongs to ${doc.patientId}, not ${ctx.state.patientId}`);
  const existing = ctx.state.documents.find((d) => d.id === doc.id);
  if (existing && existing.text === doc.text) return { docId: doc.id, version: existing.version };
  const stored: SourceDoc = existing ? { ...doc, id: `${doc.id}-v${existing.version + 1}`, version: existing.version + 1 } : { ...doc };
  ctx.state.documents.push(stored);
  audit(ctx, 'coordinator', 'document_added', { docId: stored.id, kind: stored.kind, date: stored.date, synthetic: true });
  return { docId: stored.id, version: stored.version };
}

export async function extractFacts(ctx: ToolContext, docId: string) {
  const doc = ctx.state.documents.find((d) => d.id === docId);
  if (!doc) throw new Error(`unknown document ${docId}`);
  if (ctx.state.extractedDocIds.includes(docId)) return { docId, accepted: 0, rejected: 0, skipped: true, facts: [] as Fact[] };
  const candidates = await ctx.extractor.propose(doc); // errors surface as events in the agent, never as a rejected run
  const res = verifyCandidates(doc, candidates, ctx.extractor.kind);
  for (const r of res.rejected) {
    ctx.emit({ type: 'fact_rejected', docId: r.docId, key: r.key, quote: r.quote, value: r.value, reason: r.reason, extractedBy: r.extractedBy });
    audit(ctx, 'agent', 'fact_rejected', r);
  }
  if (res.accepted.length) {
    ctx.state.facts.push(...res.accepted);
    ctx.state.version += 1;
  }
  ctx.state.extractedDocIds.push(docId);
  audit(ctx, 'agent', 'facts_extracted', { docId, accepted: res.accepted.length, rejected: res.rejected.length, extractedBy: ctx.extractor.kind });
  const uncertain = res.accepted.filter((f) => f.value === 'uncertain');
  if (uncertain.length) {
    const keys = [...new Set(uncertain.map((f) => f.key))];
    const reason = `The document is ambiguous ("${uncertain[0].source.quote}"). Relay will not guess ${keys.length} treatment/history fact${keys.length === 1 ? '' : 's'}; a clinician decides.`;
    ctx.emit({ type: 'needs_review', reason, docId, factKeys: keys });
    audit(ctx, 'agent', 'needs_review', { docId, keys });
  }
  return { docId, accepted: res.accepted.length, rejected: res.rejected.length, skipped: false, facts: res.accepted };
}

export function assess(ctx: ToolContext) {
  const prev = ctx.state.assessments;
  const next = assessAll(ctx.state, ctx.trials, ctx.now());
  const changed: string[] = [];
  for (const t of ctx.trials) {
    const d = diffAssessments(prev[t.id], next[t.id]);
    ctx.state.assessments[t.id] = next[t.id];
    if (hasChanges(d)) {
      changed.push(t.id);
      ctx.emit({ type: 'assessment_changed', patientId: ctx.state.patientId, trialId: t.id, acronym: t.acronym, statusLabel: next[t.id].statusLabel, diff: d, assessment: next[t.id] });
    }
  }
  const statuses = Object.fromEntries(ctx.trials.map((t) => [t.acronym, next[t.id].status]));
  audit(ctx, 'agent', 'assessed', { statuses, changed });
  return { statuses, changed };
}

// ---------- planning and proposals ----------

export function planNext(ctx: ToolContext): NextAction | null {
  return planNextAction(ctx.state, ctx.trials);
}

export async function draftRequest(ctx: ToolContext, action: NextAction): Promise<string> {
  if (ctx.mode === 'live' && ctx.provider) return draftRequestLlm(ctx.provider, ctx.state, action, ctx.trials);
  return draftRequestTemplate(ctx.state, action, ctx.trials);
}

export function proposeRequest(ctx: ToolContext, action: NextAction, draft: string): Proposal | null {
  if (action.kind !== 'request_document') return null;
  const dup = ctx.state.proposals.find((p) => p.kind === 'send_request' && p.status === 'pending' && p.nextAction?.documentKind === action.documentKind);
  if (dup) {
    dup.nextAction = action;
    dup.draft = draft;
    dup.trialIds = action.unblocks.map((u) => u.trialId);
    return dup;
  }
  const p: Proposal = {
    id: nextId(ctx.state, 'PRP'),
    kind: 'send_request',
    patientId: ctx.state.patientId,
    trialIds: action.unblocks.map((u) => u.trialId),
    nextAction: { ...action, draft },
    draft,
    recipient: SIMULATED_RECIPIENTS.referringTeam,
    status: 'pending',
    createdAt: ctx.now(),
  };
  ctx.state.proposals.push(p);
  ctx.emit({ type: 'proposal', proposal: p, requiresApproval: true });
  audit(ctx, 'agent', 'proposal_created', { proposalId: p.id, kind: p.kind, headline: action.headline });
  return p;
}

function nearestOpenSite(ctx: ToolContext, t: Trial, exclude?: string) {
  return t.sites
    .filter((s) => s.id !== exclude && siteOpen(ctx.state, t, s))
    .map((s) => ({ s, d: milesFromCity(ctx.state.preferences.homeCity, s) }))
    .filter((x): x is { s: Trial['sites'][number]; d: number } => x.d !== null && x.d <= ctx.state.preferences.travelLimitMiles)
    .sort((a, b) => a.d - b.d)[0];
}

function invitationDraft(ctx: ToolContext, t: Trial, siteName: string): string {
  const a = ctx.state.assessments[t.id];
  const byId = new Map(t.criteria.map((c) => [c.id, c]));
  const supported = a.results.filter((r) => r.state === 'supported').length;
  const review = a.results.filter((r) => r.state === 'needs_review').map((r) => `- ${byId.get(r.criterionId)?.plain}`);
  const screening = a.results.filter((r) => r.atScreening).map((r) => `- ${byId.get(r.criterionId)?.plain}`);
  return [
    `To: ${SIMULATED_RECIPIENTS.studyTeam(t.acronym, siteName)}`,
    `Subject: Prescreening referral — ${ctx.state.patientId} (synthetic) for ${t.acronym} (${t.nct})`,
    '',
    `Relay status: ${a.statusLabel}. ${supported} listed requirements are supported by cited passages (patient record v${ctx.state.version}, trial snapshot ${t.snapshotDate}).`,
    ...(review.length ? ['Needs a clinician’s review:', ...review] : []),
    ...(screening.length ? ['For the study team at screening:', ...screening] : []),
    '',
    'Eligibility is decided by the study team using the current protocol. Sent only after coordinator approval (simulated).',
  ].join('\n');
}

export function proposeInvitations(ctx: ToolContext, onlyTrialIds?: string[], excludeSite?: { trialId: string; siteId?: string }): Proposal[] {
  const out: Proposal[] = [];
  for (const t of ctx.trials) {
    if (onlyTrialIds && !onlyTrialIds.includes(t.id)) continue;
    const a = ctx.state.assessments[t.id];
    if (!a || (a.status !== 'ready' && a.status !== 'needs_review')) continue;
    // One live invitation per study: skip if one exists for a site that is still open (simulated lane).
    const live = ctx.state.proposals.some((p) => {
      if (p.kind !== 'invite_prescreening' || !p.trialIds.includes(t.id) || p.status === 'rejected') return false;
      const s = t.sites.find((x) => x.id === p.siteId);
      return !s || siteOpen(ctx.state, t, s);
    });
    if (live) continue;
    const site = nearestOpenSite(ctx, t, excludeSite?.trialId === t.id ? excludeSite.siteId : undefined);
    if (!site) {
      ctx.emit({
        type: 'message',
        source: 'agent',
        text: `${t.acronym}: ${a.statusLabel}, but no open site within ${ctx.state.preferences.travelLimitMiles} miles of ${ctx.state.preferences.homeCity} (simulated site lane). No invitation proposed.`,
      });
      continue;
    }
    const p: Proposal = {
      id: nextId(ctx.state, 'PRP'),
      kind: 'invite_prescreening',
      patientId: ctx.state.patientId,
      trialIds: [t.id],
      siteId: site.s.id,
      draft: invitationDraft(ctx, t, site.s.facility),
      recipient: SIMULATED_RECIPIENTS.studyTeam(t.acronym, site.s.facility),
      status: 'pending',
      createdAt: ctx.now(),
      note: `${site.s.facility}, ${site.s.city} — ${site.d} miles (approximate)`,
    };
    ctx.state.proposals.push(p);
    ctx.emit({ type: 'proposal', proposal: p, requiresApproval: true });
    audit(ctx, 'agent', 'proposal_created', { proposalId: p.id, kind: p.kind, trialId: t.id, siteId: site.s.id });
    out.push(p);
  }
  return out;
}

// ---------- coordinator decisions and the approval boundary ----------

export function recordDecision(ctx: ToolContext, proposalId: string, decision: 'approved' | 'rejected', note?: string): Proposal {
  const p = ctx.state.proposals.find((x) => x.id === proposalId);
  if (!p) throw new Error(`unknown proposal ${proposalId}`);
  if (p.status !== 'pending') throw new Error(`proposal ${proposalId} is already ${p.status}`);
  p.status = decision;
  p.decidedAt = ctx.now();
  p.decidedBy = 'coordinator';
  if (note) p.note = note;
  audit(ctx, 'coordinator', decision === 'approved' ? 'proposal_approved' : 'proposal_rejected', { proposalId, kind: p.kind, note });
  return p;
}

function assertApproved(state: RelayState, p: Proposal) {
  const approvedInAudit = state.audit.some((e) => e.type === 'proposal_approved' && e.actor === 'coordinator' && (e.detail as { proposalId?: string }).proposalId === p.id);
  if (p.status !== 'approved' || p.decidedBy !== 'coordinator' || !approvedInAudit) {
    throw new ApprovalRequiredError(`${p.kind} ${p.id} has no coordinator approval; nothing was sent.`);
  }
}

function send(ctx: ToolContext, proposalId: string, kind: Proposal['kind']) {
  const p = ctx.state.proposals.find((x) => x.id === proposalId);
  if (!p) throw new Error(`unknown proposal ${proposalId}`);
  if (p.kind !== kind) throw new Error(`proposal ${proposalId} is a ${p.kind}, not a ${kind}`);
  assertApproved(ctx.state, p);
  p.status = 'sent';
  const sentAt = ctx.now();
  ctx.state.outbox.push({ proposalId, kind, sentAt, simulated: true, to: p.recipient });
  audit(ctx, 'agent', kind === 'send_request' ? 'request_sent' : 'invitation_sent', { proposalId, to: p.recipient, simulated: true });
  return { proposalId, sentAt, to: p.recipient, simulated: true as const };
}

/** Throws ApprovalRequiredError unless the coordinator approved this exact proposal. */
export function sendRequest(ctx: ToolContext, proposalId: string) {
  return send(ctx, proposalId, 'send_request');
}

/** Throws ApprovalRequiredError unless the coordinator approved this exact proposal. */
export function sendInvitation(ctx: ToolContext, proposalId: string) {
  return send(ctx, proposalId, 'invite_prescreening');
}

// ---------- coordinator / patient lane changes ----------

export function recordCorrection(ctx: ToolContext, args: { factId: string; value: FactValue; unit?: string; note?: string }): Fact {
  const orig = ctx.state.facts.find((f) => f.id === args.factId);
  if (!orig) throw new Error(`unknown fact ${args.factId}`);
  const n = ctx.state.facts.filter((f) => f.id.startsWith(`${orig.id}~corr`)).length + 1;
  const fact: Fact = {
    id: `${orig.id}~corr${n}`,
    key: orig.key,
    value: args.value,
    ...(args.unit ?? orig.unit ? { unit: args.unit ?? orig.unit } : {}),
    ...(orig.refHigh !== undefined ? { refHigh: orig.refHigh } : {}),
    observedOn: orig.observedOn,
    source: { ...orig.source },
    extractedBy: 'human',
    verified: true,
    correctedFrom: { value: orig.value, ...(orig.unit ? { unit: orig.unit } : {}), factId: orig.id },
  };
  ctx.state.facts.push(fact);
  ctx.state.version += 1;
  ctx.state.verifications.push({ factId: fact.id, docId: fact.source.docId, value: fact.value, start: fact.source.start, end: fact.source.end, at: ctx.now(), by: 'coordinator' });
  audit(ctx, 'coordinator', 'fact_corrected', { factId: orig.id, newFactId: fact.id, key: fact.key, from: orig.value, to: fact.value, note: args.note });
  return fact;
}

/** Coordinator ticks a cited fact. Bound to (docId, value, quote span); any change voids it. */
export function recordVerification(ctx: ToolContext, factId: string) {
  const f = ctx.state.facts.find((x) => x.id === factId);
  if (!f) throw new Error(`unknown fact ${factId}`);
  ctx.state.verifications.push({ factId: f.id, docId: f.source.docId, value: f.value, start: f.source.start, end: f.source.end, at: ctx.now(), by: 'coordinator' });
  audit(ctx, 'coordinator', 'fact_verified', { factId, key: f.key, value: f.value, docId: f.source.docId });
  return { factId, key: f.key, value: formatValue(f.value, f.unit), label: FACT_LABEL[f.key] };
}

export function recordSiteUnavailable(ctx: ToolContext, args: { trialId: string; siteId?: string; reason: 'cohort_full' | 'site_unavailable'; note?: string }) {
  const t = ctx.trials.find((x) => x.id === args.trialId);
  if (!t) throw new Error(`unknown trial ${args.trialId}`);
  if (args.siteId && !t.sites.some((s) => s.id === args.siteId)) throw new Error(`unknown site ${args.siteId} for ${t.acronym}`);
  ctx.state.siteOverrides.push({ trialId: t.id, siteId: args.siteId ?? '*', open: false, reason: args.reason, ...(args.note ? { note: args.note } : {}), at: ctx.now(), simulated: true });
  // Pending invitations to that site are withdrawn; the patient's clinical profile is untouched.
  for (const p of ctx.state.proposals) {
    if (p.kind === 'invite_prescreening' && p.status === 'pending' && p.trialIds.includes(t.id) && (!args.siteId || p.siteId === args.siteId)) {
      p.status = 'rejected';
      p.note = `Withdrawn: ${args.reason.replace('_', ' ')} (simulated)`;
    }
  }
  audit(ctx, 'coordinator', 'site_unavailable', { trialId: t.id, siteId: args.siteId ?? '*', reason: args.reason, note: args.note, simulated: true, profileKept: true });
  return { trialId: t.id, siteId: args.siteId ?? '*', reason: args.reason, profileKept: true };
}

export function updatePreferences(ctx: ToolContext, prefs: Partial<Pick<Preferences, 'homeCity' | 'travelLimitMiles' | 'daysAvailable'>>) {
  ctx.state.preferences = { ...ctx.state.preferences, ...prefs, setBy: 'patient', updatedAt: ctx.now() };
  audit(ctx, 'patient', 'preferences_changed', { ...prefs });
  return ctx.state.preferences;
}

export function alternatives(ctx: ToolContext, args: { reason: AlternativeReason; trialId?: string; siteId?: string }) {
  const r = findAlternatives(ctx.state, ctx.trials, args);
  audit(ctx, 'agent', 'alternatives_found', { reason: args.reason, options: r.options.length, outsideTravel: r.outsideTravel });
  return r;
}

export function explain(ctx: ToolContext, trialId: string) {
  const t = ctx.trials.find((x) => x.id === trialId || x.acronym === trialId);
  if (!t) throw new Error(`unknown trial ${trialId}`);
  return explainForPatient(ctx.state, t);
}

export function flagNeedsReview(ctx: ToolContext, reason: string, trialId?: string) {
  ctx.emit({ type: 'needs_review', reason, ...(trialId ? { trialId } : {}) });
  audit(ctx, 'agent', 'needs_review', { reason, trialId });
  return { flagged: true };
}
