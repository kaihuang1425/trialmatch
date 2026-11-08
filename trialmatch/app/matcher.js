/* TrialMatch matcher, browser edition. A line-for-line port of trialmatch/match.py
 * (check, verify, eligibility, feasibility, diversity, score, rank, interview).
 *
 * It runs on the device: the server only publishes the trial rules bundle (public
 * registry data, no patient information) and the patient record never leaves the browser.
 * tests/test_parity.py runs this file under Node and checks it ranks every demo patient
 * exactly like the Python matcher. Change both files together.
 */
(function (root) {
  'use strict';

  const W = { unknown: 0.7, base_F: 0.8, fresh_biopsy: 0.7, placebo: 0.9,
    travel_100km: 0.85, travel_200km: 0.7, diversity: 0.2 };
  const MET = 'met', FAIL = 'not_met', UNK = 'unknown';

  const lab = (field, status, pe, te, reason) => ({ field, status, patient_evidence: pe, trial_evidence: te, reason });
  const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

  // "early" is only produced by a patient's own answer ("surgery can remove it"); records use I to IV.
  const STAGE_FIT = { I: ['early'], II: ['early'], IIIA: ['early', 'stage3_unresectable'], III: ['early', 'stage3_unresectable'],
    'IIIB-C': ['stage3_unresectable', 'advanced'], IV: ['advanced'], early: ['early'] };
  const STAGE_NUM = { I: 1, II: 2, IIIA: 3, III: 3, 'IIIB-C': 3, IV: 4, early: 2 };

  function check(patient, trial) {
    const r = trial.rules, ev = patient.evidence, labels = [];

    const a = r.age;
    if ((a.min && patient.age < a.min) || (a.max && patient.age > a.max)) {
      labels.push(lab('age', FAIL, ev.age, `Age ${a.min}-${a.max || 'no limit'}`, "Outside the trial's age range at diagnosis."));
    }
    if (r.sex !== 'ALL' && r.sex !== patient.sex) labels.push(lab('sex', FAIL, ev.sex, `Sex: ${r.sex}`, 'Trial enrols one sex only.'));

    if (r.stage) {
      const scopes = r.stage.scopes, st = patient.stage;
      if (st === 'unknown') {
        labels.push(lab('stage', UNK, ev.stage, r.stage.evidence, 'Stage not in record.'));
      } else {
        const fit = STAGE_FIT[st].filter((s) => scopes.includes(s));
        const num = STAGE_NUM[st], lo = r.stage.min_num, hi = r.stage.max_num;
        if (st === 'early' && fit.length && lo && lo > 2) {
          labels.push(lab('stage', UNK, ev.stage, r.stage.evidence, 'Patient says surgery is possible; the trial needs a later stage, so check the exact stage.'));
        } else if (fit.length && ((lo && num < lo) || (hi && num > hi))) {
          labels.push(lab('stage', FAIL, ev.stage, r.stage.evidence, `Trial enrols stage ${lo}-${hi} (as numbers); patient is stage ${st}.`));
        } else if (!fit.length) {
          labels.push(lab('stage', FAIL, ev.stage, r.stage.evidence, `Trial enrols ${[...scopes].sort().join(', ')}; patient is stage ${st}.`));
        } else if ((st === 'IIIA' || st === 'III') && fit.length !== STAGE_FIT[st].length) {
          labels.push(lab('stage', UNK, ev.stage, r.stage.evidence, 'Stage III: depends on whether the tumour can be removed by surgery.'));
        } else {
          labels.push(lab('stage', MET, ev.stage, r.stage.evidence, 'Disease stage fits.'));
        }
      }
    } else {
      labels.push(lab('stage', UNK, ev.stage, 'No stage line parsed', 'Check stage wording by hand.'));
    }

    if (r.histology) {
      const need = r.histology.required, hist = patient.histology;
      const status = hist === 'unknown' ? UNK : (need === hist ? MET : FAIL);
      labels.push(lab('histology', status, ev.histology, r.histology.evidence, `Trial requires ${need} NSCLC.`));
    }

    if (!r.ecog) {
      labels.push(lab('ecog', UNK, ev.ecog, 'ECOG limit not parsed', "Trial's fitness limit not parsed: LLM or nurse to check."));
    } else {
      const mx = r.ecog.max;
      if (patient.ecog == null) labels.push(lab('ecog', UNK, ev.ecog, r.ecog.evidence, `Trial needs ECOG 0-${mx}; not recorded.`));
      else labels.push(lab('ecog', patient.ecog <= mx ? MET : FAIL, ev.ecog, r.ecog.evidence, `Trial needs ECOG 0-${mx}.`));
    }

    for (const [g, rule] of Object.entries(r.genes)) {
      const bio = patient.biomarkers;
      const pstat = has(bio, g) ? bio[g] : 'unknown';
      const pev = has(ev, g) ? ev[g] : `${g}: not in record`;
      const kind = rule.rule;
      if (g === 'EGFR' && pstat === 'positive' && kind === 'excluded' && rule.sensitising_only && bio.EGFR_type !== 'sensitising') {
        labels.push(lab(g, UNK, pev, rule.evidence, "Trial excludes sensitising EGFR; this mutation type needs a clinician's call."));
        continue;
      }
      let status, reason;
      if (kind === 'conditional') {
        status = pstat === 'negative' ? MET : UNK;
        reason = 'Allowed only in some cases (e.g. after targeted therapy): needs a human check.';
      } else if (kind === 'required') {
        status = { positive: MET, negative: FAIL }[pstat] || UNK;
        if (g === 'EGFR' && pstat === 'positive' && bio.EGFR_type !== 'sensitising') status = UNK;
        if (g === 'EGFR' && status === MET && rule.specific_variant) {
          labels.push(lab(g, UNK, pev, rule.evidence, "Trial wants specific EGFR variants: a clinician must confirm this one qualifies."));
          continue;
        }
        if (g === 'EGFR' && status === MET && rule.classical_only && !/exon ?19|L858R/i.test(ev.EGFR)) {
          labels.push(lab(g, UNK, pev, rule.evidence, "Trial asks for classical EGFR (exon 19 / L858R); this mutation needs a clinician's call."));
          continue;
        }
        reason = `Trial requires a ${g} alteration.`;
      } else {
        status = { positive: FAIL, negative: MET }[pstat] || UNK;
        reason = `Trial excludes ${g}-positive tumours.`;
      }
      labels.push(lab(g, status, pev, rule.evidence, reason));
    }

    if (r.pdl1) {
      const p = patient.pdl1, rule = r.pdl1;
      if (p == null) {
        labels.push(lab('pdl1', UNK, ev.pdl1, rule.evidence, 'PD-L1 score needed.'));
      } else {
        let ok = true;
        if (has(rule, 'min') && p < rule.min) ok = false;
        if (has(rule, 'max_below') && p >= rule.max_below) ok = false;
        if (has(rule, 'max_incl') && p > rule.max_incl) ok = false;
        labels.push(lab('pdl1', ok ? MET : FAIL, ev.pdl1, rule.evidence, 'PD-L1 threshold.'));
      }
    }

    if (!r.prior_lines && r.stage && r.stage.scopes.includes('advanced')) {
      labels.push(lab('prior_lines', UNK, ev.prior_lines, 'Treatment-line rule not parsed', "Trial's prior-treatment rule not parsed: LLM or nurse to check."));
    }
    if (r.prior_lines) {
      const n = patient.prior_lines, rule = r.prior_lines;
      if (n == null) {
        labels.push(lab('prior_lines', UNK, ev.prior_lines, rule.evidence, 'Treatment history needed.'));
      } else {
        const ok = n >= (has(rule, 'min') ? rule.min : 0) && n <= (has(rule, 'max') ? rule.max : 99);
        labels.push(lab('prior_lines', ok ? MET : FAIL, ev.prior_lines, rule.evidence, 'Number of earlier treatment lines.'));
      }
    }

    if (r.brain_mets) {
      const bm = patient.brain_mets, rule = r.brain_mets;
      if (bm === 'unknown') {
        labels.push(lab('brain_mets', UNK, ev.brain_mets, rule.evidence, 'Brain scan result needed.'));
      } else {
        const ok = rule.rule === 'active_excluded' ? bm !== 'active' : bm === 'none';
        labels.push(lab('brain_mets', ok ? MET : FAIL, ev.brain_mets, rule.evidence, 'Brain metastases rule.'));
      }
    }
    return labels;
  }

  // Verifier rule: a "not met" must rest on a recorded value, otherwise it becomes "unknown".
  function verify(labels) {
    for (const l of labels) {
      const pe = String(l.patient_evidence || 'none').toLowerCase();
      const unsupported = pe.includes('not in record') || pe.includes('not recorded') || pe === 'none';
      if (l.status === FAIL && unsupported) {
        l.status = UNK;
        l.reason += ' (downgraded: no recorded evidence)';
      }
    }
    return labels;
  }

  function eligibility(labels, weights) {
    const w = weights || W;
    if (labels.some((l) => l.status === FAIL)) return 0;
    const perField = w.unknown_by_field || {};
    let e = 1;
    for (const l of labels) if (l.status === UNK) e *= has(perField, l.field) ? perField[l.field] : w.unknown;
    return e;
  }

  function feasibility(trial, weights) {
    const w = weights || W;
    let f = w.base_F;
    const notes = [];
    const bx = trial.rules.biopsy;
    if (bx && bx.fresh_required) { f *= w.fresh_biopsy; notes.push('fresh biopsy required (x0.7)'); }
    if (trial.placebo) { f *= w.placebo; notes.push('placebo arm (x0.9)'); }
    return { F: Math.min(f, 1), notes };
  }

  const diversity = (patient) => (patient.age >= 70 || String(patient.race || '').includes('Black') ? 1 : 0);

  // Python's round(x, 3) for the values this matcher produces (products of a few weights).
  const round3 = (x) => Math.round((x + Number.EPSILON) * 1000) / 1000;

  /* `pair` mirrors match.PAIRS: {fields: {field: 'met'|'not_met'}, outcome} from the trial team's pre-screen. */
  function score(patient, trial, pair, weights) {
    const w = weights || W;
    const labels = verify(check(patient, trial));
    if (pair) {
      for (const l of labels) {
        if (pair.fields && has(pair.fields, l.field)) { l.status = pair.fields[l.field]; l.patient_evidence = 'Trial team verdict at pre-screening'; l.by = 'team'; }
      }
      if (pair.outcome === 'screen_failed' || pair.outcome === 'declined') {
        labels.push(lab('prescreen', FAIL, `Prescreen outcome: ${pair.outcome}`, 'Human prescreen', 'Removed after prescreening.'));
      }
    }
    const E = eligibility(labels, w);
    const { F, notes } = feasibility(trial, w);
    const D = diversity(patient);
    const S = E * F * (1 + w.diversity * D);
    const urgent = E > 0 && (patient.stage === 'IV' || patient.stage === 'IIIB-C') && (patient.ecog || 0) >= 1;
    return { nct: trial.nct, score: round3(S), E: round3(E), F: round3(F), D, feasibility_notes: notes,
      prescreen: (pair || {}).outcome || null, urgent, labels };
  }

  function interview(results, maxQ) {
    const counts = {};
    for (const res of results) {
      if (res.E === 0) continue;
      for (const l of res.labels) if (l.status === UNK) counts[l.field] = (counts[l.field] || 0) + 1;
    }
    return Object.entries(counts).sort((x, y) => y[1] - x[1]).slice(0, maxQ == null ? 5 : maxQ)
      .map(([field, n]) => ({ field, trials_affected: n }));
  }

  /* opts: {top, pairFor(nct) -> pair, weights} */
  function rank(patient, trials, opts) {
    const o = opts || {};
    const results = trials.map((t) => score(patient, t, o.pairFor ? o.pairFor(t.nct) : null, o.weights));
    const mets = (r) => r.labels.filter((l) => l.status === MET).length;
    const uk = Object.fromEntries(trials.map((t) => [t.nct, t.uk_sites || 0]));
    const eligible = results.filter((r) => r.E > 0).sort((a, b) =>
      ((a.prescreen !== 'enrolled') - (b.prescreen !== 'enrolled')) || (b.score - a.score) || (mets(b) - mets(a)) || (uk[b.nct] - uk[a.nct]));
    return { patient: patient.id, n_trials: trials.length, n_possible: eligible.length,
      top: o.top == null ? eligible : eligible.slice(0, o.top), questions: interview(eligible),
      removed: results.length - eligible.length, all: results };
  }

  const api = { W, MET, FAIL, UNK, check, verify, eligibility, feasibility, diversity, score, rank, interview };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrialMatcher = api;
})(typeof self !== 'undefined' ? self : this);
