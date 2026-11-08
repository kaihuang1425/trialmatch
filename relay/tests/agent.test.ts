import { describe, expect, it } from 'vitest';
import { isAppendOnly } from '../src/engine/audit';
import type { Extractor } from '../src/engine/extract/types';
import { createPatientState } from '../src/engine/state';
import { DEFAULT_DEMO_MOLECULAR } from '../src/engine/synthetic/templates';
import { ApprovalRequiredError, sendInvitation, type ToolContext } from '../src/engine/tools';
import { rulesExtractor } from '../src/engine/extract/rules';
import { TRIALS } from '../src/engine/data';
import { ACRONYM, FIXED_CLOCK, collect, done } from './helpers';

async function afterStart() {
  return done(await collect({ mode: 'replay', state: createPatientState('SYN-0417'), trigger: { type: 'start' } })).state;
}

describe('replay agent event stream', () => {
  it('document_added emits plan → add → extract → assess with per-trial changes → plan_next_action → proposals → done', async () => {
    const before = await afterStart();
    const events = await collect({ mode: 'replay', state: before, trigger: { type: 'document_added', molecular: DEFAULT_DEMO_MOLECULAR } });
    const shape = events.map((e) => (e.type === 'tool_call' || e.type === 'tool_result' ? `${e.type}:${e.tool}` : e.type));
    // collapse repeated assessment_changed / proposal for readability
    const collapsed = shape.filter((x, i) => !(x === shape[i - 1] && (x === 'assessment_changed' || x === 'proposal')));
    expect(collapsed).toEqual([
      'tool_call:add_document',
      'tool_result:add_document',
      'plan',
      'tool_call:extract_facts',
      'tool_result:extract_facts',
      'tool_call:assess',
      'assessment_changed',
      'tool_result:assess',
      'tool_call:plan_next_action',
      'tool_result:plan_next_action',
      'tool_call:draft_request',
      'tool_result:draft_request',
      'tool_call:propose_request',
      'proposal',
      'tool_result:propose_request',
      'tool_call:propose_invitations',
      'proposal',
      'tool_result:propose_invitations',
      'done',
    ]);
    // assessment_changed arrives once per changed trial, in portfolio order
    const changed = events.filter((e) => e.type === 'assessment_changed').map((e) => (e.type === 'assessment_changed' ? e.acronym : ''));
    expect(changed).toEqual(TRIALS.map((t) => t.acronym).filter((a) => changed.includes(a)));
    expect(changed).toContain('CodeBreaK 202');
    // every event has a sequence number in order
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    // the input state was not mutated and the audit log only grew
    const after = done(events).state;
    expect(before.facts.some((f) => f.key === 'kras')).toBe(false);
    expect(isAppendOnly(before.audit, after.audit)).toBe(true);
    expect(after.audit.every((a) => a.patientVersion !== undefined && a.trialSnapshot === '2026-11-07')).toBe(true);
  });

  it('an extractor failure becomes an error event, never a rejected promise', async () => {
    const broken: Extractor = { kind: 'llm', propose: async () => Promise.reject(new Error('model timeout')) };
    const before = await afterStart();
    const events = await collect({ mode: 'replay', state: before, trigger: { type: 'document_added', molecular: DEFAULT_DEMO_MOLECULAR }, extractor: broken });
    expect(events.some((e) => e.type === 'error' && /model timeout/.test(e.message))).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('an invalid judge input is a visible error event', async () => {
    const before = await afterStart();
    const events = await collect({ mode: 'replay', state: before, trigger: { type: 'document_added', molecular: { ...DEFAULT_DEMO_MOLECULAR, kras: 'G12Q' } } });
    expect(events.some((e) => e.type === 'error' && /kras="G12Q"/.test(e.message))).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
  });
});

describe('approval boundary (enforced in code)', () => {
  it('sending an invitation without coordinator approval throws', async () => {
    const before = await afterStart();
    const s = done(await collect({ mode: 'replay', state: before, trigger: { type: 'document_added', molecular: DEFAULT_DEMO_MOLECULAR } })).state;
    const invite = s.proposals.find((p) => p.kind === 'invite_prescreening')!;
    expect(invite.status).toBe('pending');
    const ctx: ToolContext = { state: s, trials: TRIALS, mode: 'replay', extractor: rulesExtractor, emit: () => {}, now: FIXED_CLOCK };
    expect(() => sendInvitation(ctx, invite.id)).toThrow(ApprovalRequiredError);
    // forging the status without an audited coordinator approval still fails
    invite.status = 'approved';
    expect(() => sendInvitation(ctx, invite.id)).toThrow(ApprovalRequiredError);
    expect(s.outbox).toHaveLength(0);
  });

  it('approve(proposalId) records the coordinator decision, then sends (simulated)', async () => {
    const before = await afterStart();
    const s = done(await collect({ mode: 'replay', state: before, trigger: { type: 'document_added', molecular: DEFAULT_DEMO_MOLECULAR } })).state;
    const invite = s.proposals.find((p) => p.kind === 'invite_prescreening' && p.trialIds[0] === ACRONYM['CodeBreaK 202'])!;
    const events = await collect({ mode: 'replay', state: s, trigger: { type: 'approve', proposalId: invite.id } });
    const after = done(events).state;
    expect(after.proposals.find((p) => p.id === invite.id)!.status).toBe('sent');
    expect(after.outbox).toHaveLength(1);
    expect(after.outbox[0].simulated).toBe(true);
    expect(after.audit.some((a) => a.type === 'proposal_approved' && a.actor === 'coordinator')).toBe(true);
  });

  it('coordinator verification binds to (doc, value, span) and a correction voids it', async () => {
    const before = await afterStart();
    const s = done(await collect({ mode: 'replay', state: before, trigger: { type: 'document_added', molecular: DEFAULT_DEMO_MOLECULAR } })).state;
    const ecog = s.facts.find((f) => f.key === 'ecog')!;
    const verified = done(await collect({ mode: 'replay', state: s, trigger: { type: 'fact_verified', factId: ecog.id } })).state;
    const r = verified.assessments[ACRONYM['CodeBreaK 202']].results.find((x) => x.criterionId === 'cb202-ecog')!;
    expect(r.pendingVerification).toBe(false);
    // central PD-L1 is untouched by any verification
    expect(verified.assessments[ACRONYM['CodeBreaK 202']].results.find((x) => x.criterionId === 'cb202-pdl1-central')!.atScreening).toBe(true);
    const corrected = done(await collect({ mode: 'replay', state: verified, trigger: { type: 'fact_corrected', factId: ecog.id, value: 2, note: 'clinic letter says ECOG 2' } })).state;
    const r2 = corrected.assessments[ACRONYM['CodeBreaK 202']].results.find((x) => x.criterionId === 'cb202-ecog')!;
    expect(r2.state).toBe('conflicting');
    expect(corrected.audit.some((a) => a.type === 'fact_corrected')).toBe(true);
  });
});
