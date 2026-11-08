// Public sources the online Researcher reads: Europe PMC (PubMed and preprints) and FDA drug labels (openFDA).
// Both are free and keyless. Every call here takes search words only, never anything from a patient's record.
import { HttpError, fetchJson } from './http.js';

const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const FDA = 'https://api.fda.gov/drug/label.json';

export const clean = (v, n) => String(v == null ? '' : v).replace(/[^\p{L}\p{N} .,'()+\-/%]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(e[1] === 'x' || e[1] === 'X' ? 2 : 1), e[1] === 'x' || e[1] === 'X' ? 16 : 10) || 32) : ENT[e.toLowerCase()] || m);
// Europe PMC sends some titles HTML-escaped ("KRAS&lt;sup&gt;G12C&lt;/sup&gt;"): decode, then drop the tags
const strip = (s) => decode(decode(String(s || ''))).replace(/<(sup|sub)>/gi, ' ').replace(/<\/?(sup|sub|i|b|em|strong|u)>/gi, '')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// Recent lung cancer papers for some search words. `words` is an Europe PMC query, such as '"sotorasib" OR "adagrasib"'.
export async function searchPapers(words, { size = 5, since = 2019 } = {}) {
  const q = '(' + words + ') AND ("lung cancer" OR NSCLC OR "non-small cell") AND PUB_YEAR:[' + since + ' TO ' + new Date().getFullYear() + ']';
  const url = EPMC + '?' + new URLSearchParams({ query: q, format: 'json', resultType: 'core', pageSize: String(size + 1), synonym: 'true' });
  const out = await fetchJson(url, {}, 20000);
  const papers = ((out.resultList || {}).result || []).filter((r) => r.title).slice(0, size).map((r) => ({
    title: strip(r.title),
    journal: (r.journalInfo && r.journalInfo.journal && r.journalInfo.journal.title) || (r.bookOrReportDetails && r.bookOrReportDetails.publisher) || r.source,
    year: r.pubYear, pmid: r.pmid || null, doi: r.doi || null, preprint: r.source === 'PPR',
    url: r.doi ? 'https://doi.org/' + r.doi : r.pmid ? 'https://europepmc.org/article/MED/' + r.pmid : 'https://europepmc.org/article/' + r.source + '/' + r.id,
    abstract: strip(r.abstractText).slice(0, 900)
  }));
  return { query: q, hits: out.hitCount || 0, papers };
}

// A label section without its heading ("1 INDICATIONS AND USAGE", "12.1 Mechanism of Action").
function section(v, n) {
  const s = strip(Array.isArray(v) ? v.join(' ') : v)
    .replace(/^\s*\d+(\.\d+)?\s*(INDICATIONS (AND|&) USAGE|Mechanism of Action|WARNINGS AND PRECAUTIONS|ADVERSE REACTIONS|BOXED WARNING)\s*/i, '');
  return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
}
// The label's own summary of common side effects, when it has one.
function commonSideEffects(v) {
  const s = strip(Array.isArray(v) ? v.join(' ') : v);
  const m = s.match(/[^.]*most common adverse reactions[^.]*\./i);
  return m ? m[0].trim().slice(0, 600) : section(v, 500);
}

// The FDA label of an approved drug, or null when openFDA has none (not approved in the US, or not listed).
export async function drugLabel(name) {
  const n = clean(name, 40).replace(/[^\p{L}\p{N} -]/gu, '').trim();
  if (n.length < 3) return null;
  const word = n.split(' ')[0];
  // Some labels (Tagrisso, osimertinib, among them) carry no openfda names, so the last try reads the product's own
  // listing ("TAGRISSO osimertinib OSIMERTINIB ..."), and takes the names from it.
  const tries = ['openfda.generic_name:"' + n + '"', 'openfda.brand_name:"' + n + '"', 'openfda.generic_name:' + word + '*', 'spl_product_data_elements:"' + n + '"'];
  for (const search of tries) {
    let out;
    try { out = await fetchJson(FDA + '?' + new URLSearchParams({ search, limit: '1' }), {}, 12000); }
    catch (e) { if (e instanceof HttpError && e.status === 404) continue; throw e; }
    const r = out && out.results && out.results[0];
    if (!r) continue;
    const of = r.openfda || {};
    const listed = String((r.spl_product_data_elements || [])[0] || '').split(/\s+/);
    const named = !of.generic_name && listed.length > 1 && /^[A-Z][A-Z0-9-]+$/.test(listed[0]) && /^[a-z]/.test(listed[1]);
    const generic = String((of.generic_name || [])[0] || (named ? listed[1] : n)), brand = String((of.brand_name || [])[0] || (named ? listed[0] : ''));
    const date = String(r.effective_time || '');
    return {
      brand, generic,
      indication: section(r.indications_and_usage, 700),
      mechanism: section(r.mechanism_of_action, 450),
      boxed_warning: r.boxed_warning ? section(r.boxed_warning, 300) : null,
      common_side_effects: commonSideEffects(r.adverse_reactions),
      label_date: /^\d{8}$/.test(date) ? date.slice(0, 4) + '-' + date.slice(4, 6) + '-' + date.slice(6) : null,
      url: 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=' + encodeURIComponent(generic.toLowerCase())
    };
  }
  return null;
}
