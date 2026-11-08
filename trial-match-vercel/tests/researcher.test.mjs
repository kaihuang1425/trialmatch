// npm test. The chat's team: the online Researcher gets public words only, every sentence of its brief must cite a
// source it read, and the Analyst never runs on a cloud model. Stubbed network: nothing here calls Google, Europe PMC,
// openFDA or a model.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkBrief, looksPersonal, research, researchRequest } from '../lib/researcher.js';
import { analystClean, analystPrompt, analystSystem } from '../lib/analyst.js';
import analyst from '../api/agents/analyst.js';

const realFetch = globalThis.fetch;
let calls;
function stub(routes) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const body = opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : null;
    calls.push({ url: String(url), body });
    const r = routes.find(([m]) => m(String(url), body, calls));
    if (!r) throw new Error('unexpected fetch ' + url);
    const json = r[1](String(url), body, calls);
    return { ok: true, status: 200, text: async () => JSON.stringify(json) };
  };
}
const isGemini = (u) => u.startsWith('https://generativelanguage.googleapis.com/');
const isEpmc = (u) => u.startsWith('https://www.ebi.ac.uk/europepmc/');
const isFda = (u) => u.startsWith('https://api.fda.gov/');
const reply = (parts) => ({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }], modelVersion: 'gemini-3.8-flash' });

beforeEach(() => {
  for (const k of ['MEDGEMMA_VERTEX_BASE_URL', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'MEDGEMMA_BASE_URL', 'GEMINI_MODEL']) delete process.env[k];
  process.env.GEMINI_API_KEY = 'test-key';
});
afterEach(() => { globalThis.fetch = realFetch; delete process.env.GEMINI_API_KEY; });

test('the request that goes online keeps public words and drops anything that looks personal', () => {
  const r = researchRequest({ aspect: 'compare', about: ['sotorasib', 'KRAS G12C', 'my scan from 2026-03-01', '64 years old'], compare: ['docetaxel', 'Mrs Patel'], nct: 'nct01234567' });
  assert.deepEqual(r, { aspect: 'compare', about: ['sotorasib', 'KRAS G12C'], compare: ['docetaxel'], nct: 'NCT01234567', dropped: 3 });
  assert.equal(researchRequest({ aspect: 'nonsense', about: ['osimertinib'] }).aspect, 'overview');
  assert.throws(() => researchRequest({ about: ['I\'m 64'] }), /Say what to look up/);
  assert.equal(looksPersonal('stage IV EGFR exon 19 deletion'), false);
  assert.equal(looksPersonal('phase I trial of NCT01234567'), false);
  assert.equal(looksPersonal('patient PT-0042'), true);
});

test('a brief keeps only sentences that cite a source the Researcher read', () => {
  const sources = [{ n: 1 }, { n: 2 }];
  const { brief, dropped } = checkBrief({
    drug: 'sotorasib', kind: '**KRAS G12C** inhibitor',
    sentences: [{ text: 'It targets KRAS G12C [1].', sources: [1, 1] }, { text: 'Made-up claim.', sources: [7] }, { text: 'Uncited.', sources: [] }, { text: 'Fewer side effects.', sources: [2, 9] }],
    studied_in: 'previously treated stage IV NSCLC', open_questions: ['Long-term survival']
  }, sources);
  assert.equal(dropped, 2);
  assert.deepEqual(brief.sentences, [{ text: 'It targets KRAS G12C.', sources: [1] }, { text: 'Fewer side effects.', sources: [2] }]);
  assert.equal(brief.kind, 'KRAS G12C inhibitor');
  assert.deepEqual(brief.open_questions, ['Long-term survival']);
});

test('the Researcher looks things up with tools, streams its steps and returns a cited brief', async () => {
  let gem = 0;
  stub([
    [isGemini, (u, body) => {
      gem++;
      if (gem === 1) {
        assert.equal(body.toolConfig.functionCallingConfig.mode, 'ANY');   // the first turn must look something up
        const ask = body.contents[0].parts[0].text;
        assert.match(ask, /About: sotorasib/);
        assert.match(ask, /Compare with: docetaxel/);
        assert.doesNotMatch(ask, /\d{2} years|record:/i);
        return reply([
          { functionCall: { id: 'a', name: 'search_pubmed', args: { query: 'sotorasib docetaxel' } }, thoughtSignature: 'sig-1' },
          { functionCall: { id: 'b', name: 'get_drug_label', args: { drug: 'sotorasib' } } }
        ]);
      }
      if (gem === 2) {   // the tool results come back numbered, and the thought signature goes back unchanged
        assert.equal(body.contents[1].parts[0].thoughtSignature, 'sig-1');
        const out = body.contents[2].parts.map((p) => p.functionResponse.response);
        assert.equal(out[0].papers[0].source, 1);
        assert.equal(out[1].source, 3);
        return reply([{ text: 'I have enough.' }]);
      }
      assert.equal(body.toolConfig.functionCallingConfig.mode, 'NONE');
      assert.ok(body.generationConfig.responseJsonSchema);
      return reply([{ text: JSON.stringify({ drug: 'sotorasib', kind: 'KRAS G12C inhibitor', studied_in: 'previously treated KRAS G12C NSCLC',
        sentences: [{ text: 'Sotorasib improved progression-free survival over docetaxel.', sources: [1] }, { text: 'It is approved after earlier treatment.', sources: [3] }, { text: 'Invented.', sources: [12] }] }) }]);
    }],
    [isEpmc, () => ({ hitCount: 214, resultList: { result: [
      { id: '1', source: 'MED', pmid: '111', title: 'Sotorasib versus docetaxel (CodeBreaK 200)', pubYear: '2023', abstractText: 'Phase 3.' },
      { id: '2', source: 'PPR', title: 'KRAS&lt;sup&gt;G12C&lt;/sup&gt; resistance', pubYear: '2025', abstractText: 'Preprint.' }
    ] } })],
    [isFda, () => ({ results: [{ openfda: { brand_name: ['LUMAKRAS'], generic_name: ['SOTORASIB'] }, indications_and_usage: ['1 INDICATIONS AND USAGE LUMAKRAS is indicated for KRAS G12C NSCLC.'],
      mechanism_of_action: ['12.1 Mechanism of Action Sotorasib inhibits KRAS G12C.'], adverse_reactions: ['The most common adverse reactions (≥ 20%) are diarrhea and fatigue. Other text.'], effective_time: '20250101' }] })]
  ]);
  const seen = [];
  const out = await research(researchRequest({ aspect: 'compare', about: ['sotorasib'], compare: ['docetaxel'] }), { onStep: (s) => seen.push(s.state + ' ' + s.label) });
  assert.equal(gem, 3);
  assert.equal(out.agentic, true);
  assert.deepEqual(out.brief.sentences.map((s) => s.sources), [[1], [3]]);
  assert.deepEqual(out.sources.map((s) => s.kind), ['paper', 'paper', 'label']);
  assert.equal(out.sources[1].title, 'KRAS G12C resistance');
  assert.equal(out.sources[1].preprint, true);
  assert.ok(seen.includes('run Searching PubMed for “sotorasib docetaxel”'));
  assert.ok(seen.some((l) => /^ok Searched PubMed .*214 papers/.test(l)));
  assert.ok(seen.some((l) => /^ok Read the FDA label for LUMAKRAS/.test(l)));
  assert.ok(seen.some((l) => /^ok Checked the citations: 2 sentences kept, 1 dropped/.test(l)));
  const pubmed = new URL(calls.find((c) => isEpmc(c.url)).url).searchParams.get('query');
  assert.match(pubmed, /^\(sotorasib docetaxel\) AND \("lung cancer"/);
});

test('the Analyst prompt carries the brief, its sources and the record', () => {
  const p = analystPrompt('How does it compare?', { drug: 'sotorasib', kind: 'KRAS G12C inhibitor', sentences: [{ text: 'Better PFS.', sources: [1] }], studied_in: 'treated NSCLC' },
    [{ n: 1, title: 'CodeBreaK 200' }], { role: 'patient', patient: { tests: 'KRAS G12C' } });
  assert.match(p, /Brief from the Researcher \(public sources\) about sotorasib \(KRAS G12C inhibitor\):\n- Better PFS\. \[1\]/);
  assert.match(p, /Studied in: treated NSCLC/);
  assert.match(p, /\[1\] CodeBreaK 200/);
  assert.match(p, /"tests":"KRAS G12C"/);
});

test('the Analyst’s answer keeps each sentence once, drops eligibility claims and stops at its length', () => {
  const loop = 'Who was studied: people treated with osimertinib [1].\nWhat fits: You have an EGFR exon 19 deletion. The patient is eligible for LT-301. ' +
    'You have an EGFR exon 19 deletion. You meet all the entry criteria. Only the trial team decides if you are eligible.\nWorth asking: when your last scan was.';
  const c = analystClean(loop);
  assert.equal(c.claims, 2);
  assert.equal(c.text, 'Who was studied: people treated with osimertinib [1].\nWhat fits: You have an EGFR exon 19 deletion. Only the trial team decides if you are eligible.\nWorth asking: when your last scan was.');
  assert.ok(analystClean(Array.from({ length: 60 }, (_, i) => 'Sentence number ' + i + ' says a few things.').join(' '), 40).words <= 40);
  assert.equal(analystClean('Dear Patient,\nWho was studied: adults with KRAS G12C. What fits: your record shows EGFR.').text,
    'Who was studied: adults with KRAS G12C.\nWhat fits: your record shows EGFR.');
  assert.match(analystSystem(false), /three lines:\nWho was studied/);
  assert.match(analystSystem(true), /What it means for your applicants/);
});

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b || ''; } };
  return res;
}
test('the Analyst endpoint refuses to send a record to a cloud model', async () => {
  stub([]);   // any network call would fail the test
  const res = fakeRes();
  await analyst({ method: 'POST', headers: {}, body: { question: 'q', brief: { sentences: [{ text: 'x', sources: [1] }] }, context: { patient: {} } } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(JSON.parse(res.body).error, 'record_stays_local');
  assert.equal(calls.length, 0);
});
