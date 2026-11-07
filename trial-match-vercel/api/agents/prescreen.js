// POST /api/agents/prescreen { nct, record, age, sex }  ->  { trial, rules: [{ rule, type, status, why }], model }
// MedGemma reads a live trial's eligibility criteria (fetched here from ClinicalTrials.gov, never taken from the browser)
// and checks them against the patient's recorded facts. It is a pre-check for people to confirm, not a decision.
import { HttpError, clientIp, readJson, route, send } from '../../lib/http.js';
import { rateLimit } from '../../lib/redis.js';
import { getTrial } from '../../lib/ctgov.js';
import { FIELDS, cleanRecord } from '../../lib/records.js';
import { chat, parseJson } from '../../lib/medgemma.js';

const STATUS = ['met', 'not', 'unknown'];
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

function describe(rec, age, sex) {
  const lines = [];
  if (Number.isInteger(age) && age >= 18 && age <= 110) lines.push('- Age: ' + age);
  if (sex === 'F' || sex === 'M') lines.push('- Sex: ' + (sex === 'F' ? 'female' : 'male'));
  Object.keys(FIELDS).forEach((k) => {
    if (k in rec) lines.push('- ' + NAMES[k] + ': ' + (rec[k] === true ? 'yes' : ((VALUES[k] || {})[rec[k]] || rec[k])));
    else if (FIELDS[k].type !== 'true') lines.push('- ' + NAMES[k] + ': NOT RECORDED');
  });
  const neverSaid = Object.keys(FIELDS).filter((k) => FIELDS[k].type === 'true' && !(k in rec)).map((k) => NAMES[k].toLowerCase());
  if (neverSaid.length) lines.push('- Not recorded either way: ' + neverSaid.join('; '));
  return lines.join('\n');
}

export default route(['POST'], async (req, res) => {
  const body = await readJson(req, 16 * 1024);
  const rec = cleanRecord(body.record || {});
  await rateLimit('agent:' + clientIp(req), 30, 600);
  const trial = await getTrial(String(body.nct || ''));
  if (!trial.criteria) throw new HttpError(404, 'no_criteria', 'This trial has no eligibility criteria on ClinicalTrials.gov.');

  const system =
    'You pre-screen lung cancer patients for clinical trials. A research nurse confirms every result, so be strict and honest.\n' +
    'From the eligibility criteria, pick the 6 to 14 rules that decide eligibility most (diagnosis, stage, gene changes, earlier treatment, fitness, brain metastases, organ function, key exclusions). Rewrite each as one short plain-English line.\n' +
    'For each rule set "status":\n' +
    '- "met" only if the recorded facts clearly satisfy it;\n' +
    '- "not" only if a recorded fact clearly breaks it;\n' +
    '- "unknown" if the facts needed are NOT RECORDED or do not settle it. Never assume a missing fact.\n' +
    '"why" names the recorded fact used, or what is missing (under 20 words). "type" is "inc" for inclusion and "exc" for exclusion.\n' +
    'Reply with JSON only: {"rules":[{"rule":"...","type":"inc","status":"met","why":"..."}]}';
  const user = 'Trial: ' + trial.title + ' (' + trial.nct + ')\n\nEligibility criteria:\n"""\n' + trial.criteria +
    '\n"""\n\nPatient facts on record:\n' + describe(rec, Number(body.age), body.sex);
  const r = await chat({ system, user, maxTokens: 1800 });
  const parsed = parseJson(r.text);
  const rules = (Array.isArray(parsed.rules) ? parsed.rules : []).slice(0, 16).map((x) => ({
    rule: clip(x && x.rule, 220),
    type: x && x.type === 'exc' ? 'exc' : 'inc',
    status: STATUS.includes(x && x.status) ? x.status : 'unknown',
    why: clip(x && x.why, 200)
  })).filter((x) => x.rule);
  if (!rules.length) throw new HttpError(502, 'medgemma_empty', 'MedGemma did not return any rules.');
  send(res, 200, {
    trial: { nct: trial.nct, title: trial.title, url: trial.url },
    rules,
    counts: { met: rules.filter((x) => x.status === 'met').length, not: rules.filter((x) => x.status === 'not').length, unknown: rules.filter((x) => x.status === 'unknown').length },
    model: r.model, provider: r.provider
  });
});
