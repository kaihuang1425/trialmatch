"""Build app/protein/structures.js: trimmed drug-bound crystal structures for the 3D protein view.

    python -I tools/prepare_structures.py            # download (cached), trim, verify, write
    python -I tools/prepare_structures.py --check    # rebuild in memory and compare with the file on disk

For every entry below the script
  1. downloads the mmCIF file from files.rcsb.org and the entry facts from the RCSB data API
     (title, method, resolution, construct mutations, ligand name and synonyms),
  2. keeps model 1, the protein chain(s) the view needs and one copy of the drug; drops waters,
     buffers, ions, cofactors, hydrogens, alternate locations after the first and extra copies,
  3. checks every residue the app highlights exists in the trimmed chain with the expected residue name,
     and that the drug named in the app appears in the entry title or the ligand's names,
  4. writes PDB-format text (HELIX/SHEET from the file, coordinates, CONECT for covalent drug links).

Protein ATOM lines stop after the coordinates (column 54) when 3Dmol.js would infer the same element
from the atom name, which the script checks atom by atom; ligand lines keep the element column.
Ligand codes longer than three characters (e.g. A1AWR) get the PDB-format alias "LIG"; the real code is
kept in the metadata. Output is deterministic for the same input files: no dates, sorted keys.

PDB data: CC0 1.0 (wwPDB / RCSB PDB). Cite the entries shown.
"""
import argparse
import hashlib
import json
import math
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # trialmatch/
OUT = ROOT / "app" / "protein" / "structures.js"
BUDGET = 1_500_000                                       # bytes, whole structures.js
CONTACT = 4.5                                            # Angstrom, ligand contact / pocket cut-off
UA = {"User-Agent": "trialmatch-prepare-structures"}

# Each entry: what the app shows and what must be true of the file.
#   hotspots: residues the app may light up -> [(resi, expected residue name)]; "domain" = whole chain
#   aliases: other names for the drug that may appear in the entry title or ligand names (code names)
#   construct: note template; {muts} = the construct mutations from the data API minus `disease`
ENTRIES = [
    dict(pdb="6OIM", gene="KRAS", drug="Sotorasib", aliases=["AMG 510", "AMG510"], ligand="MOV", chain="A",
         hotspots={"G12C": [(12, "CYS")]}, disease=["G12C"], construct="Cysteine-light KRAS: {muts}"),
    dict(pdb="6UT0", gene="KRAS", drug="Adagrasib", aliases=["MRTX849"], ligand="M1X", chain="A",
         hotspots={"G12C": [(12, "CYS")]}, disease=["G12C"], construct="Cysteine-light KRAS: {muts}"),
    dict(pdb="9DMM", gene="KRAS", drug="Divarasib", aliases=["GDC6036", "GDC-6036"], ligand="A1AWR", chain="A",
         hotspots={"G12C": [(12, "CYS")]}, disease=["G12C"], construct="Cysteine-light KRAS: {muts}"),
    dict(pdb="8S8C", gene="KRAS", drug="Calderasib", aliases=["MK-1084"], ligand="A1H5U", chain="A",
         hotspots={"G12C": [(12, "CYS")]}, disease=["G12C"], construct=None),
    dict(pdb="9CTB", gene="KRAS", drug="Zoldonrasib", aliases=["RMC-9805"], ligand="A1AZZ", chain="A",
         partner=True, hotspots={"G12D": [(12, "ASP")]}, disease=["G12D"],
         construct="Shown with cyclophilin A, the second protein this drug binds"),
    dict(pdb="6JWL", gene="EGFR", drug="Osimertinib", aliases=["AZD9291"], ligand="YY3", chain="A",
         hotspots={"L858R": [(858, "ARG")],
                   "ex19del": [(746, "GLU"), (747, "LEU"), (748, "ARG"), (749, "GLU"), (750, "ALA")],
                   "L861Q": [(861, "LEU")], "T790M": [(790, "THR")], "G719X": [(719, "GLY")],
                   "S768I": [(768, "SER")], "C797": [(797, "CYS")]},
         disease=["L858R"], construct=None),
    dict(pdb="4CLI", gene="ALK", drug="Lorlatinib", aliases=["PF-06463922"], ligand="5P8", chain="A",
         hotspots={"domain": "domain"}, disease=[], construct=None),
    # 3OG7: the drug is bound only in chain A, and Glu600 is modelled only in chain B (A lacks 597-614),
    # so both copies are kept and the app says so.
    dict(pdb="3OG7", gene="BRAF", drug="Vemurafenib", aliases=["PLX4032"], ligand="032", chain="A",
         extra_chains=["B"], hotspots={"V600E": [(600, "GLU", "B")]}, disease=["V600E"],
         construct="Engineered BRAF kinase with {n} other residues changed"),
    dict(pdb="9SXJ", gene="MET", drug="Capmatinib", aliases=[], ligand="A1JRF", chain="A",
         hotspots={"domain": "domain"}, disease=[], construct=None),
    dict(pdb="7JU6", gene="RET", drug="Selpercatinib", aliases=[], ligand="Q6G", chain="A",
         hotspots={"domain": "domain"}, disease=[], construct=None),
    dict(pdb="3ZBF", gene="ROS1", drug="Crizotinib", aliases=[], ligand="VGH", chain="A",
         hotspots={"domain": "domain"}, disease=[], construct=None),
]

# Entries considered and left out, with the fact that decides it. Checked on every run.
EXCLUDED = [
    dict(pdb="4XV2", why="BRAF V600E + dabrafenib, but residue 600 is not modelled in any chain",
         check=lambda atoms: not any(a["resi"] == 600 and a["poly"] for a in atoms)),
]

GQL = """query($ids:[String!]!){entries(entry_ids:$ids){rcsb_id struct{title} exptl{method}
 rcsb_entry_info{resolution_combined} rcsb_accession_info{initial_release_date}
 polymer_entities{rcsb_polymer_entity{pdbx_description pdbx_mutation}
  rcsb_polymer_entity_container_identifiers{auth_asym_ids} uniprots{rcsb_id}}
 nonpolymer_entities{rcsb_nonpolymer_entity_container_identifiers{auth_asym_ids}
  nonpolymer_comp{chem_comp{id name} rcsb_chem_comp_synonyms{name}}}}}"""


# ---------------------------------------------------------------- download
def fetch(url, data=None):
    req = urllib.request.Request(url, data=data, headers={**UA, **({"Content-Type": "application/json"} if data else {})})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()


def cif_bytes(pdb, cache):
    p = cache / f"{pdb}.cif"
    if not p.exists():
        p.write_bytes(fetch(f"https://files.rcsb.org/download/{pdb}.cif"))
    return p.read_bytes()


def api_facts(ids, cache):
    p = cache / "rcsb-api-facts.json"
    want = sorted(ids)
    if p.exists():
        d = json.loads(p.read_text(encoding="utf-8"))
        if sorted(d) == want:
            return d
    raw = json.loads(fetch("https://data.rcsb.org/graphql",
                           json.dumps({"query": GQL, "variables": {"ids": want}}).encode()))
    d = {e["rcsb_id"]: e for e in raw["data"]["entries"]}
    p.write_text(json.dumps(d, indent=1, sort_keys=True), encoding="utf-8", newline="\n")
    return d


# ---------------------------------------------------------------- mmCIF
TOKEN = re.compile(r"""'(?:[^']|'(?=\S))*'|"(?:[^"]|"(?=\S))*"|\S+""")


def unquote(t):
    return t[1:-1] if len(t) >= 2 and t[0] == t[-1] and t[0] in "'\"" else t


def cif_tables(text, wanted):
    """{category: [row dict]} for the categories in `wanted` (loops and single key-value blocks)."""
    lines = text.splitlines()
    out, i, n = {}, 0, len(lines)

    def values_from(j, stop_on_tag=True):
        vals = []
        while j < n:
            ln = lines[j]
            if ln.startswith(";"):
                buf = [ln[1:]]
                j += 1
                while j < n and not lines[j].startswith(";"):
                    buf.append(lines[j])
                    j += 1
                vals.append("\n".join(buf).strip())
                j += 1
                continue
            s = ln.strip()
            if not s or s.startswith("#") or s == "loop_" or (stop_on_tag and s.startswith("_")) or s.startswith("data_"):
                break
            vals.extend(unquote(t) for t in TOKEN.findall(s))
            j += 1
        return vals, j

    while i < n:
        s = lines[i].strip()
        if s == "loop_":
            i += 1
            keys = []
            while i < n and lines[i].startswith("_"):
                keys.append(lines[i].strip())
                i += 1
            cat = keys[0].split(".")[0][1:] if keys else ""
            vals, i = values_from(i)
            if cat in wanted:
                f = [k.split(".", 1)[1] for k in keys]
                out[cat] = [dict(zip(f, vals[r:r + len(f)])) for r in range(0, len(vals) - len(f) + 1, len(f))]
            continue
        if s.startswith("_") and "." in s:
            cat = s.split(".")[0][1:]
            if cat in wanted:
                row = {}
                while i < n and lines[i].startswith("_" + cat + "."):
                    parts = lines[i].strip().split(None, 1)
                    key = parts[0].split(".", 1)[1]
                    if len(parts) == 2:
                        row[key] = unquote(parts[1].strip())
                        i += 1
                    else:
                        v, i = values_from(i + 1)
                        row[key] = " ".join(v)
                out[cat] = [row]
                continue
        i += 1
    return out


def atoms_from(tables):
    atoms = []
    for r in tables["atom_site"]:
        if r.get("pdbx_PDB_model_num", "1") != "1":
            continue
        atoms.append({
            "het": r["group_PDB"] == "HETATM", "elem": r["type_symbol"].upper(), "name": r["auth_atom_id"],
            "alt": r["label_alt_id"], "resn": r["auth_comp_id"], "chain": r["auth_asym_id"],
            "resi": int(r["auth_seq_id"]), "icode": "" if r["pdbx_PDB_ins_code"] in ".?" else r["pdbx_PDB_ins_code"],
            "x": float(r["Cartn_x"]), "y": float(r["Cartn_y"]), "z": float(r["Cartn_z"]),
            "occ": float(r["occupancy"]), "b": float(r["B_iso_or_equiv"]),
            "poly": r["label_seq_id"] not in ".?",
        })
    return atoms


def first_altloc(atoms):
    seen, out = set(), []
    for a in atoms:
        k = (a["chain"], a["resi"], a["icode"], a["name"], a["het"] and not a["poly"] and a["resn"])
        if k in seen:
            continue
        seen.add(k)
        out.append(a)
    return out


def dist(a, b):
    return math.sqrt((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2 + (a["z"] - b["z"]) ** 2)


# ---------------------------------------------------------------- PDB writing
ELEM2 = {"CL", "BR", "FE", "MG", "ZN", "NA", "CA", "MN", "CU", "CO", "NI", "SE", "CD", "HG", "IOD"}
KNOWN2 = {"He", "Li", "Be", "Ne", "Na", "Mg", "Al", "Si", "Cl", "Ar", "Ca", "Sc", "Ti", "Cr", "Mn", "Fe", "Co", "Ni",
          "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Zr", "Mo", "Ru", "Rh", "Pd", "Ag", "Cd",
          "In", "Sn", "Sb", "Te", "Xe", "Cs", "Ba", "La", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Hf", "Ta", "Re",
          "Os", "Ir", "Ce", "Nd", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Yb", "Lu", "Hs"}


def name_field(name, elem):
    if len(name) >= 4 or len(elem) == 2:
        return f"{name:<4}"[:4]
    return f" {name:<3}"


def inferred_elem(field, is_atom):
    """Mirror of 3Dmol.js atomNameToElem(line.substring(12,14), isATOM) for the no-element-column case."""
    e = field[:2].replace(" ", "")
    if e and e[0] == "H" and e not in ("Hg", "He", "Hf", "Hs", "Ho"):
        e = "H"
    if len(e) > 1:
        e = e[0].upper() + e[1:].lower()
        if e not in KNOWN2:
            e = e[0]
        elif is_atom and e in ("Ca", "Cd"):
            e = "C"
    return e.upper()


def put(buf, col, text):
    """Write `text` into the 1-based column `col` of a list-of-chars line."""
    for k, ch in enumerate(text):
        buf[col - 1 + k] = ch


def ss_lines(tables, chains):
    out = []
    for k, r in enumerate(x for x in tables.get("struct_conf", []) if x.get("conf_type_id", "").startswith("HELX")):
        c = r["beg_auth_asym_id"]
        if c not in chains or r["end_auth_asym_id"] != c:
            continue
        b = [" "] * 40
        put(b, 1, "HELIX ")
        put(b, 8, f"{len(out) + 1:>3}")
        put(b, 12, f"{str(len(out) + 1)[-3:]:>3}")
        put(b, 16, f"{r['beg_auth_comp_id']:>3}"[:3])
        put(b, 20, c)
        put(b, 22, f"{int(r['beg_auth_seq_id']):>4}")
        put(b, 28, f"{r['end_auth_comp_id']:>3}"[:3])
        put(b, 32, c)
        put(b, 34, f"{int(r['end_auth_seq_id']):>4}")
        put(b, 39, " 1")
        out.append("".join(b).rstrip())
    s = 0
    for r in tables.get("struct_sheet_range", []):
        c = r["beg_auth_asym_id"]
        if c not in chains or r["end_auth_asym_id"] != c:
            continue
        s += 1
        b = [" "] * 38
        put(b, 1, "SHEET ")
        put(b, 8, f"{s:>3}")
        put(b, 12, f"{r['sheet_id'][:3]:>3}")
        put(b, 18, f"{r['beg_auth_comp_id']:>3}"[:3])
        put(b, 22, c)
        put(b, 23, f"{int(r['beg_auth_seq_id']):>4}")
        put(b, 29, f"{r['end_auth_comp_id']:>3}"[:3])
        put(b, 33, c)
        put(b, 34, f"{int(r['end_auth_seq_id']):>4}")
        out.append("".join(b).rstrip())
    return out


def atom_line(serial, a, resn):
    rec = "HETATM" if (a["het"] and not a["poly"]) else "ATOM  "
    line = (f"{rec}{serial:>5} {name_field(a['name'], a['elem'])} {resn:>3} {a['chain']}{a['resi']:>4}"
            f"{a['icode'] or ' ':1}   {a['x']:>8.3f}{a['y']:>8.3f}{a['z']:>8.3f}")
    assert len(line) == 54, line
    full = f"{line}{a['occ']:>6.2f}{a['b']:>6.2f}          {a['elem']:>2}"
    if rec == "HETATM":
        return full
    return line if inferred_elem(line[12:14], True) == a["elem"] else full


# ---------------------------------------------------------------- one entry
def build(entry, cif_text, facts):
    pdb = entry["pdb"]
    tables = cif_tables(cif_text, {"atom_site", "struct_conf", "struct_sheet_range", "struct_conn"})
    atoms = first_altloc(atoms_from(tables))
    atoms = [a for a in atoms if a["elem"] not in ("H", "D")]
    chain, lig = entry["chain"], entry["ligand"]

    # the drug: one residue of the named ligand bound to the primary chain
    lig_res = sorted({(a["chain"], a["resi"]) for a in atoms if a["resn"] == lig and not a["poly"]})
    assert lig_res, f"{pdb}: ligand {lig} not in file"
    prot = [a for a in atoms if a["poly"] and a["chain"] == chain]
    assert prot, f"{pdb}: chain {chain} has no polymer atoms"

    def contacts(res, group):
        la = [a for a in atoms if (a["chain"], a["resi"]) == res and a["resn"] == lig]
        return sum(1 for a in group for b in la if dist(a, b) <= CONTACT)

    best = max(lig_res, key=lambda r: contacts(r, prot))
    assert contacts(best, prot) > 0, f"{pdb}: no {lig} copy touches chain {chain}"
    ligand = [a for a in atoms if (a["chain"], a["resi"]) == best and a["resn"] == lig]

    chains = [chain]
    partner = None
    if entry.get("partner"):
        others = sorted({a["chain"] for a in atoms if a["poly"] and a["chain"] != chain})
        scores = {c: sum(1 for a in atoms if a["poly"] and a["chain"] == c for b in ligand if dist(a, b) <= CONTACT)
                  for c in others}
        partner = max(scores, key=lambda c: (scores[c], c))
        assert scores[partner] > 0
        # drop the second copy of the primary protein, keep the partner that touches this drug copy
        poly_ent = {c: p for p in facts["polymer_entities"] for c in p["rcsb_polymer_entity_container_identifiers"]["auth_asym_ids"]}
        assert poly_ent[partner] is not poly_ent[chain], f"{pdb}: partner {partner} is another copy of {chain}"
        chains.append(partner)
    for c in entry.get("extra_chains", []):
        assert any(a["poly"] and a["chain"] == c for a in atoms), f"{pdb}: no chain {c}"
        chains.append(c)
    keep = [a for a in atoms if a["poly"] and a["chain"] in chains]

    # residue map and checks
    res = {}
    for a in keep:
        res.setdefault((a["chain"], a["resi"], a["icode"]), a["resn"])
    hotspots = {}
    for key, spec in entry["hotspots"].items():
        if spec == "domain":
            hotspots[key] = {"domain": True, "chain": chain}
            continue
        rows = []
        for row in spec:
            resi, resn, hc = row if len(row) == 3 else (*row, chain)
            got = res.get((hc, resi, ""))
            assert got == resn, f"{pdb}: expected {resn}{resi} in chain {hc}, file has {got}"
            ca = [a for a in keep if a["chain"] == hc and a["resi"] == resi and a["name"] == "CA"]
            assert ca, f"{pdb}: {resn}{resi} has no CA"
            rows.append([hc, resi, resn])
        hotspots[key] = {"residues": rows}

    pocket = sorted({(a["chain"], a["resi"], a["resn"]) for a in keep for b in ligand if dist(a, b) <= CONTACT},
                    key=lambda r: (r[0] != chain, r[0], r[1]))

    # covalent links between the kept drug and the kept protein, from struct_conn
    cov = []
    for r in tables.get("struct_conn", []):
        if r.get("conn_type_id") != "covale":
            continue
        ends = [(r["ptnr1_auth_asym_id"], int(r["ptnr1_auth_seq_id"]), r["ptnr1_auth_comp_id"], r["ptnr1_label_atom_id"]),
                (r["ptnr2_auth_asym_id"], int(r["ptnr2_auth_seq_id"]), r["ptnr2_auth_comp_id"], r["ptnr2_label_atom_id"])]
        lig_end = [e for e in ends if e[2] == lig and (e[0], e[1]) == best]
        pro_end = [e for e in ends if e[2] != lig and e[0] in chains]
        if lig_end and pro_end:
            cov.append({"protein": list(pro_end[0]), "ligand": list(lig_end[0])})

    # facts from the data API
    primary = next(p for p in facts["polymer_entities"]
                   if chain in p["rcsb_polymer_entity_container_identifiers"]["auth_asym_ids"])
    muts_raw = primary["rcsb_polymer_entity"]["pdbx_mutation"] or ""
    muts = list(dict.fromkeys(m.strip() for m in muts_raw.split(",") if m.strip()))
    extra = [m for m in muts if m not in entry["disease"]]
    construct = None
    if entry["construct"]:
        construct = entry["construct"].format(muts="/".join(extra), n=len(extra))
        assert "{" not in construct
    lig_fact = next(nl for nl in facts["nonpolymer_entities"] if nl["nonpolymer_comp"]["chem_comp"]["id"] == lig)
    lig_name = lig_fact["nonpolymer_comp"]["chem_comp"]["name"]
    synonyms = sorted({s["name"] for s in (lig_fact["nonpolymer_comp"].get("rcsb_chem_comp_synonyms") or [])})
    title = facts["struct"]["title"]
    hay = " | ".join([title, lig_name] + synonyms).lower()
    named_by = [n for n in [entry["drug"]] + entry["aliases"] if n.lower() in hay]
    assert named_by, f"{pdb}: neither {entry['drug']} nor {entry['aliases']} appears in title/ligand names"
    resolution = facts["rcsb_entry_info"]["resolution_combined"][0]
    method = facts["exptl"][0]["method"]

    # PDB text
    alias = lig if len(lig) <= 3 else "LIG"
    assert alias == lig or not any(a["resn"] == alias for a in keep)
    lines = ss_lines(tables, chains)
    serial, index = 0, {}
    for c in chains:
        for a in (x for x in keep if x["chain"] == c):
            serial += 1
            index[(a["chain"], a["resi"], a["name"])] = serial
            lines.append(atom_line(serial, a, a["resn"]))
    for a in ligand:
        serial += 1
        index[("LIG", a["name"])] = serial
        lines.append(atom_line(serial, a, alias))
    for c in cov:
        p, l = c["protein"], c["ligand"]
        s1, s2 = index.get((p[0], p[1], p[3])), index.get(("LIG", l[3]))
        if s1 and s2:
            lines.append(f"CONECT{s1:>5}{s2:>5}")
            lines.append(f"CONECT{s2:>5}{s1:>5}")
    lines.append("END")
    text = "\n".join(lines) + "\n"
    for bad in ("`", "\\", "${"):
        assert bad not in text, f"{pdb}: {bad!r} would break the JS template literal"

    span = sorted(r[1] for r in res if r[0] == chain)
    meta = {
        "pdb": pdb, "title": title, "method": method, "resolution": resolution,
        "released": facts["rcsb_accession_info"]["initial_release_date"][:10],
        "gene": entry["gene"], "drug": entry["drug"], "drugNamedInEntryAs": named_by,
        "ligand": {"ccd": lig, "pdbResn": alias, "chain": best[0], "resi": best[1], "name": lig_name,
                   "atoms": len(ligand)},
        "chain": chain, "chains": chains,
        "partner": ({"chain": partner, "name": next(
            p["rcsb_polymer_entity"]["pdbx_description"] for p in facts["polymer_entities"]
            if partner in p["rcsb_polymer_entity_container_identifiers"]["auth_asym_ids"])} if partner else None),
        "protein": primary["rcsb_polymer_entity"]["pdbx_description"],
        "uniprot": [u["rcsb_id"] for u in (primary["uniprots"] or [])],
        "modelled": [span[0], span[-1]], "residueCount": len(span),
        "constructMutations": extra, "construct": construct,
        "hotspots": hotspots, "pocket": [list(p) for p in pocket], "covalent": cov,
        "atoms": serial,
    }
    return meta, text


def check_excluded(entry, cif_text):
    tables = cif_tables(cif_text, {"atom_site"})
    atoms = atoms_from(tables)
    assert entry["check"](atoms), f"{entry['pdb']}: exclusion reason no longer holds: {entry['why']}"


# ---------------------------------------------------------------- output
def render(results):
    head = ("/* TrialMatch protein structures. Generated by tools/prepare_structures.py; do not edit by hand.\n"
            " * Trimmed from Protein Data Bank entries (files.rcsb.org; facts from data.rcsb.org). PDB data: CC0 1.0.\n"
            " * Each entry: meta (facts from the RCSB data API and the file) and pdb (PDB-format text). */\n")
    parts = []
    for meta, text, sha in results:
        m = dict(meta, source={"url": f"https://files.rcsb.org/download/{meta['pdb']}.cif", "sha256": sha})
        parts.append(f'"{meta["pdb"]}": {{"meta": {json.dumps(m, sort_keys=True, ensure_ascii=False)},\n"pdb": `{text}`}}')
    return head + "window.TM_STRUCTURES = {\n" + ",\n".join(parts) + "\n};\n"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=str(Path(tempfile.gettempdir()) / "trialmatch-pdb-cache"))
    ap.add_argument("--check", action="store_true", help="compare a fresh build with the file on disk")
    args = ap.parse_args()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)

    facts = api_facts([e["pdb"] for e in ENTRIES], cache)
    for e in EXCLUDED:
        check_excluded(e, cif_bytes(e["pdb"], cache).decode("utf-8"))
        print(f"excluded {e['pdb']}: {e['why']} (checked)")
    results = []
    for e in ENTRIES:
        raw = cif_bytes(e["pdb"], cache)
        meta, text = build(e, raw.decode("utf-8"), facts[e["pdb"]])
        results.append((meta, text, hashlib.sha256(raw).hexdigest()))
        hs = ", ".join(f"{k}=" + ("domain" if v.get("domain") else "+".join(f"{r[2]}{r[1]}" for r in v["residues"]))
                       for k, v in meta["hotspots"].items())
        print(f"{meta['pdb']}: {meta['resolution']} A, chains {'+'.join(meta['chains'])} "
              f"{meta['modelled'][0]}-{meta['modelled'][1]}, {meta['ligand']['ccd']} ({meta['drug']}) "
              f"{meta['ligand']['atoms']} atoms, {meta['atoms']} atoms, {len(text) // 1024} KB; {hs}"
              + (f"; covalent {meta['covalent'][0]['protein'][2]}{meta['covalent'][0]['protein'][1]}" if meta['covalent'] else ""))
    js = render(results)
    size = len(js.encode("utf-8"))
    assert size <= BUDGET, f"structures.js would be {size} bytes, over the {BUDGET} budget"
    if args.check:
        same = OUT.exists() and OUT.read_bytes() == js.encode("utf-8")
        print(f"check: {'identical' if same else 'DIFFERENT'} ({size} bytes)")
        sys.exit(0 if same else 1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(js.encode("utf-8"))
    print(f"wrote {OUT.relative_to(ROOT)} ({size} bytes, {len(results)} entries)")


if __name__ == "__main__":
    main()
