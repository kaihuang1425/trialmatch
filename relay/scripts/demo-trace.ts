// Prints the SYN-0417 demo as the event stream a UI would animate (replay mode). Usage: npx tsx scripts/demo-trace.ts
import { runAgent } from '../src/engine/agent';
import { createPatientState } from '../src/engine/state';
import { DEFAULT_DEMO_MOLECULAR } from '../src/engine/synthetic/templates';
import type { RelayState } from '../src/engine/types';
import type { Trigger } from '../src/engine/events';

async function step(state: RelayState, trigger: Trigger): Promise<RelayState> {
  let out = state;
  for await (const e of runAgent({ mode: 'replay', state, trigger })) {
    if (e.type === 'tool_result') console.log(`  ${e.ok ? 'ok ' : 'ERR'} ${e.tool}: ${e.summary}`);
    else if (e.type === 'assessment_changed') console.log(`  ~ ${e.acronym}: ${e.diff.statusFrom ?? '-'} -> ${e.diff.statusTo} (${e.diff.changes.filter((c) => c.kind === 'state').length} rows)`);
    else if (e.type === 'proposal') console.log(`  ? proposal ${e.proposal.id} ${e.proposal.kind} ${e.proposal.note ?? ''}`);
    else if (e.type === 'needs_review' || e.type === 'error' || e.type === 'message' || e.type === 'fact_rejected') console.log(`  ! ${e.type}: ${'message' in e ? e.message : 'reason' in e ? e.reason : 'text' in e ? e.text : ''}`);
    else if (e.type === 'done') {
      console.log(`  = ${e.summary}`);
      if (e.nextAction) console.log(`  > next: ${e.nextAction.headline}`);
      out = e.state;
    }
  }
  return out;
}

(async () => {
  console.log('start (referral + labs)');
  let s = await step(createPatientState('SYN-0417'), { type: 'start' });
  console.log('document_added: default molecular report');
  s = await step(s, { type: 'document_added', molecular: DEFAULT_DEMO_MOLECULAR });
  const inv = s.proposals.find((p) => p.kind === 'invite_prescreening');
  if (inv) {
    console.log(`approve ${inv.id}`);
    s = await step(s, { type: 'approve', proposalId: inv.id });
  }
  console.log('site_unavailable: CodeBreaK 202 Royal Marsden cohort full');
  s = await step(s, { type: 'site_unavailable', trialId: 'NCT05920356', siteId: 'cb202-royal-marsden-hospital', reason: 'cohort_full' });
})();
