// GET /api/status: which connectors are live. The app reads this once on load and falls back for anything missing.
import { route, send } from '../lib/http.js';
import { medgemmaLabel } from '../lib/medgemma.js';
import { redisConfigured } from '../lib/redis.js';
import { fhirConfig } from '../lib/fhir.js';

export default route(['GET'], async (req, res) => {
  const mg = medgemmaLabel();
  const fhir = fhirConfig();
  send(res, 200, {
    medgemma: mg ? { on: true, provider: mg.provider, model: mg.model } : { on: false },
    store: { on: redisConfigured() },
    fhir: fhir ? { on: true, server: new URL(fhir.base).host, demoPatient: fhir.demoPatient || null } : { on: false },
    registry: { on: true, name: 'ClinicalTrials.gov' }
  }, 'public, max-age=0, s-maxage=30');
});
