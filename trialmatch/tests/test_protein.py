"""The 3D protein view (app/protein/protein-view.js) must pick the right crystal structure and say honestly what it shows.

TMProtein.resolve(record, trial) is run under Node (tests/protein_resolve.js), the same way test_parity.py runs the
matcher. Checked here: the demo patients against BNT327 and DETERMINE, the trial-drug rules, every highlighted residue
exists in the shipped structure with the right residue name, and every view carries the honesty line.
Skipped when Node.js is not installed.
"""
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

from trialmatch.patients import load_patients

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
NODE = shutil.which("node")
needs_node = pytest.mark.skipif(not NODE, reason="Node.js not installed")

BNT327, DETERMINE, CODEBREAK = "NCT06712316", "NCT07440290", "NCT05920356"
HONEST = re.compile(r"^Crystal structure from the Protein Data Bank \((\w{4}), (\d+\.\d\d) Å\), not this patient’s tumour\.")
NOT_TRIAL = "not this trial’s treatment"


def trial(nct, _cache={}):
    """A trial in the app bundle's shape (nct, short, title, drugs), straight from the ClinicalTrials.gov snapshot."""
    if not _cache:
        with open(ROOT / "data" / "trials.json", encoding="utf-8") as f:
            for s in json.load(f):
                p = s["protocolSection"]
                _cache[p["identificationModule"]["nctId"]] = p
    p = _cache[nct]
    idm = p["identificationModule"]
    drugs = [i.get("name", "") for i in p.get("armsInterventionsModule", {}).get("interventions", [])
             if i.get("name") and not re.search("placebo", i["name"], re.I)]
    return {"nct": nct, "short": idm.get("acronym") or "", "title": idm.get("officialTitle") or idm.get("briefTitle"),
            "drugs": drugs}


def demo(pid, _cache={}):
    if not _cache:
        for p in load_patients(str(ROOT / "data" / "lung_cancer_patients.xlsx")):
            _cache[p["id"]] = {"id": p["id"], "biomarkers": p["biomarkers"], "evidence": p["evidence"]}
    return _cache[pid]


def synthetic(pid, **bm):
    base = {k: "negative" for k in ("EGFR", "KRAS_G12C", "KRAS_G12D", "BRAF_V600E", "ALK", "ROS1", "RET", "MET_ex14")}
    base.update(bm)
    return {"id": pid, "biomarkers": base}


def run(cases):
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "cases.json"
        src.write_text(json.dumps({"cases": [{"record": r, "trial": t} for r, t in cases]}), encoding="utf-8")
        out = subprocess.run([NODE, str(ROOT / "tests" / "protein_resolve.js"), str(src)],
                             capture_output=True, text=True, check=True, encoding="utf-8").stdout
    return json.loads(out)


def check_common(r, residues):
    """Rules every structure view must follow."""
    assert r["kind"] == "structure"
    m = HONEST.match(r["honesty"])
    assert m, r["honesty"]
    assert m.group(1) == r["pdb"]
    for chain, resi, resn in r["focus"]["residues"]:
        assert residues[r["pdb"]]["map"].get(f"{chain}:{resi}") == resn, (r["pdb"], chain, resi, resn)
    d = r["drug"]
    if d["relation"] == "trial":
        assert d["label"] == f"{d['name']}, this trial’s drug"
    elif d["relation"] == "class":
        assert f"same drug class as {d['trialDrug'].lower()} in this trial" in d["label"]
    else:
        assert d["label"].endswith(NOT_TRIAL), d["label"]
    assert r["captions"]["change"]["text"] and r["captions"]["drug"]["text"] == d["label"]
    assert residues[r["pdb"]]["hasLigand"]


@needs_node
def test_demo_patients_against_bnt327_and_determine():
    pids = ["TCGA-93-A4JP", "TCGA-49-AAQV", "TCGA-86-7714", "TCGA-99-8033"]
    cases = [(demo(p), trial(t)) for p in pids for t in (BNT327, DETERMINE)]
    out = run(cases)
    res, R = out["results"], out["residues"]
    by = {(c[0]["id"], c[1]["nct"]): r for c, r in zip(cases, res)}

    # TCGA-93-A4JP: EGFR sensitising, the record names L861Q -> Leu861 in 6JWL (an L858R crystal), said so
    for t in (BNT327, DETERMINE):
        r = by[("TCGA-93-A4JP", t)]
        check_common(r, R)
        assert (r["pdb"], r["title"]["change"], r["focus"]["residues"]) == ("6JWL", "L861Q", [["A", 861, "LEU"]])
        assert r["drug"]["name"] == "Osimertinib" and r["drug"]["relation"] == "default"
        assert r["drug"]["label"] == "Osimertinib, a drug that targets EGFR, " + NOT_TRIAL
        assert "6JWL, 2.55 Å" in r["honesty"] and "The crystal carries L858R, not this patient’s change." in r["honesty"]

    # TCGA-49-AAQV: exon 19 deletion -> residues 746-750 (ELREA in the file)
    for t in (BNT327, DETERMINE):
        r = by[("TCGA-49-AAQV", t)]
        check_common(r, R)
        assert r["pdb"] == "6JWL" and r["title"]["change"] == "exon 19 deletion"
        assert [x[1] for x in r["focus"]["residues"]] == [746, 747, 748, 749, 750]
        assert r["drug"]["label"] == "Osimertinib, an approved drug for this change, " + NOT_TRIAL

    # TCGA-86-7714: BRAF V600E -> 3OG7 (Glu600 modelled in chain B); dabrafenib trial -> same drug class
    r = by[("TCGA-86-7714", DETERMINE)]
    check_common(r, R)
    assert (r["pdb"], r["focus"]["residues"]) == ("3OG7", [["B", 600, "GLU"]])
    assert r["drug"]["label"] == "Vemurafenib, same drug class as dabrafenib in this trial"
    assert "Glu600 is modelled in one copy of the protein, the drug in the other." in r["honesty"]
    r = by[("TCGA-86-7714", BNT327)]
    check_common(r, R)
    assert r["drug"]["label"] == "Vemurafenib, a drug that targets this change, " + NOT_TRIAL

    # TCGA-99-8033: no positive driver -> no 3D; negative and unknown kept apart
    for t in (BNT327, DETERMINE):
        r = by[("TCGA-99-8033", t)]
        assert r["kind"] == "nodriver" and "pdb" not in r
        chips = {c["label"]: c["state"] for c in r["chips"]}
        assert chips == {"KRAS G12C": "negative", "KRAS G12D": "negative", "ALK": "negative", "EGFR": "unknown",
                         "BRAF V600E": "unknown", "ROS1": "unknown", "RET": "unknown", "MET exon 14": "unknown"}


@needs_node
def test_kras_g12c_uses_the_trials_own_drug_when_it_has_a_structure():
    pt = synthetic("SYN-KRAS-G12C", KRAS_G12C="positive")
    trials = {CODEBREAK: ("6OIM", "trial", "Sotorasib"), "NCT04613596": ("6UT0", "trial", "Adagrasib"),
              "NCT06793215": ("9DMM", "trial", "Divarasib"), "NCT07190248": ("8S8C", "trial", "Calderasib"),
              "NCT06890598": ("6OIM", "class", "Sotorasib"), BNT327: ("6OIM", "default", "Sotorasib")}
    out = run([(pt, trial(n)) for n in trials])
    for (nct, (pdb, rel, drug)), r in zip(trials.items(), out["results"]):
        check_common(r, out["residues"])
        assert (r["pdb"], r["drug"]["relation"], r["drug"]["name"]) == (pdb, rel, drug), nct
        assert r["focus"]["residues"] == [["A", 12, "CYS"]]
        assert r["title"] == {"gene": "KRAS", "change": "G12C"}
    r = out["results"][0]
    assert r["drug"]["label"] == "Sotorasib, this trial’s drug"
    assert r["honesty"].endswith("Cysteine-light KRAS: C51S/C80L/C118S.")
    assert out["results"][4]["drug"]["label"] == "Sotorasib, same drug class as olomorasib in this trial"
    assert out["results"][5]["drug"]["label"] == "Sotorasib, an approved drug for this change, " + NOT_TRIAL


@needs_node
def test_egfr_sensitising_without_a_recorded_variant_lights_both_hotspots():
    pt = synthetic("SYN-EGFR", EGFR="positive", EGFR_type="sensitising")
    r = run([(pt, trial(BNT327))])["results"][0]
    assert r["title"] == {"gene": "EGFR", "change": "· sensitising"}
    assert r["captions"]["change"]["text"].startswith("Sensitising change, exact variant not recorded")
    assert [x[1] for x in r["focus"]["residues"]] == [858, 746, 747, 748, 749, 750]
    assert r["drug"]["label"] == "Osimertinib, approved for common sensitising changes, " + NOT_TRIAL


@needs_node
def test_egfr_trial_drug_and_multiple_variants():
    out = run([(demo("TCGA-49-4494"), trial("NCT05382728")), (demo("TCGA-50-6673"), trial(BNT327))])
    r = out["results"][0]
    check_common(r, out["residues"])
    assert r["drug"]["label"] == "Osimertinib, this trial’s drug"
    assert sorted(x[1] for x in r["focus"]["residues"]) == [790, 858] and "L858R" in r["title"]["change"]
    r = out["results"][1]   # exon 20 insertion H773dup: His773 lit, osimertinib not called approved for it
    check_common(r, out["residues"])
    assert r["focus"]["residues"] == [["A", 773, "HIS"]]
    assert r["drug"]["label"] == "Osimertinib, a drug that targets EGFR, " + NOT_TRIAL
    # EGFR positive from a patient's answer (type 'unconfirmed', no variant): nothing lit, nothing claimed
    r = run([(synthetic("U", EGFR="positive", EGFR_type="unconfirmed"), trial(BNT327))])["results"][0]
    assert r["focus"]["residues"] == [] and r["title"] == {"gene": "EGFR", "change": ""}
    assert r["captions"]["change"]["text"] == "EGFR change, exact variant not recorded"
    assert r["drug"]["label"] == "Osimertinib, a drug that targets EGFR, " + NOT_TRIAL


@needs_node
def test_fusions_met_and_kras_g12d():
    cases = [(synthetic("A", ALK="positive"), trial(BNT327)), (synthetic("A", ALK="positive"), trial("NCT06858410")),
             (synthetic("R", ROS1="positive"), trial("NCT06564324")), (synthetic("T", RET="positive"), trial(BNT327)),
             (synthetic("M", MET_ex14="positive"), trial("NCT06908993")), (demo("TCGA-78-7160"), trial("NCT07777822")),
             (demo("TCGA-78-7160"), trial(BNT327))]
    out = run(cases)
    res = out["results"]
    for r in res:
        check_common(r, out["residues"])
    alk, alk_t, ros1, ret, met, g12d, g12d_d = res
    assert alk["pdb"] == "4CLI" and alk["focus"]["domain"] and alk["title"] == {"gene": "ALK", "change": "fusion"}
    assert alk["captions"]["change"]["text"] == "A gene fusion keeps this kinase switched on"
    assert alk["drug"]["label"] == "Lorlatinib, an approved drug for this change, " + NOT_TRIAL
    assert alk_t["drug"]["label"] == "Lorlatinib, this trial’s drug"
    assert ros1["pdb"] == "3ZBF" and ros1["drug"]["label"] == "Crizotinib, this trial’s drug"
    assert ret["pdb"] == "7JU6" and ret["drug"]["name"] == "Selpercatinib"
    assert met["pdb"] == "9SXJ" and "The exon 14 region is not in this crystal (residues 1057–1345 only)." in met["honesty"]
    assert met["drug"]["label"] == "Capmatinib, same drug class as tepotinib in this trial"
    assert g12d["pdb"] == "9CTB" and g12d["focus"]["residues"] == [["A", 12, "ASP"]]
    assert g12d["drug"]["label"] == "Zoldonrasib, this trial’s drug" and "cyclophilin A" in g12d["honesty"]
    assert g12d_d["drug"]["label"] == "Zoldonrasib, a drug that targets this change, " + NOT_TRIAL


@needs_node
def test_every_referenced_structure_ships_and_is_within_budget():
    out = run([])
    assert set(out["refs"]) <= set(out["residues"])
    js = (APP / "protein" / "structures.js").read_bytes()
    assert len(js) <= 1_500_000
    text = js.decode("utf-8")
    for pdb in out["residues"]:
        meta = json.loads(re.search(r'"%s": \{"meta": (\{.*?\}),\n"pdb"' % pdb, text).group(1))
        for k in ("pdb", "title", "method", "resolution", "drug", "ligand", "chain", "hotspots", "construct"):
            assert k in meta, (pdb, k)
        assert meta["method"] == "X-RAY DIFFRACTION"
        for h in meta["hotspots"].values():
            for chain, resi, resn in h.get("residues", []):
                assert out["residues"][pdb]["map"][f"{chain}:{resi}"] == resn


def test_css_classes_use_the_pv_prefix_and_do_not_collide():
    js = (APP / "protein" / "protein-view.js").read_text(encoding="utf-8")
    css_classes = set(re.findall(r"(?<![\w-])\.([a-z][\w-]*)\s*[{,:>\[ .]", "".join(re.findall(r"'([^']*)'", js[js.index("var CSS"):js.index("var DARK")]))))
    html_classes = {c for attr in re.findall(r'class="([a-z0-9 -]+)"', js) for c in attr.split()}
    for c in css_classes | html_classes:
        assert c.startswith("pv-"), c
    template = (APP / "template.html").read_text(encoding="utf-8")
    assert not re.search(r"[\s.\"']pv-[a-z]", template)


def test_vendored_3dmol_keeps_its_licence():
    lib = (APP / "vendor" / "3Dmol-min.js").read_text(encoding="utf-8")
    assert lib.startswith("/*! For license information please see 3Dmol-min.js.LICENSE.txt */")
    lic = (APP / "vendor" / "LICENSE-3Dmol.txt").read_text(encoding="utf-8")
    assert "3dmol v2.5.5" in lic and "BSD-3-Clause" in lic and "Redistribution and use in source and binary forms" in lic


@needs_node
def test_fallback_stills_exist_for_every_demo_case():
    cases = [(demo(p), trial(t)) for p in ("TCGA-93-A4JP", "TCGA-49-AAQV", "TCGA-86-7714") for t in (BNT327, DETERMINE)]
    cases.append((synthetic("K", KRAS_G12C="positive"), trial(CODEBREAK)))
    for r in run(cases)["results"]:
        for mode in ("change", "drug"):
            for theme in ("light", "dark"):
                p = APP / "protein" / "fallback" / f"{r['fallback'][0]}-{mode}-{theme}.png"
                assert p.exists() and p.stat().st_size > 5000, p
