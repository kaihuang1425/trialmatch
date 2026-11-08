"""The browser matcher (app/matcher.js) must rank every demo patient exactly like trialmatch/match.py.

Matching runs on the device in the app, so this test is what lets us say the app and the Python
evaluation are the same algorithm. Skipped when Node.js is not installed.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

import build_app
from trialmatch import match

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")


@pytest.mark.skipif(not NODE, reason="Node.js not installed")
def test_browser_matcher_ranks_like_python(tmp_path):
    raw, trials, patients = build_app.load()
    b, rec = build_app.bundle(raw, trials), build_app.records(patients)
    src = tmp_path / "in.json"
    src.write_text(json.dumps({"trials": b["trials"], "patients": rec, "weights": b["weights"]}), encoding="utf-8")
    js = json.loads(subprocess.run([NODE, str(ROOT / "tests" / "parity.js"), str(src)],
                                   capture_output=True, text=True, check=True, encoding="utf-8").stdout)

    assert len(js) == len(patients) == 30
    for p, got in zip(patients, js):
        want = match.rank(p, trials, top=len(trials))
        assert got["id"] == p["id"]
        assert (got["n_possible"], got["removed"]) == (want["n_possible"], want["removed"]), p["id"]
        assert [x["nct"] for x in got["top"]] == [x["nct"] for x in want["top"]], p["id"]
        for g, w in zip(got["top"], want["top"]):
            assert g["score"] == pytest.approx(w["score"], abs=1e-9) and g["E"] == pytest.approx(w["E"], abs=1e-9)
            assert g["labels"] == [[l["field"], l["status"]] for l in w["labels"]], (p["id"], g["nct"])
        assert got["questions"] == [[q["field"], q["trials_affected"]] for q in want["questions"]], p["id"]


def test_bundle_has_no_patient_data():
    raw, trials, patients = build_app.load()
    text = json.dumps(build_app.bundle(raw, trials))
    for p in patients:
        assert p["id"] not in text
