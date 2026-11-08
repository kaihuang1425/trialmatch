// Runs app/matcher.js under Node for tests/test_parity.py.
// node tests/parity.js <input.json>   input: {trials: [...], patients: [...]}   output: JSON on stdout
const fs = require('fs');
const path = require('path');
const M = require(path.join(__dirname, '..', 'app', 'matcher.js'));

const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = input.patients.map((p) => {
  const r = M.rank(p, input.trials, { weights: input.weights });
  return {
    id: p.id, n_possible: r.n_possible, removed: r.removed,
    top: r.top.map((x) => ({ nct: x.nct, score: x.score, E: x.E, labels: x.labels.map((l) => [l.field, l.status]) })),
    questions: r.questions.map((q) => [q.field, q.trials_affected]),
  };
});
process.stdout.write(JSON.stringify(out));
