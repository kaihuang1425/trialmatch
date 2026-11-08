// LOCAL TESTING ONLY. A stand-in for a MedGemma server with the same OpenAI-compatible API, so the plumbing can be
// tested without GPUs or keys. It is not a model: it pattern-matches the prompt. Never point a deployment at it.
//   node scripts/mock-medgemma.mjs        then set MEDGEMMA_BASE_URL=http://127.0.0.1:8790/v1 and MEDGEMMA_API_KEY=test-key
import http from 'node:http';

const PATTERNS = [
  ['histology', 'adeno', /adenocarcinoma/i],
  ['stage', 'IV', /stage\s*IV/i],
  ['egfr', 'ex19del', /EGFR exon 19 deletion/i],
  ['egfr', 'L858R', /EGFR L858R/i],
  ['alk', 'neg', /ALK and ROS1 negative/i],
  ['ros1', 'neg', /ALK and ROS1 negative/i],
  ['priorEGFR', true, /osimertinib/i],
  ['progressed', 'yes', /progressed on [a-z]+/i],
  ['ecog', 1, /ECOG performance status 1/i],
  ['brain', 'none', /no intracranial metastases/i],
  ['anc', 3.1, /neutrophils 3\.1/i],
  ['plt', 214, /platelets 214/i]
];

function reply(prompt) {
  if (/Records Reader/.test(prompt)) {
    const text = (prompt.split('Text:\n"""\n')[1] || '').split('\n"""')[0];
    const facts = [];
    for (const [key, value, re] of PATTERNS) { const m = text.match(re); if (m) facts.push({ key, value, quote: m[0] }); }
    // One fact the text never states, so the grounding check has something to reject.
    facts.push({ key: 'kras', value: 'G12C', quote: 'KRAS G12C mutation detected' });
    return '<unused94>thought: reading the letter<unused95>```json\n' + JSON.stringify({ facts }) + '\n```';
  }
  if (/pre-screen/.test(prompt)) {
    const has = (label) => prompt.split('\n').some((l) => l.startsWith('- ' + label + ':') && !l.endsWith('NOT RECORDED'));
    return JSON.stringify({ rules: [
      { rule: 'Non-small cell lung cancer, advanced or metastatic', type: 'inc', status: has('Stage') ? 'met' : 'unknown', why: has('Stage') ? 'Stage recorded' : 'Stage not recorded' },
      { rule: 'Fitness (ECOG) 0 to 1', type: 'inc', status: has('ECOG performance status') ? 'met' : 'unknown', why: has('ECOG performance status') ? 'ECOG recorded' : 'ECOG not recorded' },
      { rule: 'EGFR mutation confirmed', type: 'inc', status: has('EGFR') ? 'met' : 'unknown', why: has('EGFR') ? 'EGFR result recorded' : 'EGFR result not recorded' },
      { rule: 'No untreated brain metastases', type: 'exc', status: 'unknown', why: 'Brain scan result needed' }
    ] });
  }
  return '{}';
}

http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) { res.statusCode = 404; return res.end('{}'); }
  if (req.headers.authorization !== 'Bearer test-key') { res.statusCode = 401; return res.end('{"error":{"message":"bad key"}}'); }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const j = JSON.parse(body);
    const prompt = j.messages.map((m) => m.content).join('\n');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ model: 'mock-medgemma (local test only)', choices: [{ message: { role: 'assistant', content: reply(prompt) } }] }));
  });
}).listen(8790, '127.0.0.1', () => console.log('Mock MedGemma on http://127.0.0.1:8790/v1 (key: test-key)'));
