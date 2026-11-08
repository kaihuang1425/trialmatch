// The Analyst: the team's local agent. MedGemma reads the Researcher's public brief against the person's record.
// It runs where the record already is: on the person's own computer (the browser calls Ollama directly, with the same
// prompt as here; keep ANALYST_SYS in public/app/index.html in step), or on this site's own MedGemma server.
// It never runs on a cloud model: api/agents/analyst.js refuses when the site's model is Gemini.
import { plainText } from './agent.js';

export const ANALYST_SYSTEM =
  'You are the Analyst in Trial Match\'s team of agents. You run where the record is kept, so it never goes online. ' +
  'This is a demo: the record and the LT- trials are synthetic.\n' +
  'The Researcher, an online agent that never saw the record, sent you a brief from public sources, with numbered sources.\n' +
  'Compare the brief with the record and the trial facts. In at most 100 words of plain British English, say: ' +
  'how the people the evidence comes from compare with this person (cancer type, stage, gene change, earlier treatment); ' +
  'what in the record fits or does not; and what is unknown and worth asking the care team or the trial team. ' +
  'You may cite the brief\'s source numbers, like [2].\n' +
  'Use only the brief and the record. Never say anyone is eligible, qualifies or should take the drug; the trial team decides. ' +
  'No medical advice. Plain text, no Markdown.';
export const ANALYST_TEAM =
  ' The person asking works on a trial team: compare the brief with the trial\'s entry rules and its applicants (counts and open items), ' +
  'and say what it means for who to check or invite.';

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
    '\nRecord and trial facts (synthetic, JSON):\n' + JSON.stringify(context && typeof context === 'object' ? context : {}).slice(0, 7000);
}

export const analystText = (s) => plainText(s);
