"""Build public/app/protein/targets.js: the drug-target structures for trials that don't target a driver change.

    python -I tools/prepare_targets.py

Immunotherapy, blood-vessel blockers, antibodies against EGFR's outer part and antibody-drug conjugates (whose
payload blocks topoisomerase I) each get one crystal structure from the Protein Data Bank. For every entry the script
  1. downloads the PDB-format file from files.rcsb.org (cached next to this script, not committed),
  2. keeps model 1, the target chain(s), the drug (an antibody's chains, or one copy of a small molecule) and any DNA;
     drops waters, ions, sugars, buffers and alternate locations after the first,
  3. finds the binding site: target residues with any atom within 4.5 A of the drug,
  4. writes PDB text with backbone atoms only (enough for the cartoon) except binding-site residues, DNA and the
     small-molecule drug, which keep every atom.
The output adds entries to window.TM_STRUCTURES (loaded after structures.js) in the same shape protein-view.js reads.
PDB data: CC0 1.0 (wwPDB / RCSB PDB). Cite the entries shown.
"""
import json
import math
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'app' / 'protein' / 'targets.js'
CACHE = Path(__file__).resolve().parent / '.pdb-cache'
CONTACT = 4.5
BACKBONE = {' N  ', ' CA ', ' C  ', ' O  '}
NUCLEIC = {'DA', 'DC', 'DG', 'DT', 'TGP'}
MODIFIED = {'PTR': 'protein', 'TGP': 'dna'}   # HETATM residues that are part of a chain; written as ATOM

ENTRIES = [
    {'pdb': '5X8M', 'gene': 'PD-L1', 'target': ['A'], 'drug': 'Durvalumab', 'antibody': ['B', 'C'],
     'title': 'PD-L1 in complex with durvalumab', 'resolution': 2.661},
    {'pdb': '1BJ1', 'gene': 'VEGF', 'target': ['V', 'W'], 'drug': 'Anti-VEGF antibody', 'antibody': ['H', 'L'],
     'title': 'Vascular endothelial growth factor in complex with a neutralizing antibody', 'resolution': 2.4},
    {'pdb': '1YY9', 'gene': 'EGFR', 'target': ['A'], 'drug': 'Cetuximab', 'antibody': ['C', 'D'],
     'title': 'Extracellular domain of EGFR in complex with the Fab fragment of cetuximab', 'resolution': 2.605},
    {'pdb': '1K4T', 'gene': 'TOP1', 'target': ['A'], 'dna': ['B', 'C', 'D'], 'drug': 'Topotecan', 'ligand': ('TTC', 'D'),
     'title': 'Human DNA topoisomerase I in complex with topotecan and a 22 base pair DNA duplex', 'resolution': 2.1},
]


def fetch(pdb):
    CACHE.mkdir(exist_ok=True)
    p = CACHE / (pdb + '.pdb')
    if not p.exists():
        req = urllib.request.Request('https://files.rcsb.org/download/%s.pdb' % pdb, headers={'User-Agent': 'trialmatch-prepare-targets'})
        p.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    return p.read_text(encoding='utf-8', errors='replace').splitlines()


def atoms_of(lines):
    out, seen = [], set()
    for l in lines:
        if l.startswith('ENDMDL'):
            break   # model 1 only
        rec = l[:6]
        if rec not in ('ATOM  ', 'HETATM'):
            continue
        alt = l[16]
        key = (l[21], l[22:27], l[12:16])
        if alt not in (' ', 'A') or key in seen:
            continue
        seen.add(key)
        out.append({'line': l, 'rec': rec, 'name': l[12:16], 'resn': l[17:20].strip(), 'chain': l[21], 'resi': int(l[22:26]),
                    'icode': l[26], 'x': float(l[30:38]), 'y': float(l[38:46]), 'z': float(l[46:54]), 'el': l[76:78].strip()})
    return out


def near(a, pts, d):
    d2 = d * d
    for b in pts:
        dx, dy, dz = a['x'] - b['x'], a['y'] - b['y'], a['z'] - b['z']
        if dx * dx + dy * dy + dz * dz <= d2:
            return True
    return False


def line_for(a):
    l = a['line'].ljust(80)
    rec = 'ATOM  ' if a['rec'] == 'ATOM  ' or a['resn'] in MODIFIED else 'HETATM'
    l = rec + l[6:16] + ' ' + l[17:]
    keep_el = rec == 'HETATM' or a['resn'] in MODIFIED or a['resn'] in NUCLEIC
    return (l[:78] if keep_el else l[:54]).rstrip()


def build(e):
    lines = fetch(e['pdb'])
    A = atoms_of(lines)
    target = [a for a in A if a['chain'] in e['target'] and (a['rec'] == 'ATOM  ' or a['resn'] in MODIFIED)]
    dna = [a for a in A if a['chain'] in e.get('dna', []) and (a['resn'] in NUCLEIC)]
    if e.get('antibody'):
        drug = [a for a in A if a['chain'] in e['antibody'] and a['rec'] == 'ATOM  ']
    else:
        ccd, ch = e['ligand']
        drug = [a for a in A if a['rec'] == 'HETATM' and a['resn'] == ccd and a['chain'] == ch]
    assert target and drug, e['pdb']
    # binding site: target residues touching the drug (coarse grid first, so this stays fast)
    cell = {}
    for b in drug:
        cell.setdefault((int(b['x'] // CONTACT), int(b['y'] // CONTACT), int(b['z'] // CONTACT)), []).append(b)
    site = {}
    for a in target:
        cx, cy, cz = int(a['x'] // CONTACT), int(a['y'] // CONTACT), int(a['z'] // CONTACT)
        pts = [b for dx in (-1, 0, 1) for dy in (-1, 0, 1) for dz in (-1, 0, 1) for b in cell.get((cx + dx, cy + dy, cz + dz), [])]
        if near(a, pts, CONTACT):
            site[(a['chain'], a['resi'])] = a['resn']
    rows = sorted([[c, r, n] for (c, r), n in site.items()], key=lambda x: (x[0], x[1]))
    keep = []
    for a in target:
        if a['name'] in BACKBONE or (a['chain'], a['resi']) in site:
            keep.append(a)
    keep += dna
    if e.get('antibody'):
        keep += [a for a in drug if a['name'] in BACKBONE]
    else:
        keep += drug
    chains = sorted({a['chain'] for a in keep}, key=lambda c: (c not in e['target'], c))
    ss = [l for l in lines if l.startswith(('HELIX ', 'SHEET ')) and (l[19] in chains if l.startswith('HELIX') else l[21] in chains)]
    pdb = '\n'.join(ss + [line_for(a) for a in keep]) + '\nEND\n'
    resis = sorted({a['resi'] for a in target})
    meta = {
        'atoms': len(keep), 'chain': e['target'][0], 'chains': chains, 'construct': None, 'constructMutations': [], 'covalent': [],
        'drug': e['drug'], 'drugNamedInEntryAs': [e['drug']], 'gene': e['gene'],
        'hotspots': {'site': {'residues': rows}},
        'ligand': ({'antibody': True, 'chains': e['antibody'], 'name': e['drug'], 'ccd': None, 'atoms': sum(1 for a in drug if a['name'] in BACKBONE)}
                   if e.get('antibody') else {'atoms': len(drug), 'ccd': e['ligand'][0], 'chain': e['ligand'][1], 'name': e['drug'], 'pdbResn': e['ligand'][0], 'resi': drug[0]['resi']}),
        'method': 'X-RAY DIFFRACTION', 'modelled': [resis[0], resis[-1]], 'partner': None, 'pdb': e['pdb'],
        'resolution': e['resolution'], 'title': e['title'], 'target': True
    }
    return meta, pdb


def main():
    out = {}
    for e in ENTRIES:
        meta, pdb = build(e)
        out[e['pdb']] = {'meta': meta, 'pdb': pdb}
        print(e['pdb'], meta['gene'], 'atoms', meta['atoms'], 'site residues', len(meta['hotspots']['site']['residues']), 'bytes', len(pdb))
    js = ('/* TrialMatch drug-target structures. Generated by tools/prepare_targets.py; do not edit by hand.\n'
          ' * Trimmed from Protein Data Bank entries (files.rcsb.org). PDB data: CC0 1.0.\n'
          ' * Adds to window.TM_STRUCTURES; load after structures.js. */\n'
          '(function (T) {\n' + ''.join('T[%s] = %s;\n' % (json.dumps(k), json.dumps(v, sort_keys=True)) for k, v in out.items()) +
          '})(window.TM_STRUCTURES = window.TM_STRUCTURES || {});\n')
    OUT.write_text(js, encoding='utf-8')
    print('wrote', OUT, len(js), 'bytes')


if __name__ == '__main__':
    main()
