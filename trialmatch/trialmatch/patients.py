"""Load the team's patient spreadsheet into normalised profiles.

Every field keeps the original cell text as `evidence`, so each eligibility
label can quote the record line it rests on.
"""
import re
import pandas as pd

UNKNOWN = "unknown"

SENSITISING_EGFR = re.compile(r"exon ?19|L858R|L861Q|G719|S768I", re.I)


def _cell(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return "Not recorded"
    return str(v).strip()


def _gene(text, fusion=False):
    """Map a gene cell to positive / negative / unknown.

    Sequencing in these studies finds point mutations but not fusions, so a
    'no mutation found (sequencing)' result is only a negative for mutation genes.
    """
    t = text.lower()
    if t.startswith("not recorded") or "result missing" in t or "unclear" in t:
        return UNKNOWN
    if t.startswith("negative"):
        return "negative"
    if "no mutation found" in t or "none found" in t:
        return UNKNOWN if fusion else "negative"
    return "positive"


def _stage_group(stage):
    s = stage.upper().replace("STAGE", "").strip()
    if s.startswith("NOT RECORDED"):
        return UNKNOWN
    if s.startswith("IV"):
        return "IV"
    if s.startswith("IIIB") or s.startswith("IIIC"):
        return "IIIB-C"
    if s.startswith("IIIA"):
        return "IIIA"
    if s.startswith("III"):
        return "III"
    if s.startswith("II"):
        return "II"
    return "I"


def load_patients(path):
    df = pd.read_excel(path, sheet_name="Patients")
    df = df[df["Patient ID"].astype(str).str.match(r"^(TCGA-|P-)")]
    patients = []
    for _, r in df.iterrows():
        c = {k: _cell(v) for k, v in r.items()}
        egfr_txt = c["EGFR"]
        egfr = _gene(egfr_txt)
        egfr_type = None
        if egfr == "positive":
            if SENSITISING_EGFR.search(egfr_txt):
                egfr_type = "sensitising"
            elif "exon 20" in egfr_txt.lower():
                egfr_type = "exon20ins"
            else:
                egfr_type = "other"
        kras_txt = c["KRAS"]
        kras = _gene(kras_txt)
        braf_txt = c["BRAF"]
        braf = _gene(braf_txt)
        other_txt = c["Other gene changes (MET, ERBB2)"]
        met = _gene(other_txt) if "MET" in other_txt or "none found" in other_txt.lower() else UNKNOWN
        pdl1_txt = c["PD-L1 (%)"]
        pdl1 = None if pdl1_txt.startswith("Not recorded") else float(pdl1_txt)
        ecog_txt = c["ECOG performance status"]
        ecog = None if ecog_txt.startswith("Not recorded") else int(float(ecog_txt))
        lines_txt = c["Lines of treatment"]
        lines = None if lines_txt.startswith("Not recorded") else int(float(lines_txt))
        hist_txt = c["Cancer type"]
        histology = ("squamous" if "squamous" in hist_txt.lower()
                     else "non-squamous" if "adenocarcinoma" in hist_txt.lower()
                     else UNKNOWN)
        patients.append({
            "id": c["Patient ID"],
            "source": c["Data source"],
            "age": float(c["Age at diagnosis"]),
            "sex": c["Sex"].upper(),
            "race": c["Race"],
            "histology": histology,
            "stage": _stage_group(c["Stage"]),
            "ecog": ecog,
            "prior_lines": lines,
            "pdl1": pdl1,
            "biomarkers": {
                "EGFR": egfr, "EGFR_type": egfr_type,
                "KRAS_G12C": ("positive" if "G12C" in kras_txt else
                              "negative" if kras in ("negative", "positive") else UNKNOWN),
                "KRAS_G12D": ("positive" if "G12D" in kras_txt else
                              "negative" if kras in ("negative", "positive") else UNKNOWN),
                "BRAF_V600E": ("positive" if "V600E" in braf_txt else
                               "negative" if braf in ("negative", "positive") else UNKNOWN),
                "ALK": _gene(c["ALK"], fusion=True),
                "ROS1": UNKNOWN,   # not recorded in any of the three studies
                "RET": UNKNOWN,    # fusion: sequencing here cannot detect it
                "MET_ex14": UNKNOWN if met == "positive" else met,  # splice variants need confirming
            },
            "brain_mets": UNKNOWN,  # not recorded in any of the three studies
            "evidence": {
                "histology": f"Cancer type: {hist_txt}",
                "stage": f"Stage: {c['Stage']} ({c['T (tumour)']} {c['N (lymph nodes)']} {c['M (distant spread)']})",
                "ecog": f"ECOG performance status: {ecog_txt}",
                "prior_lines": f"Lines of treatment: {lines_txt}",
                "pdl1": f"PD-L1 (%): {pdl1_txt}",
                "EGFR": f"EGFR: {egfr_txt}",
                "KRAS_G12C": f"KRAS: {kras_txt}",
                "KRAS_G12D": f"KRAS: {kras_txt}",
                "BRAF_V600E": f"BRAF: {braf_txt}",
                "ALK": f"ALK: {c['ALK']}",
                "ROS1": "ROS1: not in record",
                "RET": "RET: not in record (fusions not detectable by this sequencing)",
                "MET_ex14": f"Other gene changes: {other_txt}",
                "brain_mets": "Brain metastases: not in record",
                "age": f"Age at diagnosis: {c['Age at diagnosis']}",
                "sex": f"Sex: {c['Sex']}",
            },
        })
    return patients
