// The pitch demo in one command: the whole site, with every agent that reads patient text (Records Reader, trial
// pre-check, chat, the team's Analyst) on MedGemma running on this laptop through Ollama. Patient text never leaves
// the laptop. The outside calls are public: ClinicalTrials.gov, Europe PMC, openFDA, the synthetic FHIR test server,
// and, when .env.local has a GEMINI_API_KEY, the team's online Researcher, which only ever receives public search words.
// DEMO_OFFLINE=1 turns the Researcher's Gemini off too (it then searches PubMed without a summary).
//
//   npm run demo            then open http://localhost:8768/app/
//
// Needs Ollama with MedGemma:  ollama pull medgemma1.5:4b
// It adds a local model "medgemma-demo" (the same weights, with room for the longer pre-check prompts).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const OLLAMA = 'http://127.0.0.1:11434';
const readEnv = () => { try { return fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local'), 'utf8'); } catch { return ''; } };
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
// MedGemma always wins over Gemini for anything that reads patient text (lib/medgemma.js). A Gemini key stays only for
// the Researcher, which gets public words, never the record.
if (process.env.DEMO_OFFLINE === '1') process.env.GEMINI_API_KEY = '';
// On the laptop there's no 60 s function limit, so the trial pre-check gets room to think: a small model often needs it
process.env.MEDGEMMA_TIMEOUT_MS ||= '90000';
process.env.PRECHECK_MAX_TOKENS ||= '4500';
process.env.FHIR_BASE_URL ||= 'https://r4.smarthealthit.org';   // public test server of synthetic patients
process.env.FHIR_DEMO_PATIENT_ID ||= '1a96f2e7-7ce0-4164-b3f6-4fdffeca00fb';
process.argv.push('--port', port);
console.log('MedGemma (' + model + ') on this laptop reads patient text. Open http://localhost:' + port + '/app/');
console.log(process.env.GEMINI_API_KEY || /GEMINI_API_KEY=./.test(readEnv()) ? 'Researcher: Gemini online, public search words only (DEMO_OFFLINE=1 to turn it off).' : 'Researcher: PubMed search only (no GEMINI_API_KEY).');
await import('./dev.mjs');
