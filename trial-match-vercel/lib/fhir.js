// FHIR R4 connector: reads a patient's record from a FHIR server (read-only) and turns it into the app's facts.
// Coded results (labs, ECOG) are mapped directly from LOINC codes; everything else goes to the Records Reader.
import { HttpError, fetchJson } from './http.js';
import { ground, readRecord } from './records.js';
import { medgemmaConfig } from './medgemma.js';

export function fhirConfig() {
  const base = process.env.FHIR_BASE_URL;
  if (!base) return null;
  return { base: base.replace(/\/+$/, ''), token: process.env.FHIR_BEARER_TOKEN || '', demoPatient: process.env.FHIR_DEMO_PATIENT_ID || '' };
}

async function get(c, path) {
  const headers = { Accept: 'application/fhir+json' };
  if (c.token) headers.Authorization = 'Bearer ' + c.token;
  return fetchJson(c.base + '/' + path, { headers }, 20000);
}
const entries = (b) => ((b && b.entry) || []).map((e) => e.resource).filter(Boolean);
const text = (cc) => (cc && (cc.text || ((cc.coding || [])[0] || {}).display)) || '';
const codes = (cc) => ((cc && cc.coding) || []).map((c) => c.code);
const day = (s) => (s ? String(s).slice(0, 10) : '');

function obsValue(o) {
  if (o.valueQuantity) return { n: o.valueQuantity.value, unit: o.valueQuantity.unit || o.valueQuantity.code || '' };
  if (typeof o.valueInteger === 'number') return { n: o.valueInteger, unit: '' };
  if (o.valueCodeableConcept) return { s: text(o.valueCodeableConcept), code: codes(o.valueCodeableConcept) };
  if (typeof o.valueString === 'string') return { s: o.valueString };
  return null;
}
function valueText(v) {
  if (!v) return '';
  return v.n != null ? (Math.round(v.n * 100) / 100) + (v.unit ? ' ' + v.unit : '') : v.s;
}

const LAB = {
  anc: ['751-8', '26499-4'],
  plt: ['777-3', '26515-7'],
  crcl: ['2164-2'],
  biliMg: ['1975-2'],
  biliUmol: ['14631-6'],
  ecog: ['89247-1']
};
const ECOG_LA = { 'LA9622-7': 0, 'LA9623-5': 1, 'LA9624-3': 2, 'LA9625-0': 3, 'LA9626-8': 4 };

// Builds one line of text per resource (the "record digest") and the coded facts, each tied to its line.
function digest(bundles) {
  const lines = [];
  const coded = [];
  bundles.conditions.forEach((c) => {
    const status = text(c.clinicalStatus) || ((c.clinicalStatus || {}).coding || [{}])[0].code || '';
    lines.push('Condition: ' + text(c.code) + (status ? ' (' + status + ')' : '') + (c.onsetDateTime ? ', onset ' + day(c.onsetDateTime) : '') +
      ((c.stage || []).length ? ', stage ' + c.stage.map((s) => text(s.summary)).filter(Boolean).join('; ') : ''));
  });
  const latest = {};
  bundles.observations.forEach((o) => {
    const v = obsValue(o);
    const when = day(o.effectiveDateTime || o.issued);
    const line = 'Observation ' + (when || '') + ': ' + text(o.code) + ' = ' + valueText(v);
    lines.push(line);
    const cs = codes(o.code);
    Object.keys(LAB).forEach((k) => {
      if (!LAB[k].some((x) => cs.includes(x)) || !v) return;
      if (!latest[k] || when > latest[k].when) latest[k] = { v, when, line };
    });
  });
  (bundles.meds).forEach((m) => {
    const name = text(m.medicationCodeableConcept) || (m.medicationReference && m.medicationReference.display) || '';
    const when = day(m.authoredOn || (m.effectivePeriod && m.effectivePeriod.start) || m.effectiveDateTime);
    lines.push('Medication: ' + name + (when ? ', from ' + when : '') + (m.status ? ' (' + m.status + ')' : ''));
  });
  bundles.procedures.forEach((p) => {
    lines.push('Procedure: ' + text(p.code) + (p.performedDateTime || p.performedPeriod ? ', ' + day(p.performedDateTime || p.performedPeriod.start) : ''));
  });
  bundles.reports.forEach((r) => {
    const concl = r.conclusion || (r.conclusionCode || []).map(text).join('; ');
    lines.push('Report ' + day(r.effectiveDateTime || r.issued) + ': ' + text(r.code) + (concl ? '. Conclusion: ' + concl : ''));
  });

  // Coded facts (no model involved). The quote is the digest line itself.
  const num = (x) => (typeof x === 'number' ? x : NaN);
  if (latest.anc && Number.isFinite(num(latest.anc.v.n))) coded.push({ key: 'anc', value: Math.round(latest.anc.v.n * 10) / 10, quote: latest.anc.line, coded: true });
  if (latest.plt && Number.isFinite(num(latest.plt.v.n))) coded.push({ key: 'plt', value: Math.round(latest.plt.v.n), quote: latest.plt.line, coded: true });
  if (latest.crcl && Number.isFinite(num(latest.crcl.v.n))) coded.push({ key: 'crcl', value: Math.round(latest.crcl.v.n), quote: latest.crcl.line, coded: true });
  if (latest.ecog) {
    const v = latest.ecog.v;
    const n = v.n != null ? v.n : (v.code || []).map((c) => ECOG_LA[c]).find((x) => x != null);
    if (n != null) coded.push({ key: 'ecog', value: n, quote: latest.ecog.line, coded: true });
  }
  const notes = [];
  // Bilirubin is stored as a multiple of the upper limit of normal; the conversion assumes a typical limit and says so.
  const bili = latest.biliMg ? { ...latest.biliMg, uln: 1.2, unit: 'mg/dL' } : latest.biliUmol ? { ...latest.biliUmol, uln: 21, unit: 'µmol/L' } : null;
  if (bili && Number.isFinite(num(bili.v.n))) {
    coded.push({ key: 'bili', value: Math.round((bili.v.n / bili.uln) * 10) / 10, quote: bili.line, derived: true });
    notes.push('Bilirubin converted to × upper limit of normal using ' + bili.uln + ' ' + bili.unit + '.');
  }
  return { text: lines.join('\n'), coded, notes };
}

// Medicines and conditions the app maps without a model, each grounded in a digest line.
const RULES = [
  { key: 'priorEGFR', value: true, re: /\b(osimertinib|gefitinib|erlotinib|afatinib|dacomitinib|lazertinib)\b/i, prefix: 'Medication:' },
  { key: 'priorALK', value: true, re: /\b(alectinib|lorlatinib|crizotinib|brigatinib|ceritinib)\b/i, prefix: 'Medication:' },
  { key: 'priorChemo', value: true, re: /\b(carboplatin|cisplatin|pemetrexed|docetaxel|paclitaxel|gemcitabine|vinorelbine|etoposide)\b/i, prefix: 'Medication:' },
  { key: 'priorIO', value: true, re: /\b(pembrolizumab|nivolumab|atezolizumab|durvalumab|cemiplimab|ipilimumab)\b/i, prefix: 'Medication:' },
  { key: 'histology', value: 'adeno', re: /adenocarcinoma/i, prefix: 'Condition:' },
  { key: 'histology', value: 'squamous', re: /squamous cell carcinoma of (the )?lung|squamous.*lung/i, prefix: 'Condition:' },
  { key: 'histology', value: 'sclc', re: /small cell (carcinoma|cancer) of (the )?lung|\bSCLC\b/i, prefix: 'Condition:', not: /non[- ]small/i },
  { key: 'ild', value: true, re: /interstitial lung disease|pneumonitis|pulmonary fibrosis/i, prefix: 'Condition:' },
  { key: 'autoimmune', value: true, re: /rheumatoid arthritis|systemic lupus|crohn|ulcerative colitis|multiple sclerosis|psoriasis|autoimmune/i, prefix: 'Condition:' }
];
// Coded stage on a lung cancer condition. Stage III is left to the reader (operable or not is not in the code).
const STAGE = [{ value: 'IV', re: /stage (4|IV)\b/i }, { value: 'early', re: /stage (1|2|I|II)[AB]?\b/i }];
function stageFact(lines) {
  const hits = [];
  lines.split('\n').forEach((l) => {
    if (!l.startsWith('Condition:') || !/lung/i.test(l) || /\((resolved|inactive|entered-in-error)\)/i.test(l)) return;
    const s = STAGE.find((x) => x.re.test(l));
    if (s) hits.push({ value: s.value, line: l, onset: (l.match(/onset (\d{4}-\d{2}-\d{2})/) || [])[1] || '' });
  });
  hits.sort((a, b) => (a.onset < b.onset ? 1 : -1));   // most recent first
  return hits.length ? [{ key: 'stage', value: hits[0].value, quote: hits[0].line }] : [];
}

function ruleFacts(lines) {
  const out = stageFact(lines);
  lines.split('\n').forEach((l) => {
    RULES.forEach((r) => {
      if (!l.startsWith(r.prefix) || !r.re.test(l) || (r.not && r.not.test(l))) return;
      if (/\((resolved|inactive|entered-in-error|stopped|cancelled)\)/i.test(l) && /^(ild|autoimmune)$/.test(r.key)) return;
      out.push({ key: r.key, value: r.value, quote: l });
    });
  });
  return out;
}

export async function readFhirPatient(patientId) {
  const c = fhirConfig();
  if (!c) throw new HttpError(503, 'fhir_not_configured', 'No FHIR server is connected.');
  const id = String(patientId || c.demoPatient || '').trim();
  if (!/^[A-Za-z0-9\-.]{1,64}$/.test(id)) throw new HttpError(400, 'bad_patient_id', 'Give a FHIR patient ID (letters, numbers, dots and dashes).');
  const pid = encodeURIComponent(id);
  const patient = await get(c, 'Patient/' + pid).catch((e) => {
    if (e.status === 404 || e.code === 'upstream_404') throw new HttpError(404, 'patient_not_found', 'That patient ID was not found on the FHIR server.');
    throw e;
  });
  const [conds, obs, medReq, medSt, procs, reps] = await Promise.all([
    get(c, 'Condition?patient=' + pid + '&_count=100'),
    get(c, 'Observation?patient=' + pid + '&_count=200&_sort=-date'),
    get(c, 'MedicationRequest?patient=' + pid + '&_count=100').catch(() => null),
    get(c, 'MedicationStatement?patient=' + pid + '&_count=100').catch(() => null),
    get(c, 'Procedure?patient=' + pid + '&_count=100').catch(() => null),
    get(c, 'DiagnosticReport?patient=' + pid + '&_count=50').catch(() => null)
  ]);
  const bundles = { conditions: entries(conds), observations: entries(obs), meds: entries(medReq).concat(entries(medSt)),
    procedures: entries(procs), reports: entries(reps) };
  const d = digest(bundles);
  const digestText = d.text.slice(0, 24000);

  // 1) codes and named medicines, checked like any other fact
  const base = ground(d.coded.concat(ruleFacts(digestText)), digestText);
  // 2) MedGemma reads the rest (tumour type, stage, gene results, progression, brain scans), when connected
  let reader = null, readerError = null;
  if (medgemmaConfig() && digestText) {
    try { reader = await readRecord(digestText.slice(0, 16000), 'a FHIR record summary (one line per resource)'); }
    catch (e) { readerError = e.message; }
  }
  const facts = { ...(reader ? reader.facts : {}), ...base.facts };   // coded values win over model-read ones
  const evidence = { ...(reader ? reader.evidence : {}), ...base.evidence };
  const birth = patient.birthDate ? String(patient.birthDate).slice(0, 4) : null;
  return {
    facts, evidence,
    rejected: base.rejected.concat(reader ? reader.rejected : []),
    notes: d.notes.concat(reader ? [] : [medgemmaConfig() ? 'MedGemma could not read this record: ' + (readerError || 'no answer') : 'MedGemma is not connected, so only coded results and named medicines were read.']),
    counts: { conditions: bundles.conditions.length, observations: bundles.observations.length, medicines: bundles.meds.length, procedures: bundles.procedures.length, reports: bundles.reports.length },
    patient: { id, birthYear: birth, sex: patient.gender || null },
    server: new URL(c.base).host,
    model: reader ? reader.model : null
  };
}
