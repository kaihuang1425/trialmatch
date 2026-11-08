// Request text for a NextAction. Replay: template. Live: the model rewrites the template, and the
// result is kept only if it still names every study the request unblocks (otherwise the template).

import { SIMULATED_RECIPIENTS } from './config';
import { DOC_LABEL, FACT_LABEL } from './labels';
import type { LlmProvider } from './llm/provider';
import { textOf } from './llm/provider';
import { RELAY_POLICY } from './policy';
import type { NextAction, RelayState, Trial } from './types';

export function draftRequestTemplate(state: RelayState, action: NextAction, trials: Trial[]): string {
  const name = (id: string) => trials.find((t) => t.id === id)?.acronym ?? id;
  const plain = (tid: string, cid: string) => trials.find((t) => t.id === tid)?.criteria.find((c) => c.id === cid)?.plain ?? cid;
  const lines: string[] = [];
  lines.push(`To: ${SIMULATED_RECIPIENTS.referringTeam}`);
  if (action.kind === 'clinical_review') {
    lines.push(`Subject: Clinical review needed for trial prescreening — ${state.patientId} (synthetic)`);
    lines.push('');
    lines.push(`Relay has checked ${state.patientId} against the trial portfolio. These items need a clinician's judgement:`);
  } else {
    const doc = action.documentKind ? DOC_LABEL[action.documentKind] : 'document';
    const testing = action.notTested?.length ? ' The record states this testing has not been performed, so it would need to be requested.' : '';
    lines.push(`Subject: Request for ${doc} — ${state.patientId} (synthetic)`);
    lines.push('');
    lines.push(`We are prescreening ${state.patientId} for clinical studies. A ${doc} would let us check ${action.openCount} open requirement${action.openCount === 1 ? '' : 's'} across ${action.unblocks.length} stud${action.unblocks.length === 1 ? 'y' : 'ies'}.${testing}`);
    lines.push(`Needed: ${action.target.map((k) => FACT_LABEL[k]).join(', ')}.`);
    const stale = Object.values(state.assessments)
      .flatMap((a) => a.results)
      .flatMap((r) => r.staleAll ?? [])
      .filter((s) => action.target.includes(s.key));
    if (stale.length) {
      const d = [...new Set(stale.map((s) => s.observedOn))].sort()[0];
      lines.push(`The results we hold are dated ${d}; Relay treats results older than ${RELAY_POLICY.labRecencyDays.value} days as outdated for prescreening (a Relay policy, not a protocol rule).`);
    }
    lines.push('');
    lines.push('What it would unblock:');
  }
  for (const u of action.unblocks) lines.push(`- ${name(u.trialId)}: ${u.criterionIds.map((c) => plain(u.trialId, c)).join('; ')}`);
  lines.push('');
  lines.push('No decision about eligibility has been made. The study teams decide using the current protocol.');
  lines.push('Drafted by Relay; sent only after the research coordinator approves it (simulated, nothing leaves this demo).');
  return lines.join('\n');
}

export async function draftRequestLlm(provider: LlmProvider, state: RelayState, action: NextAction, trials: Trial[]): Promise<string> {
  const base = draftRequestTemplate(state, action, trials);
  const res = await provider.complete({
    purpose: 'draft',
    system:
      'You edit clinical-trial prescreening requests between NHS teams. Keep every study name, requirement and date from the draft. Do not add clinical claims, probabilities or eligibility verdicts. Plain, specific British English. Output only the request text.',
    messages: [{ role: 'user', content: `Tighten this request without changing its facts:\n\n${base}` }],
    maxTokens: 2000,
  });
  const text = textOf(res).trim();
  const names = action.unblocks.map((u) => trials.find((t) => t.id === u.trialId)?.acronym ?? u.trialId);
  if (!text || res.stopReason === 'refusal' || !names.every((n) => text.includes(n))) return base;
  return text;
}
