// GET /api/status: which connectors are live. The app reads this once on load and falls back for anything missing.
import { route, send } from '../lib/http.js';
import { medgemmaConfig, medgemmaLabel } from '../lib/medgemma.js';
import { geminiConfig } from '../lib/gemini.js';
import { redisConfigured } from '../lib/redis.js';
import { fhirConfig } from '../lib/fhir.js';

export default route(['GET'], async (req, res) => {
  const mg = medgemmaLabel();
  const fhir = fhirConfig();
  const g = geminiConfig(), c = medgemmaConfig();
  send(res, 200, {
    // "medgemma" is the site's model slot; family says which model fills it (MedGemma, or Gemini standing in)
    // agent: the chat can look up live trials itself (Gemini only)
    medgemma: mg ? { on: true, provider: mg.provider, model: mg.model, family: mg.family, cloud: mg.cloud, agent: !!mg.agent } : { on: false },
    store: { on: redisConfigured() },
    fhir: fhir ? { on: true, server: new URL(fhir.base).host, demoPatient: fhir.demoPatient || null } : { on: false },
    registry: { on: true, name: 'ClinicalTrials.gov' },
    // the chat's team. researcher: online, public words only (Gemini, or a plain PubMed search without a key).
    // analyst: MedGemma on this site's own server, which may read the record; never a cloud model.
    researcher: { on: true, family: g ? 'Gemini' : null, model: g ? g.model : null, agentic: !!g, sources: ['PubMed', 'FDA labels', 'ClinicalTrials.gov'] },
    analyst: c && c.provider !== 'gemini' ? { on: true, family: 'MedGemma', model: c.model || 'MedGemma' } : { on: false }
  }, 'public, max-age=0, s-maxage=30');
});
