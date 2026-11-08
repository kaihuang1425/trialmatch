"""Rebuild the TrialMatch app (app/index.html).

python build_app.py

The app is local-first. It is assembled from three parts that a real deployment would ship separately:
  1. the trial rules bundle: every recruiting Phase 3 NSCLC treatment trial, its parsed eligibility rules
     and plain display fields. Public registry data only, no patient information. This is the part a
     server would publish and devices would download (bundle()).
  2. the matcher (app/matcher.js): a port of trialmatch/match.py that runs in the browser, so matching
     happens on the patient's or the clinic's own device. tests/test_parity.py keeps the two identical.
  3. the demo records (records()): the 30 de-identified research records standing in for the record a
     patient keeps on their own device, or a clinic keeps on its own system. Never sent anywhere.
"""
import json
import re

from trialmatch.patients import load_patients
from trialmatch.criteria import parse_trial
from trialmatch import match

SNAPSHOT = "2026-11-07"   # date data/trials.json was downloaded from ClinicalTrials.gov
EVIDENCE_CHARS = 240

# Hand-written patient-facing titles. Cards fall back to the acronym or a cut-down title.
PLAIN = {
    "NCT06712316": "BNT327 with chemotherapy, as a first treatment",
    "NCT05085028": "Pembrolizumab less often, with fewer hospital visits",
    "NCT07440290": "Two targeted tablets for a BRAF gene change",
    "NCT06312137": "Pembrolizumab with or without sacituzumab tirumotecan",
    "NCT04585490": "A blood test to tailor treatment after chemoradiation",
}
# Plain "what it tests" lines. Others use the registry summary.
WHAT = {
    "NCT06712316": "A new antibody, BNT327, given with chemotherapy to people starting treatment for advanced lung cancer.",
    "NCT05085028": "Checks whether giving immunotherapy less often works as well and means fewer trips to hospital.",
    "NCT07440290": "Dabrafenib with trametinib for lung cancers with a BRAF V600E change. Needs a fresh biopsy.",
    "NCT04585490": "Uses ctDNA blood tests to decide on extra treatment after chemoradiation. Sites in the United States only.",
}
# Hospital photos in app/img/sites/. The first UK location that matches a pattern picks the photo.
SITES = [("royal-marsden", "Royal Marsden", re.compile(r"Marsden", re.I)),
         ("uclh", "UCLH", re.compile(r"University College London|UCLH", re.I)),
         ("christie", "The Christie", re.compile(r"Christie", re.I))]


def cut(s, n=60):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0].rstrip(" ,;:-–(") + "…"


def clean_facility(f):
    f = re.sub(r"\s*\(\s*Site[^)]*\)", "", f or "")
    f = re.sub(r"\s*/\s*ID#.*$", "", f)
    f = re.split(r"\s+[-–|]\s+|,\s*", f)[0]
    f = re.sub(r"\s+NHS( Foundation)? Trust$", "", f, flags=re.I).strip()
    return cut(f, 36)


def trim_evidence(x):
    """Copy of a rules dict with every evidence quote cut to EVIDENCE_CHARS (keeps the bundle small)."""
    if isinstance(x, dict):
        return {k: (cut(v, EVIDENCE_CHARS) if k == "evidence" and isinstance(v, str) else trim_evidence(v)) for k, v in x.items()}
    if isinstance(x, list):
        return [trim_evidence(v) for v in x]
    return x


def matcher_trial(t):
    """The fields app/matcher.js reads from a parsed trial."""
    return {"nct": t["nct"], "rules": trim_evidence(t["rules"]), "placebo": t["placebo"], "uk_sites": t["uk_sites"]}


def display(study, t):
    """Plain fields the app shows about a trial, all from the public registry record."""
    p = study["protocolSection"]
    n = t["nct"]
    idm, design = p["identificationModule"], p.get("designModule", {})
    summary = re.sub(r"\s+", " ", p.get("descriptionModule", {}).get("briefSummary", "")).strip()
    locs = p.get("contactsLocationsModule", {}).get("locations", [])
    uk = [l for l in locs if l.get("country") == "United Kingdom"]
    key = name = None
    for l in uk:
        hit = next(((k, nm) for k, nm, rx in SITES if rx.search(l.get("facility") or "")), None)
        if hit:
            key, name = hit
            break
    if uk and not name:
        name = clean_facility(uk[0].get("facility"))
    countries = list(dict.fromkeys(l.get("country") for l in locs if l.get("country")))
    drugs = [i.get("name", "") for i in p.get("armsInterventionsModule", {}).get("interventions", [])
             if i.get("name") and not re.search(r"placebo", i.get("name", ""), re.I)]
    nums = [x.replace("EARLY_PHASE", "early ").replace("PHASE", "") for x in t["phases"] if x != "NA"]
    # Short name: the registry acronym, else a code in brackets at the end of the official title
    # or brief title ("... (ROSETTA Lung-02)"), else the cut-down brief title.
    tail = None
    for title in (idm.get("briefTitle") or "", idm.get("officialTitle") or ""):
        m = re.search(r"\(([A-Z][A-Za-z0-9]*(?:[- ][A-Za-z0-9]+){0,3})\)\s*$", title)
        if m and re.search(r"\d|[A-Z]{3,}", m.group(1)) and len(m.group(1)) <= 24:
            tail = m.group(1)
            break
    return {
        "title": t["title"],
        "short": (idm.get("acronym") or "").strip() or tail or cut(t["title"]),
        "plain": PLAIN.get(n), "what": WHAT.get(n),
        "summary": cut(summary, 300),
        "sponsor": p.get("sponsorCollaboratorsModule", {}).get("leadSponsor", {}).get("name", ""),
        "phase": ("Phase " + "/".join(nums)) if nums else "",
        "status": t["status"].replace("_", " ").capitalize(),
        "randomised": design.get("designInfo", {}).get("allocation") == "RANDOMIZED",
        "enrolment": design.get("enrollmentInfo", {}).get("count"),
        "drugs": list(dict.fromkeys(cut(d, 48) for d in drugs))[:5],
        "biopsy": bool(t["rules"]["biopsy"] and t["rules"]["biopsy"]["fresh_required"]),
        "n_criteria": t["n_inclusion"] + t["n_exclusion"],
        "site_key": key, "site_name": name,
        "uk_cities": list(dict.fromkeys(l.get("city") for l in uk if l.get("city")))[:8],
        "countries": countries[:6], "n_countries": len(countries),
        "url": t["url"],
    }


def bundle(raw, trials):
    """The downloadable trial rules bundle: public data only."""
    return {"snapshot": SNAPSHOT, "source": "ClinicalTrials.gov API v2 (US National Library of Medicine)",
            "query": "Recruiting or not yet recruiting, Phase 3, non-small cell lung cancer, primary purpose treatment",
            "weights": {k: v for k, v in match.W.items()},
            "trials": [{**matcher_trial(t), **display(raw[t["nct"]], t)} for t in trials]}


def records(patients):
    """Demo records: what a patient's device (or a clinic's system) holds. Kept out of the bundle."""
    keep = ("id", "source", "age", "sex", "race", "histology", "stage", "ecog", "prior_lines", "pdl1",
            "biomarkers", "brain_mets", "evidence")
    return [{k: p[k] for k in keep} for p in patients]


def load():
    with open("data/trials.json", encoding="utf-8") as f:
        raw = {s["protocolSection"]["identificationModule"]["nctId"]: s for s in json.load(f)}
    trials = [t for t in (parse_trial(s) for s in raw.values()) if t["purpose"] == "TREATMENT"]
    return raw, trials, load_patients("data/lung_cancer_patients.xlsx")


def main():
    raw, trials, patients = load()
    b, rec = bundle(raw, trials), records(patients)
    esc = lambda o: json.dumps(o, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")
    with open("app/template.html", encoding="utf-8") as f:
        html = f.read()
    with open("app/matcher.js", encoding="utf-8") as f:
        matcher = f.read()
    html = html.replace("__MATCHER__", matcher).replace("__BUNDLE__", esc(b)).replace("__RECORDS__", esc(rec))
    with open("app/index.html", "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    n_img = sum(1 for t in b["trials"] if t["site_key"])
    print(f"wrote app/index.html ({len(html.encode('utf-8')) // 1024} KB): bundle of {len(b['trials'])} trials "
          f"({len(esc(b).encode('utf-8')) // 1024} KB, {n_img} with a hospital photo), {len(rec)} demo records")


if __name__ == "__main__":
    main()
