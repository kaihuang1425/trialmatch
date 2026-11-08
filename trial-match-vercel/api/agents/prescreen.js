// POST /api/agents/prescreen { nct, record, age, sex, said }  ->  { trial, rules: [{ rule, type, status, why, needs }], model }
// MedGemma reads a live trial's eligibility criteria (fetched here from ClinicalTrials.gov, never taken from the browser)
// and checks them against the patient's recorded facts. It is a pre-check for people to confirm, not a decision.
// `said` holds answers the patient gave in the chat (a fact key and a value from a fixed set); they are marked as the
// patient's own until the care team confirms them. `needs` names the one fact that would settle an unknown rule, so the
// test-and-learn loop knows what to ask next.
import { HttpError, clientIp, readJson, route, send } from '../../lib/http.js';
import { rateLimit } from '../../lib/redis.js';
import { getTrial } from '../../lib/ctgov.js';
import { FIELDS, cleanRecord, cleanValue } from '../../lib/records.js';
import { chat, parseJson } from '../../lib/medgemma.js';

const STATUS = ['met', 'not', 'unknown'];
const NEEDS = [...Object.keys(FIELDS), 'other'];
// Gemini's reply must match this (structured output); MedGemma gets the same shape in the prompt.
export const RULES_SCHEMA = {
  type: 'object',
  properties: {
    rules: {
      type: 'array',
      maxItems: 16,
      items: {
        type: 'object',
        properties: {
          rule: { type: 'string' },
          type: { type: 'string', enum: ['inc', 'exc'] },
          status: { type: 'string', enum: STATUS },
          why: { type: 'string' },
          needs: { type: 'string', enum: NEEDS, description: 'For an unknown rule, the fact key that would settle it; otherwise other' }
        },
        required: ['rule', 'type', 'status', 'why', 'needs']
      }
    }
  },
  required: ['rules']
};
const clip = (s, n) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');

const NAMES = { histology: 'Tumour type', stage: 'Stage', egfr: 'EGFR', alk: 'ALK', ros1: 'ROS1', kras: 'KRAS', pdl1: 'PD-L1 TPS %',
  ecog: 'ECOG performance status', priorEGFR: 'Earlier EGFR tablet', priorALK: 'Earlier ALK tablet', priorChemo: 'Earlier chemotherapy',
  priorIO: 'Earlier immunotherapy', priorCRT: 'Earlier chemoradiotherapy', progressed: 'Cancer grew on latest treatment',
  lastTxWeeks: 'Weeks since last cancer treatment', brain: 'Brain metastases', anc: 'Neutrophils (x10^9/L)', plt: 'Platelets (x10^9/L)',
  crcl: 'Creatinine clearance (mL/min)', bili: 'Bilirubin (x upper limit of normal)', autoimmune: 'Autoimmune disease treated in last 2 years',
  ild: 'Interstitial lung disease or pneumonitis', infection: 'Infection being treated now' };
const VALUES = {
  histology: { adeno: 'adenocarcinoma', squamous: 'squamous cell carcinoma', sclc: 'small cell lung cancer' },
  stage: { IV: 'stage IV', III_unres: 'stage III, not operable', IIIA_res: 'stage IIIA, operable', early: 'stage I-II', es: 'extensive-stage small cell' },
  egfr: { neg: 'no EGFR mutation', ex19del: 'exon 19 deletion', L858R: 'L858R mutation', ex20ins: 'exon 20 insertion', other: 'another EGFR mutation' },
  alk: { neg: 'negative', pos: 'positive' }, ros1: { neg: 'negative', pos: 'positive' }, kras: { neg: 'no G12C mutation', G12C: 'G12C mutation' },
  brain: { none: 'none', treated_stable: 'treated and stable', untreated: 'present, not treated' }
};

// The patient's own answers: a known key and a value the app offers (yes/no for the "has had" facts). Anything else is dropped.
export function cleanSaid(said) {
  const out = {};
  if (!said || typeof said !== 'object') return out;
  Object.keys(FIELDS).forEach((k) => {
    if (!(k in said)) return;
    const v = said[k];
    if (FIELDS[k].type === 'true') { if (v === 'yes' || v === true) out[k] = 'yes'; else if (v === 'no' || v === false) out[k] = 'no'; return; }
    const c = cleanValue(k, v);
    if (c !== undefined) out[k] = c;
  });
  return out;
}

// One line per fact, with its key in brackets so the model can name the fact an unknown rule needs.
export function describe(rec, age, sex, said = {}) {
  const lines = [];
  const show = (k, v) => (v === true || v === 'yes' ? 'yes' : v === 'no' ? 'no' : ((VALUES[k] || {})[v] || v));
  if (Number.isInteger(age) && age >= 18 && age <= 110) lines.push('- Age: ' + age);
  if (sex === 'F' || sex === 'M') lines.push('- Sex: ' + (sex === 'F' ? 'female' : 'male'));
  Object.keys(FIELDS).forEach((k) => {
    const tag = NAMES[k] + ' [' + k + ']: ';
    if (k in said) lines.push('- ' + tag + show(k, said[k]) + ' (the patient said this in the chat; the care team has not confirmed it yet)');
    else if (k in rec) lines.push('- ' + tag + show(k, rec[k]));
    else if (FIELDS[k].type !== 'true') lines.push('- ' + tag + 'NOT RECORDED');
  });
  const neverSaid = Object.keys(FIELDS).filter((k) => FIELDS[k].type === 'true' && !(k in rec) && !(k in said)).map((k) => NAMES[k].toLowerCase() + ' [' + k + ']');
  if (neverSaid.length) lines.push('- Not recorded either way: ' + neverSaid.join('; '));
  return lines.join('\n');
}

// The model's rules, cleaned: known statuses only, and a `needs` key only where it can help (an unknown rule).
export function tidyRules(list) {
  return (Array.isArray(list) ? list : []).slice(0, 16).map((x) => {
    const status = STATUS.includes(x && x.status) ? x.status : 'unknown';
    return {
      rule: clip(x && x.rule, 220),
      type: x && x.type === 'exc' ? 'exc' : 'inc',
      status,
      why: clip(x && x.why, 200),
      needs: status === 'unknown' && x && FIELDS[x.needs] ? x.needs : 'other'
    };
  }).filter((x) => x.rule);
}

export default route(['POST'], async (req, res) => {
  const body = await readJson(req, 16 * 1024);
  const rec = cleanRecord(body.record || {}), said = cleanSaid(body.said);
  await rateLimit('agent:' + clientIp(req), 30, 600);
  const trial = await getTrial(String(body.nct || ''));
  if (!trial.criteria) throw new HttpError(404, 'no_criteria', 'This trial has no eligibility criteria on ClinicalTrials.gov.');

  const system =
    'You pre-screen lung cancer patients for clinical trials. A research nurse confirms every result, so be strict and honest.\n' +
    'From the eligibility criteria, pick the 6 to 10 rules that decide eligibility most (diagnosis, stage, gene changes, earlier treatment, fitness, brain metastases, organ function, key exclusions). Rewrite each as one short plain-English line.\n' +
    'For each rule set "status":\n' +
    '- "met" only if the recorded facts clearly satisfy it;\n' +
    '- "not" only if a recorded fact clearly breaks it;\n' +
    '- "unknown" if the facts needed are NOT RECORDED or do not settle it. Never assume a missing fact.\n' +
    'Facts the patient said in the chat count as recorded; when you use one, "why" starts with "You said".\n' +
    '"why" names the recorded fact used, or what is missing (under 20 words). "type" is "inc" for inclusion and "exc" for exclusion.\n' +
    '"needs": for an "unknown" rule, the one fact key in brackets below that would settle it; "other" if no listed fact would, or the rule is not unknown.\n' +
    'Reply with JSON only: {"rules":[{"rule":"...","type":"inc","status":"met","why":"...","needs":"other"}]}';
  const user = 'Trial: ' + trial.title + ' (' + trial.nct + ')\n\nEligibility criteria:\n"""\n' + trial.criteria.slice(0, 7000) +   // the deciding rules come first; a shorter prompt keeps MedGemma's thinking in budget
    '\n"""\n\nPatient facts on record (fact key in brackets):\n' + describe(rec, Number(body.age), body.sex, said);
  const r = await chat({ system, user, maxTokens: 3600, schema: RULES_SCHEMA });   // MedGemma 1.5 thinks before the JSON, inside this budget
  const parsed = parseJson(r.text);
  const rules = tidyRules(parsed.rules);
  if (!rules.length) throw new HttpError(502, 'medgemma_empty', (r.family || 'The model') + ' did not return any rules.');
  send(res, 200, {
    trial: { nct: trial.nct, title: trial.title, url: trial.url },
    rules,
    counts: { met: rules.filter((x) => x.status === 'met').length, not: rules.filter((x) => x.status === 'not').length, unknown: rules.filter((x) => x.status === 'unknown').length },
    model: r.model, provider: r.provider, family: r.family
  });
});
