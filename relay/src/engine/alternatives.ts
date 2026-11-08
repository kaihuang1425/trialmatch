// findAlternatives: after "cohort full", "site unavailable" or a travel change, list other sites or
// studies. Preferences (travel) FILTER options; they never override eligibility: a trial that is
// "Not a match on current evidence" is never offered, however close its site is.
// Site availability is SIMULATED (registry recruitment status + coordinator overrides).

import { milesFromCity } from './geo';
import type { RelayState, Site, Trial, TrialStatus } from './types';

export type AlternativeReason = 'cohort_full' | 'site_unavailable' | 'travel';

export interface Alternative {
  trialId: string;
  acronym: string;
  siteId: string;
  facility: string;
  city: string;
  distanceMiles: number;
  sameTrial: boolean;
  trialStatus: TrialStatus | 'not_assessed';
  availability: { open: boolean; simulated: true; basis: string };
}

export interface AlternativesResult {
  reason: AlternativeReason;
  keptProfile: true;
  patientVersion: number;
  homeCity: string;
  travelLimitMiles: number;
  options: Alternative[];
  outsideTravel: number; // open sites of eligible-so-far trials beyond the travel limit
  excludedNotMatch: string[]; // trials never offered because the evidence contradicts them
  note: string;
}

export function siteOpen(state: RelayState, trial: Trial, site: Site): boolean {
  if (!site.availability.open) return false;
  return !state.siteOverrides.some((o) => o.trialId === trial.id && (o.siteId === '*' || o.siteId === site.id));
}

const RANK: Record<string, number> = { ready: 0, needs_review: 1, needs_evidence: 2, not_assessed: 3 };

export function findAlternatives(
  state: RelayState,
  trials: Trial[],
  args: { reason: AlternativeReason; trialId?: string; siteId?: string },
): AlternativesResult {
  const { homeCity, travelLimitMiles } = state.preferences;
  const options: Alternative[] = [];
  const excludedNotMatch: string[] = [];
  let outsideTravel = 0;
  for (const t of trials) {
    const status = state.assessments[t.id]?.status ?? 'not_assessed';
    if (status === 'not_match') {
      excludedNotMatch.push(t.id);
      continue;
    }
    for (const s of t.sites) {
      if (t.id === args.trialId && (args.siteId === undefined || s.id === args.siteId)) continue;
      if (!siteOpen(state, t, s)) continue;
      const d = milesFromCity(homeCity, s);
      if (d === null) continue;
      if (d > travelLimitMiles) {
        outsideTravel += 1;
        continue;
      }
      options.push({
        trialId: t.id,
        acronym: t.acronym,
        siteId: s.id,
        facility: s.facility,
        city: s.city,
        distanceMiles: d,
        sameTrial: t.id === args.trialId,
        trialStatus: status,
        availability: s.availability,
      });
    }
  }
  options.sort((a, b) => Number(b.sameTrial) - Number(a.sameTrial) || RANK[a.trialStatus] - RANK[b.trialStatus] || a.distanceMiles - b.distanceMiles);
  return {
    reason: args.reason,
    keptProfile: true,
    patientVersion: state.version,
    homeCity,
    travelLimitMiles,
    options,
    outsideTravel,
    excludedNotMatch,
    note: 'Straight-line distance from approximate city centroids. Site availability is simulated. Travel preference filters options; it never changes eligibility.',
  };
}
