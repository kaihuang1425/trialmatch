// GET /api/agents/trial-scout[?term=EGFR exon 19]  ->  recruiting phase III NSCLC trials with UK sites, live from ClinicalTrials.gov.
// `term` narrows the search (a gene change, a drug); the patient's agent uses it to look for trials beyond the demo set.
// Cached at the edge for an hour so the registry is not hit on every page view.
import { query, route, send } from '../../lib/http.js';
import { searchTrials } from '../../lib/ctgov.js';

export default route(['GET'], async (req, res) => {
  const term = String(query(req).term || '').replace(/[^\p{L}\p{N} .,'()+\-/]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const out = await searchTrials(term ? { term } : {});
  send(res, 200, { ...out, source: 'ClinicalTrials.gov', fetchedAt: new Date().toISOString() },
    'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
});
