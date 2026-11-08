// Offline test of the Trial Match matcher against a registry-search baseline, on synthetic patients.
//
//   npm run eval                      (defaults: 20 batches of 120 patients, seeds 2026 to 2045)
//   npm run eval -- --batches 50 --patients 200 --seed 7
//
// Writes eval/results.md, eval/results.json, and eval/pairs.csv and eval/cohort.json for the first batch.
// Everything here is synthetic. The numbers say how the matching step behaves on patients we made up.
// They are not real-world accuracy, enrolment or benefit.
//
// How it works, in short:
// 1. The matcher is read straight out of public/app/index.html (the deployed demo app), so this tests the code people use.
// 2. Each synthetic patient has a complete hidden "true" state, and a "record" made from it with gaps
//    (no recent brain scan, no PD-L1 result, no recent bloods, ...). The matcher only ever sees the record.
// 3. The ground-truth label for a pair is "every entry rule of the trial is met by the true state". The rules for
//    the labels are written here from each criterion's wording (see GOLD), separately from the app's rule code.
// 4. Registry search = what a ClinicalTrials.gov search filters on: condition, phase and recruiting status.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMatcher } from './matcher.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'eval');

/* ---------------- options ---------------- */
function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = Number(process.argv[i + 1]);
  if (!Number.isInteger(v) || v < 1) throw new Error(`--${name} needs a whole number above 0`);
  return v;
}
// Results are pooled over several batches so one lucky (or unlucky) batch can't set the headline;
// the spread between batches is reported next to it.
const BATCH = arg('patients', 120);
const SEED = arg('seed', 2026);
const N_BATCHES = arg('batches', 20);
const COMMAND = 'npm run eval' + (process.argv.length > 2 ? ' -- ' + process.argv.slice(2).join(' ') : '');

/* ---------------- 1. the deployed matcher ---------------- */
// loadMatcher() (scripts/matcher.mjs) reads the rules, the 19 trials and evaluate() out of public/app/index.html.

/* ---------------- 2. ground-truth rules, written from each criterion's wording ---------------- */
// Each entry matches a criterion's text and returns a test on the patient's complete true state.
// Thresholds are read from the text itself, so a code change that drifts from the wording shows up as a disagreement.
// If the app gains a criterion with new wording, the run stops and asks for a rule here.
const SENSITISING = ['ex19del', 'L858R'];
const nsclc = (t) => t.histology !== 'sclc';
const treatedAdvanced = (t) => t.priorChemo || t.priorIO || t.priorEGFR || t.priorALK;
const treatedAny = (t) => treatedAdvanced(t) || t.priorCRT;
const GOLD = [
  [/^Non-small cell lung cancer, stage IV$/, () => (t) => nsclc(t) && t.stage === 'IV'],
  [/^Non-small cell lung cancer, stage III not operable or stage IV$/, () => (t) => nsclc(t) && (t.stage === 'IV' || t.stage === 'III_unres')],
  [/^Non-small cell lung cancer, stage III not operable$/, () => (t) => nsclc(t) && t.stage === 'III_unres'],
  [/^Non-small cell lung cancer, stage II–IIIA, operable$/, () => (t) => nsclc(t) && (t.stage === 'early' || t.stage === 'IIIA_res')],
  // Stage IV small cell lung cancer is always extensive stage.
  [/^Small cell lung cancer, extensive stage$/, () => (t) => t.histology === 'sclc' && (t.stage === 'es' || t.stage === 'IV')],
  [/^EGFR exon 19 deletion or L858R$/, () => (t) => SENSITISING.includes(t.egfr)],
  [/^ALK-positive$/, () => (t) => t.alk === 'pos'],
  [/^KRAS G12C mutation$/, () => (t) => t.kras === 'G12C'],
  [/^No EGFR, ALK or ROS1 change$/, () => (t) => t.egfr === 'neg' && t.alk === 'neg' && t.ros1 === 'neg'],
  [/^EGFR and ALK negative$/, () => (t) => t.egfr === 'neg' && t.alk === 'neg'],
  [/^PD-L1 score of (\d+)% or more$/, (m) => (t) => t.pdl1 >= +m[1]],
  [/^PD-L1 score below (\d+)%$/, (m) => (t) => t.pdl1 < +m[1]],
  [/^Cancer grew on (?:a third-generation|an) EGFR tablet \(e\.g\. osimertinib\)$/, () => (t) => t.priorEGFR && t.progressed === 'yes'],
  [/^Cancer grew after platinum chemotherapy and immunotherapy$/, () => (t) => t.priorChemo && t.priorIO && t.progressed === 'yes'],
  [/^Cancer grew after at least one earlier treatment for advanced disease$/, () => (t) => treatedAdvanced(t) && t.progressed === 'yes'],
  // Chemoradiotherapy for stage III is treatment with curative intent, not treatment "for advanced disease".
  [/^No earlier treatment for advanced disease$/, () => (t) => !treatedAdvanced(t)],
  [/^No treatment for extensive-stage disease yet$/, () => (t) => !treatedAdvanced(t)],
  [/^No treatment for this cancer yet$/, () => (t) => !treatedAny(t)],
  [/^No chemotherapy for advanced disease yet$/, () => (t) => !t.priorChemo],
  [/^No earlier immunotherapy$/, () => (t) => !t.priorIO],
  [/^At least (\d+) weeks since last cancer treatment$/, (m) => (t) => !treatedAny(t) || t.lastTxWeeks >= +m[1]],
  [/^Finished chemoradiotherapy in the last (\d+) weeks$/, (m) => (t) => t.priorCRT && t.crtWeeks <= +m[1]],
  // Whether chemoradiotherapy happened at all is the previous rule's job; this one is only about growth.
  [/^Cancer has not grown since chemoradiotherapy$/, () => (t) => t.progressed === 'no'],
  [/^No untreated or symptomatic brain metastases$/, () => (t) => t.brain !== 'untreated'],
  [/^Spread to the brain \(treated or not\)$/, () => (t) => t.brain !== 'none'],
  [/^Fitness \(ECOG\) 0–(\d)$/, (m) => (t) => t.ecog <= +m[1]],
  [/^No autoimmune disease treated in the last 2 years$/, () => (t) => !t.autoimmune],
  [/^No (?:interstitial lung disease or pneumonitis|pneumonitis after radiotherapy)$/, () => (t) => !t.ild],
  [/^No infection being treated now$/, () => (t) => !t.infection],
  [/^Blood counts: neutrophils ≥([\d.]+), platelets ≥(\d+)$/, (m) => (t) => t.anc >= +m[1] && t.plt >= +m[2]],
  [/^Kidney function: creatinine clearance ≥(\d+) mL\/min$/, (m) => (t) => t.crcl >= +m[1]],
  [/^Liver function: bilirubin ≤([\d.]+)× upper limit$/, (m) => (t) => t.bili <= +m[1]]
];
function goldRule(text) {
  for (const [re, make] of GOLD) { const m = text.match(re); if (m) return make(m); }
  throw new Error(`No ground-truth rule for the criterion "${text}". Add one to GOLD in scripts/eval.mjs, written from its wording.`);
}

/* ---------------- 3. registry-search baseline ---------------- */
// ClinicalTrials.gov's search filters on condition, phase and overall status (Trial Scout sends
// query.cond, AREA[Phase]PHASE3 and RECRUITING; see lib/ctgov.js). It doesn't read the entry rules.
// A synthetic trial's registry condition comes from its diagnosis rule (its first criterion).
// The patient searches for their own diagnosis, which is kinder to the baseline than a plain "lung cancer" search.
function registryEntry(t) {
  return { condition: /^Small cell lung cancer/.test(t.crit[0].text) ? 'Small cell lung cancer' : 'Non-small cell lung cancer', phase: 'Phase 3', status: 'Recruiting' };
}
function registrySearch(record, entry) {
  const cond = record.histology === 'sclc' ? 'Small cell lung cancer' : 'Non-small cell lung cancer';
  return entry.condition === cond && entry.phase === 'Phase 3' && entry.status === 'Recruiting';
}

/* ---------------- 4. synthetic patients ---------------- */
function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function rng(seed) {
  const r = mulberry32(seed >>> 0);
  const api = {
    u: r,
    chance: (p) => r() < p,
    int: (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)),
    pick: (pairs) => { let x = r() * pairs.reduce((s, p) => s + p[1], 0); for (const [v, w] of pairs) { if ((x -= w) < 0) return v; } return pairs[pairs.length - 1][0]; },
    normal: (mu, sd) => mu + sd * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()),
    shuffle: (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  };
  return api;
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r1 = (x) => Math.round(x * 10) / 10;

// The kinds of people referred to a lung cancer trials clinic. The mix is fixed (quota, not chance) so every cohort
// has the same make-up. It's our choice, not an epidemiological estimate. EGFR after a tablet is weighted up because
// 13 of the 19 demo trials are for that group.
const TYPES = [
  { id: 'egfr_after_tablet', label: 'EGFR-positive, after an EGFR tablet', w: 0.20 },
  { id: 'egfr_first', label: 'EGFR-positive, untreated', w: 0.04 },
  { id: 'alk', label: 'ALK-positive', w: 0.06 },
  { id: 'kras', label: 'KRAS G12C', w: 0.08 },
  { id: 'nodriver_first', label: 'No EGFR/ALK, untreated stage IV', w: 0.28 },
  { id: 'nodriver_later', label: 'No EGFR/ALK, after first treatment', w: 0.12 },
  { id: 'stage3', label: 'Stage III, after chemoradiotherapy', w: 0.08 },
  { id: 'operable', label: 'Operable stage II–IIIA', w: 0.06 },
  { id: 'sclc', label: 'Small cell lung cancer', w: 0.08 }
];
function quotas(n) {
  const raw = TYPES.map((t) => t.w * n), q = raw.map(Math.floor);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const left = n - q.reduce((s, x) => s + x, 0);
  for (let k = 0; k < left; k++) q[order[k][1]]++;
  return q;
}
const brainOf = (r, [none, treated, untreated]) => r.pick([['none', none], ['treated_stable', treated], ['untreated', untreated]]);

// The complete true state: every fact known, nothing missing. Field names follow the app's record schema.
function makeTruth(type, r) {
  const pdl1Band = r.pick([[0, 0.3], [1, 0.4], [2, 0.3]]);
  const t = {
    histology: 'adeno', stage: 'IV', egfr: 'neg', alk: 'neg', ros1: 'neg', kras: 'neg',
    pdl1: pdl1Band === 0 ? 0 : pdl1Band === 1 ? r.int(1, 49) : r.int(50, 95),
    priorChemo: false, priorIO: false, priorEGFR: false, priorALK: false, priorCRT: false, progressed: 'na', lastTxWeeks: null, crtWeeks: null,
    ecog: r.pick([[0, 0.3], [1, 0.45], [2, 0.18], [3, 0.07]]), brain: 'none',
    autoimmune: r.chance(0.06), ild: r.chance(0.04), infection: r.chance(0.03),
    anc: r1(clamp(r.normal(3.6, 1.3), 0.3, 9)), plt: Math.round(clamp(r.normal(235, 70), 30, 600)),
    crcl: Math.round(clamp(r.normal(72, 22), 15, 140)), bili: r1(clamp(Math.exp(r.normal(Math.log(0.6), 0.5)), 0.2, 4))
  };
  const histo = (adeno) => (t.histology = r.chance(adeno) ? 'adeno' : 'squamous');
  const laterLine = (pBoth, pChemo, pIO) => {
    const line = r.pick([['both', pBoth], ['chemo', pChemo], ['io', pIO]]);
    t.priorChemo = line !== 'io'; t.priorIO = line !== 'chemo';
    t.progressed = r.chance(0.8) ? 'yes' : 'no'; t.lastTxWeeks = r.int(0, 10);
  };
  switch (type) {
    case 'egfr_after_tablet':
      t.egfr = r.pick([['ex19del', 0.55], ['L858R', 0.4], ['other', 0.05]]);
      t.priorEGFR = true; t.priorChemo = r.chance(0.25);
      t.progressed = r.chance(0.85) ? 'yes' : 'no';           // some are referred while the tablet still works
      t.lastTxWeeks = t.progressed === 'yes' ? r.int(0, 8) : 0;
      t.brain = brainOf(r, [0.55, 0.25, 0.2]);
      break;
    case 'egfr_first':
      t.egfr = r.pick([['ex19del', 0.45], ['L858R', 0.35], ['ex20ins', 0.2]]);
      t.brain = brainOf(r, [0.6, 0.2, 0.2]);
      break;
    case 'alk':
      t.alk = 'pos'; t.stage = r.chance(0.85) ? 'IV' : 'III_unres';
      if (r.chance(0.2)) { t.priorALK = true; t.progressed = r.chance(0.7) ? 'yes' : 'no'; t.lastTxWeeks = r.int(0, 8); }
      if (t.stage === 'IV') t.brain = brainOf(r, [0.6, 0.2, 0.2]);
      break;
    case 'kras':
      t.kras = 'G12C'; histo(0.85);
      if (r.chance(0.85)) laterLine(0.85, 0.15, 0);
      t.brain = brainOf(r, [0.75, 0.13, 0.12]);
      break;
    case 'nodriver_first':
    case 'nodriver_later':
      histo(0.6);
      if (t.histology === 'adeno') { if (r.chance(0.04)) t.ros1 = 'pos'; else if (r.chance(0.12)) t.kras = 'G12C'; }
      if (type === 'nodriver_later') laterLine(0.8, 0.15, 0.05);
      t.brain = brainOf(r, [0.75, 0.13, 0.12]);
      break;
    case 'stage3':
      histo(0.55); t.stage = 'III_unres';
      if (t.histology === 'adeno' && r.chance(0.06)) t.egfr = 'ex19del';
      t.priorCRT = true; t.crtWeeks = r.int(1, 14); t.lastTxWeeks = t.crtWeeks;
      t.progressed = r.chance(0.85) ? 'no' : 'yes';
      t.priorIO = r.chance(0.05);
      break;
    case 'operable':
      histo(0.6); t.stage = r.chance(0.6) ? 'early' : 'IIIA_res';
      t.ecog = r.pick([[0, 0.5], [1, 0.45], [2, 0.05]]);
      if (t.histology === 'adeno') { if (r.chance(0.1)) t.egfr = r.chance(0.5) ? 'ex19del' : 'L858R'; else if (r.chance(0.03)) t.alk = 'pos'; }
      break;
    case 'sclc':
      t.histology = 'sclc'; t.stage = r.chance(0.8) ? 'es' : 'ls';
      if (r.chance(0.2)) { t.priorChemo = true; t.priorIO = true; t.progressed = 'yes'; t.lastTxWeeks = r.int(0, 10); }
      if (t.stage === 'es') t.brain = brainOf(r, [0.7, 0.12, 0.18]);
      break;
    default: throw new Error('unknown patient type ' + type);
  }
  return t;
}

// The record the matcher sees: the true state with ordinary gaps, written as the app writes "unknown".
// Values that are present are correct. Yes/no flags (earlier treatments, autoimmune disease, lung disease,
// infection), histology and stage are always recorded here. The what-ifs below drop that assumption.
function makeRecord(t, type, r) {
  const p = { ...t };
  const treated = treatedAny(t);
  const genes = (v) => { p.egfr = p.alk = p.ros1 = p.kras = v; };
  if (t.histology === 'sclc') genes('unk');                                         // gene panels aren't usually run for SCLC
  else if (type === 'egfr_after_tablet' || type === 'egfr_first') {
    if (t.egfr !== 'ex20ins' && r.chance(0.05)) p.egfr = 'egfr_unk';                // "EGFR mutation detected", subtype not reported
    if (r.chance(0.3)) p.kras = 'unk';                                              // testing stopped once EGFR was found
  } else if (type === 'alk' || type === 'kras') {
    if (r.chance(0.1)) p.ros1 = 'unk';
  } else if (r.chance(t.histology === 'squamous' ? 0.35 : 0.12)) genes('unk');     // no gene panel in the record
  else if (r.chance(0.1)) p.kras = 'unk';
  if (r.chance(t.histology === 'sclc' ? 0.8 : 0.2)) p.pdl1 = null;                 // PD-L1 not reported
  if (r.chance(0.1)) p.ecog = null;                                                // fitness not written down
  if ((t.stage === 'IV' || t.stage === 'es') && r.chance(0.3)) p.brain = 'unk';    // no recent brain scan
  if (r.chance(0.3)) p.anc = p.plt = p.crcl = p.bili = null;                       // no recent bloods
  else ['anc', 'plt', 'crcl', 'bili'].forEach((k) => { if (r.chance(0.05)) p[k] = null; });
  if (treated && r.chance(0.12)) p.progressed = 'unk';                             // latest scan not reported yet
  if (treated && r.chance(0.15)) p.lastTxWeeks = null;                             // date of last treatment missing
  if (t.priorCRT && r.chance(0.15)) p.crtWeeks = null;                             // end of chemoradiotherapy missing
  return p;
}

// What-ifs: the record is silent in ways the matcher can't tell from "no". Each is applied to every record, so there
// are no made-up rates: they show the size of the failure mode at its worst, not how often it happens.
const WHATIFS = [
  { id: 'silent', label: 'The record never mentions autoimmune disease, lung disease, infection or earlier immunotherapy, even when the patient has them',
    apply: (p) => ({ ...p, autoimmune: false, ild: false, infection: false, priorIO: false }) },
  { id: 'nostage', label: 'The stage is missing from the record', apply: (p) => ({ ...p, stage: 'unk' }) },
  { id: 'notype', label: 'The tumour type (small cell or not) is missing from the record', apply: (p) => ({ ...p, histology: 'unk' }) }
];

const CITY_NAMES = ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Edinburgh', 'Bristol', 'Newcastle', 'Cambridge', 'Southampton', 'Cardiff', 'Norwich'];
function makeCohort(seed, n, batch) {
  const rt = rng(seed), rr = rng(seed ^ 0xA5A5A5A5);
  const q = quotas(n), order = [];
  TYPES.forEach((t, i) => { for (let k = 0; k < q[i]; k++) order.push(t.id); });
  rt.shuffle(order);
  return order.map((type, i) => {
    const truth = makeTruth(type, rt), record = makeRecord(truth, type, rr);
    return { id: `SYN-${String(batch).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`, type, city: CITY_NAMES[rt.int(0, CITY_NAMES.length - 1)], truth, record };
  });
}

/* ---------------- 5. run both systems on every pair ---------------- */
function runPairs(M, cohort, trials) {
  const asPatient = (rec, pt) => ({ ...rec, city: pt.city, maxTravel: 999, maxVisits: 4, rand: 'yes' });  // practical fit only moves the score, never the tier
  const pairs = [];
  for (const pt of cohort) {
    for (const t of trials) {
      const rules = t.crit.map((c) => ({ text: c.text, gold: goldRule(c.text)(pt.truth) }));
      const failed = rules.filter((x) => !x.gold).map((x) => x.text);
      const r = M.evaluate(asPatient(pt.record, pt), t), whatIf = {}, whatIfNotMet = {};
      for (const w of WHATIFS) {
        const rw = M.evaluate(asPatient(w.apply(pt.record), pt), t);
        whatIf[w.id] = rw.tier;
        if (rw.tier === 'not' && failed.length === 0) whatIfNotMet[w.id] = rw.rows.filter((x) => x.s === M.NO).map((x) => x.c.text);
      }
      pairs.push({
        pid: pt.id, type: pt.type, code: t.code, gold: failed.length === 0, goldFailed: failed,
        registry: registrySearch(pt.record, registryEntry(t)),
        tier: r.tier, unknown: r.rows.filter((x) => x.s === M.U).map((x) => x.c.text), notMet: r.rows.filter((x) => x.s === M.NO).map((x) => x.c.text),
        // "not met" rows whose rule the true state actually passes: a "no" that didn't come from a failing recorded value
        notMetRows: r.rows.filter((x) => x.s === M.NO).length, notMetButTrue: r.rows.filter((x, i) => x.s === M.NO && rules[i].gold).length,
        whatIf, whatIfNotMet
      });
    }
  }
  return pairs;
}

// The app's own rule code run on the complete true state should agree with the labels criterion by criterion.
function criterionCheck(M, cohort, trials) {
  let checks = 0, agree = 0; const off = {};
  for (const pt of cohort) for (const t of trials) for (const c of t.crit) {
    const app = c.f(pt.truth), gold = goldRule(c.text)(pt.truth) ? M.OK : M.NO;
    checks++;
    if (app === gold) agree++; else off[c.text] = (off[c.text] || 0) + 1;
  }
  return { checks, agree, disagreements: off };
}

/* ---------------- 6. measures ---------------- */
function measure(pairs, nPatients, listed) {
  let n = 0, wrong = 0, eligible = 0, found = 0;
  for (const x of pairs) { if (x.gold) eligible++; if (listed(x)) { n++; if (x.gold) found++; else wrong++; } }
  return { listed: n, wrong, wrongShare: n ? wrong / n : 0, eligible, found, missed: eligible - found, recall: eligible ? found / eligible : 1, perPatient: n / nPatients };
}
const VIEWS = {
  registry: (x) => x.registry,
  tmStrong: (x) => x.tier === 'strong',
  tmReview: (x) => x.tier !== 'not'
};
function summarise(pairs, nPatients) {
  const out = {};
  for (const k in VIEWS) out[k] = measure(pairs, nPatients, VIEWS[k]);
  out.ratioStrong = out.registry.listed / Math.max(1, out.tmStrong.listed);
  out.ratioReview = out.registry.listed / Math.max(1, out.tmReview.listed);
  out.eligiblePerPatient = out.registry.eligible / nPatients;
  out.ruledOutWrongly = pairs.filter((x) => x.tier === 'not' && x.gold).length;
  out.notMetRows = pairs.reduce((s, x) => s + x.notMetRows, 0);
  out.notMetButTrue = pairs.reduce((s, x) => s + x.notMetButTrue, 0);
  const possible = pairs.filter((x) => x.tier === 'possible');
  out.possible = { pairs: possible.length, trulyEligible: possible.filter((x) => x.gold).length };
  return out;
}

/* ---------------- 7. run ---------------- */
const M = loadMatcher();
const TRIALS = M.trials.slice();
const batches = [];
for (let b = 0; b < N_BATCHES; b++) {
  const seed = SEED + b, cohort = makeCohort(seed, BATCH, b + 1);
  batches.push({ seed, cohort, pairs: runPairs(M, cohort, TRIALS) });
}
const N_PATIENTS = BATCH * N_BATCHES;
const pairs = batches.flatMap((b) => b.pairs);
const main = summarise(pairs, N_PATIENTS);
const check = criterionCheck(M, batches.flatMap((b) => b.cohort), TRIALS);

const tally = (list) => { const o = {}; for (const k of list) o[k] = (o[k] || 0) + 1; return Object.entries(o).sort((a, b) => b[1] - a[1]); };
const whatIfs = WHATIFS.map((w) => {
  const ps = pairs.map((x) => ({ ...x, tier: x.whatIf[w.id] }));
  return {
    id: w.id, label: w.label, ...summarise(ps, N_PATIENTS),
    wrongBecause: tally(ps.filter((x) => x.tier === 'strong' && !x.gold).flatMap((x) => x.goldFailed)),
    ruledOutBy: tally(pairs.flatMap((x) => x.whatIfNotMet[w.id] || []))
  };
});

const FIRST9 = TRIALS.filter((t) => Number(t.code.slice(3)) <= 309).map((t) => t.code);
const sub9 = summarise(pairs.filter((x) => FIRST9.includes(x.code)), N_PATIENTS);

const perBatch = batches.map((b) => ({ seed: b.seed, ...summarise(b.pairs, BATCH) }));
const range = (f) => { const v = perBatch.map(f); return { min: Math.min(...v), max: Math.max(...v) }; };
const spread = {
  registryWrong: range((m) => m.registry.wrongShare), registryRecall: range((m) => m.registry.recall), registryPerPatient: range((m) => m.registry.perPatient),
  strongWrong: range((m) => m.tmStrong.wrongShare), strongRecall: range((m) => m.tmStrong.recall), strongPerPatient: range((m) => m.tmStrong.perPatient),
  reviewWrong: range((m) => m.tmReview.wrongShare), reviewRecall: range((m) => m.tmReview.recall), reviewPerPatient: range((m) => m.tmReview.perPatient),
  ratioStrong: range((m) => m.ratioStrong), ratioReview: range((m) => m.ratioReview), ruledOutWrongly: range((m) => m.ruledOutWrongly)
};

const perTrial = TRIALS.map((t) => {
  const ps = pairs.filter((x) => x.code === t.code);
  return {
    code: t.code, name: t.name, rules: t.crit.length, registryCondition: registryEntry(t).condition,
    eligible: ps.filter((x) => x.gold).length, registry: ps.filter((x) => x.registry).length,
    strong: ps.filter((x) => x.tier === 'strong').length, strongWrong: ps.filter((x) => x.tier === 'strong' && !x.gold).length,
    possible: ps.filter((x) => x.tier === 'possible').length, possibleEligible: ps.filter((x) => x.tier === 'possible' && x.gold).length,
    ruledOutWrongly: ps.filter((x) => x.tier === 'not' && x.gold).length
  };
});
const perType = TYPES.map((ty) => {
  const ps = pairs.filter((x) => x.type === ty.id), n = ps.length / TRIALS.length, per = (f) => (n ? ps.filter(f).length / n : 0);
  return { type: ty.id, label: ty.label, patients: n, eligible: per((x) => x.gold), registry: per((x) => x.registry), strong: per((x) => x.tier === 'strong'), review: per((x) => x.tier !== 'not') };
});
// Which missing facts keep truly eligible pairs out of "all rules met"?
const blockers = tally(pairs.filter((x) => x.gold && x.tier === 'possible').flatMap((x) => x.unknown));

/* ---------------- 8. write ---------------- */
const DATE = new Date().toISOString().slice(0, 10);
const nPairs = pairs.length;
const int = (n) => Number(n).toLocaleString('en-GB');
const pct = (x) => (x === 0 ? '0%' : x === 1 ? '100%' : (100 * x).toFixed(x < 0.1 || x > 0.9 ? 1 : 0) + '%');
const dec = (x) => x.toFixed(1);
const times = (x) => x.toFixed(1) + '×';
const span = (r, f) => (f(r.min) === f(r.max) ? f(r.min) : f(r.min) + ' to ' + f(r.max));
const quoted = (list, n) => list.slice(0, n).map(([k, v]) => `"${k}" (${int(v)})`).join(', ');
const STRONG = '“All rules met”';
const REVIEW = '“All met” + “to check”';
const lastSeed = SEED + N_BATCHES - 1;

const md = [];
md.push('# Trial Match: offline matching test');
md.push('');
md.push(`**Synthetic data only.** ${int(N_PATIENTS)} synthetic patients (${N_BATCHES} batches of ${BATCH}, seeds ${SEED} to ${lastSeed}) × ${TRIALS.length} synthetic trials = **${int(nPairs)} patient–trial pairs**. Run on ${DATE} with \`${COMMAND}\`. These numbers say how the matching step behaves on patients we generated ourselves, labelled by rules we wrote. They are not real-world accuracy, enrolment or benefit.`);
md.push('');
md.push('To rerun it from the `trial-match-vercel` folder (Node 22 or later, nothing to install):');
md.push('');
md.push('```bash');
md.push(COMMAND);
md.push('```');
md.push('');
md.push(`Everything except the date above comes out the same on every run. It also writes \`results.json\` (all the numbers), and for the first batch (seed ${SEED}) \`pairs.csv\` (every pair with its label and both answers) and \`cohort.json\` (every patient's true state and record).`);
md.push('');
md.push(`## Results on all ${TRIALS.length} demo trials`);
md.push('');
md.push(`| | Registry search | Trial Match: ${STRONG} | Trial Match: ${REVIEW} |`);
md.push('|---|---|---|---|');
md.push(`| Pairs listed as a match | ${int(main.registry.listed)} | ${int(main.tmStrong.listed)} | ${int(main.tmReview.listed)} |`);
md.push(`| Share of listed pairs that are wrong (patient not truly eligible) | **${pct(main.registry.wrongShare)}** (${int(main.registry.wrong)}) | **${pct(main.tmStrong.wrongShare)}** (${int(main.tmStrong.wrong)}) | ${pct(main.tmReview.wrongShare)} (${int(main.tmReview.wrong)}) |`);
md.push(`| Truly eligible pairs found (recall), of ${int(main.registry.eligible)} | ${pct(main.registry.recall)} (${int(main.registry.found)}) | **${pct(main.tmStrong.recall)}** (${int(main.tmStrong.found)}) | **${pct(main.tmReview.recall)}** (${int(main.tmReview.found)}) |`);
md.push(`| Trials to review per patient | **${dec(main.registry.perPatient)}** | **${dec(main.tmStrong.perPatient)}** | **${dec(main.tmReview.perPatient)}** |`);
md.push(`| Fewer trials to review than registry search | | ${times(main.ratioStrong)} | ${times(main.ratioReview)} |`);
md.push(`| Truly eligible pairs ruled out (“not met”) | n/a | ${int(main.ruledOutWrongly)} | ${int(main.ruledOutWrongly)} |`);
md.push('');
md.push(`On average a patient is truly eligible for ${dec(main.eligiblePerPatient)} of the ${TRIALS.length} trials.`);
md.push('');
md.push(`- **${STRONG}** is the app's "strong" match: every entry rule is met by a value in the record. This is the list a patient's agent would apply from.`);
md.push(`- **“To check”** is the app's "possible" match: nothing rules the patient out, but at least one rule needs a fact the record doesn't have yet. The app shows the missing fact, for a nurse or the patient to settle. ${int(main.possible.pairs)} pairs were "to check", and ${int(main.possible.trulyEligible)} of them (${pct(main.possible.trulyEligible / Math.max(1, main.possible.pairs))}) were truly eligible once the hidden facts are known.`);
md.push(`- **No truly eligible pair was ruled out.** Of ${int(main.notMetRows)} "not met" rule results, ${int(main.notMetButTrue)} were for a rule the patient truly passes: each "not met" came from a recorded value that fails the rule, and a missing fact gave "to check" instead. The stage is always recorded in this run; the what-ifs below show what happens when it isn't.`);
md.push(`- **How many real matches reach "all rules met" depends on how complete the records are.** With no gaps it would be all of them (see the criterion check below). The gaps are our choice (listed below). The app also asks the patient about some of them (brain scan, PD-L1, gene tests, dates of treatment), which isn't modelled here. Truly eligible pairs that stayed "to check" were mostly waiting on: ${quoted(blockers, 5)}.`);
md.push('');
md.push(`### How much the numbers move between batches`);
md.push('');
md.push(`The same measures for each batch of ${BATCH} patients on its own, lowest to highest across the ${N_BATCHES} batches:`);
md.push('');
md.push(`| | Registry search | Trial Match: ${STRONG} | Trial Match: ${REVIEW} |`);
md.push('|---|---|---|---|');
md.push(`| Share of listed pairs that are wrong | ${span(spread.registryWrong, pct)} | ${span(spread.strongWrong, pct)} | ${span(spread.reviewWrong, pct)} |`);
md.push(`| Recall | ${span(spread.registryRecall, pct)} | ${span(spread.strongRecall, pct)} | ${span(spread.reviewRecall, pct)} |`);
md.push(`| Trials to review per patient | ${span(spread.registryPerPatient, dec)} | ${span(spread.strongPerPatient, dec)} | ${span(spread.reviewPerPatient, dec)} |`);
md.push(`| Fewer trials to review than registry search | | ${span(spread.ratioStrong, times)} | ${span(spread.ratioReview, times)} |`);
md.push('');
md.push('## Numbers for the landing page\'s Results section');
md.push('');
md.push('The measured value for each slot on the page, pooled over all batches. The page should also say they come from synthetic patients.');
md.push('');
md.push('| Slot | Measured |');
md.push('|---|---|');
md.push(`| Registry search: share of "eligible" matches that were wrong | ${pct(main.registry.wrongShare)} |`);
md.push(`| Trial Match: share wrong | ${pct(main.tmStrong.wrongShare)} of "all rules met" (${pct(main.tmReview.wrongShare)} once "to check" is included) |`);
md.push(`| "With every real match still found" | ${pct(main.tmReview.recall)} of real matches are "all rules met" or "to check"; ${pct(main.tmStrong.recall)} are "all rules met" |`);
md.push(`| "N× less to review" | ${times(main.ratioReview)} counting "to check" (${times(main.ratioStrong)} for "all rules met" alone) |`);
md.push(`| "X trials per patient instead of Y" | ${dec(main.tmReview.perPatient)} counting "to check" (${dec(main.tmStrong.perPatient)} for "all rules met" alone), instead of ${dec(main.registry.perPatient)} |`);
md.push(`| Small print: pair count | ${int(nPairs)} synthetic patient–trial pairs (${int(N_PATIENTS)} patients × ${TRIALS.length} trials) |`);
md.push('');
md.push('## What each side does');
md.push('');
md.push(`- **Registry search.** What a ClinicalTrials.gov search filters on: condition, phase and recruiting status (the same filters Trial Scout sends, see \`lib/ctgov.js\`). It doesn't read entry rules, so it lists every recruiting phase III trial for the patient's diagnosis. Each synthetic trial's registry condition comes from its diagnosis rule (${perTrial.filter((t) => t.registryCondition === 'Small cell lung cancer').map((t) => t.code).join(', ')} is small cell; the rest are non-small cell). The patient searches for their own diagnosis, which is kinder to the baseline than a plain "lung cancer" search (that would list all ${TRIALS.length} trials for everyone). All demo trials are phase III and recruiting, so those two filters remove nothing here.`);
md.push(`- **Trial Match.** The deployed matcher, read straight from \`public/app/index.html\` (the rule helpers, the ${TRIALS.length} trials and \`evaluate()\`; SHA-256 of that code \`${M.sha256.slice(0, 16)}\`). It sees only the record. Its tier is used as is: "strong" (all rules met), "possible" (to check) or "not". Travel limits and other preferences only change the app's score, not the tier, and neither side uses them here.`);
md.push('');
md.push('## How the synthetic patients and labels were made');
md.push('');
md.push(`1. **Patients.** Each batch of ${BATCH} has fixed shares of nine kinds of referral (table below). Within each kind, the facts are drawn at random from a seeded generator: EGFR subtype, PD-L1 band, earlier treatments and whether the cancer grew, weeks since treatment, fitness (ECOG 0–3), brain spread (none, treated and stable, untreated), autoimmune disease (6%), lung disease (4%), infection (3%), and blood counts, kidney and liver results from normal-shaped spreads that put a few percent outside each trial's limits. The shares and rates are our choices, picked so every trial has some eligible patients. They are not estimates of the UK population.`);
md.push('2. **True state and record.** Each patient has a complete true state with every fact known. The matcher gets a record made from it with ordinary gaps, each written the way the app writes "unknown": no gene panel (12% of adenocarcinoma, 35% of squamous; never for small cell), PD-L1 not reported (20%; 80% for small cell), ECOG not written down (10%), no recent brain scan (30% of stage IV and extensive stage), no recent bloods (30%, plus 5% per single test), latest scan not reported (12% of treated patients), date of last treatment missing (15%), end of chemoradiotherapy missing (15%). Values that are in the record are correct, and yes/no facts are always recorded.');
md.push(`3. **Labels.** A pair is truly eligible when every entry rule of the trial is met by the true state. The label rules are in \`scripts/eval.mjs\` (\`GOLD\`), written from each criterion's wording with thresholds read from the text, separately from the app's rule code. **Criterion check:** run on the complete true states, the app's own rules agree with the label rules on ${int(check.agree)} of ${int(check.checks)} criterion checks${check.agree === check.checks ? '' : ' (disagreements: ' + Object.entries(check.disagreements).map(([k, v]) => `"${k}" ${int(v)}`).join(', ') + ')'}. No clinician reviewed the labels.`);
md.push('');
md.push('| Kind of patient | Share | Truly eligible per patient | Registry search per patient | All rules met per patient | Incl. "to check" per patient |');
md.push('|---|---|---|---|---|---|');
for (const r of perType) md.push(`| ${r.label} | ${pct(r.patients / N_PATIENTS)} | ${dec(r.eligible)} | ${dec(r.registry)} | ${dec(r.strong)} | ${dec(r.review)} |`);
md.push('');
md.push('## Per trial');
md.push('');
md.push('| Trial | Rules | Truly eligible | Registry search lists | All rules met (wrong) | To check (truly eligible) | Truly eligible ruled out |');
md.push('|---|---|---|---|---|---|---|');
for (const r of perTrial) md.push(`| ${r.code} ${r.name} | ${r.rules} | ${int(r.eligible)} | ${int(r.registry)} | ${int(r.strong)} (${int(r.strongWrong)}) | ${int(r.possible)} (${int(r.possibleEligible)}) | ${int(r.ruledOutWrongly)} |`);
md.push('');
md.push('## What if the record is silent?');
md.push('');
md.push('The main run assumes recorded values are right, that the tumour type and stage are recorded, and that yes/no facts (earlier treatments, autoimmune disease, lung disease, infection) are always recorded. The app has no "unknown" for those yes/no facts, so a record that says nothing reads as "no". A missing tumour type or stage is written as unknown. Each what-if applies one gap to every record, for the same patients. It shows how big the failure is at its worst, not how often it happens.');
md.push('');
md.push(`| | ${STRONG}: wrong | Real matches that are "all rules met" or "to check" | Truly eligible pairs ruled out |`);
md.push('|---|---|---|---|');
md.push(`| Main run | ${pct(main.tmStrong.wrongShare)} (${int(main.tmStrong.wrong)} of ${int(main.tmStrong.listed)}) | ${pct(main.tmReview.recall)} | ${int(main.ruledOutWrongly)} |`);
for (const w of whatIfs) md.push(`| ${w.label} | ${pct(w.tmStrong.wrongShare)} (${int(w.tmStrong.wrong)} of ${int(w.tmStrong.listed)}) | ${pct(w.tmReview.recall)} | ${int(w.ruledOutWrongly)} |`);
md.push('');
for (const w of whatIfs) {
  const bits = [];
  if (w.wrongBecause.length) bits.push(`the wrong "all rules met" pairs truly fail ${quoted(w.wrongBecause, 4)}`);
  if (w.ruledOutBy.length) bits.push(`truly eligible pairs are ruled out by ${quoted(w.ruledOutBy, 4)}`);
  if (bits.length) md.push(`- **${w.label}:** ${bits.join('; ')}.`);
}
md.push('');
const silent = whatIfs.find((w) => w.id === 'silent');
if (silent.tmStrong.wrong || silent.ruledOutWrongly) md.push('Silent yes/no facts are why the Records Reader, the Skeptic quote check and the trial team\'s own screening stay in the loop.');
for (const w of whatIfs.filter((x) => x.id !== 'silent')) {
  md.push('');
  md.push(w.ruledOutWrongly || w.tmStrong.wrong
    ? `**${w.label}: this is a fault in the rules.** An unknown value should give "to check", not "not met" or "met".`
    : `${w.label}: nothing is wrongly ruled out or wrongly listed. The pairs wait as "to check" (${pct(w.tmReview.recall)} of real matches are still "all rules met" or "to check").`);
}
md.push('');
md.push('## The first nine trials only (LT-301 to LT-309)');
md.push('');
md.push(`LT-310 to LT-319 are ten extra trials for EGFR-positive cancer that grew on an EGFR tablet. On LT-301 to LT-309 alone (${int(N_PATIENTS)} × 9 = ${int(N_PATIENTS * 9)} pairs): registry search lists ${dec(sub9.registry.perPatient)} trials per patient and ${pct(sub9.registry.wrongShare)} of them are wrong. Trial Match lists ${dec(sub9.tmStrong.perPatient)} with all rules met (${pct(sub9.tmStrong.wrongShare)} wrong, recall ${pct(sub9.tmStrong.recall)}), and ${dec(sub9.tmReview.perPatient)} counting "to check" (${pct(sub9.tmReview.wrongShare)} wrong, recall ${pct(sub9.tmReview.recall)}). That is ${times(sub9.ratioReview)} fewer to review counting "to check", or ${times(sub9.ratioStrong)} for "all rules met" alone.`);
md.push('');
md.push('## Limits');
md.push('');
md.push('- **The labels and the matcher come from the same criteria.** Both are our reading of each rule\'s wording. So "0% wrong" mostly shows that the code does what its criteria say and treats missing facts as unknown. It is not independent evidence of clinical accuracy, and real trial protocols have many more rules than these.');
md.push('- **Reading the record isn\'t tested here.** The main run assumes recorded values are right. The Records Reader\'s quote check is tested separately (`npm test`). The what-ifs show what happens when the record is silent.');
md.push('- **The cohort mix drives the registry number.** Most demo trials need one narrow profile (EGFR-positive after an EGFR tablet), so most people a registry search lists for them can\'t join. A different mix gives a different share. The per-kind table shows how.');
md.push('- **The record gaps drive the "all rules met" recall.** Fewer gaps means more real matches are "all rules met" and fewer are "to check".');
md.push('- **The baseline is a simple one.** A person searching ClinicalTrials.gov can also type a gene name or read each trial\'s rules. We compare against the filters alone.');
md.push('- **Not tested:** the MedGemma pre-check for live ClinicalTrials.gov trials, travel limits and other preferences, and whether a trial still has places.');
md.push('');

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'results.md'), md.join('\n'));

const strip = (s) => { const o = { ...s }; delete o.wrongBecause; delete o.ruledOutBy; return o; };
writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({
  synthetic: true,
  note: 'Synthetic patients and synthetic trials. Not real-world performance.',
  date: DATE, command: COMMAND, firstSeed: SEED, batches: N_BATCHES, patientsPerBatch: BATCH, patients: N_PATIENTS, trials: TRIALS.length, pairs: nPairs,
  matcher: { file: 'public/app/index.html', sha256: M.sha256 },
  definitions: {
    registry: 'condition + phase 3 + recruiting, the ClinicalTrials.gov search filters',
    tmStrong: 'deployed matcher tier "strong": every rule met by a recorded value',
    tmReview: 'deployed matcher tier "strong" or "possible": nothing ruled out, possibly waiting on missing facts',
    wrongShare: 'listed pairs whose patient is not truly eligible / listed pairs',
    recall: 'truly eligible pairs listed / truly eligible pairs',
    perPatient: 'listed pairs / patients'
  },
  main, spread, perBatch, criterionCheck: check,
  whatIfs: whatIfs.map((w) => ({ ...strip(w), wrongBecause: Object.fromEntries(w.wrongBecause), ruledOutBy: Object.fromEntries(w.ruledOutBy) })),
  first9: { trials: FIRST9, pairs: N_PATIENTS * FIRST9.length, ...sub9 },
  perTrial, perType, missingFactsKeepingEligiblePairsToCheck: Object.fromEntries(blockers)
}, null, 2) + '\n');

const first = batches[0];
const csv = (v) => { const s = Array.isArray(v) ? v.join(' | ') : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const head = ['patient', 'kind', 'trial', 'truly_eligible', 'rules_failed_in_truth', 'registry_search_lists', 'trial_match_tier', 'trial_match_unknown_rules', 'trial_match_not_met_rules', ...WHATIFS.map((w) => 'what_if_' + w.id + '_tier')];
const rows = first.pairs.map((x) => [x.pid, x.type, x.code, x.gold ? 'yes' : 'no', x.goldFailed, x.registry ? 'yes' : 'no', x.tier, x.unknown, x.notMet, ...WHATIFS.map((w) => x.whatIf[w.id])].map(csv).join(','));
writeFileSync(path.join(OUT, 'pairs.csv'), [head.join(','), ...rows].join('\n') + '\n');
writeFileSync(path.join(OUT, 'cohort.json'), JSON.stringify({
  synthetic: true, note: `Synthetic patients made by scripts/eval.mjs, batch 1 (seed ${first.seed}). "record" is what the matcher sees.`, seed: first.seed,
  patients: first.cohort.map((p) => ({ id: p.id, kind: p.type, city: p.city, truth: p.truth, record: p.record }))
}, null, 1) + '\n');

console.log(`Synthetic test: ${int(N_PATIENTS)} patients (${N_BATCHES} × ${BATCH}) × ${TRIALS.length} trials = ${int(nPairs)} pairs.`);
console.log(`  Registry search:            ${pct(main.registry.wrongShare)} wrong, recall ${pct(main.registry.recall)}, ${dec(main.registry.perPatient)} trials per patient`);
console.log(`  Trial Match, all rules met: ${pct(main.tmStrong.wrongShare)} wrong, recall ${pct(main.tmStrong.recall)}, ${dec(main.tmStrong.perPatient)} per patient (${times(main.ratioStrong)} fewer)`);
console.log(`  Trial Match, + to check:    ${pct(main.tmReview.wrongShare)} wrong, recall ${pct(main.tmReview.recall)}, ${dec(main.tmReview.perPatient)} per patient (${times(main.ratioReview)} fewer)`);
console.log(`  Criterion check: ${int(check.agree)} / ${int(check.checks)} agree. Wrote eval/results.md, results.json, pairs.csv, cohort.json`);
if (check.agree !== check.checks) {
  console.error(`\nThe app's rule code disagrees with its own criterion wording: ${Object.keys(check.disagreements).map((k) => `"${k}"`).join(', ')}. Fix the rule or its text.`);
  process.exitCode = 1;
}
