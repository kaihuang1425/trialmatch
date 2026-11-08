// The Analyst: the team's local agent. MedGemma reads the Researcher's public brief against the person's record.
// It runs where the record already is: on the person's own computer (the browser calls Ollama directly, with the same
// prompt as here; keep analystSystem/analystClean in public/app/index.html in step), or on this site's own MedGemma
// server. It never runs on a cloud model: api/agents/analyst.js refuses when the site's model is Gemini.
import { plainText } from './agent.js';

// Three labelled lines: a small model keeps to a shape far better than to "at most N words".
export function analystSystem(team) {
  return 'You are the Analyst in Trial Match\'s team of agents, in a demo where the record and the LT- trials are synthetic. ' +
    'You run where the record is kept, so it never goes online.\n' +
    'The Researcher, an online agent that never saw the record, sent you a brief from public sources, with numbered sources.\n' +
    (team
      ? 'Compare the brief with the trial and its applicants. Write to a trial team member, in plain British English, at most 90 words, as exactly three lines:\n' +
        'Who was studied: how the people in the research compare with this trial\'s applicants.\n' +
        'What it means for your applicants: what the open items or the counts suggest checking.\n' +
        'Worth checking: one thing the evidence does not settle.\n'
      : 'Compare the brief with the record. Write to the patient as "you", in plain British English, at most 90 words, as exactly three lines:\n' +
        'Who was studied: how the people in the research compare with you (gene change, earlier treatment, stage).\n' +
        'What fits: what in your record matches the research, or does not. The record\'s checked_by_rules lines are already checked: follow them, and say plainly when your gene change differs.\n' +
        'Worth asking: one thing that is unknown, for your care team or the trial team.\n') +
    'You may cite the brief\'s source numbers, like [2]. Never say anyone is eligible, qualifies or should take the drug: the trial team decides. ' +
    'Say only what the brief and the record state: do not explain what a gene change is beyond them. Do not list the trial\'s entry rules. No medical advice. Plain text, no Markdown.';
}

const words = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, n);

// brief: { drug, kind, sentences: [{ text, sources }], studied_in, open_questions }, sources: [{ n, title }]
export function analystPrompt(question, brief, sources, context) {
  const b = brief && typeof brief === 'object' ? brief : {};
  const list = (Array.isArray(b.sentences) ? b.sentences : []).slice(0, 6)
    .map((s) => '- ' + words(s && s.text, 400) + ' [' + (Array.isArray(s && s.sources) ? s.sources.map(Number).filter(Boolean).join(', ') : '') + ']').join('\n');
  const src = (Array.isArray(sources) ? sources : []).slice(0, 12).map((s) => '[' + Number(s.n) + '] ' + words(s.title, 160)).join('\n');
  return 'Question: ' + words(question, 300) + '\n\n' +
    'Brief from the Researcher (public sources)' + (b.drug ? ' about ' + words(b.drug, 80) + (b.kind ? ' (' + words(b.kind, 100) + ')' : '') : '') + ':\n' + (list || '- (no brief)') + '\n' +
    (b.studied_in ? 'Studied in: ' + words(b.studied_in, 300) + '\n' : '') +
    (Array.isArray(b.open_questions) && b.open_questions.length ? 'Not settled by the evidence: ' + b.open_questions.slice(0, 3).map((q) => words(q, 160)).join('; ') + '\n' : '') +
    (src ? 'Sources:\n' + src + '\n' : '') +
    '\nRecord (synthetic, JSON):\n' + JSON.stringify(context && typeof context === 'object' ? context : {}).slice(0, 5000);
}

// Small local models can loop or overreach. Keep each sentence once, drop any that says someone is eligible or meets
// the rules (claims counts them, so the caller can add the reminder), and stop at about `max` words. Lines stay lines.
const CLAIMY = /\b(is|are|was|be|being|seems?|appears?|looks?|'s|’s)\s+(definitely |likely |probably |clearly |fully |also |now )?(eligible|qualified|a (good |suitable |strong )?candidate)\b|\bqualif(y|ies)\b|\bmeets? (all |every )?(of )?(the |your |their )?(entry |eligibility |inclusion )?(criteria|rules)\b/i;
const HEDGE = /\bonly the trial team\b|\bthe trial team (decides|can confirm|will decide|confirms)\b/i;
export function analystClean(text, max = 130) {
  const seen = new Set(), lines = [];
  let n = 0, claims = 0, full = false;
  // a label run into the line before ("... What fits: ...") starts its own line
  for (const line of String(text || '').replace(/^\s*(dear|hi|hello)\b[^\n.]{0,40}[,!]?\s*\n/i, '')   // no "Dear Patient,"
    .replace(/\s+(What fits|Worth asking|What it means for your applicants|Worth checking):/g, '\n$1:').split(/\n+/)) {
    const keep = [];
    for (const s of line.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/)) {
      const key = s.replace(/^[A-Z][\w ]{2,40}:\s*/, '').toLowerCase().replace(/\[\d+\]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();   // "What fits: X" repeats X
      if (!key || seen.has(key) || full) continue;
      seen.add(key);
      if (CLAIMY.test(s) && !HEDGE.test(s)) { claims++; continue; }
      const w = s.split(' ').length;
      if (n + w > max && n) { full = true; continue; }
      keep.push(s); n += w;
    }
    if (keep.length) lines.push(keep.join(' '));
  }
  return { text: lines.join('\n'), claims, words: n };
}

export const analystText = (s) => plainText(s);
