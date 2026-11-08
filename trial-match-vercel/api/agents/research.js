// POST /api/agents/research { topic, terms? }  ->  { papers, summary?, model?, steps }
// The Research agent: searches the published literature (Europe PMC, which covers PubMed and preprints, free and
// keyless) for what is known about a trial's drug or target, then, when a model is connected, writes a short answer
// in which every sentence cites one of the papers it was given. Citations to papers it wasn't given are removed.
// It only ever sees search words, never the patient's record.
import { HttpError, clientIp, fetchJson, readJson, route, send } from '../../lib/http.js';
import { rateLimit } from '../../lib/redis.js';
import { chat, medgemmaConfig } from '../../lib/medgemma.js';

const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const clean = (v, n) => String(v == null ? '' : v).replace(/[^\p{L}\p{N} .,'()+\-/]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const SYSTEM = 'You summarise published research for a clinical trial matching demo. Use only the numbered papers given. ' +
  'Write at most 90 words in plain British English. End every sentence with the number of the paper it comes from, like [2]. ' +
  'Do not add facts that are not in the papers. Do not give medical advice or say who is eligible.';

export default route(['POST'], async (req, res) => {
  const body = await readJson(req, 8 * 1024);
  const topic = clean(body.topic, 120);
  const terms = (Array.isArray(body.terms) ? body.terms : []).map((t) => clean(t, 40)).filter(Boolean).slice(0, 4);
  if (topic.length < 3 && !terms.length) throw new HttpError(400, 'too_short', 'Say what to look up.');
  await rateLimit('research:' + clientIp(req), 20, 600);
  const words = terms.length ? terms.map((t) => '"' + t + '"').join(' OR ') : topic;
  const q = '(' + words + ') AND ("lung cancer" OR NSCLC OR "non-small cell") AND PUB_YEAR:[2019 TO 2026]';
  const url = EPMC + '?' + new URLSearchParams({ query: q, format: 'json', resultType: 'core', pageSize: '6', synonym: 'true' });
  const out = await fetchJson(url, {}, 20000);
  const list = ((out.resultList || {}).result || []).filter((r) => r.title).slice(0, 5);
  const papers = list.map((r, i) => ({
    n: i + 1, title: strip(r.title), journal: (r.journalInfo && r.journalInfo.journal && r.journalInfo.journal.title) || r.bookOrReportDetails?.publisher || r.source,
    year: r.pubYear, pmid: r.pmid || null, doi: r.doi || null, preprint: r.source === 'PPR',
    url: r.doi ? 'https://doi.org/' + r.doi : r.pmid ? 'https://europepmc.org/article/MED/' + r.pmid : 'https://europepmc.org/article/' + r.source + '/' + r.id,
    abstract: strip(r.abstractText).slice(0, 900)
  }));
  const steps = [{ ok: true, label: 'Searched Europe PMC (PubMed and preprints) for ' + (terms.length ? terms.join(', ') : '“' + topic + '”') + ': ' + (out.hitCount || 0) + ' papers since 2019' }];
  let summary = null, model = null, family = null;
  if (papers.length && medgemmaConfig()) {
    steps.push({ ok: true, label: 'Read the top ' + papers.length + ' abstracts' });
    try {
      const user = 'Question: what is known about ' + (topic || terms.join(', ')) + '?\n\nPapers:\n' +
        papers.map((p) => '[' + p.n + '] ' + p.title + ' (' + (p.journal || 'journal not listed') + ', ' + p.year + ')' + (p.preprint ? ' [preprint]' : '') + '\n' + (p.abstract || 'No abstract.')).join('\n\n');
      const r = await chat({ system: SYSTEM, user, maxTokens: 1400 });
      // keep only citations to papers it was given; drop sentences left with none
      const ok = (n) => n >= 1 && n <= papers.length;
      const kept = String(r.text || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.replace(/\[(\d+)\]/g, (m, n) => (ok(+n) ? m : '')).trim())
        .filter((s) => /\[\d+\]/.test(s));
      if (kept.length) { summary = kept.join(' '); model = r.model; family = r.family || 'MedGemma'; steps.push({ ok: true, label: 'Summarised with ' + family + ', every sentence cited' }); }
      else steps.push({ ok: false, label: 'The summary had no checkable citations, so it was left out' });
    } catch (e) {
      steps.push({ ok: false, label: 'No summary: ' + (e instanceof HttpError ? e.message : 'the model didn’t answer') });
    }
  }
  send(res, 200, { query: q, hits: out.hitCount || 0, papers: papers.map(({ abstract, ...p }) => p), summary, model, family, steps },
    'public, max-age=0, s-maxage=3600');
});
