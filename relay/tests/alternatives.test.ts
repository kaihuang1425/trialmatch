import { describe, expect, it } from 'vitest';
import { TRIALS } from '../src/engine/data';
import { milesFromCity } from '../src/engine/geo';
import { createPatientState } from '../src/engine/state';
import { DEFAULT_DEMO_MOLECULAR } from '../src/engine/synthetic/templates';
import { ACRONYM, collect, done } from './helpers';

async function heroAfterReport() {
  const s0 = done(await collect({ mode: 'replay', state: createPatientState('SYN-0417'), trigger: { type: 'start' } })).state;
  return done(await collect({ mode: 'replay', state: s0, trigger: { type: 'document_added', molecular: DEFAULT_DEMO_MOLECULAR } })).state;
}

describe('site unavailable → alternatives', () => {
  it('keeps the profile and offers only open sites within 60 miles, never a non-matching study', async () => {
    const s = await heroAfterReport();
    const cb = TRIALS.find((t) => t.acronym === 'CodeBreaK 202')!;
    const marsden = cb.sites.find((x) => x.city === 'London')!;
    const factsBefore = JSON.stringify(s.facts);
    const events = await collect({ mode: 'replay', state: s, trigger: { type: 'site_unavailable', trialId: cb.id, siteId: marsden.id, reason: 'cohort_full' } });
    const after = done(events).state;
    expect(JSON.stringify(after.facts)).toBe(factsBefore); // clinical profile untouched
    const result = events.find((e) => e.type === 'tool_result' && e.tool === 'find_alternatives');
    expect(result && result.type === 'tool_result' && result.ok).toBe(true);
    const alt = (result as { output: { options: { trialId: string; siteId: string; distanceMiles: number; trialStatus: string }[]; excludedNotMatch: string[] } }).output;
    expect(alt.options.length).toBeGreaterThan(0);
    for (const o of alt.options) {
      expect(o.distanceMiles).toBeLessThanOrEqual(60);
      expect(o.trialStatus).not.toBe('not_match');
      expect(o.siteId).not.toBe(marsden.id);
      const t = TRIALS.find((x) => x.id === o.trialId)!;
      const site = t.sites.find((x) => x.id === o.siteId)!;
      expect(milesFromCity('London', site)).toBeLessThanOrEqual(60);
    }
    // the first option is another site of the same study (Mount Vernon, Northwood)
    expect(alt.options[0].trialId).toBe(cb.id);
    expect(alt.excludedNotMatch).toContain(ACRONYM['ALKAZAR']);
    // the withdrawn invitation and a new one for the alternative site
    expect(after.proposals.some((p) => p.kind === 'invite_prescreening' && p.siteId === marsden.id && p.status === 'rejected')).toBe(true);
    expect(after.proposals.some((p) => p.kind === 'invite_prescreening' && p.siteId === alt.options[0].siteId && p.status === 'pending')).toBe(true);
  });

  it('a shorter travel preference filters options but never changes eligibility', async () => {
    const s = await heroAfterReport();
    const events = await collect({ mode: 'replay', state: s, trigger: { type: 'preference_changed', preferences: { travelLimitMiles: 5 } } });
    const after = done(events).state;
    for (const t of TRIALS) expect(after.assessments[t.id].status).toBe(s.assessments[t.id].status);
    const result = events.find((e) => e.type === 'tool_result' && e.tool === 'find_alternatives') as { output: { options: { distanceMiles: number }[] } };
    for (const o of result.output.options) expect(o.distanceMiles).toBeLessThanOrEqual(5);
  });
});
