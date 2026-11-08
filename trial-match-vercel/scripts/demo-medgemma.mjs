// The pitch demo in one command: the whole site, with every agent (Records Reader, trial pre-check, chat) on
// MedGemma running on this laptop through Ollama. Patient text never leaves the laptop; the only outside calls
// are the public ClinicalTrials.gov registry and the synthetic FHIR test server.
//
//   npm run demo            then open http://localhost:8768/app/
//
// Needs Ollama with MedGemma:  ollama pull medgemma1.5:4b
// It adds a local model "medgemma-demo" (the same weights, with room for the longer pre-check prompts).
const OLLAMA = 'http://127.0.0.1:11434';
const BASE = 'medgemma1.5:4b', DEMO = 'medgemma-demo';
const port = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '8768';

async function json(path, body) {
  const r = await fetch(OLLAMA + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error(path + ' answered ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return r.headers.get('content-type')?.includes('json') ? r.json() : r.text();
}

let model = BASE;
try {
  const tags = await json('/api/tags');
  const names = (tags.models || []).map((m) => m.name);
  if (!names.some((n) => n.startsWith(BASE))) {
    console.error('MedGemma isn\'t downloaded yet. Run:  ollama pull ' + BASE + '   (about 3.3 GB), then npm run demo again.');
    process.exit(1);
  }
  if (!names.some((n) => n.startsWith(DEMO))) {
    console.log('Making "' + DEMO + '": ' + BASE + ' with a 16k context, so the trial pre-check prompts fit.');
    await json('/api/create', { model: DEMO, from: BASE, parameters: { num_ctx: 16384 }, stream: false });
  }
  model = DEMO;
} catch (e) {
  if (/fetch failed|ECONNREFUSED/i.test(String(e && (e.cause || e.message)))) {
    console.error('Ollama isn\'t running. Start the Ollama app (or run: ollama serve), then npm run demo again.');
    process.exit(1);
  }
  console.warn('Couldn\'t set up ' + DEMO + ' (' + e.message + '). Using ' + BASE + ' as it is.');
}

process.env.MEDGEMMA_BASE_URL = OLLAMA + '/v1';
process.env.MEDGEMMA_MODEL = model;
process.env.MEDGEMMA_API_KEY = '';
process.env.MEDGEMMA_VERTEX_BASE_URL = '';
process.env.GEMINI_API_KEY = '';            // never the cloud in this mode, even if .env.local has a key
process.env.FHIR_BASE_URL ||= 'https://r4.smarthealthit.org';   // public test server of synthetic patients
process.env.FHIR_DEMO_PATIENT_ID ||= '1a96f2e7-7ce0-4164-b3f6-4fdffeca00fb';
process.argv.push('--port', port);
console.log('MedGemma (' + model + ') on this laptop. Open http://localhost:' + port + '/app/');
await import('./dev.mjs');
