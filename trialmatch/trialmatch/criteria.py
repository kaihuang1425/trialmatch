"""Criteria Parser (rule-based layer).

Turns a ClinicalTrials.gov record into the structured fields that decide most
NSCLC matches. Each field keeps the criterion line it came from (`evidence`).
Design rule: when a line is ambiguous, leave the field unset rather than guess.
An unset field never rules a patient out; the remaining lines are handed to the
LLM checker (see llm.py) or to the research nurse.
"""
import re

AGE_RE = re.compile(r"(\d+)\s*Years?", re.I)


def _age(s):
    if not s:
        return None
    m = AGE_RE.search(s)
    return int(m.group(1)) if m else None


def split_sections(text):
    """Return (inclusion_lines, exclusion_lines)."""
    text = text.replace("\\", "")
    heads = list(re.finditer(r"exclusion criteria\s*:", text, re.I)) or list(re.finditer(r"exclusion criteria", text, re.I))
    if heads:
        cut = heads[-1]
        before, exc = text[:cut.start()], text[cut.end():]
    else:
        before, exc = text, ""
    incs = list(re.finditer(r"inclusion criteria\s*:?", before, re.I))
    inc = before[incs[-1].end():] if incs else before

    def lines(block):
        out = []
        for raw in block.split("\n"):
            # some registries cram numbered items into one line: "1. ...; 2. ..."
            for piece in re.split(r"(?:(?<=[;。.])\s+)(?=\d{1,2}\s*[.)、]\s+[A-Z])", raw):
                p = re.sub(r"^[\s*•\-\d.)、]+", "", piece).strip()
                if len(p) > 3:
                    out.append(p)
        return out
    return lines(inc), lines(exc)


NEG_WORDS = re.compile(
    r"\b(negative|wild[- ]?type|without|absence|absent|no known|not have|no (?:documented|evidence)"
    r"|lack|excluded|ineligible|must not|do not have|does not have|driver[- ]gene negative)\b"
    r"|\bno\s+(?:\w+\s+){0,2}(?:EGFR|ALK|ROS|KRAS|BRAF|RET|MET|driver|actionable|known|sensiti)", re.I)
POS_WORDS = re.compile(
    r"\b(mutations?|mutant|mutated|positive|harbou?rs?|fusions?|rearrange\w*|alterations?|amplification"
    r"|exon ?19|L858R|G12 ?C|G12 ?D|V600E|exon ?14|insertion|translocation|sensiti[sz]ing)\b", re.I)
PRIOR_TX = re.compile(r"\b(progress(?:ed|ion)?|prior|previous|after|failure|failed|resistan|TKI therapy|treated with|received)\b", re.I)

GENES = {
    "EGFR": re.compile(r"\bEGFR\b"),
    "ALK": re.compile(r"\bALK\b"),
    "ROS1": re.compile(r"\bROS-?1\b", re.I),
    "KRAS_G12C": re.compile(r"\bKRAS\b.{0,40}G12 ?C|G12 ?C\b", re.I),
    "KRAS_G12D": re.compile(r"G12 ?D\b", re.I),
    "BRAF_V600E": re.compile(r"\bBRAF\b|V600E", re.I),
    "RET": re.compile(r"\bRET\b"),
    "MET_ex14": re.compile(r"\bMET\b.{0,40}exon ?14|METex14", re.I),
}
DRIVER_NEG = re.compile(r"driver[- ]gene[- ]negative|(?:no|without) (?:known )?(?:actionable|targetable|sensiti[sz]ing) "
                        r"(?:genomic |driver |oncogenic )?(?:alteration|mutation)", re.I)


# Negations that can sit after the gene and still describe it ("EGFR mutation negative", "EGFR wild-type").
# "without X", "no X" or "absence of X" after the gene open a new object instead.
POST_NEG = re.compile(r"negative|wild[- ]?type|absent|excluded|ineligible|must not|do not have|does not have"
                      r"|not have|driver[- ]gene negative", re.I)
OTHER_MARKER = re.compile(r"PD-?L-?1|PD-?1|TPS|CPS|expression|TMB|MSI(?:-H)?|dMMR|HLA[\w-]*|HER-?2|ERBB2|STK11|KEAP1"
                          r"|TP53|SMARCA4|TROP-?2|B7-?H\d|CD\d+|c-?MET", re.I)
GAP_FILLER = {"is", "are", "be", "been", "must", "status", "and", "or"}


def _negated(line, rx):
    """True when a negation in `line` applies to the gene that `rx` finds. A negation after the
    last mention of the gene is discounted when it opens a new object ("negative for PD-L1",
    "without prior therapy") or sits right after another marker ("G12C and PD-L1 negative")."""
    mentions = list(rx.finditer(line))
    for n in NEG_WORDS.finditer(line):
        if not mentions or n.start() < mentions[-1].end():
            return True
        if not POST_NEG.fullmatch(n.group(0)):
            continue
        if re.match(r"\s*(?:for|of|to|in)\b", line[n.end():], re.I):
            continue
        owner = None
        for w in reversed(re.findall(r"[\w.\-/]+", line[mentions[-1].end():n.start()])):
            w = w.strip(".,-/")
            if w and w.lower() not in GAP_FILLER:
                owner = w
                break
        if owner and OTHER_MARKER.fullmatch(owner):
            continue
        return True
    return False


THERAPY = re.compile(r"(?:anti-?)?\b(?:EGFR|ALK|ROS-?1|KRAS(?: G12[CD])?|BRAF|RET|MET)\b\)?[- ]?(?:-?TKIs?|tyrosine kinase inhibitors?|"
                     r"inhibitors?|-?targe?t(?:ing|ed)\s*(?:agents?|therap\w*|drugs?)?|-?directed(?:\s*therap\w*)?)", re.I)


def _genes(inc, exc, title=""):  # noqa: C901
    """For each gene: 'required', 'excluded' or 'conditional' (positive allowed only after
    prior targeted therapy; needs a human check), with the evidence line."""
    out = {}

    def put(g, rule, line):
        if g not in out:
            out[g] = {"rule": rule, "evidence": line}
        elif out[g]["rule"] != rule:
            out[g] = {"rule": "conditional", "evidence": out[g]["evidence"] + " | " + line}

    inc = [THERAPY.sub("[targeted therapy]", l) for l in inc]
    exc = [THERAPY.sub("[targeted therapy]", l) for l in exc]
    for line in inc:
        hits = [g for g, rx in GENES.items() if rx.search(line)]
        if DRIVER_NEG.search(line):
            for g in ("EGFR", "ALK", "ROS1"):
                put(g, "excluded", line)
            continue
        for g in hits:
            if re.search(r"candidate\w* (?:to|for) .{0,25}" + g.split("_")[0], line, re.I):
                put(g, "required", line)
            elif _negated(line, GENES[g]):
                put(g, "excluded", line)
            elif PRIOR_TX.search(line):
                put(g, "conditional", line)
            elif POS_WORDS.search(line):
                put(g, "required", line)
    for line in exc:
        if DRIVER_NEG.search(line):
            continue
        if re.search(r"known (?:\w+\s+){0,2}(?:actionable|targetable|driver)|driver gene (?:mutation|alteration)s? "
                     r"(?:for|with) (?:approved|available)", line, re.I):
            for g in ("EGFR", "ALK", "ROS1"):
                put(g, "excluded", line)
        hits = [g for g, rx in GENES.items() if rx.search(line)]
        for g in hits:
            if PRIOR_TX.search(line) and not POS_WORDS.search(line.split(g)[0][-60:] + g):
                # e.g. "prior EGFR TKI therapy" is about past treatment, not the tumour
                continue
            if POS_WORDS.search(line) or re.search(r"known|documented|presence", line, re.I):
                put(g, "excluded", line)
    # A gene named as positive in the trial title is a requirement, whatever the body lines say
    for g, rx in GENES.items():
        if rx.search(title) and POS_WORDS.search(title) and not _negated(title, rx):
            out[g] = {"rule": "required", "evidence": "Title: " + title}
    if "EGFR" in out and out["EGFR"]["rule"] == "required":
        egfr_lines = " ".join(l for l in inc if "EGFR" in l) + " " + title
        out["EGFR"]["specific_variant"] = bool(re.search(r"PACC|uncommon|atypical|exon ?20|C797S|T790M|G719|L861Q|S768I",
                                                         egfr_lines, re.I))
        out["EGFR"]["classical_only"] = bool(re.search(r"exon ?19|ex19|L858R", egfr_lines, re.I)) \
            and not re.search(r"L861Q|G719|S768I|uncommon|atypical|exon ?20|any EGFR", egfr_lines, re.I)
    # EGFR exclusions that only name sensitising mutations do not exclude exon 20 insertions
    if "EGFR" in out and out["EGFR"]["rule"] == "excluded":
        out["EGFR"]["sensitising_only"] = bool(
            re.search(r"sensiti[sz]|exon ?19|L858R|TKI", out["EGFR"]["evidence"], re.I))
    return out


ECOG_RE = re.compile(
    r"(?:ECOG|performance status|\bPS\b)[^.;]{0,80}?(?:of|score|status|PS|:|=)?\s*"
    r"(?:(?:0,\s*1,?\s*(?:or|and)\s*(2))|(?:0\s*(?:-|–|to|or|,)\s*(\d))|(?:[≤<]=?\s*(\d)))", re.I)


def _ecog(inc):
    for line in inc:
        if re.search(r"ECOG|performance status", line, re.I):
            m = ECOG_RE.search(line)
            if m:
                v = next(x for x in m.groups() if x)
                return {"max": int(v), "evidence": line}
    return None


def _histology(title, inc):
    if re.search(r"(?<!non-)(?<!non )(?<!non)small[- ]cell lung (?:cancer|carcinoma)|\bSCLC\b", title, re.I) \
            and not re.search(r"non[- ]?small", title, re.I):
        return {"required": "small-cell", "evidence": "Title: " + title}
    text = " ".join([title] + inc[:6])
    nonsq = re.search(r"non[- ‑]?squamous|nonsquamous|adenocarcinoma|\bnsq-?NSCLC|non-?sqNSCLC", text, re.I)
    sq = re.search(r"(?<!non)(?<!non-)(?<!non )squamous|(?<![n-])\bsqNSCLC", text, re.I)
    if nonsq and not sq:
        return {"required": "non-squamous", "evidence": _first(inc, r"non[- ]?squamous|nonsquamous") or title}
    if sq and not nonsq and re.search(r"squamous|sqNSCLC", " ".join([title] + inc[:6]), re.I):
        return {"required": "squamous", "evidence": title}
    return None


def _first(lines, pat):
    for l in lines:
        if re.search(pat, l, re.I):
            return l
    return None


def _stage(title, summary, inc):
    """Which disease settings the trial enrols: early (resectable), stage III unresectable,
    advanced (IIIB-IV / metastatic)."""
    # Only lines that describe the disease, not notes about allowed prior treatment
    stage_lines = [l for l in inc if re.search(r"stage|metasta|advanced|resect|operable|NSCLC|non-small", l, re.I)
                   and not re.search(r"prior|previous|permitted|allowed|received|completed", l, re.I)][:3]
    head = " ".join([title, summary[:400]] + stage_lines)
    scopes = set()
    unresectable = re.search(r"unresectable|inoperable|non-?operable|(?:not|ineligible|unsuitable)\s+(?:\w+\s+){0,3}"
                             r"(?:surg\w*|resection)|not amenable|chemoradi|concurrent radi", head, re.I)
    if re.search(r"\bresectable|resected|complete resection|adjuvant|neoadjuvant|perioperative|early[- ]stage|"
                 r"stage I[AB]?\b|stage I-|stage II[AB]?\b|surgery|surgical|lobectomy|segmentectomy|SBRT|stereotactic",
                 head, re.I) and not unresectable:
        scopes.add("early")
    if unresectable or re.search(r"locally advanced|stage III\b", head, re.I):
        scopes.add("stage3_unresectable")
    no_local = re.sub(r"locally[- ]advanced", "", head, flags=re.I)
    no_local = re.sub(r"(?:without|no|absence of|free of)\s+(?:\w+\s+){0,2}metasta\w*", "", no_local, flags=re.I)
    if re.search(r"metasta|stage IV|stage IIIB|stage IIIC|\badvanced|recurrent|previously treated", no_local, re.I):
        scopes.add("advanced")
    line = next((l for l in stage_lines if re.search(r"stage", l, re.I)), stage_lines[0] if stage_lines else title)
    if not scopes:
        return None
    # Stage numbers named in the disease lines, e.g. "Stage IB-IIIA", "Stage II, IIIA or IIIB"
    nums = []
    for m in re.finditer(r"(?i:stage)\s*((?:I{1,3}V?|IV)[ABC]?(?:(?:\s*(?:-|–|to|,|or|and|/))+\s*(?:(?i:stage)\s*)?(?:I{1,3}V?|IV)[ABC]?)*)",
                         " ".join([title] + stage_lines)):
        for tok in re.findall(r"(IV|I{1,3})[ABC]?", m.group(1)):
            nums.append({"I": 1, "II": 2, "III": 3, "IV": 4}[tok])
    out = {"scopes": sorted(scopes), "evidence": line}
    if nums:
        out["min_num"], out["max_num"] = min(nums), max(nums)
    return out


def _pdl1(inc):
    thr = re.compile(r"PD-?L1[^.;]{0,60}?(?:≥|>=|greater than or equal to|at least|>)\s*(\d+)\s*%", re.I)
    below = re.compile(r"PD-?L1[^.;]{0,60}?(?:<|less than)\s*(\d+)\s*%", re.I)
    rng = re.compile(r"PD-?L1[^.;]{0,60}?(\d+)\s*%?\s*(?:-|–|to)\s*(\d+)\s*%", re.I)
    for line in inc:
        if not re.search(r"PD-?L1", line, re.I):
            continue
        m = rng.search(line)
        if m:
            return {"min": float(m.group(1)), "max_incl": float(m.group(2)), "evidence": line}
        m = thr.search(line)
        if m:
            return {"min": float(m.group(1)), "evidence": line}
        m = below.search(line)
        if m:
            return {"max_below": float(m.group(1)), "evidence": line}
    return None


def _prior(inc, exc, title=""):
    naive = re.compile(r"(?:no|without|absence of|has not received|have not received|not (?:previously )?received)\s+"
                       r"(?:any\s+)?(?:prior|previous)?\s*(?:systemic|anti-?(?:cancer|tumou?r)|chemo)|treatment[- ]na[iï]ve|"
                       r"previously untreated", re.I)
    pretreated = re.compile(r"(?:progress\w*|failure|failed|relapse\w*)\s.{0,80}(?:after|on|during|following|of)\s.{0,60}"
                            r"(?:prior|previous|platinum|chemotherapy|line|TKI|immunotherapy|PD-?1|PD-?L1)|"
                            r"previously treated|previously received|received (?:one|at least one|1|≥ ?1) prior|"
                            r"at least (?:one|1) (?:prior )?line|≥\s*1 (?:prior )?line|second[- ]line", re.I)
    for line in inc:
        if naive.search(line) and re.search(r"advanced|metasta|stage IV|recurrent|NSCLC", line, re.I):
            return {"max": 0, "evidence": line}
        negated = re.search(r"\b(?:not|no|without)\s+(?:\w+\s+){0,3}(?:disease\s+)?progress", line, re.I)
        failed = (re.search(r"\bfail\w*|progress\w*|refractory|relapsed", line, re.I)
                  and re.search(r"line|therapy|treatment|chemo|TKI|immuno|regimen", line, re.I))
        if (pretreated.search(line) or failed) and not negated and not re.search(r"adjuvant|neoadjuvant", line, re.I):
            return {"min": 1, "evidence": line}
    for line in exc:
        m = re.search(r"(?:more than|>)\s*(one|two|three|1|2|3) prior (?:lines?|regimens?)", line, re.I)
        if m:
            n = {"one": 1, "two": 2, "three": 3}.get(m.group(1).lower(), None) or int(m.group(1))
            return {"max": n, "evidence": line}
        if re.search(r"prior (?:systemic|anti-?cancer|anti-?tumou?r) (?:therapy|treatment)\s+(?:\w+\s+){0,2}for "
                     r"(?:locally advanced|advanced|metastatic|stage IV|recurrent)", line, re.I):
            return {"max": 0, "evidence": line}
    if re.search(r"first[- ]line|treatment[- ]na[iï]ve|previously untreated", title, re.I):
        return {"max": 0, "evidence": "Title: " + title}
    return None


def _brain(exc, inc):
    for line in exc + inc:
        if re.search(r"brain|CNS|central nervous", line, re.I) and re.search(
                r"active|untreated|symptomatic|unstable|progressing|leptomening", line, re.I):
            return {"rule": "active_excluded", "evidence": line}
        if re.search(r"no evidence of brain metast", line, re.I):
            return {"rule": "any_excluded", "evidence": line}
    return None


def _biopsy(inc):
    archival_ok = next((l for l in inc if re.search(r"archiv", l, re.I)), None)
    for line in inc:
        if re.search(r"(?:must|required|willing|mandatory|agree)\b.{0,60}(?:fresh (?:tumou?r )?(?:tissue )?biopsy|newly obtained)"
                     r"|fresh (?:tumou?r )?(?:tissue )?biopsy (?:is )?(?:required|mandatory)", line, re.I):
            if archival_ok:
                return {"fresh_required": False, "evidence": archival_ok}
            return {"fresh_required": True, "evidence": line}
    return None


def parse_trial(study):
    p = study["protocolSection"]
    idm, el = p["identificationModule"], p.get("eligibilityModule", {})
    title = idm.get("officialTitle") or idm.get("briefTitle", "")
    summary = p.get("descriptionModule", {}).get("briefSummary", "")
    inc, exc = split_sections(el.get("eligibilityCriteria", ""))
    interventions = p.get("armsInterventionsModule", {}).get("interventions", [])
    placebo = any("placebo" in (i.get("name", "") + " " + i.get("description", "")).lower() for i in interventions)
    locs = p.get("contactsLocationsModule", {}).get("locations", [])
    sites = [{"facility": l.get("facility"), "city": l.get("city"), "country": l.get("country"),
              "geo": l.get("geoPoint")} for l in locs]
    rules = {
        "age": {"min": _age(el.get("minimumAge")), "max": _age(el.get("maximumAge"))},
        "sex": el.get("sex", "ALL"),
        "histology": _histology(title, inc),
        "stage": _stage(title, summary, inc),
        "ecog": _ecog(inc),
        "genes": _genes(inc, exc, title),
        "pdl1": _pdl1(inc),
        "prior_lines": _prior(inc, exc, title),
        "brain_mets": _brain(exc, inc),
        "biopsy": _biopsy(inc),
    }
    return {
        "nct": idm["nctId"],
        "title": idm.get("briefTitle", ""),
        "status": p["statusModule"]["overallStatus"],
        "phases": p.get("designModule", {}).get("phases", []),
        "placebo": placebo,
        "purpose": p.get("designModule", {}).get("designInfo", {}).get("primaryPurpose"),
        "sites": sites,
        "uk_sites": sum(1 for s in sites if s["country"] == "United Kingdom"),
        "rules": rules,
        "n_inclusion": len(inc),
        "n_exclusion": len(exc),
        "inclusion": inc,
        "exclusion": exc,
        "url": f"https://clinicaltrials.gov/study/{idm['nctId']}",
    }
