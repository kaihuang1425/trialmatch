// npm test. The Gemini path with a stubbed network: structured output, the chat agent's tool loop and thought
// signatures. Nothing here calls Google or ClinicalTrials.gov.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { chat, medgemmaLabel } from '../lib/medgemma.js';
import { readRecord } from '../lib/records.js';
import { askAgent, plainText } from '../lib/agent.js';
import { claimsEligibility } from '../api/agents/ask.js';

const realFetch = globalThis.fetch;
let calls;
// routes: list of [match(url) -> bool, reply(url, body) -> json]
function stub(routes) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url: String(url), headers: opts.headers || {}, body });
    const r = routes.find(([m]) => m(String(url), body));
    if (!r) throw new Error('unexpected fetch ' + url);
    const json = r[1](String(url), body);
    return { ok: true, status: 200, text: async () => JSON.stringify(json) };
  };
}
const isGemini = (u) => u.startsWith('https://generativelanguage.googleapis.com/v1beta/models/');
const isCtgov = (u) => u.startsWith('https://clinicaltrials.gov/api/v2/studies');
const answer = (text) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }], modelVersion: 'gemini-3.8-flash' });
const toolCall = (name, args, id, sig) => ({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { id, name, args }, thoughtSignature: sig }] }, finishReason: 'STOP' }] });

const STUDY = {
  protocolSection: {
    identificationModule: { nctId: 'NCT07185997', briefTitle: 'A KRAS G12C trial' },
    designModule: { phases: ['PHASE3'] },
    statusModule: { overallStatus: 'RECRUITING' },
    sponsorCollaboratorsModule: { leadSponsor: { name: 'Sponsor Ltd' } },
    armsInterventionsModule: { interventions: [{ type: 'DRUG', name: 'Drug A' }] },
    contactsLocationsModule: { locations: [{ facility: 'The Christie', city: 'Manchester', country: 'United Kingdom', status: 'RECRUITING' }] },
    descriptionModule: { briefSummary: 'Tests drug A.' }
  }
};

beforeEach(() => {
  for (const k of ['MEDGEMMA_VERTEX_BASE_URL', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'MEDGEMMA_BASE_URL', 'GEMINI_MODEL']) delete process.env[k];
  process.env.GEMINI_API_KEY = 'test-key';
});
afterEach(() => { globalThis.fetch = realFetch; delete process.env.GEMINI_API_KEY; });

test('chat calls Gemini natively with the schema, the system instruction and low thinking', async () => {
  stub([[isGemini, () => answer('{"ok":true}')]]);
  const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
  const r = await chat({ system: 'Be brief.', user: 'Hello', maxTokens: 100, schema });
  assert.equal(r.text, '{"ok":true}');
  assert.equal(r.family, 'Gemini');
  const c = calls[0];
  assert.equal(c.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal(c.headers['x-goog-api-key'], 'test-key');
  assert.deepEqual(c.body.systemInstruction, { parts: [{ text: 'Be brief.' }] });
  assert.deepEqual(c.body.contents, [{ role: 'user', parts: [{ text: 'Hello' }] }]);
  assert.equal(c.body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(c.body.generationConfig.responseJsonSchema, schema);
  assert.deepEqual(c.body.generationConfig.thinkingConfig, { thinkingLevel: 'LOW' });
  assert.equal(c.body.generationConfig.maxOutputTokens, 100 + 2048);
  assert.equal('temperature' in c.body.generationConfig, false);
});

test('MedGemma still wins when both are set, and the label says which model answers', async () => {
  process.env.MEDGEMMA_BASE_URL = 'http://127.0.0.1:1/v1';
  assert.equal(medgemmaLabel().family, 'MedGemma');
  assert.equal(medgemmaLabel().agent, undefined);
  delete process.env.MEDGEMMA_BASE_URL;
  assert.deepEqual(medgemmaLabel(), { provider: 'Gemini API (Google cloud)', model: 'gemini-3.8-flash', family: 'Gemini', cloud: true, agent: true });
});

test('Records Reader on Gemini: text values become typed facts, and the Skeptic still drops invented quotes', async () => {
  const letter = 'Stage IV adenocarcinoma. PD-L1 TPS 10%. ECOG performance status 1.';
  stub([[isGemini, () => answer(JSON.stringify({ facts: [
    { key: 'pdl1', value: '10', quote: 'PD-L1 TPS 10%' },
    { key: 'ecog', value: '1', quote: 'ECOG performance status 1' },
    { key: 'kras', value: 'G12C', quote: 'KRAS G12C detected' }
  ] }))]]);
  const r = await readRecord(letter, 'a clinic letter');
  assert.deepEqual(r.facts, { pdl1: 10, ecog: 1 });
  assert.equal(r.rejected.length, 1);
  assert.ok(calls[0].body.generationConfig.responseJsonSchema.properties.facts);
});

test('agent: looks up live trials, passes the thought signature back and names only trials it saw', async () => {
  let turn = 0;
  stub([
    [isCtgov, () => ({ totalCount: 1, studies: [STUDY] })],
    [isGemini, () => (++turn === 1
      ? toolCall('search_live_trials', { keyword: 'KRAS G12C', city: 'Manchester' }, 'call-1', 'sig-A')
      : answer('NCT07185997 recruits in Manchester. Also see NCT01234567. The trial team decides who can join.'))]
  ]);
  const r = await askAgent('Context (JSON):\n{}\n\nQuestion: Any KRAS trials near Manchester?');

  const search = calls.find((c) => isCtgov(c.url));
  assert.match(search.url, /query\.term=KRAS\+G12C/);
  const second = calls.filter((c) => isGemini(c.url))[1].body;
  assert.equal(second.contents.length, 3);
  assert.deepEqual(second.contents[1], { role: 'model', parts: [{ functionCall: { id: 'call-1', name: 'search_live_trials', args: { keyword: 'KRAS G12C', city: 'Manchester' } }, thoughtSignature: 'sig-A' }] });
  const fr = second.contents[2].parts[0].functionResponse;
  assert.equal(fr.id, 'call-1');
  assert.equal(fr.name, 'search_live_trials');
  assert.equal(fr.response.trials[0].nct, 'NCT07185997');
  assert.deepEqual(fr.response.trials[0].uk_cities, ['Manchester']);
  assert.equal(second.tools[0].functionDeclarations.length, 4);   // two lookups, propose_action and hand_to_team

  assert.deepEqual(r.sources, [{ nct: 'NCT07185997', title: 'A KRAS G12C trial', url: 'https://clinicaltrials.gov/study/NCT07185997' }]);
  assert.match(r.text, /NCT01234567 wasn’t in what I looked up/);
  assert.equal(r.steps.length, 1);
  assert.equal(r.steps[0].label, 'Searched ClinicalTrials.gov for “KRAS G12C” near Manchester: 1 trial');
});

test('agent: stops looking things up and must answer on its last turn', async () => {
  let turn = 0;
  stub([
    [isCtgov, () => ({ totalCount: 1, studies: [STUDY] })],
    [isGemini, (u, body) => (body.toolConfig.functionCallingConfig.mode === 'NONE' ? answer('Done.') : toolCall('search_live_trials', {}, 'c' + (++turn), 'sig-' + turn))]
  ]);
  const r = await askAgent('Question: keep searching');
  const modes = calls.filter((c) => isGemini(c.url)).map((c) => c.body.toolConfig.functionCallingConfig.mode);
  assert.deepEqual(modes, ['AUTO', 'AUTO', 'AUTO', 'NONE']);
  assert.equal(r.text, 'Done.');
  assert.equal(r.steps.length, 3);
});

test('plainText turns the Markdown Gemini sometimes writes into plain chat text', () => {
  assert.equal(plainText('## Trials\n\n* **NCT07100080**: tests a drug.\n- NCT07155187 (2 * 3)\n\n\n\nAsk the team.'),
    'Trials\n\n• NCT07100080: tests a drug.\n• NCT07155187 (2 * 3)\n\nAsk the team.');
});

test('the eligibility guard catches claims but not the disclaimer', () => {
  assert.equal(claimsEligibility('You are eligible for LT-301.'), true);
  assert.equal(claimsEligibility('She is likely eligible, and you qualify too.'), true);
  assert.equal(claimsEligibility('Only the trial teams can confirm if you are eligible to take part.'), false);
  assert.equal(claimsEligibility('The team will check whether you qualify.'), false);
  assert.equal(claimsEligibility('Only the team can say whether you are eligible, but you are eligible for LT-301.'), true);
});

test('agent: a failed lookup is reported to the model and shown as a failed step', async () => {
  let turn = 0;
  stub([[isGemini, () => (++turn === 1 ? toolCall('get_live_trial', { nct: 'not-an-id' }, 'x1', 'sig') : answer('I could not find that trial.'))]]);
  const r = await askAgent('Question: tell me about trial not-an-id');
  assert.equal(r.steps[0].ok, false);
  const fr = calls[1].body.contents[2].parts[0].functionResponse;
  assert.match(fr.response.error, /ClinicalTrials\.gov ID/);
});
