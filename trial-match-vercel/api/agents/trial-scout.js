// GET /api/agents/trial-scout  ->  recruiting phase III NSCLC trials with UK sites, live from ClinicalTrials.gov.
// Cached at the edge for an hour so the registry is not hit on every page view.
import { route, send } from '../../lib/http.js';
import { searchTrials } from '../../lib/ctgov.js';

export default route(['GET'], async (req, res) => {
  const out = await searchTrials({});
  send(res, 200, { ...out, source: 'ClinicalTrials.gov', fetchedAt: new Date().toISOString() },
    'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
});
