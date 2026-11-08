// npm test. The chat agent chooses actions with propose_action, which never acts: it only returns a proposal for the
// page to show as a confirm card. Gemini is stubbed; nothing here calls Google.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { askAgent, AGENT_TOOLS, ACTIONS } from '../lib/agent.js';

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
const call = (args, id) => ({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { id, name: 'propose_action', args }, thoughtSignature: 'sig' }] }, finishReason: 'STOP' }] });

beforeEach(() => {
  for (const k of ['MEDGEMMA_VERTEX_BASE_URL', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'MEDGEMMA_BASE_URL', 'GEMINI_MODEL']) delete process.env[k];
  process.env.GEMINI_API_KEY = 'test-key';
});
afterEach(() => { globalThis.fetch = realFetch; delete process.env.GEMINI_API_KEY; });

test('the agent offers propose_action as a tool with a fixed list of actions', () => {
  const t = AGENT_TOOLS.find((x) => x.name === 'propose_action');
  assert.ok(t);
  assert.deepEqual(t.parameters.properties.action.enum, ACTIONS);
});

test('a proposal comes back for the page to confirm, and the model is told it is not done', async () => {
  geminiReplies([call({ action: 'apply', trial: 'lt 311' }, 'c1'), say('I can apply to LT-311 for you. Tap Apply to confirm.')]);
  const a = await askAgent('Context (JSON): {"role":"patient"}\n\nQuestion: please sign me up for the HER3 one');
  assert.deepEqual(a.actions, [{ action: 'apply', trial: 'LT-311' }]);
  assert.match(a.steps[0].label, /^Offered to apply to LT-311/);
  const back = bodies[1].contents.at(-1).parts[0].functionResponse;
  assert.equal(back.name, 'propose_action');
  assert.equal(back.response.shown_to_person, true);
  assert.match(back.response.note, /Do not say it is done/);
});

test('bad proposals are refused with a reason and nothing is proposed', async () => {
  geminiReplies([call({ action: 'delete_record' }, 'c1'), call({ action: 'apply', trial: 'the brain one' }, 'c2'), say('Which trial do you mean?')]);
  const a = await askAgent('Question: do something');
  assert.deepEqual(a.actions, []);
  assert.equal(a.steps.length, 2);
  assert.ok(a.steps.every((s) => !s.ok));
  assert.match(bodies[1].contents.at(-1).parts[0].functionResponse.response.error, /Unknown action/);
  assert.match(bodies[2].contents.at(-1).parts[0].functionResponse.response.error, /trial code/);
});

test('travel, brain scan and pre-check proposals are checked and normalised', async () => {
  for (const [args, want] of [
    [{ action: 'set_travel', miles: 0 }, { action: 'set_travel', miles: 0 }],
    [{ action: 'add_brain_scan', brain_scan: 'no_spread' }, { action: 'add_brain_scan', brain_scan: 'no_spread' }],
    [{ action: 'precheck_live_trial', nct: 'nct07185997' }, { action: 'precheck_live_trial', nct: 'NCT07185997' }]
  ]) {
    geminiReplies([call(args, 'c1'), say('Tap to confirm.')]);
    const a = await askAgent('Question: x');
    assert.deepEqual(a.actions, [want]);
  }
});
