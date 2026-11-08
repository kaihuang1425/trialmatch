/* Relay coordinator board (house board). Data-driven: every card, count and colour is computed
   from cited facts by a small rules engine, so new evidence or a correction re-assesses everything. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const params = new URLSearchParams(location.search);
  const SELFTEST = params.get("selftest") === "1";
  if (SELFTEST || params.get("motion") === "off") Kit.setMotion(false);
  if (params.get("theme")) Kit.setTheme(params.get("theme"));

  const TODAY = new Date("2026-11-07T15:40:00");
  const LAB_POLICY_DAYS = 28; // Relay policy, not a protocol claim
  const SNAPSHOT = "Registry snapshot 7 Nov 2026";

  /* ======================= Synthetic documents ======================= */
  const HEADER = "SYNTHETIC RECORD — generated for the Relay demo. Not a real patient.";
  const REF_TEXT = [
    HEADER, "Referral summary · SYN-0417 · 30 Oct 2026", "",
    "63-year-old referred for consideration of clinical trials after a new diagnosis of non-small cell lung cancer.",
    "Histology: CT-guided biopsy of the right upper lobe mass shows adenocarcinoma (nonsquamous). No small-cell or neuroendocrine component identified.",
    "Staging: PET-CT on 14 Oct 2026 shows stage IVA (M1b) disease with a single adrenal metastasis; measurable disease per RECIST 1.1.",
    "MRI brain on 12 Oct 2026: no intracranial metastases.",
    "Performance status: ECOG 1.",
    "Treatment to date: no systemic anticancer therapy has been given.",
    "Past medical history: hypertension, controlled; no other cardiac history. No history of inflammatory bowel disease, interstitial lung disease or autoimmune disease. No gastrointestinal disorder affecting absorption. No other cancer diagnosis.",
    "Molecular testing: tissue sent for NGS panel and PD-L1 immunohistochemistry; results awaited.",
    "Lives in London and would prefer to travel no more than 60 miles.",
  ].join("\n");
  const LABS_TEXT = [HEADER, "Blood results · SYN-0417 · 18 Sep 2026", "",
    "Neutrophils 4.1 ×10^9/L. Haemoglobin 128 g/L. Platelets 262 ×10^9/L.",
    "Creatinine 84 µmol/L. ALT 22 U/L. Bilirubin 9 µmol/L."].join("\n");

  const KRAS = { G12C: "c.34G>T p.(G12C) detected", G12D: "c.35G>A p.(G12D) detected", none: "no pathogenic variant detected" };
  const EGFR = { none: "no pathogenic variant detected", ex19: "exon 19 deletion p.(E746_A750del) detected", L858R: "c.2573T>G p.(L858R) detected", G719X: "c.2156G>C p.(G719A) detected (PACC)" };
  const ALK = { none: "not detected", pos: "EML4-ALK fusion detected" };
  const HER2 = { none: "no mutation or amplification detected", ex20: "exon 20 insertion p.(A775_G776insYVMA) detected" };
  const LABEL = {
    kras: { G12C: "KRAS G12C", G12D: "KRAS G12D", none: "KRAS not detected" },
    egfr: { none: "EGFR not detected", ex19: "EGFR exon 19 del", L858R: "EGFR L858R", G719X: "EGFR G719A (PACC)" },
    alk: { none: "ALK not detected", pos: "ALK fusion" },
    her2: { none: "HER2 mut/amp not detected", ex20: "HER2 exon 20 ins" },
  };
  function molText(v) {
    return [HEADER, "Molecular pathology report · SYN-0417 · 7 Nov 2026", "",
      "Specimen: right upper lobe core biopsy, tumour content 40%.",
      "NGS panel (DNA and RNA):",
      "KRAS: " + KRAS[v.kras], "EGFR: " + EGFR[v.egfr], "ALK fusion: " + ALK[v.alk],
      "ROS1, RET and NTRK fusions: not detected.", "BRAF V600E: not detected.", "MET exon 14 skipping: not detected.",
      "ERBB2 (HER2): " + HER2[v.her2],
      "PD-L1 (22C3) tumour proportion score: " + v.pdl1 + "%."].join("\n");
  }
  function bloodText(v) {
    return [HEADER, "Blood results · SYN-0417 · 7 Nov 2026", "",
      "Neutrophils " + v.anc + " ×10^9/L. Haemoglobin " + v.hb + " g/L. Platelets " + v.plt + " ×10^9/L.",
      "Creatinine 81 µmol/L. ALT 24 U/L. Bilirubin 8 µmol/L."].join("\n");
  }

  /* Deterministic extraction for the synthetic templates: every fact keeps a verbatim quote. */
  function extract(doc) {
    const F = (key, value, display, quote, date) => {
      if (doc.text.indexOf(quote) < 0) throw new Error("quote not found: " + quote); // the guardrail
      return { key, value, display, doc: doc.id, quote, date: date || doc.dateISO, by: "agent" };
    };
    if (doc.kind === "referral") return [
      F("age", 63, "63", "63-year-old"),
      F("hist", "nonsquamous", "Adenocarcinoma, nonsquamous", "adenocarcinoma (nonsquamous)"),
      F("stage", "IVA", "Stage IVA (M1b)", "stage IVA (M1b)"),
      F("measurable", true, "RECIST 1.1", "measurable disease per RECIST 1.1"),
      F("brain", "none", "None on MRI", "no intracranial metastases"),
      F("ecog", 1, "ECOG 1", "ECOG 1"),
      F("priorTx", "none", "None", "no systemic anticancer therapy has been given"),
      F("pmh", "none", "None documented", "No history of inflammatory bowel disease, interstitial lung disease or autoimmune disease"),
      F("cardiac", "none", "Controlled hypertension only", "hypertension, controlled; no other cardiac history"),
      F("gi", "none", "None documented", "No gastrointestinal disorder affecting absorption"),
      F("otherMalig", "none", "None", "No other cancer diagnosis"),
      F("travel", 60, "≤ 60 mi", "travel no more than 60 miles"),
    ];
    if (doc.kind === "labs") {
      const m = doc.text.match(/Neutrophils ([\d.]+) ×10\^9\/L\. Haemoglobin ([\d.]+) g\/L\. Platelets ([\d.]+) ×10\^9\/L\./);
      return [F("labs", { anc: +m[1], hb: +m[2], plt: +m[3] }, "ANC " + m[1] + " · Hb " + m[2] + " · Plt " + m[3], m[0], doc.dateISO)];
    }
    if (doc.kind === "molecular") {
      const v = doc.values;
      return [
        F("kras", v.kras, LABEL.kras[v.kras], "KRAS: " + KRAS[v.kras]),
        F("egfr", v.egfr, LABEL.egfr[v.egfr], "EGFR: " + EGFR[v.egfr]),
        F("alk", v.alk, LABEL.alk[v.alk], "ALK fusion: " + ALK[v.alk]),
        F("rosret", "none", "ROS1/RET/NTRK not detected", "ROS1, RET and NTRK fusions: not detected."),
        F("braf", "none", "BRAF V600E not detected", "BRAF V600E: not detected."),
        F("met", "none", "MET ex14 not detected", "MET exon 14 skipping: not detected."),
        F("her2", v.her2, LABEL.her2[v.her2], "ERBB2 (HER2): " + HER2[v.her2]),
        F("pdl1", v.pdl1, "PD-L1 TPS " + v.pdl1 + "%", "tumour proportion score: " + v.pdl1 + "%"),
      ];
    }
    return [];
  }

  /* ======================= Trials (real registry records, snapshot 7 Nov 2026) ======================= */
  const DRIVERS = ["egfr", "alk", "rosret", "braf", "met"];
  const MOL = ["kras", "egfr", "alk", "rosret", "braf", "met", "her2", "pdl1"];
  const ok = (...ev) => ({ state: "supported", ev });
  const bad = (ev, note) => ({ state: "conflicting", ev: [].concat(ev), note });
  const nonsq = (f) => f.hist.value === "nonsquamous";
  const advanced = (f) => ["IIIB", "IIIC", "IV", "IVA", "IVB"].includes(f.stage.value);
  const isStale = (fact) => fact && (TODAY - new Date(fact.date)) / 864e5 > LAB_POLICY_DAYS;
  const staleRes = (f) => ({ state: "unknown", stale: true, ev: ["labs"], note: "Blood results from " + fmtDate(f.labs.date) + " are older than " + LAB_POLICY_DAYS + " days (Relay policy)." });
  function drivers(keys, reviewKeys) {
    const rv = reviewKeys || [];
    return (f) => {
      const hit = keys.filter((k) => f[k] && f[k].value !== "none");
      const hard = hit.filter((k) => !rv.includes(k));
      if (hard.length) return bad(hard, "Documented: " + hard.map((k) => f[k].display).join(", ") + ".");
      if (hit.length) return { state: "needs_review", ev: hit, note: "Documented: " + hit.map((k) => f[k].display).join(", ") + ". Whether a targeted treatment is available for this patient needs a clinician's check." };
      const missing = keys.filter((k) => !f[k]);
      if (missing.length) return { state: "unknown", missing, ev: keys.filter((k) => f[k]) };
      return ok(...keys);
    };
  }
  const C = (id, kind, plain, text, keys, fn, o) => Object.assign({ id, kind, plain, text, keys, fn }, o || {});
  const V_CBK = "Histologically or cytologically confirmed diagnosis of nonsquamous stage IV or advanced Stage IIIB or IIIC NSCLC with KRAS p. G12C mutation and negative for PD-L1 expression by central testing or local laboratory testing confirmed through central testing";
  const notSmallCell = (f) => (nonsq(f) ? ok("hist") : bad("hist"));
  const noPrior = (f) => (f.priorTx.value === "none" ? ok("priorTx") : bad("priorTx"));
  const noBrain = (f) => (f.brain.value === "none" ? ok("brain") : bad("brain"));
  const isMeasurable = (f) => (f.measurable.value ? ok("measurable") : bad("measurable"));
  const isAdvanced = (f) => (advanced(f) ? ok("stage") : bad("stage"));
  const ecogMax = (n) => (f) => (f.ecog.value <= n ? ok("ecog") : bad("ecog", "ECOG " + f.ecog.value + " is above the limit of " + n + "."));
  const krasIs = (v) => (f) => (f.kras.value === v ? ok("kras") : bad("kras"));

  const TRIALS = [
    { id: "cbk", nct: "NCT05920356", acr: "CodeBreaK 202", phase: "Phase 3", sponsor: "Amgen",
      title: "Sotorasib + platinum doublet vs pembrolizumab + platinum doublet, first line",
      sites: [["Royal Marsden Hospital", "London", 3, "R"], ["Mount Vernon Cancer Centre", "Northwood", 15, "R"], ["Torbay Hospital", "Torquay", 186, "R"], ["Royal Cornwall Hospital", "Truro", 254, "R"]],
      crit: [
        C("cbk-1", "inc", "Nonsquamous NSCLC, stage IIIB–IV", V_CBK, ["hist", "stage"], (f) => (nonsq(f) && advanced(f) ? ok("hist", "stage") : bad(["hist", "stage"])), { part: "1 of 3 in one criterion — all must hold" }),
        C("cbk-2", "inc", "KRAS G12C mutation", V_CBK, ["kras"], krasIs("G12C"), { part: "2 of 3 in one criterion — all must hold" }),
        C("cbk-3", "inc", "PD-L1 negative (TPS < 1%)", V_CBK, ["pdl1"], (f) => (f.pdl1.value < 1 ? { state: "supported", ev: ["pdl1"], pending: true, note: "Local result. The protocol asks for central confirmation." } : bad("pdl1", "TPS " + f.pdl1.value + "%. The study needs PD-L1 negative.")), { part: "3 of 3 in one criterion — all must hold" }),
        C("cbk-3b", "inc", "Central PD-L1 confirmation", V_CBK, [], () => ({ state: "needs_review", atScreening: true, ev: [], note: "The protocol needs PD-L1 negativity confirmed by central testing. The study team does this at screening." }), { part: "3 of 3 in one criterion — all must hold" }),
        C("cbk-4", "inc", "No systemic therapy for metastatic disease", "No history of systemic anticancer therapy in metastatic/non-curable settings", ["priorTx"], noPrior),
        C("cbk-5", "inc", "ECOG 0–1", "Eastern Cooperative Oncology Group (ECOG) ≤ 1", ["ecog"], ecogMax(1)),
        C("cbk-6", "exc", "No driver with approved first-line targeted therapy", "Participants with tumors known to harbor molecular alterations for which targeted therapy is locally approved as a front-line therapy", DRIVERS, drivers(DRIVERS), { custom: true }),
        C("cbk-7", "exc", "No symptomatic brain metastases", "Symptomatic (treated or untreated) brain metastases", ["brain"], noBrain),
        C("cbk-8", "exc", "No prior KRAS G12C inhibitor", "Prior therapy with a KRAS G12C inhibitor", ["priorTx"], noPrior),
        C("cbk-9", "exc", "No small-cell or squamous component", "Mixed histology NSCLC with either small-cell or large-cell neuroendocrine cell component or predominant squamous cell histology", ["hist"], notSmallCell),
        C("cbk-10", "exc", "No GI condition stopping oral medication", "Gastrointestinal (GI) tract disease causing the inability to take oral medication", ["gi"], (f) => (f.gi.value === "none" ? ok("gi") : bad("gi"))),
        C("cbk-11", "exc", "No recent MI, unstable arrhythmia or angina", "Myocardial infarction within 6 months of randomization, unstable arrhythmias, or unstable angina", ["cardiac"], (f) => (f.cardiac.value === "none" ? ok("cardiac") : bad("cardiac"))),
      ] },
    { id: "kan", nct: "NCT07190248", acr: "KANDLELIT-007", phase: "Phase 3", sponsor: "MSD",
      title: "Calderasib + subcutaneous pembrolizumab vs pembrolizumab + chemotherapy, first line",
      sites: [["Royal Free Hospital", "London", 4, "R"], ["Leicester Royal Infirmary", "Leicester", 99, "R"], ["Queen Elizabeth Hospital", "Birmingham", 118, "R"], ["Royal Cornwall Hospital", "Truro", 254, "R"]],
      crit: [
        C("kan-1", "inc", "Nonsquamous NSCLC, stage IIIB–IV, not for curative treatment", "Has nonsquamous NSCLC (Stage IIIB, Stage IIIC) not eligible for curative resection or chemoradiation or Stage IV: M1a, M1b, or M1c", ["hist", "stage"], (f) => (nonsq(f) && advanced(f) ? ok("hist", "stage") : bad(["hist", "stage"]))),
        C("kan-2", "inc", "KRAS G12C mutation", "…as First-line Treatment of Participants With KRAS G12C-Mutant, Advanced or Metastatic Nonsquamous NSCLC (KANDLELIT-007)", ["kras"], krasIs("G12C"), { from: "title" }),
        C("kan-3", "exc", "No prior systemic therapy for advanced NSCLC", "Has received prior systemic anticancer therapy for their advanced or metastatic NSCLC", ["priorTx"], noPrior),
        C("kan-4", "exc", "No active CNS metastases", "Has known active central nervous system (CNS) metastases and/or carcinomatous meningitis", ["brain"], noBrain),
        C("kan-5", "exc", "No inflammatory bowel disease", "Has active inflammatory bowel disease requiring immunosuppressive medication or previous clear history of inflammatory bowel disease (e.g., Crohn's disease, ulcerative colitis, or chronic diarrhea)", ["pmh"], (f) => (f.pmh.value === "none" ? ok("pmh") : bad("pmh"))),
        C("kan-6", "exc", "No pneumonitis or ILD needing steroids", "History of (noninfectious) pneumonitis/interstitial lung disease that required steroids or has current pneumonitis/interstitial lung disease", ["pmh"], (f) => (f.pmh.value === "none" ? ok("pmh") : bad("pmh"))),
        C("kan-8", "exc", "No uncontrolled cardiovascular disease", "Has uncontrolled, significant cardiovascular disease or cerebrovascular disease", ["cardiac"], (f) => (f.cardiac.value === "none" ? ok("cardiac") : bad("cardiac"))),
        C("kan-9", "exc", "No GI disorder affecting absorption", "Has a gastrointestinal disorder affecting absorption", ["gi"], (f) => (f.gi.value === "none" ? ok("gi") : bad("gi"))),
        C("kan-10", "exc", "No other malignancy treated in 3 years", "Has known additional malignancy that is progressing or has required active treatment within the past 3 years", ["otherMalig"], (f) => (f.otherMalig.value === "none" ? ok("otherMalig") : bad("otherMalig"))),
        C("kan-11", "exc", "No autoimmune disease treated in 2 years", "Has active autoimmune disease that has required systemic treatment in the past 2 years", ["pmh"], (f) => (f.pmh.value === "none" ? ok("pmh") : bad("pmh"))),
        C("kan-12", "inc", "HIV, if positive, well controlled", "If human immunodeficiency virus (HIV) positive, must have well controlled HIV on antiretroviral therapy (ART)", [], () => ({ state: "needs_review", atScreening: true, ev: [], note: "HIV status isn't in the referral. The study team checks it at screening." })),
        C("kan-7", "inc", "Protocol criteria beyond the registry", "The main inclusion criteria include but are not limited to the following:", [], () => ({ state: "needs_review", atScreening: true, ev: [], note: "The registry lists the main criteria only. The study team checks the full protocol at screening." })),
      ] },
    { id: "kra", nct: "NCT06793215", acr: "Krascendo 2", phase: "Phase 3", sponsor: "Roche",
      title: "Divarasib + pembrolizumab vs pembrolizumab + chemotherapy, first line",
      sites: [["Barts and the London NHS Trust", "London", 1, "R"], ["Sarah Cannon Research Institute", "London", 2, "R"], ["Royal Marsden Hospital – Fulham", "London", 4, "R"], ["Bristol Haematology & Oncology Centre", "Bristol", 106, "R"]],
      crit: [
        C("kra-1", "inc", "ECOG 0–1", "Eastern Cooperative Oncology Group (ECOG) performance status of 0 or 1", ["ecog"], ecogMax(1)),
        C("kra-2", "inc", "Advanced nonsquamous NSCLC, not for curative treatment", "Histologically or cytologically confirmed diagnosis of advanced or metastatic non squamous NSCLC that is not eligible for curative surgery and/or definitive chemoradiotherapy", ["hist", "stage"], (f) => (nonsq(f) && advanced(f) ? ok("hist", "stage") : bad(["hist", "stage"]))),
        C("kra-3", "inc", "Measurable disease (RECIST 1.1)", "Measurable disease, as defined by RECIST v1.1", ["measurable"], isMeasurable),
        C("kra-4", "inc", "No prior systemic treatment for advanced NSCLC", "No prior systemic treatment for advanced or metastatic NSCLC", ["priorTx"], noPrior),
        C("kra-5", "inc", "KRAS G12C documented", "Documentation of the presence of a KRAS G12C mutation", ["kras"], krasIs("G12C")),
        C("kra-6", "inc", "PD-L1 status documented", "Documentation of known PD-L1 expression status in tumor tissue", ["pdl1"], () => ok("pdl1")),
        C("kra-7", "inc", "Adequate end-organ function", "Adequate end-organ function", ["labs"], (f) => (isStale(f.labs) ? staleRes(f) : { state: "needs_review", atScreening: true, ev: ["labs"], note: "Thresholds are not listed in the registry. The study team checks them at screening." })),
        C("kra-8", "exc", "No second driver with targeted treatment", "Known concomitant second oncogenic driver with available targeted treatment", DRIVERS.concat("her2"), drivers(DRIVERS.concat("her2"), ["her2"]), { custom: true }),
        C("kra-9", "exc", "No symptomatic or untreated CNS metastases", "Symptomatic, untreated, or actively progressing central nervous system (CNS) metastases", ["brain"], noBrain),
        C("kra-10", "exc", "No prior KRAS G12C or pan-RAS inhibitor", "Prior treatment with KRAS G12C inhibitors or pan-KRAS/RAS inhibitors", ["priorTx"], noPrior),
      ] },
    { id: "alk", nct: "NCT06765109", acr: "ALKAZAR", phase: "Phase 3", sponsor: "Nuvalent",
      title: "Neladalkib vs alectinib, first line, ALK-positive",
      sites: [["Guy's Cancer Centre", "London", 1, "R"], ["Royal Marsden Hospital", "London", 3, "R"], ["Royal Free London", "Hampstead", 4, "R"], ["Royal Surrey County Hospital", "Guildford", 30, "R"], ["Cambridge University Hospitals", "Cambridge", 50, "R"]],
      crit: [
        C("alk-1", "inc", "Advanced or metastatic NSCLC", "Histologically or cytologically confirmed locally advanced (not amenable for multimodality treatment) or metastatic Non-small Cell Lung Cancer (NSCLC)", ["stage"], isAdvanced),
        C("alk-2", "inc", "ALK rearrangement documented", "Documented Anaplastic Lymphoma Kinase (ALK) rearrangement via testing of tissue or blood", ["alk"], (f) => (f.alk.value === "pos" ? ok("alk") : bad("alk"))),
        C("alk-3", "inc", "No prior systemic treatment", "No prior systemic anticancer treatment for NSCLC (adjuvant/neoadjuvant chemotherapy allowed if 12 months prior to randomization; prior ALK tyrosine kinase inhibitor [TKI] such as alectinib is not allowed in any setting)", ["priorTx"], noPrior),
        C("alk-4", "inc", "Measurable disease (RECIST 1.1)", "Measurable disease (1 or more target lesions per Response Evaluation Criteria in Solid Tumors [RECIST] 1.1)", ["measurable"], isMeasurable),
        C("alk-5", "exc", "No oncogenic driver other than ALK", "Patient's cancer has a known oncogenic driver alteration other than ALK.", ["kras", "egfr", "rosret", "braf", "met", "her2"], drivers(["kras", "egfr", "rosret", "braf", "met", "her2"]), { custom: true }),
      ] },
    { id: "alp", nct: "NCT07185997", acr: "ALPACCA", phase: "Phase 3", sponsor: "ArriVent",
      title: "Firmonertinib vs osimertinib or afatinib, EGFR PACC mutations, first line",
      sites: [["University College London Hospitals", "London", 1, "R"], ["Royal Marsden Hospital", "London", 3, "R"], ["The Christie", "Manchester", 163, "R"]],
      crit: [
        C("alp-1", "inc", "Advanced or metastatic NSCLC", "Histologically or cytologically documented, locally advanced or metastatic Non-Small Cell Lung Cancer (NSCLC) not amenable to curative surgery or radiotherapy.", ["stage"], isAdvanced),
        C("alp-2", "inc", "EGFR PACC mutation documented", "Documented results of the presence of an Epidermal Growth Factor Receptor (EGFR) PACC mutation in tumor tissue or blood from local testing.", ["egfr"], (f) => (f.egfr.value === "G719X" ? ok("egfr") : bad("egfr"))),
        C("alp-3", "inc", "No prior systemic therapy, incl. EGFR-targeting", "No prior systemic anticancer therapy regimens received for locally advanced or metastatic Non-Small Cell Lung Cancer (NSCLC) including prior treatment with any Epidermal Growth Factor Receptor (EGFR)-targeting agents (e.g., previous (EGFR) TKIs, monoclonal antibodies, or bispecific antibodies).", ["priorTx"], noPrior),
      ] },
    { id: "cop", nct: "NCT06667076", acr: "COPERNICUS", phase: "Phase 2", sponsor: "Janssen",
      title: "Subcutaneous amivantamab + lazertinib or + chemotherapy, common EGFR mutations",
      sites: [["Guy's and St Thomas'", "London", 1, "R"], ["Royal Marsden Hospital", "London", 3, "R"], ["Royal Marsden Hospital", "Sutton", 12, "R"], ["The Christie", "Manchester", 163, "R"]],
      crit: [
        C("cop-1", "inc", "Advanced NSCLC, not for curative therapy", "Have histologically or cytologically confirmed advanced or metastatic non-small cell lung cancer (NSCLC) that is not amenable to curative intent therapy", ["stage"], isAdvanced),
        C("cop-2", "inc", "EGFR exon 19 deletion or L858R", "Epidermal growth factor resistance-mutation (EGFRm) must be an Ex19del or Ex21 L858R substitution, as detected by…", ["egfr"], (f) => (["ex19", "L858R"].includes(f.egfr.value) ? ok("egfr") : bad("egfr"))),
        C("cop-3", "inc", "Measurable lesion, not previously irradiated", "Have at least 1 measurable lesion, according to RECIST version (v)1.1, that has not been previously irradiated", ["measurable"], isMeasurable),
      ] },
    { id: "bea", nct: "NCT04886804", acr: "Beamion LUNG-1", phase: "Phase 1", sponsor: "Boehringer Ingelheim",
      title: "Zongertinib, solid tumours with HER2 aberrations",
      sites: [["Royal Marsden Hospital, Chelsea", "London", 3, "A"], ["Hammersmith Hospital", "London", 4, "A"], ["Royal Marsden Hospital", "Sutton", 12, "A"]],
      crit: [
        C("bea-1", "inc", "Advanced solid tumour with a measurable lesion", "Histologically or cytologically confirmed diagnosis of an advanced, unresectable and/or metastatic non-haematologic malignancy. Patient must show presence of at least one measurable lesion according to Response Evaluation Criteria In Solid Tumors (RECIST) 1.1.", ["stage", "measurable"], (f) => (advanced(f) && f.measurable.value ? ok("stage", "measurable") : bad(["stage", "measurable"]))),
        C("bea-2", "inc", "ECOG 0–2 (2 only in some cohorts)", "Eastern Cooperative Oncology Group (ECOG) score of 0, 1 or 2 (ECOG=2 only for Cohorts 6, 7 and 9) .", ["ecog"], (f) => (f.ecog.value <= 1 ? ok("ecog") : f.ecog.value === 2 ? { state: "needs_review", ev: ["ecog"], note: "ECOG 2 is allowed only in cohorts 6, 7 and 9." } : bad("ecog"))),
        C("bea-3", "inc", "HER2 aberration", "…of Zongertinib (BI 1810631) as Monotherapy in Patients With Advanced or Metastatic Solid Tumors With HER2 Aberrations", ["her2"], (f) => (f.her2.value !== "none" ? ok("her2") : { state: "needs_review", ev: ["her2"], note: "This report covers HER2 mutation and amplification only. Overexpression and other HER2 aberrations weren't tested." }), { from: "title" }),
        C("bea-4", "inc", "Neutrophils ≥ 1.5, Hb ≥ 9.0 g/dL, platelets ≥ 100", "Adequate organ function defined as all of the following: Absolute neutrophil count (ANC) ≥ 1.5 x 10^9/L … haemoglobin ≥ 9.0 g/dL (≥ 90 g/L) … platelets ≥ 100 x 10^9/L …", ["labs"], (f) => (isStale(f.labs) ? staleRes(f) : !(f.labs.value.anc >= 1.5 && f.labs.value.hb >= 90 && f.labs.value.plt >= 100) ? bad("labs") : { state: "needs_review", ev: ["labs"], note: "Blood counts meet the listed thresholds. The criterion lists further organ-function items that these results don't cover." })),
      ] },
    { id: "ras", nct: "NCT06881784", acr: "RASolve 301", phase: "Phase 3", sponsor: "Revolution Medicines",
      title: "Daraxonrasib vs docetaxel, previously treated RAS-mutant NSCLC",
      sites: [["Barts Hospital", "London", 1, "A"], ["University College London Hospital", "London", 1, "A"], ["Royal Marsden Hospital", "London", 3, "A"]],
      crit: [
        C("ras-1", "inc", "ECOG 0–1", "Eastern Cooperative Oncology Group (ECOG) performance status of 0 or 1.", ["ecog"], ecogMax(1)),
        C("ras-2", "inc", "1–2 prior lines incl. anti-PD-(L)1 and platinum", "One to two prior lines of therapy including an anti-PD-1/anti-PD(L)-1 agent and platinum-based chemotherapy.", ["priorTx"], (f) => (f.priorTx.value === "none" ? bad("priorTx", "No prior therapy documented. The study is for previously treated disease.") : ok("priorTx"))),
        C("ras-3", "inc", "RAS mutation at codon 12, 13 or 61", "Documented RAS mutation status, defined as Nonsynonymous mutations in KRAS, NRAS, or HRAS at codons 12, 13, or 61 (G12, G13, or Q61).", ["kras"], (f) => (f.kras.value !== "none" ? ok("kras") : bad("kras"))),
        C("ras-4", "inc", "Measurable disease (RECIST 1.1)", "Measurable disease per RECIST v1.1.", ["measurable"], isMeasurable),
      ] },
  ];
  const T = Object.fromEntries(TRIALS.map((t) => [t.id, t]));
  const CRIT = {};
  TRIALS.forEach((t) => t.crit.forEach((c) => (CRIT[c.id] = Object.assign(c, { trial: t.id }))));

  /* ======================= Assessment ======================= */
  const ORDER = { conflicting: 0, unknown: 1, needs_review: 2, supported: 3 };
  const STATUS = { ready: "Ready for prescreening review", needs_evidence: "Potential match — needs evidence", needs_review: "Potential match — needs clinical review", not_match: "Not a match on current evidence" };
  const STATUS_RANK = { ready: 0, needs_review: 1, needs_evidence: 2, not_match: 3 };

  const vkey = (cid, r) => { const f = r && r.ev && r.ev.length ? S.facts[r.ev[0]] : null; return cid + "|" + (f ? f.doc + "|" + f.value + "|" + f.quote : ""); };
  function evalCrit(c, f) {
    const missing = c.keys.filter((k) => !f[k]);
    let r;
    if (missing.length && !c.custom) r = { state: "unknown", missing, ev: c.keys.filter((k) => f[k]) };
    else r = c.fn(f);
    r = Object.assign({ id: c.id, ev: [] }, r);
    if (r.pending && S.verified[vkey(c.id, r)]) r.pending = false;
    return r;
  }
  function assess(t) {
    const f = S.facts;
    const results = t.crit.map((c) => evalCrit(c, f));
    const n = { supported: 0, unknown: 0, needs_review: 0, conflicting: 0 };
    results.forEach((r) => n[r.state]++);
    const clin = results.filter((r) => r.state === "needs_review" && !r.atScreening).length;
    const screening = results.filter((r) => r.state === "needs_review" && r.atScreening).length;
    const status = n.conflicting ? "not_match" : n.unknown ? "needs_evidence" : clin ? "needs_review" : "ready";
    return { tid: t.id, results, n, status, screening, pending: results.filter((r) => r.state === "supported" && r.pending).length };
  }
  const kindOf = (r) => (r.stale ? "bloods" : (r.missing || []).some((k) => MOL.includes(k)) ? "molecular" : (r.missing || []).includes("labs") ? "bloods" : "other");
  function frontLine(t, a) {
    const pick = (st) => a.results.filter((r) => r.state === st);
    if (a.status === "not_match") {
      const r = pick("conflicting")[0], c = CRIT[r.id];
      const val = r.ev.length && S.facts[r.ev[0]] ? S.facts[r.ev[0]].display : "";
      return { state: "conflicting", text: c.plain + (val ? " — " + val : "") };
    }
    if (a.status === "needs_evidence") {
      const open = pick("unknown");
      const SHORT = { kras: "KRAS", pdl1: "PD-L1", egfr: "EGFR", alk: "ALK", her2: "HER2", rosret: "other drivers", braf: "other drivers", met: "other drivers" };
      const mol = [...new Set(open.filter((r) => kindOf(r) === "molecular").flatMap((r) => (r.missing || []).map((k) => SHORT[k] || k)))];
      if (mol.length) return { state: "unknown", text: "Molecular report missing · " + mol.slice(0, 3).join(", ") + (mol.length > 3 ? " +" + (mol.length - 3) : "") };
      if (open.some((r) => r.stale)) return { state: "unknown", text: "Refresh needed · bloods from " + fmtDate(S.facts.labs.date) + " (Relay 28-day policy)" };
      return { state: "unknown", text: CRIT[open[0].id].plain + " · not documented" };
    }
    if (a.status === "needs_review") { const rv = pick("needs_review").find((r) => !r.atScreening) || pick("needs_review")[0]; return { state: "needs_review", text: (rv.note || "Needs a clinician's judgement").replace(/\.$/, "") }; }
    const bits = [];
    if (a.pending) bits.push(a.pending + " cited value" + (a.pending > 1 ? "s" : "") + " to verify");
    if (a.screening) bits.push(a.screening + " checked at screening");
    return { state: "supported", text: bits.length ? bits.join(" · ") : "All checked requirements supported" };
  }
  function nextLabel(t, a) {
    const b = S.bucket[t.id];
    if (b === "invited") return "Invited · simulated";
    if (b === "closed") return "Reopen";
    if (a.status === "ready") return "Invite";
    if (a.status === "needs_review") return "Review";
    if (a.status === "not_match") return "Close";
    return b === "waiting" ? "Requested" : "Request evidence";
  }
  const nearest = (t) => t.sites.filter((s) => s[3] === "R").sort((a, b) => a[2] - b[2])[0];
  const travel = () => (S.facts.travel ? S.facts.travel.value : 60);

  /* ======================= State ======================= */
  let S;
  function fresh() {
    S = { gen: Math.random(), facts: {}, docs: [], bucket: {}, reason: {}, saved: {}, verified: {}, requested: {}, history: [], tab: "review", q: "",
      view: {}, panel: null, sheet: null, alt: null, lastDiff: null, version: 1, changed: {}, seq: 0, working: null };
    TRIALS.forEach((t) => (S.bucket[t.id] = "review"));
    addDocRaw({ kind: "referral", title: "Referral summary", date: "30 Oct 2026", dateISO: "2026-10-30", text: REF_TEXT });
    addDocRaw({ kind: "labs", title: "Blood results", date: "18 Sep 2026", dateISO: "2026-09-18", text: LABS_TEXT });
    S.version = 1;
    S.history = [];
    log("Agent", "Read Referral summary (30 Oct) and Blood results (18 Sep). " + Object.keys(S.facts).length + " facts cited, 0 rejected.");
    log("Agent", "Assessed SYN-0417 against 8 studies in the portfolio.");
  }
  function addDocRaw(d) {
    d.id = "d" + (S.docs.length + 1);
    d.version = S.docs.filter((x) => x.kind === d.kind).length + 1;
    S.docs.push(d);
    extract(d).forEach((fa) => (S.facts[fa.key] = fa));
    S.version++;
    return d;
  }
  function clock() { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function log(who, text) { S.history.unshift({ at: clock(), who, text, id: ++S.seq }); }
  function fmtDate(iso) { const d = new Date(iso + "T12:00:00"); return d.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]; }

  /* ======================= Rendering: chrome, head, docs ======================= */
  $$("[data-icon]").forEach((el) => (el.outerHTML = Kit.icon(el.dataset.icon)));
  $(".brand").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 15a7 7 0 0112-5"/><path d="M19 9a7 7 0 01-12 5"/><path d="M15 6.5h2.6V3.9"/><path d="M9 17.5H6.4v2.6"/></svg>';

  function renderHead() {
    const counts = { review: 0, waiting: 0, invited: 0, closed: 0 };
    TRIALS.forEach((t) => counts[S.bucket[t.id]]++);
    $$("[data-count]").forEach((el) => Kit.roll(el, counts[el.dataset.count]));
    const total = TRIALS.length;
    $("#head-count").textContent = total + " referrals · 1 patient · " + SNAPSHOT;
    const bubble = $("#nav-bubble");
    bubble.textContent = counts.review; bubble.dataset.zero = String(counts.review === 0);
    Kit.roll($("#fact-n"), Object.keys(S.facts).length);
    $("#rec-v").textContent = S.version;
  }
  // keep the fact counter element stable so it can roll
  function renderFacts() { Kit.roll($("#fact-n"), Object.keys(S.facts).length); $("#rec-v").textContent = S.version; }

  function renderDocs(newId) {
    const box = $("#docs");
    box.innerHTML = S.docs.map((d) => {
      const stale = d.kind === "labs" && isStale({ date: d.dateISO });
      return '<span class="doc" data-doc="' + d.id + '"' + (stale ? ' data-stale="true"' : "") + (d.id === newId ? ' data-reading="true"' : "") + ">" + Kit.icon("doc") +
        "<span>" + esc(d.title) + (d.version > 1 ? " v" + d.version : "") + '</span><span class="mono">' + esc(d.date) + "</span>" +
        (stale ? Kit.icon("clock", "doc__clock") + '<span class="sr-only">outdated</span>' : "") + '<span class="doc__sweep"></span></span>';
    }).join("") + '<button class="btn add-doc" id="add-doc" type="button">' + Kit.icon("upload") + "Add document</button>";
    if (newId) Kit.replay($('[data-doc="' + newId + '"]'), "drop-in", 220);
    $("#add-doc").addEventListener("click", () => openSheet("molecular"));
  }

  /* ======================= Agent card ======================= */
  function plan() {
    const groups = {};
    TRIALS.forEach((t) => {
      if (["closed", "invited"].includes(S.bucket[t.id])) return;
      const a = assess(t);
      if (a.status === "not_match") return;
      a.results.filter((r) => r.state === "unknown").forEach((r) => {
        const k = kindOf(r);
        const g = (groups[k] = groups[k] || { kind: k, reqs: 0, trials: new Set() });
        g.reqs++; g.trials.add(t.id);
      });
    });
    return Object.values(groups).filter((g) => g.kind !== "other").sort((a, b) => b.reqs - a.reqs || b.trials.size - a.trials.size);
  }
  const KIND = {
    molecular: { verb: "Request the molecular pathology report", doc: "Molecular pathology report", ask: "the molecular pathology report for SYN-0417 (NGS panel and PD-L1 immunohistochemistry). The referral summary of 30 Oct says the results are awaited" },
    bloods: { verb: "Request current blood results", doc: "Blood results", ask: "current blood results for SYN-0417 (full blood count, renal and liver function). The latest results we hold are from 18 Sep" },
  };
  const pl = (n, one, many) => n + " " + (n === 1 ? one : many);
  function chipsFor(ids) {
    return '<div class="agent__chips">' + ids.map((id) => '<button class="chip chip--open" type="button" data-hl="' + id + '">' + esc(T[id].acr) + "</button>").join("") + "</div>";
  }
  function renderAgent() {
    const box = $("#agent");
    const mark = (ic) => '<div class="agent__mark">' + Kit.icon(ic) + "</div>";
    if (S.working) {
      box.dataset.mode = "working";
      box.innerHTML = mark("spark") + '<div><div class="agent__label">Agent</div><div class="agent__head">' + esc(S.working.title) + '</div><ol class="steps">' +
        S.working.steps.map((s) => '<li data-done="' + !!s.done + '">' + Kit.glyph(s.done ? "supported" : "unknown", s.done ? "Done" : "In progress") + "<span>" + esc(s.text) + "</span></li>").join("") + "</ol></div><div></div>";
      return;
    }
    if (S.alt) {
      const t = T[S.alt.tid], full = S.alt.site;
      const others = t.sites.filter((s) => s[3] === "R" && s[0] !== full[0]).sort((a, b) => a[2] - b[2]);
      const near = others.filter((s) => s[2] <= travel());
      const sameStage = TRIALS.filter((x) => x.id !== t.id && !["closed", "invited"].includes(S.bucket[x.id]) && assess(x).status !== "not_match" && nearest(x) && nearest(x)[2] <= travel());
      box.dataset.mode = "alt";
      const sub = near.length ? "Next " + t.acr + " site: " + near[0][0] + ", " + near[0][2] + " mi." :
        "Other " + t.acr + " sites are beyond " + travel() + " mi (nearest " + (others[0] ? others[0][1] + ", " + others[0][2] + " mi" : "none") + ").";
      box.innerHTML = mark("swap") + '<div><div class="agent__label">Progress kept · ' + Object.keys(S.facts).length + ' facts carry over</div><div class="agent__head">' + esc(t.acr) + " closed: no place at " + esc(full[0]) + ' <span class="muted">(simulated)</span></div><div class="agent__sub">' + esc(sub) + "</div>" +
        (sameStage.length ? chipsFor(sameStage.map((x) => x.id)) : "") + "</div>" +
        '<div class="agent__acts">' + (others[0] && !near.length ? '<button class="btn" type="button" id="ag-travel">Ask about ' + esc(others[0][1]) + "</button>" : "") + '<button class="btn btn--ghost" type="button" id="ag-dismiss">Dismiss</button></div>';
      $("#ag-dismiss").addEventListener("click", () => { S.alt = null; renderAgent(); $("#add-doc").focus(); });
      const tr = $("#ag-travel");
      if (tr) tr.addEventListener("click", () => {
        const site = others[0];
        log("You", "Approved a question to SYN-0417 about travel to " + site[1] + " (" + site[2] + " mi) for " + t.acr + " (simulated).");
        const keep = S.alt; S.alt = null; renderAgent();
        Kit.toast({ msg: "Question sent to SYN-0417 (simulated)", sub: "Travel to " + site[1] + " · " + site[2] + " mi", icon: "send", action: { label: "Undo", run: () => { log("You", "Withdrew the travel question to SYN-0417 (simulated)."); S.alt = keep; renderAgent(); } } });
        $("#add-doc").focus();
      });
      wireChips();
      return;
    }
    const g = plan();
    if (!g.length) {
      const ready = TRIALS.filter((t) => S.bucket[t.id] === "review" && assess(t).status === "ready").length;
      box.dataset.mode = "done";
      box.innerHTML = mark("check") + '<div><div class="agent__label">Agent</div><div class="agent__head">Nothing is blocked on missing evidence</div><div class="agent__sub">' +
        (ready ? ready + " referral" + (ready > 1 ? "s are" : " is") + " ready for your review." : "Every open referral needs a decision from you.") + "</div></div><div></div>";
      return;
    }
    const top = g[0], k = KIND[top.kind], ids = [...top.trials];
    if (S.requested[top.kind]) {
      box.dataset.mode = "waiting";
      box.innerHTML = mark("clock") + '<div><div class="agent__label">Waiting · requested ' + esc(S.requested[top.kind]) + '</div><div class="agent__head">' + esc(k.doc) + '</div><div class="agent__sub"><span class="mono">' + pl(top.reqs, "open requirement", "open requirements") + "</span> across " + pl(ids.length, "study", "studies") + " depend" + (top.reqs === 1 ? "s" : "") + " on it.</div>" + chipsFor(ids) + "</div>" +
        '<div class="agent__acts"><button class="btn btn--primary" type="button" id="ag-add">' + Kit.icon("upload") + "Add document</button></div>";
      $("#ag-add").addEventListener("click", () => openSheet(top.kind));
    } else {
      box.dataset.mode = "next";
      box.innerHTML = mark("spark") + '<div><div class="agent__label">Next step</div><div class="agent__head">' + esc(k.verb) + '</div><div class="agent__sub">Resolves <span class="mono" id="ag-reqs">' + top.reqs + "</span> open requirement" + (top.reqs === 1 ? "" : "s") + (ids.length === 1 ? " in " + T[ids[0]].acr + "." : " across " + ids.length + " studies.") + "</div>" + chipsFor(ids) + "</div>" +
        '<div class="agent__acts"><button class="btn btn--primary" type="button" id="ag-review">Review request</button></div>';
      $("#ag-review").addEventListener("click", () => openPanel(null, { inline: "compose", kind: top.kind }));
    }
    box.onmouseenter = () => ring(ids);
    box.onfocusin = (e) => { if (e.target.id === "ag-review" || e.target.id === "ag-add") ring(ids); };
    wireChips();
  }
  function wireChips() { $$("#agent [data-hl]").forEach((b) => { b.addEventListener("mouseenter", () => ring([b.dataset.hl])); b.addEventListener("click", () => openPanel(b.dataset.hl)); }); }
  let ringT = 0;
  function ring(ids) {
    if (Date.now() - ringT < 900) return; ringT = Date.now();
    ids.forEach((id) => { const c = $("#card-" + id); if (c && !c.closest(".slot").hidden) { c.dataset.ring = "false"; void c.offsetWidth; c.dataset.ring = "true"; } });
  }

  /* ======================= Cards ======================= */
  function buildCard(t) {
    const slot = document.createElement("div");
    slot.className = "slot"; slot.dataset.flip = t.id; slot.id = "slot-" + t.id;
    const site = nearest(t);
    slot.innerHTML =
      '<div class="reveal" aria-hidden="true"><span class="reveal__invite">' + Kit.icon("check") + 'Invite</span><span class="reveal__close">Not suitable' + Kit.icon("x") + "</span></div>" +
      '<article class="card" id="card-' + t.id + '">' +
      '<button class="card__open" type="button" aria-label="Open ' + esc(t.acr) + ' referral"></button>' +
      '<div class="card__top"><div class="card__name"><div class="card__acr">' + esc(t.acr) + '</div><div class="card__phase mono">' + t.nct + " · " + t.phase + "</div></div>" +
      '<button class="card__save" type="button" aria-pressed="false" aria-label="Save ' + esc(t.acr) + ' for review">' + Kit.icon("bookmark") + "</button></div>" +
      '<div class="card__title">' + esc(t.title) + "</div>" +
      '<div class="card__status" aria-live="polite"></div>' +
      '<div class="card__ev"><div class="strip" aria-hidden="true">' + t.crit.map((c) => '<span class="seg" data-flip="' + c.id + '" data-state="unknown"></span>').join("") + "</div>" +
      '<div class="counts mono"><span><b data-c="supported"></b> supported</span><span><b data-c="unknown"></b> open</span><span data-rv><b data-c="needs_review"></b> review</span><span><b data-c="conflicting"></b> conflicts</span></div></div>' +
      '<div class="card__front"></div>' +
      '<div class="card__foot"><span class="mono muted card__site">' + (site ? Kit.icon("pin", "glyph") + '<span class="card__site-name">' + esc(site[0]) + "</span><span>· " + site[2] + " mi</span>" : "No UK site recruiting (registry)") + "</span></div>" +
      '<div class="card__foot"><span class="changed" aria-live="polite"></span><button class="btn card__next" type="button"></button></div>' +
      "</article>";
    const card = slot.querySelector(".card");
    slot.querySelector(".card__site .glyph") && (slot.querySelector(".card__site .glyph").style.color = "var(--source)");
    card.querySelector(".card__open").addEventListener("click", () => { if (dragEnd && Date.now() - dragEnd < 250) return; openPanel(t.id); });
    card.querySelector(".card__save").addEventListener("click", () => toggleSave(t.id));
    card.querySelector(".card__next").addEventListener("click", () => nextAction(t.id));
    wireSwipe(slot, card, t);
    return slot;
  }
  function updateCard(t, a, opts) {
    const o = opts || {};
    const card = $("#card-" + t.id); if (!card) return;
    const prev = S.view[t.id];
    S.view[t.id] = a;
    card.dataset.status = a.status;
    // status line crossfade
    const st = card.querySelector(".card__status");
    const cur = st.querySelector("span:not([data-out])");
    if (!cur || cur.dataset.s !== a.status) {
      if (cur) { cur.dataset.out = "true"; cur.setAttribute("aria-hidden", "true"); setTimeout(() => cur.remove(), Kit.reduced() ? 0 : 260); }
      const n = document.createElement("span"); n.className = "st-" + a.status; n.dataset.s = a.status; n.textContent = STATUS[a.status];
      if (cur && !Kit.reduced()) { n.dataset.out = "true"; st.appendChild(n); void n.offsetWidth; delete n.dataset.out; } else st.appendChild(n);
    }
    // segments morph in place, then sort (conflicts first)
    const strip = card.querySelector(".strip");
    a.results.forEach((r) => { const s = strip.querySelector('[data-flip="' + r.id + '"]'); s.dataset.state = r.state; s.dataset.pending = String(!!r.pending); });
    const sortSegs = () => Kit.flip(strip, () => {
      [...strip.children].sort((x, y) => ORDER[x.dataset.state] - ORDER[y.dataset.state] || t.crit.findIndex((c) => c.id === x.dataset.flip) - t.crit.findIndex((c) => c.id === y.dataset.flip)).forEach((s) => strip.appendChild(s));
    }, { dur: 280 });
    if (prev && !Kit.reduced()) setTimeout(sortSegs, 380); else sortSegs();
    Object.keys(a.n).forEach((k) => Kit.roll(card.querySelector('[data-c="' + k + '"]'), a.n[k]));
    card.querySelector("[data-rv]").hidden = a.n.needs_review === 0;
    const fl = frontLine(t, a);
    const front = card.querySelector(".card__front");
    const html = Kit.glyph(fl.state) + "<span>" + esc(fl.text) + "</span>";
    if (front.innerHTML !== html) { front.innerHTML = html; if (prev) Kit.replay(front, "drop-in", 220); }
    const nb = card.querySelector(".card__next");
    const lbl = nextLabel(t, a);
    nb.innerHTML = esc(lbl) + (["Invited · simulated", "Requested"].includes(lbl) ? "" : Kit.icon("arrowRight"));
    nb.className = "btn card__next" + (lbl === "Invite" ? " btn--primary" : "");
    nb.disabled = lbl === "Invited · simulated" || lbl === "Requested";
    nb.setAttribute("aria-label", lbl + " · " + t.acr);
    const sv = card.querySelector(".card__save");
    sv.setAttribute("aria-pressed", String(!!S.saved[t.id]));
    const ch = card.querySelector(".changed");
    if (o.changed) { ch.textContent = "Updated · " + o.changed + " change" + (o.changed > 1 ? "s" : ""); ch.dataset.on = "true"; S.changed[t.id] = o.changed; }
    else if (!S.changed[t.id]) { ch.dataset.on = "false"; ch.textContent = ""; }
  }
  function sortKey(t) { return (S.saved[t.id] ? -10 : 0) + STATUS_RANK[(S.view[t.id] || assess(t)).status] + TRIALS.indexOf(t) / 100; }
  function layoutCards(animate) {
    const box = $("#cards");
    const q = S.q.trim().toLowerCase();
    const match = (t) => !q || [t.acr, t.nct, t.title, t.sponsor].join(" ").toLowerCase().includes(q);
    const apply = () => {
      TRIALS.slice().sort((a, b) => sortKey(a) - sortKey(b)).forEach((t) => {
        const slot = $("#slot-" + t.id);
        slot.hidden = !(S.bucket[t.id] === S.tab && match(t));
        box.appendChild(slot);
      });
    };
    if (animate) Kit.flip(box, apply, { sel: ".slot:not([hidden])" }); else apply();
    const visible = $$(".slot:not([hidden])", box).length;
    const inTab = TRIALS.filter((t) => S.bucket[t.id] === S.tab).length;
    $("#q-n").textContent = q ? String(visible) : "";
    const empty = $("#empty");
    empty.hidden = visible > 0;
    if (!visible) {
      const tabName = { review: "to review", waiting: "waiting on evidence", invited: "invited", closed: "closed" }[S.tab];
      const other = ["review", "waiting", "invited", "closed"].find((k) => k !== S.tab && TRIALS.some((t) => S.bucket[t.id] === k)) || "review";
      empty.innerHTML = q && inTab ? "<div>No referrals match “" + esc(S.q) + "”.</div>" + '<button class="btn" type="button" id="empty-act">Clear search</button>'
        : "<div>Nothing " + tabName + ".</div>" + '<button class="btn" type="button" id="empty-act">Show ' + ({ review: "to review", waiting: "waiting", invited: "invited", closed: "closed" }[other]) + "</button>";
      $("#empty-act").addEventListener("click", () => { if (q && inTab) { S.q = ""; $("#q").value = ""; layoutCards(true); $("#q").focus(); } else setTab(other, true); });
    }
  }
  function renderAll(animate) {
    TRIALS.forEach((t) => updateCard(t, assess(t)));
    layoutCards(animate);
    renderHead();
    renderAgent();
  }

  /* ---------- Swipe: a gesture on top of labelled buttons ---------- */
  let dragEnd = 0;
  function wireSwipe(slot, card, t) {
    let sx = 0, sy = 0, dx = 0, dragging = false, down = false;
    card.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest(".card__save, .card__next")) return;
      down = true; dragging = false; sx = e.clientX; sy = e.clientY; dx = 0;
    });
    card.addEventListener("pointermove", (e) => {
      if (!down) return;
      dx = e.clientX - sx; const dy = e.clientY - sy;
      if (!dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) { dragging = true; card.dataset.dragging = "true"; try { card.setPointerCapture(e.pointerId); } catch (_) {} }
      if (!dragging) return;
      card.style.transform = "translateX(" + dx + "px) rotate(" + (dx / 60).toFixed(2) + "deg)";
      slot.dataset.reveal = dx > 0 ? "invite" : "close";
      slot.querySelector(".reveal").style.opacity = String(Math.min(1, Math.abs(dx) / 120));
    });
    const end = () => {
      if (!down) return; down = false;
      if (!dragging) return;
      dragging = false; dragEnd = Date.now(); delete card.dataset.dragging;
      card.style.transform = ""; slot.querySelector(".reveal").style.opacity = "0";
      if (dx > 120) openPanel(t.id, { inline: "invite" });
      else if (dx < -120) openPanel(t.id, { inline: "reason" });
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  /* ======================= Tabs & search ======================= */
  function moveLine(tabs, line) {
    const sel = tabs.querySelector('[aria-selected="true"]'); if (!sel || !line) return;
    line.style.width = sel.offsetWidth + "px";
    line.style.transform = "translateX(" + sel.offsetLeft + "px)";
  }
  function setTab(tab, focus) {
    if (S.tab === tab) return;
    S.tab = tab;
    $$("#tabs .tab").forEach((b) => { const on = b.dataset.tab === tab; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    $("#cards").setAttribute("aria-labelledby", "tab-" + tab);
    moveLine($("#tabs"), $("#tabs-line"));
    const box = $("#cards");
    layoutCards(false);
    if (!Kit.reduced()) box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
    if (focus) $("#tab-" + tab).focus();
  }
  $$("#tabs .tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  $("#tabs").addEventListener("keydown", (e) => {
    const tabs = $$("#tabs .tab"); const i = tabs.findIndex((b) => b.dataset.tab === S.tab);
    let j = null;
    if (e.key === "ArrowRight") j = (i + 1) % tabs.length; else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length; else if (e.key === "Home") j = 0; else if (e.key === "End") j = tabs.length - 1;
    if (j !== null) { e.preventDefault(); setTab(tabs[j].dataset.tab, true); }
  });
  $("#q").addEventListener("input", (e) => { S.q = e.target.value; layoutCards(true); });
  window.addEventListener("resize", () => moveLine($("#tabs"), $("#tabs-line")));

  /* ======================= Actions ======================= */
  function nextAction(tid) {
    const a = assess(T[tid]), lbl = nextLabel(T[tid], a);
    if (lbl === "Invite") openPanel(tid, { inline: "invite" });
    else if (lbl === "Close") openPanel(tid, { inline: "reason", reason: "protocol" });
    else if (lbl === "Reopen") reopen(tid);
    else if (lbl === "Request evidence") openPanel(tid, { inline: "compose" });
    else openPanel(tid);
  }
  function toggleSave(tid) {
    S.saved[tid] = !S.saved[tid];
    log("You", (S.saved[tid] ? "Saved " : "Unsaved ") + T[tid].acr + " for review.");
    const btn = $("#card-" + tid + " .card__save");
    btn.setAttribute("aria-pressed", String(!!S.saved[tid]));
    Kit.replay(btn.querySelector("svg"), "tick", 260);
    layoutCards(true);
    if (S.panel && S.panel.tid === tid) renderPanel();
  }
  function moveBucket(ids, bucket, toTab) {
    const prev = {};
    const targets = ids.filter((id) => S.bucket[id] !== bucket);
    const flights = targets.map((id) => { prev[id] = S.bucket[id]; const s = $("#slot-" + id); return s && !s.hidden ? Kit.flyTo(s.querySelector(".card"), $("#tab-" + toTab)) : null; });
    targets.forEach((id) => (S.bucket[id] = bucket));
    layoutCards(true); renderHead();
    TRIALS.forEach((t) => updateCard(t, assess(t)));
    renderAgent();
    Promise.all(flights).then(() => { const el = $("#tab-" + toTab + " [data-count]"); el && Kit.replay(el, "tick", 260); });
    return prev;
  }
  function restoreBuckets(prev) { Object.keys(prev).forEach((id) => (S.bucket[id] = prev[id])); layoutCards(true); renderHead(); TRIALS.forEach((t) => updateCard(t, assess(t))); renderAgent(); }

  function doInvite(tid, reason) {
    const t = T[tid], site = nearest(t);
    const prev = moveBucket([tid], "invited", "invited");
    const openItems = assess(t).results.filter((r) => r.state !== "supported" && !r.atScreening).map((r) => CRIT[r.id].plain);
    log("You", "Approved a prescreening invitation for SYN-0417 · " + t.acr + (site ? " at " + site[0] : "") + " (simulated). Record v" + S.version + ", " + SNAPSHOT + "." + (openItems.length ? " Override reason: “" + (reason || "").trim() + "”. Open items: " + openItems.join("; ") + "." : ""));
    closePanel(false);
    Kit.toast({ msg: "Invitation approved (simulated)", sub: t.acr + (site ? " · " + site[0] : ""), icon: "check", action: { label: "Undo", run: () => { restoreBuckets(prev); log("You", "Undid the invitation for " + t.acr + "."); } } });
    focusAfter(tid);
  }
  function doClose(tid, reason) {
    const t = T[tid];
    const prev = moveBucket([tid], "closed", "closed");
    S.reason[tid] = reason;
    log("You", "Closed " + t.acr + ": " + REASONS[reason] + ".");
    const keepAlt = S.alt;
    if (reason === "cohort") { const site = nearest(t); S.alt = { tid, site: site || ["the nearest site", "", 0, "R"] }; log("Agent", "Kept SYN-0417's profile; looked for other sites and studies within " + travel() + " mi."); }
    renderAgent();
    closePanel(false);
    Kit.toast({ msg: "Closed · " + REASONS[reason], sub: t.acr, icon: "x", action: { label: "Undo", run: () => { delete S.reason[tid]; S.alt = keepAlt; restoreBuckets(prev); log("You", "Reopened " + t.acr + "."); } } });
    focusAfter(tid);
  }
  function reopen(tid) { const keepReason = S.reason[tid], keepAlt = S.alt; const prev = moveBucket([tid], "review", "review"); delete S.reason[tid]; if (S.alt && S.alt.tid === tid) S.alt = null; renderAgent(); log("You", "Reopened " + T[tid].acr + "."); Kit.toast({ msg: "Reopened " + T[tid].acr, icon: "undo", action: { label: "Undo", run: () => { if (keepReason) S.reason[tid] = keepReason; S.alt = keepAlt; restoreBuckets(prev); log("You", "Undid reopening " + T[tid].acr + "."); if (S.panel) renderPanel(); } } }); if (S.panel) renderPanel(); }
  function focusAfter(tid) {
    const vis = $$(".slot:not([hidden]) .card__open");
    (vis[0] || $("#tab-" + S.tab)).focus();
  }
  function sendRequest(kind, tid) {
    const ids = TRIALS.filter((t) => !["closed", "invited"].includes(S.bucket[t.id]) && assess(t).status !== "not_match" && assess(t).results.some((r) => r.state === "unknown" && kindOf(r) === kind)).map((t) => t.id);
    const keepReq = S.requested[kind];
    S.requested[kind] = clock();
    const prev = moveBucket(ids, "waiting", "waiting");
    const text = (($("#draft") || {}).value || "").replace(/\s+/g, " ").trim();
    log("You", "Approved the agent's request for the " + KIND[kind].doc.toLowerCase() + " to the referring oncology team (simulated send). " + ids.length + " referrals now wait on it." + (text ? " Approved text: “" + text.slice(0, 180) + (text.length > 180 ? "…" : "") + "”" : ""));
    closePanel(false);
    Kit.toast({ msg: "Request sent (simulated)", sub: KIND[kind].doc + " · " + ids.length + " referrals waiting", icon: "send", action: { label: "Undo", run: () => { if (keepReq) S.requested[kind] = keepReq; else delete S.requested[kind]; restoreBuckets(prev); log("You", "Withdrew the request."); } } });
    focusAfter();
  }

  /* ======================= Evidence arrival: the centrepiece ======================= */
  let busy = Promise.resolve();
  function addDocument(kind, values) {
    if (S.working) return busy;
    closeSheet(false);
    const agentEl = $("#agent"); agentEl && agentEl.focus({ preventScroll: true });
    busy = (async () => {
      const gen = S.gen; const alive = () => S.gen === gen;
      const before = Object.fromEntries(TRIALS.map((t) => [t.id, assess(t)]));
      const d = kind === "molecular"
        ? { kind: "molecular", title: "Molecular pathology report", date: "7 Nov 2026", dateISO: "2026-11-07", values, text: molText(values) }
        : { kind: "labs", title: "Blood results", date: "7 Nov 2026", dateISO: "2026-11-07", text: bloodText(values) };
      let nFacts;
      try { nFacts = extract(Object.assign({ id: "tmp" }, d)).length; }
      catch (err) { log("Agent", "Couldn't cite facts from " + d.title + " (" + err.message + "). Nothing changed."); Kit.toast({ msg: "Couldn't read that document", sub: "No facts added · see Activity", icon: "x" }); return; }
      S.working = { title: "Reading " + d.title.toLowerCase(), steps: [
        { text: "Read " + d.title + " · 7 Nov" }, { text: "Cite " + nFacts + " facts, verify every quote" }, { text: "Re-assess " + TRIALS.length + " studies" }] };
      renderAgent();
      const doc = addDocRaw(d);
      renderDocs(doc.id);
      await Kit.wait(420); if (!alive()) return;
      S.working.steps[0].done = true; renderAgent();
      await Kit.wait(360); if (!alive()) return;
      log("Agent", "Read " + d.title + " (7 Nov). " + nFacts + " facts cited with verified quotes, 0 rejected.");
      S.working.steps[1].done = true; S.working.steps[1].text = "Cited " + nFacts + " facts · 0 rejected"; renderAgent(); renderFacts(); renderHead();
      await Kit.wait(260); if (!alive()) return;
      // referrals waiting on this evidence come back to review
      const after = Object.fromEntries(TRIALS.map((t) => [t.id, assess(t)]));
      const back = TRIALS.filter((t) => S.bucket[t.id] === "waiting" && before[t.id].results.some((r) => r.state === "unknown" && kindOf(r) === (kind === "labs" ? "bloods" : "molecular")));
      back.forEach((t) => (S.bucket[t.id] = "review"));
      delete S.requested[kind === "labs" ? "bloods" : "molecular"];
      if (S.tab !== "review") setTab("review"); else layoutCards(false);
      renderHead();
      const diff = [];
      for (const t of TRIALS) {
        const b = before[t.id], a = after[t.id];
        const rows = a.results.map((r, i) => ({ id: r.id, from: b.results[i].state, to: r.state })).filter((x) => x.from !== x.to);
        if (!rows.length && b.status === a.status) continue;
        diff.push({ tid: t.id, from: b.status, to: a.status, rows });
      }
      S.lastDiff = { doc: d.title + " · 7 Nov", items: diff };
      for (const item of diff) {
        updateCard(T[item.tid], after[item.tid], { changed: item.rows.length });
        log("Agent", "Re-assessed " + T[item.tid].acr + ": " + STATUS[item.from] + " → " + STATUS[item.to] + " (" + item.rows.length + " requirement" + (item.rows.length === 1 ? "" : "s") + ").");
        await Kit.wait(170); if (!alive()) return;
      }
      TRIALS.forEach((t) => updateCard(t, after[t.id]));
      await Kit.wait(420); if (!alive()) return;
      layoutCards(true);
      S.working.steps[2].done = true; S.working.steps[2].text = "Re-assessed " + TRIALS.length + " studies · " + diff.length + " changed"; renderAgent();
      await Kit.wait(500); if (!alive()) return;
      S.working = null; renderAgent();
      const fwd = diff.filter((x) => STATUS_RANK[x.to] < STATUS_RANK[x.from]).length;
      const conf = diff.filter((x) => x.to === "not_match" && x.from !== "not_match").length;
      Kit.toast({ msg: diff.length + " studies updated", sub: fwd + " moved forward · " + conf + " now conflict · " + d.title, icon: "doc", action: { label: "See changes", doneLabel: "Opened", run: () => openPanel(null, { mode: "changes" }) } });
    })();
    return busy;
  }

  /* ======================= Corrections & verification ======================= */
  const EDITABLE = { ecog: { label: "ECOG", options: [0, 1, 2, 3, 4], disp: (v) => "ECOG " + v }, pdl1: { label: "PD-L1 TPS %", num: true, disp: (v) => "PD-L1 TPS " + v + "%" } };
  function correct(key, value, tid) {
    const old = S.facts[key];
    const before = Object.fromEntries(TRIALS.map((t) => [t.id, assess(t)]));
    S.facts[key] = Object.assign({}, old, { value, display: EDITABLE[key].disp(value), by: "coordinator", prev: old, at: clock() });
    S.version++;
    const changed = applyReassess(before);
    log("You", "Corrected " + EDITABLE[key].label + ": " + old.display + " → " + S.facts[key].display + " (record v" + S.version + "). " + changed.length + " studies re-assessed.");
    if (S.panel) { S.panel.fix = null; renderPanel(before[tid]); }
    renderFacts();
    const conf = changed.filter((x) => x.to === "not_match" && x.from !== "not_match").length;
    Kit.toast({ msg: EDITABLE[key].label + " corrected to " + value, sub: changed.length + " studies re-assessed" + (conf ? " · " + conf + " now conflict" : ""), icon: "edit", action: { label: "Undo", run: () => {
      const b2 = Object.fromEntries(TRIALS.map((t) => [t.id, assess(t)]));
      S.facts[key] = old; S.version++; applyReassess(b2); renderFacts(); log("You", "Undid the " + EDITABLE[key].label + " correction.");
      if (S.panel) renderPanel(b2[S.panel.tid]);
    } } });
  }
  function applyReassess(before) {
    const out = [];
    TRIALS.forEach((t) => {
      const a = assess(t), b = before[t.id];
      const rows = a.results.filter((r, i) => r.state !== b.results[i].state).length;
      updateCard(t, a, rows ? { changed: rows } : null);
      if (rows || a.status !== b.status) out.push({ tid: t.id, from: b.status, to: a.status });
    });
    layoutCards(true); renderHead(); renderAgent();
    return out;
  }
  function toggleVerify(cid) {
    const before = Object.fromEntries(TRIALS.map((t) => [t.id, assess(t)]));
    const r0 = before[CRIT[cid].trial].results.find((x) => x.id === cid);
    const k = vkey(cid, r0);
    S.verified[k] = !S.verified[k];
    log("You", (S.verified[k] ? "Verified" : "Un-verified") + " the cited evidence for “" + CRIT[cid].plain + "” (" + T[CRIT[cid].trial].acr + ", " + (S.facts[r0.ev[0]] || {}).display + ").");
    applyReassess(before);
    renderPanel(before[CRIT[cid].trial]);
  }

  /* ======================= Details panel ======================= */
  const REASONS = { protocol: "Protocol requirement not met", cohort: "No place in cohort (simulated)", evidence: "Evidence insufficient", travel: "Travel not manageable", prefer: "Patient prefers another option" };
  let lastOpener = null;
  function openPanel(tid, o) {
    const opts = o || {};
    if (S.sheet) closeSheet(false);
    if (!S.panel) lastOpener = document.activeElement;
    S.panel = { tid, mode: opts.mode || (tid ? "criteria" : "history"), inline: opts.inline || null, kind: opts.kind || null, reason: opts.reason || null, rows: new Set(opts.rows || []), fix: null };
    if (opts.inline === "compose" && !opts.kind) {
      const a = assess(T[tid]); const r = a.results.find((x) => x.state === "unknown");
      S.panel.kind = r ? (kindOf(r) === "other" ? "molecular" : kindOf(r)) : "molecular";
    }
    $$(".card[data-active]").forEach((c) => delete c.dataset.active);
    if (tid) { $("#card-" + tid).dataset.active = "true"; if (S.changed[tid]) { delete S.changed[tid]; updateCard(T[tid], assess(T[tid])); } }
    renderPanel();
    $("#panel").dataset.open = "true";
    const target = S.panel.inline ? $("#panel .inline [data-first]") || $("#p-title") : $("#p-title");
    setTimeout(() => { if (S.panel && target && document.contains(target)) target.focus(); }, Kit.reduced() ? 0 : 60);
  }
  function closePanel(restore) {
    if (!S || !S.panel) return;
    const tid = S.panel.tid;
    S.panel = null;
    $("#panel").dataset.open = "false";
    $$(".card[data-active]").forEach((c) => delete c.dataset.active);
    if (restore !== false) {
      const back = tid && $("#slot-" + tid) && !$("#slot-" + tid).hidden ? $("#card-" + tid + " .card__open") : lastOpener && document.contains(lastOpener) && lastOpener.offsetParent ? lastOpener : $("#tab-" + S.tab);
      back && back.focus();
    }
  }
  function passage(f) {
    if (f.by === "coordinator") return '<div class="passage"><div class="passage__src">' + Kit.icon("edit") + "Corrected by coordinator · " + esc(f.at) + '</div><div>Was <span class="mono">' + esc(f.prev.display) + '</span> in the cited document. Now <span class="mono">' + esc(f.display) + "</span>.</div></div>";
    const d = S.docs.find((x) => x.id === f.doc);
    const i = d.text.indexOf(f.quote);
    const s = Math.max(d.text.lastIndexOf("\n", i) + 1, i - 90), e = Math.min(d.text.length, i + f.quote.length + 90);
    const nl = d.text.indexOf("\n", i + f.quote.length);
    const end = nl > 0 ? Math.min(e, nl) : e;
    return '<div class="passage"><div class="passage__src">' + Kit.icon("doc") + esc(d.title) + (d.version > 1 ? " v" + d.version : "") + ' · <span class="mono">' + esc(d.date) + "</span></div><div>" +
      (s > 0 && d.text[s - 1] !== "\n" ? "…" : "") + esc(d.text.slice(s, i)) + '<mark class="hl">' + esc(f.quote) + "</mark>" + esc(d.text.slice(i + f.quote.length, end)) + (end < d.text.length && d.text[end] !== "\n" ? "…" : "") + "</div></div>";
  }
  function valueText(r) {
    if (r.state === "unknown") return r.stale ? fmtDate(S.facts.labs.date) + " · outdated" : "Not documented";
    if (r.state === "needs_review" && !r.ev.length) return r.atScreening ? "At screening" : "Study team";
    const f = r.ev.length ? S.facts[r.ev[r.ev.length > 2 ? 0 : r.ev.length - 1]] : null;
    if (r.ev.length > 2 && r.state === "supported") return "None detected";
    return f ? f.display : "";
  }
  function rowHTML(r, prevState) {
    const c = CRIT[r.id], open = S.panel.rows.has(r.id);
    const facts = (r.ev || []).map((k) => S.facts[k]).filter(Boolean);
    const uniq = []; facts.forEach((f) => { if (!uniq.some((u) => u.doc === f.doc && u.quote === f.quote && u.by === f.by)) uniq.push(f); });
    const edit = (r.ev || []).find((k) => EDITABLE[k]);
    const vk = vkey(r.id, r);
    const noteCls = r.state === "unknown" ? "note--open" : r.state === "needs_review" ? "note--review" : r.state === "conflicting" ? "note--conflict" : "";
    let note = r.note || "";
    if (r.state === "unknown" && !r.stale) note = "Missing: " + (r.missing || []).map((k) => ({ kras: "KRAS", egfr: "EGFR", alk: "ALK", rosret: "ROS1/RET/NTRK", braf: "BRAF", met: "MET", her2: "HER2", pdl1: "PD-L1", labs: "blood results" }[k] || k)).join(", ") + (S.requested[kindOf(r)] ? ". Requested " + S.requested[kindOf(r)] + "." : ".");
    const fix = S.panel.fix === r.id && edit ? '<div class="fix"><label class="sr-only" for="fix-v">' + EDITABLE[edit].label + "</label>" +
      (EDITABLE[edit].num ? '<input id="fix-v" type="number" step="any" min="0" max="100" value="' + S.facts[edit].value + '">' : '<select id="fix-v">' + EDITABLE[edit].options.map((v) => '<option value="' + v + '"' + (v === S.facts[edit].value ? " selected" : "") + ">ECOG " + v + "</option>").join("") + "</select>") +
      '<button class="btn btn--primary" type="button" data-act="fix-save" data-key="' + edit + '" data-fk="fix-save">Save</button><button class="btn btn--ghost" type="button" data-act="fix-cancel" data-fk="fix-cancel">Cancel</button></div>' : "";
    const tools = [];
    if (r.state === "unknown") tools.push('<button class="btn" type="button" data-act="row-request" data-kind="' + kindOf(r) + '" data-fk="rq-' + r.id + '">' + Kit.icon("send") + "Request</button>");
    if (r.state === "supported" && (r.pending || S.verified[vk])) tools.push('<button class="btn" type="button" data-act="verify" data-cid="' + r.id + '" aria-pressed="' + !!S.verified[vk] + '" data-fk="vf-' + r.id + '">' + Kit.icon("check") + (S.verified[vk] ? "Verified" : "Mark verified") + "</button>");
    if (edit && !fix) tools.push('<button class="btn" type="button" data-act="fix" data-cid="' + r.id + '" data-fk="fx-' + r.id + '">' + Kit.icon("edit") + "Correct value</button>");
    return '<li class="row" data-row="' + r.id + '" data-open="' + open + '"' + (prevState && prevState !== r.state ? ' data-changed="true"' : "") + ">" +
      '<button class="row__btn" type="button" aria-expanded="' + open + '" data-act="row" data-cid="' + r.id + '" data-fk="row-' + r.id + '">' + Kit.glyph(r.state, Kit.STATE_LABEL[r.state] + (r.pending ? ", to verify" : "")) +
      '<span><span class="row__req">' + esc(c.plain) + '</span><span class="row__kind">' + (c.kind === "inc" ? "Inclusion" : "Exclusion") + (c.from === "title" ? " · from the study title" : "") + (r.atScreening ? " · checked at screening" : "") + "</span></span>" +
      '<span class="row__val mono">' + esc(valueText(r)) + "</span>" + Kit.icon("chevron", "row__chev") + "</button>" +
      '<div class="row__more"' + (open ? "" : " inert") + '><div class="row__inner"><div class="row__pad">' +
      '<div><div class="lbl">Registry text' + (c.part ? " · " + esc(c.part) : "") + '</div><p class="verbatim">' + esc(c.text) + "</p></div>" +
      (uniq.length ? '<div><div class="lbl">Evidence</div>' + uniq.map(passage).join("") + "</div>" : "") +
      (note ? '<div class="note ' + noteCls + '">' + Kit.glyph(r.state) + "<span>" + esc(note) + "</span></div>" : "") +
      fix + (tools.length ? '<div class="row__tools">' + tools.join("") + "</div>" : "") +
      "</div></div></div></li>";
  }
  function composeHTML(kind, tid) {
    const ids = TRIALS.filter((t) => !["closed", "invited"].includes(S.bucket[t.id]) && assess(t).status !== "not_match" && assess(t).results.some((r) => r.state === "unknown" && kindOf(r) === kind)).map((t) => t.id);
    const n = ids.reduce((s, id) => s + assess(T[id]).results.filter((r) => r.state === "unknown" && kindOf(r) === kind).length, 0);
    const own = tid ? assess(T[tid]).results.filter((r) => r.state === "unknown" && kindOf(r) === kind).length : 0;
    const text = "Hello — could you share " + KIND[kind].ask + ".\n\n" + (tid && ids.length > 1 ? "It would let us check " + pl(own, "open requirement", "open requirements") + " for " + T[tid].acr + " and " + (n - own) + " more across " + pl(ids.length - 1, "other study", "other studies") + "." : "It would let us check " + pl(n, "open requirement", "open requirements") + (ids.length === 1 ? " for " + T[ids[0]].acr + "." : " across " + ids.length + " studies.")) + "\n\nThank you,\nResearch nurse, lung trials team";
    return '<div class="inline" role="group" aria-labelledby="cmp-h"><h3 id="cmp-h">' + esc(KIND[kind].verb) + '</h3><div class="muted">To: Referring oncology team <span class="mono">(simulated)</span></div>' +
      '<label class="sr-only" for="draft">Request text</label><textarea class="draft" id="draft" data-first tabindex="0">' + esc(text) + "</textarea>" +
      '<div><div class="lbl">Unblocks</div><div class="unblocks">' + ids.map((id) => '<span class="chip chip--open">' + esc(T[id].acr) + "</span>").join("") + "</div></div>" +
      '<div class="acts"><button class="btn btn--primary" type="button" data-act="send" data-kind="' + kind + '" data-fk="send">' + Kit.icon("send") + 'Approve and send</button><button class="btn btn--ghost" type="button" data-act="inline-cancel" data-fk="cancel">Cancel</button></div></div>';
  }
  function reasonHTML(pre) {
    return '<div class="inline" role="group" aria-labelledby="rs-h"><h3 id="rs-h">Why is this referral not suitable?</h3><div class="reasons" role="radiogroup" aria-labelledby="rs-h">' +
      Object.keys(REASONS).map((k, i) => '<label class="reason"><input type="radio" name="reason" value="' + k + '"' + (k === pre ? " checked" : "") + (i === 0 ? " data-first" : "") + ">" + esc(REASONS[k]) + "</label>").join("") +
      '</div><div class="acts"><button class="btn btn--primary" type="button" data-act="close-ref" data-fk="close-ref"' + (pre ? "" : " disabled") + '>Close referral</button><button class="btn btn--ghost" type="button" data-act="inline-cancel" data-fk="cancel">Cancel</button></div></div>';
  }
  function inviteHTML(t, a) {
    const open = a.results.filter((r) => r.state !== "supported" && !r.atScreening);
    const scr = a.results.filter((r) => r.atScreening);
    const site = nearest(t);
    const li = (r) => "<li>" + Kit.glyph(r.state) + "<span>" + esc(CRIT[r.id].plain) + "</span></li>";
    return '<div class="inline" role="group" aria-labelledby="iv-h"><h3 id="iv-h">' + (open.length ? open.length + " requirement" + (open.length > 1 ? "s are" : " is") + " not supported yet" : "Invite SYN-0417 to prescreening") + "</h3>" +
      (open.length ? '<ul class="chg__rows">' + open.map(li).join("") + "</ul>" : '<div class="muted">' + esc(site ? site[0] : "Study team") + ' · <span class="mono">simulated</span></div>') +
      (scr.length ? '<div><div class="lbl">Checked at screening</div><ul class="chg__rows">' + scr.map(li).join("") + "</ul></div>" : "") +
      (open.length ? '<label class="field" style="margin:0"><span>Why invite with open items?</span><textarea class="draft" id="ov-reason" style="min-height:64px" data-first></textarea></label>' : "") +
      '<div class="acts"><button class="btn btn--primary" type="button" data-act="invite" data-fk="invite"' + (open.length ? " disabled" : " data-first") + ">" + (open.length ? "Invite anyway" : "Approve invitation") + '</button><button class="btn btn--ghost" type="button" data-act="inline-cancel" data-fk="cancel">Cancel</button></div></div>';
  }
  function historyHTML(filter) {
    const items = S.history.filter((h) => !filter || h.text.includes(filter));
    return '<ul class="hist">' + items.map((h, i) => '<li data-hid="' + h.id + '"><span class="mono muted">' + esc(h.at) + '</span><span><span class="who">' + esc(h.who) + "</span> · " + esc(h.text) + "</span></li>").join("") + "</ul>";
  }
  function changesHTML() {
    if (!S.lastDiff) return '<div class="empty"><div>No changes yet.</div></div>';
    return '<div class="lbl" style="padding:8px 8px 4px">' + esc(S.lastDiff.doc) + '</div><ul class="chg">' + S.lastDiff.items.map((x) =>
      '<li class="chg__trial"><div class="chg__name"><span>' + esc(T[x.tid].acr) + '</span><span class="chg__arrow"><span class="st-' + x.from + '">' + esc(STATUS[x.from].replace("Potential match — ", "")) + "</span>" + Kit.icon("arrowRight", "glyph") + '<span class="st-' + x.to + '">' + esc(STATUS[x.to].replace("Potential match — ", "")) + "</span></span></div>" +
      '<ul class="chg__rows">' + x.rows.map((r) => "<li>" + Kit.glyph(r.from) + Kit.icon("arrowRight", "glyph") + Kit.glyph(r.to) + "<span>" + esc(CRIT[r.id].plain) + "</span></li>").join("") + "</ul></li>").join("") + "</ul>";
  }
  function renderPanel(prevAssess) {
    const P = S.panel; if (!P) return;
    const el = $("#panel");
    const fk = document.activeElement && el.contains(document.activeElement) ? document.activeElement.dataset.fk : null;
    const scroll = $(".panel__body", el) ? $(".panel__body", el).scrollTop : 0;
    const t = P.tid ? T[P.tid] : null;
    const a = t ? assess(t) : null;
    let head;
    if (t) {
      const b = S.bucket[t.id];
      head = '<div class="panel__bar"><h2 id="p-title" tabindex="-1">' + esc(t.acr) + '</h2><button class="btn btn--icon btn--ghost" type="button" data-act="close-panel" aria-label="Close panel" data-fk="x">' + Kit.icon("close") + "</button></div>" +
        '<div class="panel__sub"><a class="src-link mono" href="https://clinicaltrials.gov/study/' + t.nct + '" target="_blank" rel="noopener">' + t.nct + " ↗</a><span>" + esc(t.phase + " · " + t.sponsor) + '</span><span class="synthetic">Synthetic patient</span></div>' +
        '<div class="panel__status st-' + a.status + '">' + Kit.glyph(a.status === "ready" ? "supported" : a.status === "not_match" ? "conflicting" : a.status === "needs_review" ? "needs_review" : "unknown") + "<span>" + STATUS[a.status] + "</span>" +
        (b !== "review" ? '<span class="chip">' + ({ waiting: "Waiting on evidence", invited: "Invited (simulated)", closed: "Closed · " + (REASONS[S.reason[t.id]] || "") }[b]) + "</span>" : "") + "</div>" +
        '<div class="panel__ver mono">SYN-0417 · record v' + S.version + " · " + SNAPSHOT + "</div>";
    } else {
      head = '<div class="panel__bar"><h2 id="p-title" tabindex="-1">' + (P.inline === "compose" ? "Request" : "Activity") + '</h2><button class="btn btn--icon btn--ghost" type="button" data-act="close-panel" aria-label="Close panel" data-fk="x">' + Kit.icon("close") + "</button></div>" +
        '<div class="panel__sub"><span class="mono">SYN-0417 · record v' + S.version + '</span><span class="synthetic">Synthetic patient</span></div>';
    }
    const tabs = [];
    if (t) tabs.push(["criteria", "Criteria <span class=\"mono\">" + t.crit.length + "</span>"]);
    tabs.push(["history", "History"]);
    if (S.lastDiff) tabs.push(["changes", "Changes"]);
    const tabsHTML = P.inline === "compose" && !t ? "" : '<div class="ptabs" role="tablist" aria-label="Panel sections">' + tabs.map(([k, l]) => '<button class="tab" role="tab" type="button" data-act="ptab" data-mode="' + k + '" aria-selected="' + (P.mode === k) + '" data-fk="pt-' + k + '">' + l + "</button>").join("") + '<span class="tabs__line" aria-hidden="true"></span></div>';

    let body = "";
    if (P.inline === "compose") body += composeHTML(P.kind, P.tid);
    if (P.inline === "reason") body += reasonHTML(P.reason);
    if (P.inline === "invite" && t) body += inviteHTML(t, a);
    if (!t && P.inline === "compose") { /* compose only */ }
    else if (P.mode === "criteria" && t) {
      const rows = a.results.slice().sort((x, y) => ORDER[x.state] - ORDER[y.state] || t.crit.findIndex((c) => c.id === x.id) - t.crit.findIndex((c) => c.id === y.id));
      const prevMap = prevAssess ? Object.fromEntries(prevAssess.results.map((r) => [r.id, r.state])) : {};
      body += '<ul class="rows">' + rows.map((r) => rowHTML(r, prevMap[r.id])).join("") + "</ul>";
    } else if (P.mode === "history") body += historyHTML(t ? t.acr : null);
    else if (P.mode === "changes") body += changesHTML();

    let foot = "";
    if (t) {
      const b = S.bucket[t.id];
      if (b === "invited") foot = '<div class="acts"><button class="btn" type="button" data-act="withdraw" data-fk="withdraw">Withdraw invitation</button></div>';
      else if (b === "closed") foot = '<div class="acts"><button class="btn" type="button" data-act="reopen" data-fk="reopen">Reopen referral</button></div>';
      else foot = '<div class="acts"><button class="btn btn--primary" type="button" data-act="f-invite" data-fk="f-invite">Invite for prescreening</button><button class="btn" type="button" data-act="f-request" data-fk="f-request"' + (a.n.unknown ? "" : " disabled") + '>Request information</button><button class="btn" type="button" data-act="f-reason" data-fk="f-reason">Not suitable</button><button class="btn btn--icon" type="button" data-act="f-save" aria-pressed="' + !!S.saved[t.id] + '" aria-label="Save for review" data-fk="f-save">' + Kit.icon("bookmark") + "</button></div>";
    }
    el.innerHTML = '<div class="panel__head">' + head + tabsHTML + '</div><div class="panel__body">' + body + "</div>" + (foot ? '<div class="panel__foot">' + foot + "</div>" : "");
    const sv = $('[data-act="f-save"] svg', el); if (sv && S.saved[t.id]) sv.style.fill = "currentColor";
    const pt = $(".ptabs", el); if (pt) moveLine(pt, $(".tabs__line", pt));
    $(".panel__body", el).scrollTop = scroll;
    $$('.row[data-changed="true"] .row__btn .glyph', el).forEach((g) => Kit.replay(g, "tick", 260));
    if (fk) { const back = $('[data-fk="' + fk + '"]', el); (back || $("#p-title")).focus(); }
  }
  $("#panel").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const P = S.panel; if (!P) return;
    const act = b.dataset.act;
    if (act === "close-panel") return closePanel();
    if (act === "ptab") { P.mode = b.dataset.mode; P.inline = P.inline === "compose" && !P.tid ? P.inline : null; return renderPanel(); }
    if (act === "row") {
      const id = b.dataset.cid; const li = b.closest(".row");
      if (P.rows.has(id)) P.rows.delete(id); else P.rows.add(id);
      const open = P.rows.has(id);
      li.dataset.open = String(open); b.setAttribute("aria-expanded", String(open));
      const more = li.querySelector(".row__more"); if (open) more.removeAttribute("inert"); else more.setAttribute("inert", "");
      if (open) { const hl = li.querySelector(".hl"); if (hl) { hl.style.animation = "none"; void hl.offsetWidth; hl.style.animation = ""; } }
      return;
    }
    if (act === "verify") return toggleVerify(b.dataset.cid);
    if (act === "fix") { P.fix = b.dataset.cid; renderPanel(); const v = $("#fix-v"); v && v.focus(); return; }
    if (act === "fix-cancel") { const cid = P.fix; P.fix = null; renderPanel(); const fb = $('[data-fk="fx-' + cid + '"]'); fb && fb.focus(); return; }
    if (act === "fix-save") { const key = b.dataset.key; const raw = $("#fix-v").value; const v = Math.max(0, Math.min(100, Number(raw))); if (Number.isNaN(v) || raw === "") return; if (v === S.facts[key].value) { P.fix = null; return renderPanel(); } return correct(key, v, P.tid); }
    if (act === "row-request") { P.inline = "compose"; P.kind = b.dataset.kind === "other" ? "molecular" : b.dataset.kind; renderPanel(); $("#draft").focus(); return; }
    if (act === "inline-cancel") { if (!P.tid) return closePanel(); P.inline = null; renderPanel(); $("#p-title").focus(); return; }
    if (act === "send") return sendRequest(b.dataset.kind, P.tid);
    if (act === "close-ref") { const r = $('#panel input[name="reason"]:checked'); if (r) doClose(P.tid, r.value); return; }
    if (act === "invite") return doInvite(P.tid, ($("#ov-reason") || {}).value);
    if (act === "f-invite") { const a = assess(T[P.tid]); P.inline = "invite"; renderPanel(); const f = $('#panel [data-act="invite"]'); f && f.focus(); return; }
    if (act === "f-request") { P.inline = "compose"; const r = assess(T[P.tid]).results.find((x) => x.state === "unknown"); P.kind = r && kindOf(r) !== "other" ? kindOf(r) : "molecular"; renderPanel(); $("#draft").focus(); return; }
    if (act === "f-reason") { P.inline = "reason"; renderPanel(); const f = $('#panel input[name="reason"]'); f && f.focus(); return; }
    if (act === "f-save") return toggleSave(P.tid);
    if (act === "withdraw") { const tid = P.tid; const prev = moveBucket([tid], "review", "review"); log("You", "Withdrew the invitation for " + T[tid].acr + "."); renderPanel(); Kit.toast({ msg: "Invitation withdrawn (simulated)", sub: T[tid].acr, icon: "undo", action: { label: "Undo", run: () => { restoreBuckets(prev); if (S.panel) renderPanel(); } } }); return; }
    if (act === "reopen") return reopen(P.tid);
  });
  $("#panel").addEventListener("input", (e) => { if (e.target.id === "ov-reason") $('#panel [data-act="invite"]').disabled = !e.target.value.trim(); });
  $("#panel").addEventListener("change", (e) => { if (e.target.name === "reason") { const btn = $('#panel [data-act="close-ref"]'); btn.disabled = false; } });

  /* ======================= Synthetic report sheet (judge input) ======================= */
  const SHEET_DEFAULT = { kind: "molecular", mol: { kras: "G12C", egfr: "none", alk: "none", her2: "none", pdl1: 0 }, bld: { anc: 3.8, hb: 131, plt: 248 } };
  let sheetVals;
  function openSheet(kind) {
    if (S.panel) closePanel(false);
    lastOpener = document.activeElement;
    S.sheet = true;
    sheetVals = JSON.parse(JSON.stringify(SHEET_DEFAULT)); sheetVals.kind = kind === "bloods" || kind === "labs" ? "labs" : "molecular";
    renderSheet();
    $("#scrim").dataset.open = "true"; $("#sheet").dataset.open = "true";
    $(".app").inert = true; $(".chrome").inert = true;
    setTimeout(() => { if (S.sheet) $("#s-title").focus(); }, Kit.reduced() ? 0 : 40);
  }
  function closeSheet(restore) {
    if (!S || !S.sheet) return;
    S.sheet = null;
    $("#scrim").dataset.open = "false"; $("#sheet").dataset.open = "false";
    $(".app").inert = false; $(".chrome").inert = false;
    if (restore !== false) (lastOpener && document.contains(lastOpener) ? lastOpener : $("#add-doc")).focus();
  }
  const segCtl = (name, opts, cur) => '<div class="seg-ctl" role="group" aria-label="' + name + '">' + opts.map(([v, l]) => '<button type="button" data-sv="' + name + '" data-val="' + v + '" aria-pressed="' + (String(cur) === String(v)) + '">' + esc(l) + "</button>").join("") + "</div>";
  function previewText() {
    const txt = sheetVals.kind === "molecular" ? molText(sheetVals.mol) : bloodText(sheetVals.bld);
    let html = esc(txt);
    const marks = sheetVals.kind === "molecular" ? [KRAS[sheetVals.mol.kras], EGFR[sheetVals.mol.egfr], ALK[sheetVals.mol.alk], HER2[sheetVals.mol.her2], "score: " + sheetVals.mol.pdl1 + "%"] : ["Neutrophils " + sheetVals.bld.anc, "Haemoglobin " + sheetVals.bld.hb, "Platelets " + sheetVals.bld.plt];
    marks.forEach((m, i) => { html = html.replace(esc(m), '<mark data-m="' + i + '">' + esc(m) + "</mark>"); });
    return html;
  }
  function renderSheet(flashIdx) {
    const v = sheetVals, mol = v.kind === "molecular";
    $("#sheet").innerHTML = '<div class="sheet__bar"><h2 id="s-title" tabindex="-1">Add a synthetic document</h2><span class="synthetic">Synthetic</span><button class="btn btn--icon btn--ghost" type="button" data-sact="close" aria-label="Close">' + Kit.icon("close") + "</button></div>" +
      '<div class="sheet__grid"><div>' +
      '<div class="field"><span>Document</span>' + segCtl("kind", [["molecular", "Molecular pathology report"], ["labs", "Blood results"]], v.kind) + "</div>" +
      (mol ? '<div class="field"><span>KRAS</span>' + segCtl("kras", [["G12C", "G12C"], ["G12D", "G12D"], ["none", "Not detected"]], v.mol.kras) + "</div>" +
        '<div class="field"><span>EGFR</span>' + segCtl("egfr", [["none", "Not detected"], ["ex19", "Exon 19 del"], ["L858R", "L858R"], ["G719X", "G719A"]], v.mol.egfr) + "</div>" +
        '<div class="field"><span>ALK</span>' + segCtl("alk", [["none", "Not detected"], ["pos", "Fusion"]], v.mol.alk) + "</div>" +
        '<div class="field"><span>HER2</span>' + segCtl("her2", [["none", "Not detected"], ["ex20", "Exon 20 ins"]], v.mol.her2) + "</div>" +
        '<div class="field"><span id="pdl1-l">PD-L1 tumour proportion score (%)</span><div class="stepper"><button class="btn btn--icon" type="button" data-sact="pd-" aria-label="Decrease PD-L1">−</button><input id="pdl1" type="number" step="any" min="0" max="100" value="' + v.mol.pdl1 + '" aria-labelledby="pdl1-l"><button class="btn btn--icon" type="button" data-sact="pd+" aria-label="Increase PD-L1">+</button></div></div>'
        : '<div class="field"><span id="anc-l">Neutrophils (×10^9/L)</span><div class="stepper"><input id="anc" type="number" step="0.1" min="0" value="' + v.bld.anc + '" aria-labelledby="anc-l"></div></div>' +
          '<div class="field"><span id="hb-l">Haemoglobin (g/L)</span><div class="stepper"><input id="hb" type="number" min="0" value="' + v.bld.hb + '" aria-labelledby="hb-l"></div></div>' +
          '<div class="field"><span id="plt-l">Platelets (×10^9/L)</span><div class="stepper"><input id="plt" type="number" min="0" value="' + v.bld.plt + '" aria-labelledby="plt-l"></div></div>') +
      '</div><div><div class="lbl" style="margin-bottom:6px">Preview</div><div class="preview" id="preview">' + previewText() + "</div></div></div>" +
      '<div class="sheet__foot"><button class="btn btn--ghost" type="button" data-sact="close">Cancel</button><button class="btn btn--primary" type="button" data-sact="add" id="s-add">' + Kit.icon("upload") + "Add to SYN-0417's record</button></div>";
    if (flashIdx != null) { const m = $('#preview mark[data-m="' + flashIdx + '"]'); if (m) m.dataset.flash = (S.flash = S.flash === "A" ? "B" : "A"); }
  }
  function refreshPreview(idx) { $("#preview").innerHTML = previewText(); const m = $('#preview mark[data-m="' + idx + '"]'); if (m && !Kit.reduced()) m.dataset.flash = (S.flash = S.flash === "A" ? "B" : "A"); }
  $("#sheet").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sact],[data-sv]"); if (!b) return;
    if (b.dataset.sv) {
      const name = b.dataset.sv, val = b.dataset.val;
      if (name === "kind") { sheetVals.kind = val; renderSheet(); $('[data-sv="kind"][data-val="' + val + '"]').focus(); return; }
      sheetVals.mol[name] = val;
      $$('[data-sv="' + name + '"]').forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.val === val)));
      refreshPreview({ kras: 0, egfr: 1, alk: 2, her2: 3 }[name]);
      return;
    }
    const a = b.dataset.sact;
    if (a === "close") return closeSheet();
    if (a === "pd-" || a === "pd+") { sheetVals.mol.pdl1 = Math.max(0, Math.min(100, sheetVals.mol.pdl1 + (a === "pd+" ? 5 : -5))); $("#pdl1").value = sheetVals.mol.pdl1; refreshPreview(4); return; }
    if (a === "add") return addDocument(sheetVals.kind, sheetVals.kind === "molecular" ? Object.assign({}, sheetVals.mol) : Object.assign({}, sheetVals.bld));
  });
  $("#sheet").addEventListener("input", (e) => {
    const id = e.target.id; const n = Number(e.target.value);
    if (e.target.value === "" || Number.isNaN(n)) return;
    if (id === "pdl1") { sheetVals.mol.pdl1 = Math.max(0, Math.min(100, Math.round(n * 10) / 10)); refreshPreview(4); }
    if (["anc", "hb", "plt"].includes(id)) { sheetVals.bld[id] = n; refreshPreview(["anc", "hb", "plt"].indexOf(id)); }
  });
  $("#scrim").addEventListener("click", () => closeSheet());

  /* ======================= Global keys, nav, chrome ======================= */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (S.sheet) { e.preventDefault(); return closeSheet(); }
    if (S.panel) {
      e.preventDefault();
      if (S.panel.fix) { const cid = S.panel.fix; S.panel.fix = null; renderPanel(); const fb = $('[data-fk="fx-' + cid + '"]'); return (fb || $("#p-title")).focus(); }
      if (S.panel.inline && S.panel.tid) { S.panel.inline = null; renderPanel(); return $("#p-title").focus(); }
      return closePanel();
    }
  });
  $("#nav-ref").addEventListener("click", (e) => { e.preventDefault(); closePanel(false); setTab("review", true); });
  $("#nav-activity").addEventListener("click", () => openPanel(null, { mode: "history" }));

  const THEMES = ["auto", "light", "dark"];
  let themeI = THEMES.indexOf(params.get("theme") || "auto");
  function paintChrome() {
    const th = THEMES[themeI];
    $("#ch-theme").innerHTML = Kit.icon(th === "dark" ? "moon" : th === "light" ? "sun" : "spark");
    $("#ch-theme").setAttribute("aria-label", "Theme: " + th);
    const on = document.documentElement.dataset.motion !== "off";
    $("#ch-motion").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 12c3-6 5-6 8 0s5 6 8 0"/>' + (on ? "" : '<path d="M4 20L20 4"/>') + "</svg>";
    $("#ch-motion").setAttribute("aria-pressed", String(on)); $("#ch-motion").setAttribute("aria-label", "Motion " + (on ? "on" : "off"));
    $("#ch-reset").innerHTML = Kit.icon("undo");
  }
  $("#ch-theme").addEventListener("click", () => { themeI = (themeI + 1) % 3; Kit.setTheme(THEMES[themeI]); paintChrome(); });
  $("#ch-motion").addEventListener("click", () => { Kit.setMotion(document.documentElement.dataset.motion === "off"); paintChrome(); });
  $("#ch-reset").addEventListener("click", () => boot());

  /* ======================= Boot ======================= */
  function boot() {
    closeSheet(false); closePanel(false);
    $$(".toasts .toast").forEach((t) => t.remove());
    fresh();
    const box = $("#cards"); box.innerHTML = "";
    TRIALS.forEach((t) => box.appendChild(buildCard(t)));
    S.tab = "review";
    $$("#tabs .tab").forEach((b) => { const on = b.dataset.tab === "review"; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    $("#q").value = "";
    $("#pt-facts").innerHTML = '<span id="fact-n"></span> cited facts · record v<span id="rec-v"></span>';
    renderDocs(); renderAll(false); renderFacts();
    requestAnimationFrame(() => moveLine($("#tabs"), $("#tabs-line")));
    moveLine($("#tabs"), $("#tabs-line"));
    paintChrome();
  }
  boot();

  // Seeded states for screenshots: ?state=after|alt|pd60  ?panel=<trial>  ?row=<crit>  ?inline=compose|reason|invite  ?sheet=1
  async function seed() {
    const st = params.get("state");
    if (st) {
      const was = document.documentElement.dataset.motion; Kit.setMotion(false);
      sendRequest("molecular");
      await addDocument("molecular", Object.assign({}, SHEET_DEFAULT.mol, st === "pd60" ? { pdl1: 60 } : {}));
      $$(".toasts .toast").forEach((t) => t.remove());
      if (st === "alt") { doClose("kan", "cohort"); $$(".toasts .toast").forEach((t) => t.remove()); }
      if (was !== "off" && !SELFTEST && params.get("motion") !== "off") Kit.setMotion(true);
      paintChrome();
    }
    const p = params.get("panel");
    if (p && T[p]) openPanel(p, { inline: params.get("inline") || null, rows: params.get("row") ? [params.get("row")] : [] });
    else if (params.get("inline") === "compose") openPanel(null, { inline: "compose", kind: "molecular" });
    if (params.get("sheet") === "1") openSheet("molecular");
  }

  /* ======================= Self-test ======================= */
  function assert(c, m) { if (!c) throw new Error(m); }
  const vis = () => $$(".slot:not([hidden])").map((s) => s.dataset.flip);
  const click = (sel) => { const el = typeof sel === "string" ? $(sel) : sel; assert(el, "missing " + sel); el.click(); };
  const key = (el, k) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  const statusOf = (id) => assess(T[id]).status;
  window.BoardSteps = [
    { name: "initial render: 8 referrals to review, agent proposes the molecular report", run: async () => {
      assert(vis().length === 8, "expected 8 visible cards, got " + vis().length);
      assert(/molecular pathology report/i.test($("#agent").textContent), "agent should propose molecular report");
      assert($("#ag-reqs").textContent === "12", "expected 12 open requirements, got " + $("#ag-reqs").textContent);
      assert(statusOf("ras") === "not_match", "RASolve should already conflict (needs prior therapy)");
      assert($$("#card-cbk .seg").length === 12, "CodeBreaK strip should have 12 segments");
      assert(!/\d\s*%/.test($("#cards").textContent), "no percentages on cards");
      assert(document.documentElement.scrollWidth <= window.innerWidth + 1, "horizontal scroll");
    } },
    { name: "open a card, expand a criterion, see the cited passage, Escape returns focus", run: async () => {
      click("#card-cbk .card__open");
      assert($("#panel").dataset.open === "true", "panel should open");
      assert($$("#panel .row").length === 12, "12 criterion rows");
      assert($('#panel .row[data-row="cbk-1"] .row__more').hasAttribute("inert"), "collapsed rows are inert");
      click('#panel [data-act="row"][data-cid="cbk-5"]');
      assert($('#panel .row[data-row="cbk-5"]').dataset.open === "true", "row expands");
      assert($('#panel .row[data-row="cbk-5"] .hl').textContent === "ECOG 1", "highlighted quote is the cited span");
      assert(/Referral summary/.test($('#panel .row[data-row="cbk-5"] .passage__src').textContent), "source document named");
      key(document, "Escape");
      assert($("#panel").dataset.open === "false", "Escape closes panel");
      assert(document.activeElement === $("#card-cbk .card__open"), "focus returns to the card");
    } },
    { name: "search filters, empty state offers one next step", run: async () => {
      const q = $("#q"); q.value = "kras"; q.dispatchEvent(new Event("input"));
      assert(vis().length === 1 && vis()[0] === "kra", "only Krascendo matches 'kras', got " + vis().join(","));
      q.value = "zzzz"; q.dispatchEvent(new Event("input"));
      assert(!$("#empty").hidden && /Clear search/.test($("#empty").textContent), "empty state with Clear search");
      click("#empty-act");
      assert(vis().length === 8 && q.value === "", "clear restores all");
    } },
    { name: "approve the agent's request: 7 cards wait; Undo brings them back", run: async () => {
      click("#ag-review");
      assert($("#panel .inline .draft"), "composer open");
      assert(/12 open requirements across 7 studies/.test($("#draft").value), "draft names what it unblocks: " + $("#draft").value);
      click('#panel [data-act="send"]');
      assert(TRIALS.filter((t) => S.bucket[t.id] === "waiting").length === 7, "7 waiting");
      assert($('[data-count="waiting"]').dataset.v === "7", "waiting count 7");
      click(".toast:last-child .toast__act");
      assert(TRIALS.filter((t) => S.bucket[t.id] === "waiting").length === 0, "undo restores");
      assert(!S.requested.molecular, "request withdrawn");
      $$(".toasts .toast").forEach((t) => t.remove());
    } },
    { name: "judge input: KRAS G12C, PD-L1 0% → CodeBreaK ready (central PD-L1 at screening), EGFR/ALK studies conflict, HER2 needs review, labs stay open", run: async () => {
      click("#ag-review"); click('#panel [data-act="send"]');
      $$(".toasts .toast").forEach((t) => t.remove());
      click("#ag-add");
      assert($("#sheet").dataset.open === "true", "sheet open");
      click('[data-sv="kras"][data-val="G12C"]');
      const pd = $("#pdl1"); pd.value = "0"; pd.dispatchEvent(new Event("input", { bubbles: true }));
      assert(/p\.\(G12C\) detected/.test($("#preview").textContent), "preview shows the value");
      click("#s-add"); await busy;
      assert(statusOf("cbk") === "ready", "CodeBreaK ready, got " + statusOf("cbk"));
      assert(statusOf("kan") === "ready", "KANDLELIT ready: its remaining items are checked at screening, got " + statusOf("kan"));
      assert(/checked at screening/.test($("#card-cbk .card__front").textContent), "front says what is left for screening");
      assert(statusOf("kra") === "needs_evidence", "Krascendo still needs bloods (outdated)");
      ["alk", "alp", "cop"].forEach((id) => assert(statusOf(id) === "not_match", id + " should conflict"));
      assert(statusOf("bea") === "needs_evidence" && assess(T.bea).results.find((r) => r.id === "bea-3").state === "needs_review", "HER2 mut/amp negative is a review item for Beamion, not a conflict");
      assert(S.tab === "review" && vis().length === 8, "all back in review");
      assert(S.lastDiff && S.lastDiff.items.length === 8, "8 studies changed, got " + (S.lastDiff && S.lastDiff.items.length));
      assert(/Blood results/i.test($("#agent").textContent), "agent moves on to bloods");
      assert($("#card-cbk .seg[data-flip='cbk-2']").dataset.state === "supported", "KRAS segment morphed to supported");
      assert(/8 studies updated/.test($(".toast:last-child").textContent), "receipt toast");
      click(".toast:last-child .toast__act");
      assert(S.panel && S.panel.mode === "changes" && $$("#panel .chg__trial").length === 8, "See changes lists 8 studies");
      closePanel(); $$(".toasts .toast").forEach((t) => t.remove());
    } },
    { name: "verify a cited value; correct ECOG 1 → 2 re-assesses; Undo restores", run: async () => {
      openPanel("cbk", { rows: ["cbk-3"] });
      click('#panel [data-act="verify"][data-cid="cbk-3"]');
      assert(!assess(T.cbk).results.find((r) => r.id === "cbk-3").pending, "verified");
      click('#panel [data-act="row"][data-cid="cbk-5"]');
      click('#panel [data-act="fix"][data-cid="cbk-5"]');
      const sel = $("#fix-v"); sel.value = "2";
      click('#panel [data-act="fix-save"]');
      assert(S.facts.ecog.value === 2 && S.facts.ecog.by === "coordinator", "fact corrected by coordinator");
      assert(statusOf("cbk") === "not_match" && statusOf("kra") === "not_match", "ECOG 2 conflicts with ECOG ≤ 1 studies");
      assert(/Corrected by coordinator/.test($('#panel .row[data-row="cbk-5"]').textContent), "row cites the correction");
      assert(/Corrected ECOG/.test(S.history[0].text), "history logs the correction");
      click(".toast:last-child .toast__act");
      assert(S.facts.ecog.value === 1 && statusOf("cbk") === "ready", "undo restores ECOG 1");
      closePanel(); $$(".toasts .toast").forEach((t) => t.remove());
    } },
    { name: "invite a ready referral: it moves to Invited; Undo returns it", run: async () => {
      click("#card-cbk .card__next");
      assert(S.panel && S.panel.inline === "invite", "invite confirm opens");
      click('#panel [data-act="invite"]');
      assert(S.bucket.cbk === "invited" && $('[data-count="invited"]').dataset.v === "1", "invited");
      click(".toast:last-child .toast__act");
      assert(S.bucket.cbk === "review", "undo invite");
      $$(".toasts .toast").forEach((t) => t.remove());
    } },
    { name: "invite a non-ready referral asks first; Cancel keeps it", run: async () => {
      openPanel("kra"); click('#panel [data-act="f-invite"]');
      assert(/not supported yet/.test($("#panel .inline h3").textContent), "lists what is open");
      assert($('#panel [data-act="invite"]').disabled, "override needs a reason first");
      const rs = $("#ov-reason"); rs.value = "Bloods will be repeated at screening"; rs.dispatchEvent(new Event("input", { bubbles: true }));
      assert(!$('#panel [data-act="invite"]').disabled, "reason enables the override");
      click('#panel [data-act="inline-cancel"]');
      assert(S.bucket.kra === "review" && !S.panel.inline, "nothing changed");
      closePanel();
    } },
    { name: "not suitable: no place in cohort → closed, agent keeps progress and looks further; Undo", run: async () => {
      openPanel("kan"); click('#panel [data-act="f-reason"]');
      assert($('#panel [data-act="close-ref"]').disabled, "needs a reason first");
      const r = $('#panel input[value="cohort"]'); r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true }));
      click('#panel [data-act="close-ref"]');
      assert(S.bucket.kan === "closed" && S.reason.kan === "cohort", "closed with reason");
      assert(/Progress kept/.test($("#agent").textContent) && /Leicester/.test($("#agent").textContent), "agent offers next site beyond travel range");
      click(".toast:last-child .toast__act");
      assert(S.bucket.kan === "review" && !S.alt, "undo reopens");
      $$(".toasts .toast").forEach((t) => t.remove());
    } },
    { name: "swipe left opens the reason sheet; swipe right opens the invite check", run: async () => {
      const card = $("#card-alk");
      const pe = (type, x) => card.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 100, button: 0, pointerId: 7, isPrimary: true }));
      pe("pointerdown", 300); pe("pointermove", 280); pe("pointermove", 140); pe("pointerup", 140);
      assert(S.panel && S.panel.tid === "alk" && S.panel.inline === "reason", "left swipe → reason");
      closePanel();
      pe("pointerdown", 100); pe("pointermove", 130); pe("pointermove", 260); pe("pointerup", 260);
      assert(S.panel && S.panel.tid === "alk" && S.panel.inline === "invite", "right swipe → invite check");
      closePanel();
    } },
    { name: "save for review pins the card first", run: async () => {
      click("#card-ras .card__save");
      assert(S.saved.ras && vis()[0] === "ras", "saved card first");
      click("#card-ras .card__save");
      assert(!S.saved.ras, "unsaved");
    } },
    { name: "tabs: arrow keys move, empty tab offers one step", run: async () => {
      $("#tab-review").focus(); key($("#tab-review"), "ArrowRight");
      assert(S.tab === "waiting" && document.activeElement === $("#tab-waiting"), "arrow moves to Waiting");
      assert(!$("#empty").hidden && /Show to review/.test($("#empty").textContent), "empty waiting tab");
      key($("#tab-waiting"), "Home");
      assert(S.tab === "review", "Home → first tab");
    } },
    { name: "judge changes PD-L1 to 60%: CodeBreaK conflicts, nothing else moves", run: async () => {
      boot();
      sendRequest("molecular"); $$(".toasts .toast").forEach((t) => t.remove());
      await addDocument("molecular", { kras: "G12C", egfr: "none", alk: "none", her2: "none", pdl1: 60 });
      assert(statusOf("cbk") === "not_match", "CodeBreaK conflicts at PD-L1 60%");
      assert(statusOf("kra") === "needs_evidence" && statusOf("kan") === "ready", "others unchanged by PD-L1 value");
      $$(".toasts .toast").forEach((t) => t.remove());
    } },
    { name: "fresh bloods: Krascendo ready (thresholds checked at screening); Beamion counts pass but its full criterion needs review", run: async () => {
      click("#ag-review"); click('#panel [data-act="send"]'); $$(".toasts .toast").forEach((t) => t.remove());
      click("#ag-add"); assert($('[data-sv="kind"][data-val="labs"]').getAttribute("aria-pressed") === "true", "sheet opens on blood results");
      click("#s-add"); await busy;
      assert(statusOf("kra") === "ready", "Krascendo → ready, got " + statusOf("kra"));
      assert(assess(T.bea).results.find((r) => r.id === "bea-4").state === "needs_review", "Beamion organ function stays a review item");
      assert(/Nothing is blocked/.test($("#agent").textContent), "agent: nothing blocked");
      $$(".toasts .toast").forEach((t) => t.remove());
    } },
    { name: "activity, theme and sheet cancel paths", run: async () => {
      click("#nav-activity");
      assert(S.panel && S.panel.mode === "history" && $$("#panel .hist li").length > 5, "activity history");
      key(document, "Escape");
      click("#add-doc"); key(document, "Escape");
      assert($("#sheet").dataset.open === "false", "Escape closes sheet");
      click("#ch-theme");
      assert(document.documentElement.dataset.theme === "light" || document.documentElement.dataset.theme === "dark", "theme toggles");
      Kit.setTheme("auto");
    } },
  ];
  async function selftest() {
    const out = []; let pass = 0;
    for (const s of window.BoardSteps) {
      try { await s.run(); out.push("PASS " + s.name); pass++; } catch (e) { out.push("FAIL " + s.name + ": " + e.message); }
    }
    out.push("RESULT: " + pass + "/" + window.BoardSteps.length + " steps passed");
    $("#selftest-log").textContent = out.join("\n");
    document.documentElement.dataset.selftest = pass === window.BoardSteps.length ? "pass" : "fail";
    console.log(out.join("\n"));
  }
  window.Board = { get S() { return S; }, assess, addDocument, busy: () => busy, boot };
  (async () => { await seed(); if (SELFTEST) { boot(); await selftest(); } })();
})();
