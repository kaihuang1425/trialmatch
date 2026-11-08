// The record schema the app understands, and the Records Reader: MedGemma pulls facts out of clinical text,
// then every fact is checked against the text it came from before the app sees it.
import { chat, parseJson } from './medgemma.js';

const E = (values, label) => ({ type: 'enum', values, label });
const N = (min, max, label, int) => ({ type: 'number', min, max, label, int: !!int });
const T = (label) => ({ type: 'true', label });

export const FIELDS = {
  histology: E(['adeno', 'squamous', 'sclc'], 'Tumour type: adeno (adenocarcinoma), squamous (squamous cell), sclc (small cell)'),
  stage: E(['IV', 'III_unres', 'IIIA_res', 'early', 'es'], 'Stage: IV, III_unres (stage III not operable), IIIA_res (stage IIIA operable), early (stage I-II), es (extensive-stage small cell)'),
  egfr: E(['neg', 'ex19del', 'L858R', 'ex20ins', 'other'], 'EGFR: neg (no mutation), ex19del, L858R, ex20ins, other (another EGFR mutation)'),
  alk: E(['neg', 'pos'], 'ALK rearrangement: neg or pos'),
  ros1: E(['neg', 'pos'], 'ROS1 rearrangement: neg or pos'),
  kras: E(['neg', 'G12C'], 'KRAS: neg (no G12C) or G12C'),
  pdl1: N(0, 100, 'PD-L1 tumour proportion score in %'),
  ecog: N(0, 4, 'ECOG performance status 0-4', true),
  priorEGFR: T('Has had an EGFR tablet (osimertinib, gefitinib, erlotinib, afatinib...)'),
  priorALK: T('Has had an ALK tablet (alectinib, lorlatinib, crizotinib, brigatinib...)'),
  priorChemo: T('Has had chemotherapy'),
  priorIO: T('Has had immunotherapy (pembrolizumab, nivolumab, atezolizumab, durvalumab...)'),
  priorCRT: T('Has had chemoradiotherapy'),
  progressed: E(['yes', 'no'], 'Cancer grew on the latest treatment: yes or no'),
  lastTxWeeks: N(0, 520, 'Weeks since the last cancer treatment'),
  brain: E(['none', 'treated_stable', 'untreated'], 'Brain metastases: none, treated_stable, untreated'),
  anc: N(0, 100, 'Neutrophils x10^9/L'),
  plt: N(0, 2000, 'Platelets x10^9/L'),
  crcl: N(0, 300, 'Creatinine clearance mL/min'),
  bili: N(0, 50, 'Bilirubin as a multiple of the upper limit of normal'),
  autoimmune: T('Has an autoimmune disease treated in the last 2 years'),
  ild: T('Has interstitial lung disease or pneumonitis'),
  infection: T('Has an infection being treated now')
};

// A quote must contain these words for the value to count as stated (the "Skeptic" check).
const MUST = {
  histology: { adeno: /adeno/i, squamous: /squamous/i, sclc: /small[- ]cell|\bsclc\b/i },
  stage: { IV: /\b(iv|4|m1[abc]?)\b|metasta/i, III_unres: /\b(iii|3)\b/i, IIIA_res: /\b(iiia|3a)\b/i, early: /\b(i|ii|1|2|ia|ib|iia|iib)\b/i, es: /extensive/i },
  egfr: { neg: /neg|wild|not detected|no .{0,20}mutation/i, ex19del: /19/, L858R: /L858R/i, ex20ins: /20/, other: /egfr/i },
  alk: { neg: /neg|not detected|no /i, pos: /pos|rearrang|fusion|detected/i },
  ros1: { neg: /neg|not detected|no /i, pos: /pos|rearrang|fusion|detected/i },
  kras: { neg: /neg|wild|not detected|no /i, G12C: /G12C/i },
  // "has grown" states growth; "has not grown" or "no growth" doesn't, so a negated quote can't back "yes"
  progressed: { yes: /^(?!.*\b(no|not|without)\b.{0,25}(progress|grow|grew)|.*n't (progress|grow)).*(progress|grow|grew|worse|increase|enlarg|bigger)/i,
    no: /stable|respon|shrunk|shrank|smaller|no (sign of |evidence of )?(progression|growth)|not (progress|grow)|n't (progress|grow)/i },
  brain: { none: /no .{0,30}(brain|intracranial|cerebral)|(brain|intracranial|mri).{0,40}(clear|normal|negative|no )/i, treated_stable: /treat|stable/i, untreated: /metasta|lesion|deposit/i }
};

const norm = (s) => String(s).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

export function cleanValue(key, v) {
  const f = FIELDS[key];
  if (!f) return undefined;
  if (f.type === 'enum') return f.values.includes(v) ? v : undefined;
  if (f.type === 'true') return v === true || v === 'true' ? true : undefined;
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  if (!Number.isFinite(n) || n < f.min || n > f.max || (f.int && !Number.isInteger(n))) return undefined;
  return n;
}

// Keeps a record's known fields only (used when the browser sends a record for a pre-check).
export function cleanRecord(rec) {
  const out = {};
  Object.keys(FIELDS).forEach((k) => { const v = cleanValue(k, rec && rec[k]); if (v !== undefined) out[k] = v; });
  return out;
}

// The Skeptic: a fact survives only if its quote is in the source and actually states the value.
export function ground(items, source) {
  const src = norm(source);
  const facts = {}, evidence = {}, rejected = [];
  (Array.isArray(items) ? items : []).slice(0, 60).forEach((it) => {
    if (!it || typeof it !== 'object') return;
    const key = String(it.key || '');
    const value = cleanValue(key, it.value);
    const quote = typeof it.quote === 'string' ? it.quote.trim().slice(0, 300) : '';
    const no = (reason) => rejected.push({ key, value: it.value, quote, reason });
    if (!FIELDS[key]) return no('not a field the app uses');
    if (value === undefined) return no('value not allowed');
    if (!quote) return no('no quote given');
    if (!src.includes(norm(quote))) return no('quote is not in the text');
    if (FIELDS[key].type === 'number' && !it.coded && !it.derived) {   // coded/derived values come from a FHIR code, not prose
      const digits = String(value);
      const tail = digits.includes('.') ? '0*' : '(?:\\.0+)?';
      if (!new RegExp('(^|[^0-9.])' + digits.replace('.', '\\.') + tail + '(?![0-9])').test(quote)) return no('number is not in the quote');
    }
    const must = MUST[key] && MUST[key][value];
    if (must && !must.test(quote)) return no('quote does not state this value');
    if (key in facts && facts[key] !== value) return no('conflicts with another quote');
    facts[key] = value;
    evidence[key] = quote;
  });
  return { facts, evidence, rejected };
}

function fieldList() {
  return Object.keys(FIELDS).map((k) => {
    const f = FIELDS[k];
    const v = f.type === 'enum' ? 'one of ' + f.values.join(' | ') : f.type === 'true' ? 'true (only when stated)' : 'number';
    return '- ' + k + ': ' + v + '. ' + f.label;
  }).join('\n');
}

// What Gemini's reply must look like (structured output). The value is text for every field, so one schema covers
// options, numbers and "true"; cleanValue turns it back into the right type, and ground() still checks every quote.
export const FACTS_SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', enum: Object.keys(FIELDS) },
          value: { type: 'string', description: 'One allowed option, a number such as 3.1, or true' },
          quote: { type: 'string', description: 'The exact words from the text that state this fact, copied character for character' }
        },
        required: ['key', 'value', 'quote']
      }
    }
  },
  required: ['facts']
};

export async function readRecord(text, kind) {
  const system =
    'You are the Records Reader for a lung cancer clinical-trial matching service. You read ' + kind + '.\n' +
    'Extract only facts the text states explicitly. Never infer, guess or use outside knowledge. Leave out anything not stated.\n' +
    'For every fact, copy the exact words from the text that state it into "quote" (character for character, at most 200 characters).\n' +
    'Allowed keys and values:\n' + fieldList() + '\n\n' +
    'Reply with JSON only, no prose: {"facts":[{"key":"...","value":...,"quote":"..."}]}';
  const user = 'Text:\n"""\n' + text + '\n"""';
  const r = await chat({ system, user, maxTokens: 1500, schema: FACTS_SCHEMA });
  const parsed = parseJson(r.text);
  const g = ground(parsed.facts, text);
  return { ...g, model: r.model, provider: r.provider, family: r.family };
}
