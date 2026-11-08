"""Sanity tests for the rule-based parser, built from real criteria lines. Run: python -m pytest -q"""
from trialmatch.criteria import _ecog, _genes, _pdl1, _prior, _stage, split_sections


def test_ecog_three_values():
    assert _ecog(["ECOG/Zubrod performance status (PS) 0, 1, or 2"])["max"] == 2

def test_ecog_zero_one():
    assert _ecog(["Eastern Cooperative Oncology Group (ECOG) performance status of 0 or 1."])["max"] == 1

def test_no_egfr_means_excluded():
    g = _genes(["No EGFR sensitive mutations or ALK gene translocations."], [])
    assert g["EGFR"]["rule"] == "excluded" and g["ALK"]["rule"] == "excluded"

def test_required_kras():
    assert _genes(["Has KRAS G12C mutation confirmed by central laboratory"], [])["KRAS_G12C"]["rule"] == "required"

def test_known_actionable_in_exclusion():
    g = _genes([], ["Known actionable genomic alterations."])
    assert {"EGFR", "ALK", "ROS1"} <= set(g)

def test_pdl1_threshold_with_antibody_text():
    line = "PD-L1 expression on ≥1% of tumor cells based on local IHC testing with the anti-PD-L1 antibody clones 22C3"
    assert _pdl1([line])["min"] == 1

def test_first_line_is_naive():
    assert _prior(["No previous systemic anti-tumor treatment for locally advanced or metastatic squamous NSCLC"], [])["max"] == 0

def test_pretreated():
    assert _prior(["Previously received systemic platinum-based chemotherapy and PD-1/L1 inhibitors."], [])["min"] == 1

def test_stage_range_with_or():
    st = _stage("", "", ["Adult subjects with a histologically confirmed diagnosis of Stage IIIB, IIIC, or IV sqNSCLC"])
    assert st["max_num"] == 4 and "advanced" in st["scopes"]

def test_not_amenable_is_not_early():
    st = _stage("", "", ["Histologically confirmed locally advanced (Stage IIIB/IIIC) not amenable to complete surgical resection"])
    assert "early" not in st["scopes"]

def test_split_with_preamble():
    inc, exc = split_sections("The key inclusion and exclusion criteria include:\nInclusion Criteria:\n"
                              "* Stage II NSCLC\n* ECOG 0 or 1\nExclusion Criteria:\n* Active CNS metastases")
    assert inc == ["Stage II NSCLC", "ECOG 0 or 1"] and exc == ["Active CNS metastases"]

def test_negation_for_another_marker_does_not_flip_the_gene():
    # CodeBreaK 202 (NCT05920356): "negative" belongs to PD-L1, not KRAS
    line = ("Histologically or cytologically confirmed diagnosis of nonsquamous stage IV or advanced Stage IIIB or IIIC "
            "NSCLC with KRAS p. G12C mutation and negative for PD-L1 expression")
    assert _genes([line], [])["KRAS_G12C"]["rule"] == "required"
    assert _genes(["KRAS G12C mutation and PD-L1 negative"], [])["KRAS_G12C"]["rule"] == "required"

def test_negation_after_the_gene_still_counts():
    assert _genes(["EGFR mutation negative"], [])["EGFR"]["rule"] == "excluded"
    assert _genes(["EGFR wild-type tumour"], [])["EGFR"]["rule"] == "excluded"
    g = _genes(["Local testing of EGFR with no EGFR exon 19 deletion or EGFR L858 R mutation"], [])
    assert g["EGFR"]["rule"] == "excluded"

def test_progressed_on_targeted_therapy_is_conditional():
    line = ("Participants WITH an actionable gene alteration (e.g., anaplastic lymphoma kinase [ALK] translocation): "
            "must have progressed on (or be considered ineligible for) anti-cancer therapy targeting driver gene alterations")
    assert _genes([line], [])["ALK"]["rule"] == "conditional"
