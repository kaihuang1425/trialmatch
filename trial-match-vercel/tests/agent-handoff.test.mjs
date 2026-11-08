// npm test. The chat agent hands questions to the app's teams with hand_to_team: the research team (Researcher online,
// Analyst where the record is) or Find and check. A good hand-off ends the agent's loop at once and comes back for the
// page to run; a bad one is refused with a reason. Gemini is stubbed; nothing here calls Google.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { askAgent, AGENT_TOOLS, AGENT_SYSTEM, TEAMS, ASPECTS } from '../lib/agent.js';

const realFetch = globalThis.fetch;
let bodies;
function geminiReplies(replies) {
  bodies = [];
  let i = 0;
  globalThis.fetch = async (url, opts = {}) => {
    if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) throw new Error('unexpected fetch ' + url);
    bodies.push(JSON.parse(opts.body));
    const json = replies[Math.min(i++, replies.length - 1)];
    return { ok: true, status: 200, text: async () => JSON.stringify(json) };
  };
}
const say = (text) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }], modelVersion: 'gemini-3.8-flash' });
const calls = (...cs) => ({ candidates: [{ content: { role: 'model', parts: cs.map(([name, args], i) => ({ functionCall: { id: 'c' + i, name, args }, ...(i ? {} : { thoughtSignature: 'sig' }) })) }, finishReason: 'STOP' }], modelVersion: 'gemini-3.8-flash' });
const hand = (args) => calls(['hand_to_team', args]);

beforeEach(() => {
  for (const k of ['MEDGEMMA_VERTEX_BASE_URL', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'MEDGEMMA_BASE_URL', 'GEMINI_MODEL']) delete process.env[k];
  process.env.GEMINI_API_KEY = 'test-key';
});
afterEach(() => { globalThis.fetch = realFetch; delete process.env.GEMINI_API_KEY; });

test('hand_to_team is offered with a fixed list of teams and kinds of question, and the instructions say when to use it', () => {
  const t = AGENT_TOOLS.find((x) => x.name === 'hand_to_team');
  assert.ok(t);
  assert.deepEqual(t.parameters.properties.team.enum, TEAMS);
  assert.deepEqual(t.parameters.properties.aspect.enum, ASPECTS);
  assert.match(AGENT_SYSTEM, /hand_to_team/);
  assert.match(AGENT_SYSTEM, /find_and_check" \(patients only\)/);
});

test('a research hand-off comes back for the page at once, normalised, with no second model call', async () => {
  geminiReplies([hand({ team: 'research', aspect: 'side_effects', terms: ['Sotorasib', '  KRAS G12C '], trial: 'lt 311' }), say('should not be asked')]);
  const a = await askAgent('Context (JSON): {"role":"patient"}\n\nQuestion: will the tablet in LT-311 make me tired?');
  assert.deepEqual(a.handoff, { team: 'research', aspect: 'side_effects', terms: ['Sotorasib', 'KRAS G12C'], trial: 'LT-311' });
  assert.equal(bodies.length, 1);
  assert.equal(a.steps.length, 1);
  assert.equal(a.steps[0].tool, 'hand_to_team');
  assert.match(a.steps[0].label, /^Handed it to the research team/);
  assert.deepEqual(a.actions, []);
  assert.deepEqual(a.sources, []);
});

test('a find-and-check hand-off carries only the team', async () => {
  geminiReplies([hand({ team: 'find_and_check', terms: ['ignored'], trial: 'LT-301' })]);
  const a = await askAgent('Question: can you go and find trials that would take me?');
  assert.deepEqual(a.handoff, { team: 'find_and_check' });
  assert.match(a.steps[0].label, /^Handed it to Find and check/);
});

test('an unknown kind of question becomes an overview, and an NCT ID is enough to research', async () => {
  geminiReplies([hand({ team: 'research', aspect: 'prognosis', nct: 'nct07185997' })]);
  const a = await askAgent('Question: what is NCT07185997 testing?');
  assert.deepEqual(a.handoff, { team: 'research', aspect: 'overview', nct: 'NCT07185997' });
});

test('a hand-off with nothing to research, or to a team that does not exist, is refused and the agent answers itself', async () => {
  geminiReplies([hand({ team: 'research', aspect: 'evidence' }), hand({ team: 'billing' }), say('Which drug do you mean?')]);
  const a = await askAgent('Question: what does the research say?');
  assert.equal(a.handoff, undefined);
  assert.equal(a.text, 'Which drug do you mean?');
  assert.equal(a.steps.length, 2);
  assert.ok(a.steps.every((s) => !s.ok));
  assert.match(bodies[1].contents.at(-1).parts[0].functionResponse.response.error, /Say what to research/);
  assert.match(bodies[2].contents.at(-1).parts[0].functionResponse.response.error, /Unknown team/);
});

test('a good hand-off wins over lookups asked for in the same turn, which are not run', async () => {
  let ctgov = 0;
  geminiReplies([calls(['search_live_trials', { keyword: 'KRAS G12C' }], ['hand_to_team', { team: 'find_and_check' }])]);
  const stub = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { if (String(url).includes('clinicaltrials.gov')) { ctgov++; throw new Error('should not search'); } return stub(url, opts); };
  const a = await askAgent('Question: find me trials');
  assert.deepEqual(a.handoff, { team: 'find_and_check' });
  assert.equal(ctgov, 0);
  assert.equal(a.steps.length, 1);
});

test('terms are cut to plain words and at most four, so the page’s privacy guard gets a short hint', async () => {
  geminiReplies([hand({ team: 'research', terms: ['osimertinib<script>', 'a', 'b', 'c', 'd', 'osimertinib<script>'] })]);
  const a = await askAgent('Question: tell me about osimertinib');
  assert.deepEqual(a.handoff.terms, ['osimertinib script', 'a', 'b', 'c']);
});
