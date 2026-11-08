// Runs TMProtein.resolve() from app/protein/protein-view.js under Node for tests/test_protein.py.
// node tests/protein_resolve.js <input.json>   input: {cases: [{record, trial}]}   output: JSON on stdout
// Also returns, per structure, the residues present in the shipped PDB text (chain:resi -> residue name).
const fs = require('fs');
const path = require('path');

global.window = globalThis;
require(path.join(__dirname, '..', 'app', 'protein', 'structures.js'));
require(path.join(__dirname, '..', 'app', 'protein', 'protein-view.js'));

const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const residues = {};
for (const [pdb, entry] of Object.entries(window.TM_STRUCTURES)) {
  const map = {};
  for (const l of entry.pdb.split('\n')) {
    if (l.startsWith('ATOM') && l.substr(12, 4) === ' CA ') map[l[21] + ':' + parseInt(l.substr(22, 4), 10)] = l.substr(17, 3).trim();
  }
  residues[pdb] = { map, ligandResn: entry.meta.ligand.pdbResn, hasLigand: entry.pdb.includes('HETATM') };
}
const out = input.cases.map((c) => window.TMProtein.resolve(c.record, c.trial));
const I = window.TMProtein._internals;
const refs = Object.values(I.GENE).map((g) => g.pdb);
for (const d of I.DRUGS) if (d.pdb) refs.push(...Object.values(d.pdb));
process.stdout.write(JSON.stringify({ results: out, residues, refs: [...new Set(refs)], version: window.TMProtein.version }));
