// Plain-language explanation for the patient view. Cites the same facts as the coordinator view and
// never predicts outcomes, chances of enrolment or benefit.

import { siteOpen } from './alternatives';
import { milesFromCity } from './geo';
import { FACT_LABEL, formatValue } from './labels';
import type { RelayState, Trial } from './types';

export interface PatientExplanation {
  trialId: string;
  acronym: string;
  statusPlain: string;
  whatItTests: string;
  treatments: { group: string; description: string }[];
  whySuggested: { text: string; factIds: string[]; quote: string; docId: string }[];
  stillToCheck: { text: string; byStudyTeam: boolean }[];
  nearestSite?: { facility: string; city: string; distanceMiles: number; availabilitySimulated: true };
  source: { url: string; lastVerified: string };
  disclaimer: string;
}

const STATUS_PLAIN: Record<string, string> = {
  not_match: 'Your records show something this study does not accept.',
  needs_evidence: 'This study could fit, but some information is missing or out of date.',
  needs_review: 'This study could fit; a doctor needs to look at a few points.',
  ready: 'Your records match what this study lists so far; the study team would check the rest with you.',
};

export function explainForPatient(state: RelayState, trial: Trial): PatientExplanation {
  const a = state.assessments[trial.id];
  const results = a?.results ?? [];
  const byId = new Map(trial.criteria.map((c) => [c.id, c]));
  const why = results
    .filter((r) => r.state === 'supported' && r.evidence.length)
    .slice(0, 6)
    .map((r) => {
      const f = r.evidence[0];
      return {
        text: `${byId.get(r.criterionId)?.plain ?? r.criterionId} — your ${f.source.docId} says: ${FACT_LABEL[f.key]} ${formatValue(f.value, f.unit)}`,
        factIds: r.evidence.map((e) => e.id),
        quote: f.source.quote,
        docId: f.source.docId,
      };
    });
  const still = results
    .filter((r) => r.state === 'unknown' || r.state === 'needs_review')
    .map((r) => ({ text: byId.get(r.criterionId)?.plain ?? r.criterionId, byStudyTeam: !!r.atScreening }));
  const open = trial.sites
    .filter((s) => siteOpen(state, trial, s))
    .map((s) => ({ s, d: milesFromCity(state.preferences.homeCity, s) }))
    .filter((x): x is { s: (typeof trial.sites)[number]; d: number } => x.d !== null)
    .sort((x, y) => x.d - y.d)[0];
  return {
    trialId: trial.id,
    acronym: trial.acronym,
    statusPlain: STATUS_PLAIN[a?.status ?? 'needs_evidence'],
    whatItTests: trial.briefSummary.split(/(?<=\.)\s/)[0] ?? trial.briefTitle,
    treatments: trial.arms.map((x) => ({ group: x.label, description: x.description ?? x.interventionNames.join(', ') })),
    whySuggested: why,
    stillToCheck: still,
    ...(open ? { nearestSite: { facility: open.s.facility, city: open.s.city, distanceMiles: open.d, availabilitySimulated: true as const } } : {}),
    source: { url: trial.source.url, lastVerified: trial.snapshotDate },
    disclaimer: 'This is not a decision about whether you can join. The study team decides, using the full protocol, after talking with you.',
  };
}
