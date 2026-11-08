/* Relay patient board: SYN-0417's own view of the studies suggested to them.
   Synthetic patient; trials are real ClinicalTrials.gov API v2 records (snapshot 7 Nov 2026, data/trials/raw).
   Facts, documents and criteria mirror coordinator.js so both boards tell the same story. */
(function () {
  "use strict";
  const K = window.Kit;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const params = new URLSearchParams(location.search);
  const SELFTEST = params.get("selftest") === "1";
  if (SELFTEST || params.get("motion") === "off") K.setMotion(false);
  if (params.get("theme")) K.setTheme(params.get("theme"));

  const EASE = "cubic-bezier(.2,.8,.2,1)";
  const moving = () => !K.reduced();
  const shown = (el) => !!el && el.isConnected && el.getClientRects().length > 0;
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
  const NL = "Not listed in the registry — ask the team";
  const SNAPSHOT = "Registry snapshot 7 Nov 2026";
  const TRAVEL = [15, 30, 60, 100];
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const REASONS = ["Too far to travel", "Prefer another option", "Timing doesn't work", "Something else"];
  const ORDER = { conflicting: 0, unknown: 1, needs_review: 2, supported: 3 };
  const VIEWS = ["profile", "opps", "convos"];

  /* ======================= Synthetic record (same documents as the coordinator board) ======================= */
  const REF = { title: "Referral summary", date: "30 Oct 2026" };
  const BLOODS = { title: "Blood results", date: "18 Sep 2026", stale: true };
  const MOLDOC = { title: "Molecular pathology report", date: "7 Nov 2026" };
  const FACTS = [
    { key: "diag", label: "Diagnosis", value: "Adenocarcinoma, a nonsquamous non-small cell lung cancer", chip: "Adenocarcinoma, nonsquamous", doc: REF },
    { key: "stage", label: "Stage", value: "IVA (M1b) · advanced", chip: "Stage IVA", doc: REF },
    { key: "treat", label: "Cancer treatment so far", value: "None yet", chip: "No treatment yet", doc: REF },
    { key: "ecog", label: "Day-to-day activity", value: "ECOG 1 · up and about, avoids strenuous activity", chip: "ECOG 1", doc: REF },
    { key: "brain", label: "Brain MRI, 12 Oct 2026", value: "No metastases", chip: "No brain metastases", doc: REF },
    { key: "measurable", label: "Scans", value: "Measurable disease (RECIST 1.1)", chip: "Measurable on scans", doc: REF },
    { key: "pmh", label: "Other conditions", value: "No bowel, lung or autoimmune disease recorded", chip: "No bowel or lung disease", doc: REF },
    { key: "age", label: "Age", value: "63", chip: "Age 63", doc: REF },
    { key: "labs", label: "Blood tests", value: "Blood counts, kidney and liver function", doc: BLOODS, stale: "Outdated · 50 days old" },
  ];
  const SLOTS = [
    { key: "kras", label: "KRAS", value: "G12C change detected", chip: "KRAS G12C", passage: "KRAS: c.34G>T p.(G12C) detected" },
    { key: "drivers", label: "Other driver changes", value: "None detected · EGFR, ALK, HER2, ROS1, RET, NTRK, BRAF, MET", chip: "No other driver change", passage: "EGFR, ALK, HER2, ROS1, RET, NTRK, BRAF, MET: not detected" },
    { key: "pdl1", label: "PD-L1", value: "Negative · tumour proportion score 0", chip: "PD-L1 negative", passage: "PD-L1 (22C3) tumour proportion score: 0" },
  ];
  const FACT = Object.fromEntries(FACTS.map((f) => [f.key, f]));
  const SLOT = Object.fromEntries(SLOTS.map((s) => [s.key, s]));

  /* ======================= Studies (real registry records; criteria mirror coordinator.js) ======================= */
  const MOLSRC = "Molecular pathology report · requested 7 Nov";
  const STUDIES = [
    { id: "cbk", acr: "CodeBreaK 202", nct: "NCT05920356", phase: "Phase 3", sponsor: "Amgen",
      what: "Compares sotorasib with pembrolizumab, each given with carboplatin and pemetrexed chemotherapy, as a first treatment. It measures how long people live, and how long they live without the cancer growing.",
      arms: [
        { tag: "Study group", name: "Sotorasib + carboplatin + pemetrexed", how: "Sotorasib is taken by mouth." },
        { tag: "Comparison group", name: "Pembrolizumab + carboplatin + pemetrexed", how: "Pembrolizumab is given into a vein." },
      ],
      design: "Randomised · open-label · about 750 people",
      length: null,
      sites: [
        { name: "Royal Marsden Hospital", city: "London", mi: 3 },
        { name: "Mount Vernon Cancer Centre", city: "Northwood", mi: 15 },
        { name: "Torbay Hospital", city: "Torquay", mi: 186 },
        { name: "Royal Cornwall Hospital", city: "Truro", mi: 254 },
      ],
      sitesNote: "2 more UK sites are listed as terminated.",
      crit: [
        { id: "cbk-1", text: "Nonsquamous lung cancer, stage IIIB to IV", facts: ["diag", "stage"] },
        { id: "cbk-2", text: "A KRAS G12C change", needs: "kras" },
        { id: "cbk-3", text: "PD-L1 negative", needs: "pdl1", pending: "Your report says negative · the study's central lab confirms it" },
        { id: "cbk-4", text: "No cancer treatment yet for advanced disease", facts: ["treat"] },
        { id: "cbk-5", text: "ECOG 0 or 1", facts: ["ecog"] },
        { id: "cbk-6", text: "No other change that has an approved first targeted treatment", needs: "drivers" },
        { id: "cbk-7", text: "No brain metastases causing symptoms", facts: ["brain"] },
        { id: "cbk-8", text: "No earlier KRAS G12C medicine", facts: ["treat"] },
        { id: "cbk-9", text: "No small-cell or squamous part", facts: ["diag"] },
      ] },
    { id: "kan", acr: "KANDLELIT-007", nct: "NCT07190248", phase: "Phase 3", sponsor: "MSD",
      what: "Tests calderasib, a targeted tablet for the KRAS G12C change, given with pembrolizumab as an injection under the skin, against pembrolizumab with chemotherapy. It looks at whether people live longer without the cancer growing or spreading.",
      arms: [
        { tag: "Study group", name: "Calderasib + pembrolizumab under the skin", how: "Pembrolizumab on day 1 of each 6-week cycle, for up to 18 cycles (about 2 years). Calderasib tablets until a stopping criterion is met." },
        { tag: "Comparison group", name: "Pembrolizumab under the skin + chemotherapy", how: "Pembrolizumab as above, with pemetrexed into a vein, and carboplatin or cisplatin into a vein for up to 4 doses (about 6 weeks)." },
      ],
      design: "Randomised · open-label · about 675 people",
      length: "Pembrolizumab for up to 18 cycles, about 2 years. The other medicines continue until a stopping criterion is met.",
      sites: [
        { name: "Royal Free Hospital", city: "London", mi: 4, closed: true },
        { name: "Leicester Royal Infirmary", city: "Leicester", mi: 99 },
        { name: "Queen Elizabeth Hospital", city: "Birmingham", mi: 118 },
        { name: "Royal Cornwall Hospital", city: "Truro", mi: 254 },
      ],
      sitesNote: null,
      crit: [
        { id: "kan-1", text: "Nonsquamous lung cancer, stage IIIB to IV, not for curative treatment", facts: ["diag", "stage"] },
        { id: "kan-2", text: "A KRAS G12C change (named in the study title)", needs: "kras" },
        { id: "kan-3", text: "No cancer treatment yet for advanced disease", facts: ["treat"] },
        { id: "kan-4", text: "No active brain metastases", facts: ["brain"] },
        { id: "kan-5", text: "No inflammatory bowel disease", facts: ["pmh"] },
        { id: "kan-6", text: "No pneumonitis or lung disease that needed steroids", facts: ["pmh"] },
        { id: "kan-7", text: "The registry lists only the main criteria", review: "A clinician on the study team checks the rest" },
      ] },
    { id: "kra", acr: "Krascendo 2", nct: "NCT06793215", phase: "Phase 3", sponsor: "Roche",
      what: "Compares divarasib plus pembrolizumab with pembrolizumab plus chemotherapy, as a first treatment for KRAS G12C lung cancer. It looks at how well each works and how safe it is.",
      arms: [
        { tag: "Study group", name: "Divarasib + pembrolizumab", how: "Divarasib by mouth once a day; pembrolizumab into a vein every 3 weeks." },
        { tag: "Comparison group", name: "Pembrolizumab + pemetrexed + carboplatin or cisplatin", how: "All into a vein every 3 weeks." },
      ],
      design: "Randomised · open-label · about 600 people",
      length: null,
      sites: [
        { name: "Barts and the London NHS Trust", city: "London", mi: 1 },
        { name: "Sarah Cannon Research Institute", city: "London", mi: 2 },
        { name: "Royal Marsden Hospital – Fulham", city: "London", mi: 4 },
        { name: "Royal Marsden NHS Foundation Trust", city: "Sutton", mi: 12 },
      ],
      sitesNote: "8 more UK sites, the nearest in Maidstone (about 32 mi).",
      crit: [
        { id: "kra-1", text: "ECOG 0 or 1", facts: ["ecog"] },
        { id: "kra-2", text: "Advanced nonsquamous lung cancer, not for curative treatment", facts: ["diag", "stage"] },
        { id: "kra-3", text: "Measurable disease on scans (RECIST 1.1)", facts: ["measurable"] },
        { id: "kra-4", text: "No cancer treatment yet for advanced disease", facts: ["treat"] },
        { id: "kra-5", text: "A KRAS G12C change, documented", needs: "kras" },
        { id: "kra-6", text: "PD-L1 status documented (any result)", needs: "pdl1" },
        { id: "kra-7", text: "Adequate organ function", stale: "Needs recent blood tests · yours are from 18 Sep" },
        { id: "kra-8", text: "No second driver change with a targeted treatment", needs: "drivers" },
        { id: "kra-9", text: "No brain metastases that are untreated or causing symptoms", facts: ["brain"] },
        { id: "kra-10", text: "No earlier KRAS G12C or pan-RAS medicine", facts: ["treat"] },
      ] },
  ];
  const byId = Object.fromEntries(STUDIES.map((s) => [s.id, s]));
  const NEEDED = STUDIES.reduce((a, st) => a + st.crit.filter((c) => c.needs).length, 0);

  /* ======================= Derived state (never scored) ======================= */
  const stOf = (c, doc) => (c.facts ? "supported" : c.needs ? (doc ? "supported" : "unknown") : c.review ? "needs_review" : "unknown");
  const pendOf = (c, doc) => !!(c.pending && doc);
  function tally(st, doc) {
    const n = { m: 0, o: 0, r: 0 };
    st.crit.forEach((c) => { const s = stOf(c, doc); if (s === "supported") n.m++; else if (s === "unknown") n.o++; else n.r++; });
    return n;
  }
  const status = (st, doc) => { const n = tally(st, doc); return n.o ? "needs_evidence" : n.r ? "needs_review" : "ready"; };
  const STATUS = { needs_evidence: "Waiting for information", needs_review: "A clinician checks some points", ready: "Ready for the study team to review" };
  const STATUS_GLYPH = { needs_evidence: "unknown", needs_review: "needs_review", ready: "supported" };
  const nearest = (st) => st.sites.filter((s) => !s.closed).reduce((a, b) => (b.mi < a.mi ? b : a));
  const inRange = (st) => nearest(st).mi <= S.travel;
  function sortedIds() {
    return STUDIES.filter((s) => !S.removed[s.id]).sort((a, b) =>
      (inRange(b) - inRange(a)) || (tally(a, S.doc).o - tally(b, S.doc).o) || (nearest(a).mi - nearest(b).mi) || (STUDIES.indexOf(a) - STUDIES.indexOf(b))
    ).map((s) => s.id);
  }
  const visibleIds = () => sortedIds().filter((id) => !S.savedOnly || S.saved.includes(id));

  /* ======================= State ======================= */
  let S;
  const seed = () => ({ view: "", doc: false, receipt: null, travel: 60, days: ["Mon", "Tue", "Thu"], saved: [], savedOnly: false, removed: {}, interest: {}, hl: null, setasideOpen: false });
  const cards = {};
  let threads = {};
  let docBusy = false;

  /* ======================= Focus ======================= */
  let focusSeq = 0;
  const lost = () => { const a = document.activeElement; return !a || a === document.body || !a.getClientRects().length; };
  function focusEl(el) {
    if (!el) return false;
    const n = ++focusSeq;
    el.focus({ preventScroll: true });
    if (document.activeElement === el) {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: "nearest" });
      return true;
    }
    requestAnimationFrame(() => { if (n === focusSeq && lost()) el.focus(); });
    setTimeout(() => { if (n === focusSeq && lost()) el.focus(); }, 60);
    return false;
  }
  const focusFirst = (...els) => focusEl(els.find((e) => shown(e)));
  const tabEl = () => $("#tab-" + (S.view || "profile"));

  /* ======================= Profile ======================= */
  const clockGl = (label) => '<span class="clockgl" role="img" aria-label="' + (label || "Outdated") + '">' + K.icon("clock") + "</span>";
  const docRef = (d) => '<span class="fact__doc">' + K.icon("doc") + esc(d.title) + "</span><span>" + esc(d.date) + "</span>";
  const docChip = (id, d) => '<span class="doc" data-doc="' + id + '">' + K.icon("doc") + "<span>" + esc(d.title) + '</span><span class="mono">' + esc(d.date) + "</span>" +
    (d.stale ? '<span class="doc__clock" role="img" aria-label="Outdated">' + K.icon("clock") + "</span>" : "") + "</span>";

  function buildProfile() {
    $("#facts").innerHTML = FACTS.map((f) =>
      '<li class="fact" id="fact-' + f.key + '" tabindex="-1" data-key="' + f.key + '">' +
      '<span class="fact__gl">' + (f.stale ? clockGl() : K.glyph("supported", "On record")) + "</span>" +
      '<span class="fact__label">' + esc(f.label) + '</span><span class="fact__value">' + esc(f.value) + "</span>" +
      (f.stale ? '<span class="fact__stale">' + esc(f.stale) + "</span>" : "") +
      '<span class="fact__src">' + docRef(f.doc) + "</span></li>").join("");
    $("#slots").innerHTML = SLOTS.map((s) =>
      '<li class="fact slot" id="fact-' + s.key + '" tabindex="-1" data-key="' + s.key + '"><span class="fact__gl"></span><span class="fact__label">' + esc(s.label) + '</span><span class="fact__value"></span><span class="fact__src"></span></li>').join("");
    $$("#slots .slot").forEach((el) => paintSlot(el, false, false));
    $("#slotgroup").dataset.filled = "";
    $$(".segctl").forEach((seg) => {
      seg.innerHTML = '<span class="segctl__thumb" aria-hidden="true"></span>' + TRAVEL.map((v) => '<label><input type="radio" name="travel-' + seg.dataset.travel + '" value="' + v + '"><span>' + v + "</span></label>").join("");
    });
    $("#days").innerHTML = DAYS.map((d) => '<button class="day" type="button" data-act="day" data-day="' + d + '" aria-pressed="false">' + d + "</button>").join("");
    $("#reading-host").innerHTML = ""; $("#receipt-host").innerHTML = ""; $("#docs").innerHTML = "";
    $("#drop").hidden = false; $("#drop").dataset.over = "false";
    closePicker(false);
  }
  function paintSlot(el, filled, anim) {
    const s = SLOT[el.dataset.key];
    const was = el.dataset.filled === "true";
    el.dataset.filled = String(filled);
    $(".fact__gl", el).innerHTML = filled ? K.glyph("supported", "On record") : K.glyph("unknown", "Waiting for the report");
    $(".fact__value", el).textContent = filled ? s.value : "Waiting for the report";
    $(".fact__src", el).innerHTML = filled ? docRef(MOLDOC) : "";
    if (anim && filled !== was && moving()) { K.replay($(".glyph", el), "tick", 260); K.replay($(".fact__value", el), "drop-in", 220); }
  }
  function paintProfile(animate) {
    const vis = animate && shown($("#view-profile"));
    $$("#slots .slot").forEach((el) => { if ((el.dataset.filled === "true") !== S.doc) paintSlot(el, S.doc, vis); });
    const g = $("#slotgroup");
    if (g.dataset.filled !== String(S.doc)) {
      g.dataset.filled = String(S.doc);
      $("#lbl-slots").textContent = S.doc ? "Molecular results" : "Waiting for";
      $("#slot-head").innerHTML = S.doc
        ? K.glyph("supported", "Received") + '<span class="slotgroup__title">' + MOLDOC.title + '</span><span class="chip chip--source">' + K.icon("doc") + '<span class="mono">' + MOLDOC.date + "</span></span>"
        : K.glyph("unknown", "Missing") + '<span class="slotgroup__title">' + MOLDOC.title + '</span><span class="chip chip--open">Requested 7 Nov</span>';
      if (vis && moving()) K.replay($(".glyph", $("#slot-head")), "tick", 260);
    }
    paintDocs(vis);
    paintHl();
    const i = TRAVEL.indexOf(S.travel);
    $$(".segctl").forEach((seg) => { seg.style.setProperty("--i", i); $$("input", seg).forEach((inp) => { inp.checked = Number(inp.value) === S.travel; }); });
    $$("#days .day").forEach((b) => b.setAttribute("aria-pressed", String(S.days.includes(b.dataset.day))));
    paintReceipt();
  }
  function paintDocs(anim) {
    const host = $("#docs");
    if (!host.children.length) host.innerHTML = docChip("ref", REF) + docChip("bloods", BLOODS);
    const mol = $('[data-doc="mol"]', host);
    if (S.doc && !mol) { host.insertAdjacentHTML("afterbegin", docChip("mol", MOLDOC)); if (anim && moving()) K.replay(host.firstElementChild, "drop-in", 220); }
    if (!S.doc && mol) mol.remove();
  }
  function paintHl() { $$("#view-profile .fact").forEach((el) => (el.dataset.hl = String(el.dataset.key === S.hl))); }

  function sortSegs(strip, st) {
    const idx = (el) => st.crit.findIndex((c) => c.id === el.dataset.flip);
    [...strip.children].sort((x, y) => ORDER[x.dataset.state] - ORDER[y.dataset.state] || idx(x) - idx(y)).forEach((s) => strip.appendChild(s));
  }
  function setSegs(strip, st, doc) {
    let changed = false;
    st.crit.forEach((c) => {
      const seg = $('[data-flip="' + c.id + '"]', strip), s = stOf(c, doc), p = String(pendOf(c, doc));
      if (seg.dataset.state !== s || seg.dataset.pending !== p) changed = true;
      seg.dataset.state = s; seg.dataset.pending = p;
    });
    return changed;
  }
  const segsHTML = (st) => st.crit.map((c) => '<span class="seg" data-flip="' + c.id + '" data-state="unknown"></span>').join("");

  /* Re-check receipt: every study re-assessed in sequence, counts roll down */
  function paintReceipt() {
    const host = $("#receipt-host");
    if (!S.receipt) { host.innerHTML = ""; return; }
    if (host.firstElementChild) return;
    host.innerHTML = '<section class="receipt" aria-labelledby="receipt-title"><div class="receipt__head"><h3 class="receipt__title" id="receipt-title" tabindex="-1">Studies re-checked</h3><span class="mono muted">From your molecular report</span></div>' +
      '<ul class="rlist">' + STUDIES.map((st) => '<li class="rrow" data-id="' + st.id + '"><span class="rrow__name">' + esc(st.acr) + '</span><span class="rrow__cnt mono"><b class="rc"></b> to check</span><span class="strip" aria-hidden="true">' + segsHTML(st) + "</span></li>").join("") + "</ul>" +
      '<button class="btn" type="button" data-act="go-opps">See opportunities ' + K.icon("arrowRight") + "</button></section>";
    const anim = moving();
    STUDIES.forEach((st, i) => {
      const row = $('.rrow[data-id="' + st.id + '"]', host), strip = $(".strip", row), rc = $(".rc", row);
      setSegs(strip, st, false); sortSegs(strip, st); K.roll(rc, S.receipt[st.id]);
      const go = () => {
        if (!rc.isConnected) return;
        setSegs(strip, st, true); K.roll(rc, tally(st, true).o);
        if (anim) setTimeout(() => K.flip(strip, () => sortSegs(strip, st), { dur: 300 }), 300); else sortSegs(strip, st);
      };
      if (anim) setTimeout(go, 280 + i * 200); else go();
    });
    if (anim) K.replay($(".receipt", host), "drop-in", 240);
  }

  /* ======================= Opportunity cards ======================= */
  function aboutHTML(st) {
    const n = nearest(st);
    return '<dl class="about">' +
      "<div><dt>What taking part involves</dt><dd>" + st.arms.map((a) => '<div class="arm"><div class="arm__tag">' + esc(a.tag) + '</div><div class="arm__name">' + esc(a.name) + '</div><div class="arm__how">' + esc(a.how) + "</div></div>").join("") +
        '<p class="about__design mono">' + esc(st.design) + "</p></dd></div>" +
      '<div><dt>Where in the UK</dt><dd><ul class="sites">' + st.sites.map((s) => '<li class="site"' + (s.closed ? ' data-closed="true"' : "") + '><span class="site__n">' + esc(s.name) + ", " + esc(s.city) +
        (s.closed ? ' <span class="sim">· no place at this site (simulated)</span>' : "") + '</span><span class="site__d mono">about ' + s.mi + " mi</span></li>").join("") + "</ul>" +
        (st.sitesNote ? '<p class="about__note mono">' + esc(st.sitesNote) + "</p>" : "") + "</dd></div>" +
      '<div><dt>Visit schedule</dt><dd class="nl">' + NL + "</dd></div>" +
      '<div><dt>Travel and support</dt><dd class="nl">' + NL + "</dd></div>" +
      "<div><dt>How long it lasts</dt><dd" + (st.length ? "" : ' class="nl"') + ">" + esc(st.length || NL) + "</dd></div>" +
      "<div><dt>Research team</dt><dd>Research team at " + esc(n.name) + ' <span class="sim">(simulated contact)</span></dd></div>' +
      '<div><dt>Source</dt><dd><a class="srclink" href="https://clinicaltrials.gov/study/' + st.nct + '" target="_blank" rel="noopener">clinicaltrials.gov/study/' + st.nct + '</a><br><span class="mono muted">' + SNAPSHOT + "</span></dd></div></dl>";
  }
  function buildCard(st) {
    const li = document.createElement("li");
    li.className = "opp"; li.dataset.id = st.id; li.dataset.flip = st.id; li.dataset.stage = "none";
    li.setAttribute("aria-labelledby", st.id + "-name");
    const n = nearest(st);
    const hasRv = st.crit.some((c) => c.review);
    li.innerHTML =
      '<button class="card__open" type="button" tabindex="-1" aria-hidden="true" data-act="about"></button>' +
      '<div class="opp__head"><div class="opp__titles"><h3 class="opp__name" id="' + st.id + '-name" tabindex="-1">' + esc(st.acr) + "</h3>" +
        '<div class="opp__meta mono"><a class="srclink" href="https://clinicaltrials.gov/study/' + st.nct + '" target="_blank" rel="noopener">' + st.nct + " ↗</a><span>" + st.phase + " · " + esc(st.sponsor) + "</span></div></div>" +
        '<button class="btn btn--ghost save" type="button" data-act="save" aria-pressed="false" aria-label="Save ' + esc(st.acr) + '">' + K.icon("bookmark") + '<span class="save__t">Save</span></button></div>' +
      '<div class="opp__status" aria-live="polite"></div>' +
      '<p class="opp__what">' + esc(st.what) + "</p>" +
      '<div class="opp__sum"><div class="opp__ev"><div class="strip" aria-hidden="true">' + segsHTML(st) + "</div>" +
        '<div class="counts mono"><span><b class="c-m"></b> match</span><span><b class="c-o"></b> to check</span>' + (hasRv ? '<span><b class="c-r"></b> for a clinician</span>' : "") + "</div></div>" +
        '<div class="near">' + K.icon("pin") + '<span class="near__t"></span></div>' +
        '<div class="away" hidden>' + K.icon("pin") + '<span class="away__t"></span><button class="linkbtn" type="button" data-act="focus-travel">Change</button></div></div>' +
      '<div class="checks"><div><h4 class="sec-label checks__label">Still to check</h4><ul class="tocheck"></ul></div>' +
        '<div><h4 class="sec-label checks__label">Why it was suggested</h4><ul class="why"></ul></div></div>' +
      '<button class="more" type="button" data-act="about" aria-expanded="false" aria-controls="' + st.id + '-about">' + K.icon("chevron") + "About taking part</button>" +
      '<div class="panel" id="' + st.id + '-about" data-open="false" inert><div class="panel__inner">' + aboutHTML(st) + "</div></div>" +
      '<div class="opp__acts"><button class="btn btn--primary act-interest" type="button" data-act="interest">I\'m interested — arrange a discussion</button>' +
        '<button class="btn act-not" type="button" data-act="not" aria-expanded="false">Not for me</button>' +
        '<div class="link" hidden><span class="link__line"></span><span class="link__team" role="img" aria-label="Research team at ' + esc(n.name) + '">' + K.icon("people") + "</span></div>" +
        '<span class="link__label mono" hidden></span></div>' +
      '<div class="sheet-host"></div>';
    return li;
  }
  function paintCard(st, animate) {
    const card = cards[st.id];
    if (animate && !shown(card)) { card._stale = true; return; }
    card._stale = false;
    const anim = animate && moving();
    const strip = $(".strip", card);
    const changed = setSegs(strip, st, S.doc);
    if (anim && changed) setTimeout(() => K.flip(strip, () => sortSegs(strip, st), { dur: 300 }), 300); else sortSegs(strip, st);
    const n = tally(st, S.doc);
    K.roll($(".c-m", card), n.m); K.roll($(".c-o", card), n.o);
    if ($(".c-r", card)) K.roll($(".c-r", card), n.r);
    paintStatus(card, st, anim);
    paintChecks(card, st, anim);
    paintPlace(card, st, anim);
    paintSave(card, st, anim);
    paintInterest(card, st, anim);
  }
  function paintStatus(card, st, anim) {
    const box = $(".opp__status", card), s = status(st, S.doc);
    if (box.dataset.s === s) return;
    const first = !box.dataset.s;
    box.dataset.s = s;
    const span = document.createElement("span");
    span.className = "st-" + s;
    span.innerHTML = '<span aria-hidden="true">' + K.glyph(STATUS_GLYPH[s], "") + "</span>" + esc(STATUS[s]);
    const old = [...box.children];
    if (!anim || first) { old.forEach((o) => o.remove()); box.appendChild(span); return; }
    old.forEach((o) => (o.dataset.out = "true"));
    setTimeout(() => old.forEach((o) => o.remove()), 260);
    span.dataset.out = "true"; box.appendChild(span); void span.offsetWidth; span.dataset.out = "false";
    K.replay($(".glyph", span), "tick", 260);
  }
  const openCrit = (st, doc) => st.crit.filter((c) => stOf(c, doc) !== "supported" || pendOf(c, doc));
  function tcRow(c, doc, isNew) {
    let kind, gl, src;
    if (pendOf(c, doc)) { kind = "pending"; gl = K.glyph("supported", "Supported, to be confirmed"); src = c.pending; }
    else if (c.needs) { kind = "needs"; gl = K.glyph("unknown"); src = MOLSRC; }
    else if (c.review) { kind = "review"; gl = K.glyph("needs_review"); src = c.review; }
    else { kind = "stale"; gl = clockGl(); src = c.stale; }
    return '<li class="tc' + (isNew ? " is-new" : "") + '" data-kind="' + kind + '" data-flip="' + c.id + '"><span class="tc__gl">' + gl + '</span><span class="tc__text">' + esc(c.text) + '</span><span class="tc__src">' + esc(src) + "</span></li>";
  }
  const chipLi = (flip, key, label, isNew) => '<li data-flip="' + flip + '"><button type="button" class="factchip' + (isNew ? " is-new" : "") + '" data-act="jump" data-key="' + key + '" aria-label="' + esc(label) + ': see it in your profile">' + K.glyph("supported", "") + "<span>" + esc(label) + "</span></button></li>";
  function whyChips(st, doc, fresh) {
    const seen = new Set(), out = [];
    st.crit.forEach((c) => {
      if (stOf(c, doc) !== "supported" || pendOf(c, doc)) return;
      if (c.facts) c.facts.forEach((k) => { if (!seen.has(k)) { seen.add(k); out.push(chipLi("f-" + k, k, FACT[k].chip, false)); } });
      else if (c.needs && !seen.has(c.needs)) { seen.add(c.needs); out.push(chipLi(c.id, c.needs, SLOT[c.needs].chip, fresh.has(c.id))); }
    });
    return out.join("");
  }
  function paintChecks(card, st, anim) {
    const doc = S.doc, open = openCrit(st, doc);
    const sig = open.map((c) => c.id + (pendOf(c, doc) ? "~p" : "")).join(",");
    const prev = card.dataset.sig;
    if (prev === sig) return;
    card.dataset.sig = sig;
    const fresh = new Set((prev == null ? [] : prev.split(",")).filter((x) => x && !x.endsWith("~p")));
    const mutate = () => {
      $(".tocheck", card).innerHTML = open.length ? open.map((c) => tcRow(c, doc, prev != null && pendOf(c, doc) && fresh.has(c.id))).join("") : '<li class="tc tc--none">Nothing left for you to send</li>';
      $(".why", card).innerHTML = whyChips(st, doc, prev == null ? new Set() : fresh);
    };
    if (anim && prev != null) {
      K.flip($(".checks", card), mutate, { dur: 300 });
      $$(".is-new .glyph", card).forEach((g) => K.replay(g, "tick", 260));
    } else mutate();
  }
  function paintPlace(card, st, anim) {
    const n = nearest(st);
    const closed = st.sites.filter((s) => s.closed && s.mi < n.mi);
    $(".near__t", card).innerHTML = esc(n.name) + " · about " + n.mi + " mi" + (closed.length ? ' <span class="sim mono">· ' + esc(closed[0].name) + ": no place (simulated)</span>" : "");
    const out = n.mi > S.travel, was = card.dataset.out === "true";
    card.dataset.out = String(out);
    const away = $(".away", card);
    $(".away__t", away).textContent = "Nearest open site is about " + n.mi + " mi away, beyond your " + S.travel + " mi";
    away.hidden = !out;
    if (out && !was && anim) K.replay(away, "drop-in", 220);
  }
  function paintSave(card, st, anim) {
    const on = S.saved.includes(st.id), b = $(".save", card);
    if (b.getAttribute("aria-pressed") === String(on)) return;
    b.setAttribute("aria-pressed", String(on));
    $(".save__t", b).textContent = on ? "Saved" : "Save";
    if (anim) K.replay($("svg", b), "tick", 260);
  }
  /* Interest: the button morphs into a sent state and a thin line draws to the research team */
  function paintInterest(card, st, anim) {
    const stage = S.interest[st.id] || "none", prev = card.dataset.stage || "none";
    if (prev === stage) return;
    card.dataset.stage = stage;
    const btn = $(".act-interest", card), not = $(".act-not", card), link = $(".link", card);
    const line = $(".link__line", link), team = $(".link__team", link), lab = $(".link__label", card);
    team.style.animation = "";
    const w0 = btn.getBoundingClientRect().width;
    const setNone = () => {
      btn.classList.remove("is-sent"); btn.classList.add("btn--primary");
      btn.textContent = "I'm interested — arrange a discussion"; btn.removeAttribute("aria-label");
      not.hidden = false; link.hidden = true; lab.hidden = true;
    };
    const morphFrom = (w) => { const w1 = btn.getBoundingClientRect().width; if (Math.abs(w1 - w) > 1) btn.animate([{ width: w + "px" }, { width: w1 + "px" }], { duration: 240, easing: EASE }); };
    if (stage === "none") {
      if (anim && shown(link)) {
        Promise.all([
          line.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: 200, easing: EASE, fill: "forwards" }).finished,
          team.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.7)" }], { duration: 160, easing: EASE, fill: "forwards" }).finished,
        ]).then(() => {
          line.getAnimations().forEach((a) => a.cancel()); team.getAnimations().forEach((a) => a.cancel());
          if (card.dataset.stage !== "none") return;
          const wa = btn.getBoundingClientRect().width; setNone(); morphFrom(wa);
        }).catch(() => {});
        return;
      }
      setNone(); return;
    }
    const t = stage === "offered" ? "Discussion offered" : "Interest sent";
    btn.classList.add("is-sent"); btn.classList.remove("btn--primary");
    btn.innerHTML = K.icon("check") + "<span>" + t + "</span>";
    btn.setAttribute("aria-label", t + ": open the conversation");
    not.hidden = true; link.hidden = false; lab.hidden = false;
    lab.textContent = "Research team at " + nearest(st).name + " · " + (stage === "offered" ? "said yes" : "reviewing") + " (simulated)";
    if (!anim) return;
    morphFrom(w0);
    K.replay($("svg", btn), "tick", 260);
    if (prev === "none") {
      line.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 320, delay: 120, easing: EASE, fill: "backwards" });
      team.animate([{ transform: "scale(.6)", opacity: 0 }, { transform: "scale(1.12)", opacity: 1, offset: 0.6 }, { transform: "scale(1)", opacity: 1 }], { duration: 260, delay: 400, easing: EASE, fill: "backwards" });
      lab.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 460, easing: EASE, fill: "backwards" });
    } else if (stage === "offered") K.replay(team, "okring", 320);
  }
  function toggleAbout(card, focusMore) {
    const btn = $(".more", card), panel = $(".panel", card);
    const open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(open));
    panel.dataset.open = String(open);
    panel.inert = !open;
    if (focusMore) focusEl(btn);
  }

  /* List order: FLIP so cards travel to their new place; leaving cards drop toward the bottom first */
  async function reconcileList(animate) {
    const list = $("#opp-list");
    const vis = animate && moving() && shown(list);
    const want = visibleIds();
    const present = $$(":scope > .opp", list).map((e) => e.dataset.id);
    if (present.length === want.length && present.every((id, i) => id === want[i])) return;
    const leaving = present.filter((id) => !want.includes(id));
    if (vis && leaving.length) {
      await Promise.all(leaving.map((id) => cards[id].animate([{ transform: "none", opacity: 1 }, { transform: "translateY(28px)", opacity: 0 }], { duration: 240, easing: EASE, fill: "forwards" }).finished.catch(() => {})));
    }
    const mutate = () => {
      const now = visibleIds();
      const active = document.activeElement;
      $$(":scope > .opp", list).forEach((el) => { el.getAnimations().forEach((a) => a.cancel()); if (!now.includes(el.dataset.id)) el.remove(); });
      let ref = list.firstElementChild;
      now.forEach((id) => { const el = cards[id]; if (el === ref) ref = ref.nextElementSibling; else list.insertBefore(el, ref); });
      now.forEach((id) => { if (cards[id]._stale && shown(cards[id])) paintCard(byId[id], false); });
      if (active && active !== document.activeElement && active.isConnected && lost()) active.focus({ preventScroll: true });
    };
    if (vis) K.flip(list, mutate, { sel: ":scope > .opp", dur: 300 }); else mutate();
  }
  function flushCards() {
    let i = 0;
    STUDIES.forEach((st) => {
      const c = cards[st.id];
      if (!c._stale || !c.isConnected) return;
      if (moving()) { const d = 140 + i++ * 160; setTimeout(() => paintCard(st, true), d); } else paintCard(st, true);
    });
  }
  function paintRail() {
    const ids = STUDIES.filter((s) => !S.removed[s.id]);
    const out = ids.filter((s) => !inRange(s)).length;
    $("#orail-sum").textContent = plural(ids.length, "study", "studies") + " · " + (out ? out + " beyond " + S.travel + " mi" : "all within " + S.travel + " mi");
    $("#saved-only").setAttribute("aria-pressed", String(S.savedOnly));
    K.roll($("#cnt-saved"), S.saved.length);
  }
  function paintSetAside() {
    const ids = STUDIES.filter((s) => S.removed[s.id]);
    const sec = $("#setaside");
    const sig = JSON.stringify([S.setasideOpen, ids.map((s) => s.id + S.removed[s.id])]);
    if (sec.dataset.sig === sig) return;
    sec.dataset.sig = sig;
    sec.hidden = !ids.length;
    const open = S.setasideOpen && ids.length > 0;
    $("#setaside-t").textContent = "Set aside (" + ids.length + ")";
    $("#setaside-btn").setAttribute("aria-expanded", String(open));
    const list = $("#setaside-list");
    list.hidden = !open;
    list.innerHTML = ids.map((s) => '<li class="setaside__row"><span class="setaside__name">' + esc(s.acr) + '</span><span class="setaside__why mono">' + esc(S.removed[s.id]) + '</span><button class="btn btn--ghost" type="button" data-act="restore" data-id="' + s.id + '" aria-label="Restore ' + esc(s.acr) + '">Restore</button></li>').join("");
  }
  const MARK = '<svg class="empty__mark" viewBox="0 0 64 30" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="13" cy="15" r="11"/><path d="M24 15h16" stroke-dasharray="3 3"/><circle cx="51" cy="15" r="11"/></svg>';
  function paintOppEmpty() {
    const e = $("#opp-empty");
    if (visibleIds().length) { e.hidden = true; e.dataset.kind = ""; return; }
    const kind = S.savedOnly && sortedIds().length ? "saved" : "removed";
    const n = STUDIES.filter((s) => S.removed[s.id]).length;
    const sig = kind + n;
    if (e.dataset.kind === sig && !e.hidden) return;
    e.dataset.kind = sig; e.hidden = false;
    e.innerHTML = MARK + (kind === "saved"
      ? '<h3 class="empty__title" id="opp-empty-title" tabindex="-1">No saved studies</h3><button class="btn" type="button" data-act="show-all">Show all studies</button>'
      : '<h3 class="empty__title" id="opp-empty-title" tabindex="-1">No studies in your list</h3><p class="empty__meta mono">' + n + ' set aside</p><button class="btn" type="button" data-act="show-setaside">Show set-aside studies</button>');
  }

  /* ======================= Conversations ======================= */
  function buildThread(st) {
    const el = document.createElement("article");
    el.className = "thread"; el.dataset.id = st.id; el.dataset.flip = "t-" + st.id;
    el.setAttribute("aria-labelledby", "t-" + st.id + "-name");
    el.innerHTML =
      '<div class="thread__main"><div class="thread__head"><h3 class="thread__name" id="t-' + st.id + '-name" tabindex="-1">' + esc(st.acr) + '</h3><span class="thread__nct mono">' + st.nct + "</span></div>" +
      '<div class="thread__team">' + K.icon("people") + "<span>Research team at " + esc(nearest(st).name) + '</span><span class="sim">(simulated)</span></div>' +
      '<ol class="steps">' + ["You're interested", "Team reviewing", "Discussion offered"].map((t) => '<li class="step"><span class="step__dot"></span><span class="step__label">' + t + '</span><span class="step__date mono"></span></li>').join("") + "</ol></div>" +
      '<div class="meetwrap"><div class="meet" data-met="false" aria-hidden="true"><span class="meet__line"></span><span class="meet__mark meet__mark--you" data-flip="you">You</span><span class="meet__mark meet__mark--team" data-flip="team">' + K.icon("people") + '</span></div><p class="meet__cap"></p></div>' +
      '<div class="thread__acts"><button type="button" class="simbtn" data-act="invite">Simulate: team invites</button><button type="button" class="btn btn--ghost" data-act="withdraw">Withdraw interest</button></div>';
    return el;
  }
  /* Mutual interest: the two marks travel to meet, once */
  function paintThread(el, stage, anim) {
    const prev = el.dataset.stage;
    if (prev === stage) return;
    el.dataset.stage = stage;
    const offered = stage === "offered";
    const steps = $$(".step", el);
    const set = (li, s, date) => {
      li.dataset.s = s;
      $(".step__dot", li).innerHTML = s === "done" ? K.glyph("supported", "Done") : '<span class="ring" aria-hidden="true"></span>';
      $(".step__date", li).textContent = date || "";
      if (s === "current") li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    };
    set(steps[0], "done", "7 Nov");
    set(steps[1], offered ? "done" : "current", "");
    set(steps[2], offered ? "done" : "todo", offered ? "7 Nov" : "");
    $(".simbtn", el).hidden = offered;
    $(".meet__cap", el).textContent = offered ? "You both said yes" : "Waiting for the team";
    const meet = $(".meet", el), team = $(".meet__mark--team", el);
    team.style.animation = "";
    if (meet.dataset.met === String(offered)) return;
    if (anim && prev) {
      K.flip(meet, () => { meet.dataset.met = String(offered); }, { dur: 320 });
      if (offered) { setTimeout(() => K.replay(team, "meet-ring", 320), 300); K.replay($(".glyph", steps[2]), "tick", 260); }
    } else meet.dataset.met = String(offered);
  }
  function reconcileThreads(animate) {
    const host = $("#threads");
    const vis = animate && moving() && shown($("#view-convos"));
    const want = STUDIES.filter((s) => S.interest[s.id]).map((s) => s.id);
    Object.keys(threads).forEach((id) => {
      if (want.includes(id)) return;
      const el = threads[id]; delete threads[id];
      if (vis) el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(16px)" }], { duration: 200, easing: EASE, fill: "forwards" }).finished
        .then(() => K.flip(host, () => el.remove(), { sel: ":scope > .thread" })).catch(() => el.remove());
      else el.remove();
    });
    want.forEach((id, i) => {
      let el = threads[id];
      if (!el) {
        el = threads[id] = buildThread(byId[id]);
        const after = want.slice(0, i).map((x) => threads[x]).filter((x) => x && x.isConnected).pop();
        host.insertBefore(el, after ? after.nextSibling : host.firstChild);
        if (vis) K.replay(el, "drop-in", 240);
      }
      paintThread(el, S.interest[id], vis);
    });
    $("#conv-empty").hidden = want.length > 0;
  }

  /* ======================= Tabs, views, head ======================= */
  function placeLine(anim) {
    const line = $("#tabs-line"), sel = $('#tabs [aria-selected="true"]');
    if (!sel) return;
    if (!anim) line.style.transition = "none";
    line.style.width = sel.offsetWidth + "px";
    line.style.transform = "translateX(" + sel.offsetLeft + "px)";
    if (!anim) { void line.offsetWidth; line.style.transition = ""; }
  }
  function goView(v, o) {
    o = o || {};
    const prev = S.view;
    if (prev === v && !o.force) return;
    S.view = v;
    closeLayers();
    $$("#tabs [role=tab]").forEach((t) => { const on = t.dataset.view === v; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; });
    placeLine(o.anim !== false);
    const to = $("#view-" + v), from = prev ? $("#view-" + prev) : null;
    const fade = o.anim !== false && moving() && from && from !== to && !from.hidden;
    $$(".view").forEach((x) => { x.getAnimations().forEach((a) => a.cancel()); if (x !== to && !(fade && x === from)) { x.hidden = true; x.inert = false; } });
    to.hidden = false; to.inert = false;
    if (fade) {
      from.inert = true;
      const settle = () => { if (S.view === prev || from.hidden) return; from.hidden = true; from.inert = false; from.getAnimations().forEach((a) => a.cancel()); };
      from.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: EASE, fill: "forwards" }).finished.then(settle).catch(() => {});
      setTimeout(settle, 220);
      to.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: EASE });
    }
    const top = $("#tabs").getBoundingClientRect().top;
    if (top < 0) window.scrollTo(0, window.scrollY + top - 8);
    if (v !== "profile" && S.hl) { S.hl = null; paintHl(); }
    if (v === "opps") flushCards();
  }
  function paintTabs() {
    K.roll($("#cnt-opps"), STUDIES.filter((s) => !S.removed[s.id]).length);
    K.roll($("#cnt-convos"), Object.keys(S.interest).length);
  }
  function paintNext(anim) {
    const b = $("#next"), mode = S.doc ? "done" : "wait";
    if (b.dataset.mode === mode) return;
    const first = !b.dataset.mode;
    b.dataset.mode = mode;
    b.innerHTML = '<span class="agent__mark">' + K.icon(S.doc ? "check" : "doc") + '</span><span class="agent__body"><span class="agent__label">' + (S.doc ? "Received" : "Waiting for") + '</span><span class="agent__head">' + MOLDOC.title + '</span><span class="agent__sub">' +
      (S.doc ? MOLDOC.date + " · " + NEEDED + " checks resolved in " + STUDIES.length + " studies" : "Requested 7 Nov · needed for " + NEEDED + " checks in " + STUDIES.length + " studies") + "</span></span>";
    if (anim && !first && moving()) K.replay($(".agent__mark", b), "tick", 260);
  }

  function sync(animate) {
    paintProfile(animate);
    STUDIES.forEach((st) => paintCard(st, animate));
    paintRail();
    const p = reconcileList(animate);
    paintSetAside(); paintOppEmpty();
    reconcileThreads(animate);
    paintTabs(); paintNext(animate);
    return p;
  }

  /* ======================= Floating layers (one at a time) ======================= */
  function openPicker() {
    closeLayers();
    const p = $("#picker");
    p.innerHTML = '<button class="picker__item" type="button" data-act="add-doc" draggable="true"' + (S.doc ? " disabled" : "") + ">" + K.icon("doc") +
      '<span class="picker__t">' + MOLDOC.title + '</span><span class="picker__m mono">' + (S.doc ? "Added " + MOLDOC.date : "SYN-0417 · " + MOLDOC.date) + '<span class="synthetic">Synthetic</span></span></button>';
    p.hidden = false; $("#choose").setAttribute("aria-expanded", "true");
    if (!S.doc) focusEl($(".picker__item", p));
  }
  function closePicker(focusBack) {
    const p = $("#picker");
    if (p.hidden) return;
    p.hidden = true; $("#choose").setAttribute("aria-expanded", "false");
    if (focusBack) focusEl($("#choose"));
  }
  function openSheet(id) {
    closeLayers();
    const card = cards[id], st = byId[id];
    const host = $(".sheet-host", card);
    host.innerHTML = '<form class="inline" data-sheet="' + id + '" novalidate><fieldset><legend>Reason</legend><div class="reasons">' +
      REASONS.map((r) => '<label class="reason"><input type="radio" name="reason-' + id + '" value="' + esc(r) + '">' + esc(r) + "</label>").join("") + "</div></fieldset>" +
      '<div class="inline__alt" hidden><button type="button" class="btn" data-act="travel-instead">' + K.icon("pin") + "Change travel distance instead</button></div>" +
      '<div class="inline__acts"><button type="button" class="btn btn--ghost" data-act="sheet-cancel">Cancel</button><button type="submit" class="btn btn--primary" disabled>Remove ' + esc(st.acr) + "</button></div></form>";
    const f = $("form", host);
    $(".act-not", card).setAttribute("aria-expanded", "true");
    if (moving()) K.replay(f, "drop-in", 240);
    f.addEventListener("change", () => {
      const v = ($("input:checked", f) || {}).value || "";
      $('button[type="submit"]', f).disabled = !v;
      const alt = $(".inline__alt", f), was = alt.hidden;
      alt.hidden = v !== "Too far to travel";
      if (was && !alt.hidden && moving()) K.replay(alt, "drop-in", 220);
    });
    f.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.type === "radio") { e.preventDefault(); if (!$('button[type="submit"]', f).disabled) f.requestSubmit(); } });
    f.addEventListener("submit", (e) => { e.preventDefault(); const r = $("input:checked", f); if (r) removeStudy(id, r.value); });
    focusEl($("input", f));
  }
  function closeSheet(focusBack) {
    const f = $("form.inline");
    if (!f) return;
    const card = cards[f.dataset.sheet];
    f.remove();
    $(".act-not", card).setAttribute("aria-expanded", "false");
    if (focusBack) focusEl($(".act-not", card));
  }
  function closeLayers() { closePicker(false); closeSheet(false); }

  /* ======================= Actions ======================= */
  /* 1. Document → profile: facts condense out of the report into their slots, every study is re-checked */
  async function addDoc() {
    if (S.doc || docBusy) return;
    docBusy = true;
    closeLayers();
    if (S.view !== "profile") goView("profile", { anim: false });
    const before = Object.fromEntries(STUDIES.map((st) => [st.id, tally(st, false).o]));
    const drop = $("#drop"), host = $("#reading-host");
    host.innerHTML = '<div class="reading" tabindex="-1" aria-label="Reading the ' + MOLDOC.title + '"><div class="reading__head">' + K.icon("doc") + '<span class="reading__title">' + MOLDOC.title + '</span><span class="mono muted">' + MOLDOC.date + '</span><span class="synthetic">Synthetic</span></div>' +
      SLOTS.map((s) => '<div class="passage" data-p="' + s.key + '">' + esc(s.passage) + "</div>").join("") + "</div>";
    const reading = host.firstElementChild;
    drop.hidden = true;
    focusEl(reading);
    if (moving()) {
      K.replay(reading, "drop-in", 240);
      const g = $("#slotgroup").getBoundingClientRect(), r = reading.getBoundingClientRect();
      if (g.top < 56 || r.bottom > innerHeight - 72) window.scrollBy(0, g.top - 72);
      await K.wait(260);
    }
    for (const s of SLOTS) {
      const line = $('[data-p="' + s.key + '"]', reading), slot = $("#fact-" + s.key);
      line.classList.add("is-hit");
      await K.wait(150);
      await K.flyTo(line, $(".fact__value", slot), { dur: 320 });
      paintSlot(slot, true, true);
      line.classList.remove("is-hit"); line.classList.add("is-done");
      await K.wait(90);
    }
    S.doc = true; S.receipt = before;
    paintDocs(false);
    const chip = $('#docs [data-doc="mol"]');
    if (moving() && chip) { chip.style.opacity = "0"; await K.flyTo(reading, chip, { dur: 280 }); chip.style.opacity = ""; K.replay(chip, "drop-in", 200); }
    host.innerHTML = ""; drop.hidden = false;
    sync(true);
    focusEl($("#receipt-title"));
    const after = STUDIES.reduce((a, st) => a + tally(st, true).o, 0), was = STUDIES.reduce((a, st) => a + before[st.id], 0);
    K.toast({ msg: "3 facts added from your molecular report", sub: (was - after) + " checks resolved across " + STUDIES.length + " studies", icon: "doc",
      action: { label: "Undo", run: () => { S.doc = false; S.receipt = null; sync(true); focusFirst($("#choose"), tabEl()); } } });
    docBusy = false;
  }
  /* 2. Interest, before any invitation */
  function interest(id) {
    const st = byId[id];
    if (S.interest[id]) { goView("convos"); focusEl($("#t-" + id + "-name")); return; }
    closeLayers();
    S.interest[id] = "reviewing";
    sync(true);
    focusEl($(".act-interest", cards[id]));
    K.toast({ msg: "Interest sent to the " + st.acr + " team", sub: "Research team at " + nearest(st).name + " · simulated", icon: "send",
      action: { label: "Undo", run: () => { delete S.interest[id]; sync(true); focusFirst($(".act-interest", cards[id]), tabEl()); } } });
  }
  /* 3. Mutual interest (board control) */
  function invite(id) {
    if (S.interest[id] !== "reviewing") return;
    const st = byId[id];
    S.interest[id] = "offered";
    sync(true);
    focusEl($("#t-" + id + "-name"));
    K.toast({ msg: "The " + st.acr + " team offered a discussion", sub: "Simulated · you both said yes", icon: "chat",
      action: { label: "Undo", run: () => { if (S.interest[id] === "offered") S.interest[id] = "reviewing"; sync(true); focusFirst(threads[id] && $(".simbtn", threads[id]), tabEl()); } } });
  }
  function withdraw(id) {
    const st = byId[id], prev = S.interest[id];
    if (!prev) return;
    const order = STUDIES.filter((s) => S.interest[s.id]).map((s) => s.id), i = order.indexOf(id);
    delete S.interest[id];
    sync(true);
    const rest = order.filter((x) => x !== id), nx = rest[Math.min(i, rest.length - 1)];
    focusFirst(nx && $("#t-" + nx + "-name"), $("#conv-empty-title"), tabEl());
    K.toast({ msg: "Interest withdrawn · " + st.acr, sub: "Simulated", icon: "undo",
      action: { label: "Undo", run: () => { S.interest[id] = prev; sync(true); focusFirst($("#t-" + id + "-name"), tabEl()); } } });
  }
  /* 4. Not for me: the card leaves toward the bottom, the list closes the gap */
  function removeStudy(id, reason) {
    const st = byId[id];
    const i = visibleIds().indexOf(id);
    closeSheet(false);
    S.removed[id] = reason;
    const after = visibleIds(), nx = after[Math.min(i, after.length - 1)];
    if (nx) focusEl($("#" + nx + "-name"));
    sync(true).then(() => { if (!nx) focusFirst($("#opp-empty-title"), tabEl()); });
    K.toast({ msg: st.acr + " removed from your list", sub: "Reason: " + reason, icon: "x",
      action: { label: "Undo", run: () => { delete S.removed[id]; sync(true).then(() => focusFirst($("#" + id + "-name"), tabEl())); } } });
  }
  function restore(id) {
    const st = byId[id], reason = S.removed[id];
    if (!reason) return;
    delete S.removed[id];
    sync(true).then(() => focusFirst($("#" + id + "-name"), tabEl()));
    K.toast({ msg: st.acr + " is back in your list", icon: "undo",
      action: { label: "Undo", run: () => { S.removed[id] = reason; sync(true).then(() => focusFirst($("#opp-empty-title"), $('#setaside-list [data-act="restore"]'), tabEl())); } } });
  }
  /* 5. Travel preference: re-sorts, dims what is out of range (never hides it) */
  function setTravel(v, which) {
    if (S.travel === v) return;
    const prev = S.travel;
    S.travel = v;
    sync(true);
    const ids = STUDIES.filter((s) => !S.removed[s.id]), inN = ids.filter(inRange).length;
    K.toast({ msg: "Travel distance set to " + v + " mi", sub: inN + " of " + plural(ids.length, "study has", "studies have") + " an open site in range", icon: "pin",
      action: { label: "Undo", run: () => { S.travel = prev; sync(true); focusFirst($('.segctl[data-travel="' + which + '"] input:checked'), tabEl()); } } });
  }
  function focusTravel() {
    if (S.view !== "opps") goView("opps");
    const seg = $('.segctl[data-travel="o"]');
    focusEl($("input:checked", seg));
    if (moving()) K.replay(seg, "ring", 320);
  }
  function toggleDay(d, btn) {
    const prev = S.days.slice();
    S.days = S.days.includes(d) ? S.days.filter((x) => x !== d) : DAYS.filter((x) => x === d || S.days.includes(x));
    sync(true);
    if (moving()) K.replay(btn, "tick", 220);
    K.toast({ msg: "Days available updated", sub: S.days.join(" · ") || "No days chosen", icon: "check",
      action: { label: "Undo", run: () => { S.days = prev; sync(true); focusEl(btn); } } });
  }
  function toggleSave(id) {
    const st = byId[id], was = S.saved.includes(id);
    S.saved = was ? S.saved.filter((x) => x !== id) : S.saved.concat(id);
    sync(true);
    K.toast({ msg: (was ? "Removed from saved · " : "Saved · ") + st.acr, icon: "bookmark",
      action: { label: "Undo", run: () => { S.saved = was ? S.saved.concat(id) : S.saved.filter((x) => x !== id); sync(true).then(() => focusFirst($(".save", cards[id]), $("#saved-only"), tabEl())); } } });
  }
  function jump(key) {
    goView("profile");
    S.hl = key; paintHl();
    const row = $("#fact-" + key);
    row.scrollIntoView({ block: "center" });
    focusEl(row);
  }

  /* ======================= Events ======================= */
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!$("#picker").hidden && !e.target.closest("#drop")) closePicker(false);
    if (!b || b.disabled) return;
    const card = b.closest(".opp"), th = b.closest(".thread");
    const id = card ? card.dataset.id : th ? th.dataset.id : null;
    switch (b.dataset.act) {
      case "picker": if ($("#picker").hidden) openPicker(); else closePicker(true); break;
      case "add-doc": addDoc(); break;
      case "go-slots": goView("profile"); focusEl($("#slotgroup")); $("#slotgroup").scrollIntoView({ block: "nearest" }); break;
      case "go-opps": goView("opps"); focusFirst(visibleIds()[0] && $("#" + visibleIds()[0] + "-name"), tabEl()); break;
      case "about": closeLayers(); toggleAbout(card, b.classList.contains("card__open")); break;
      case "save": toggleSave(id); break;
      case "interest": interest(id); break;
      case "not": if ($("form.inline", card)) closeSheet(true); else openSheet(id); break;
      case "sheet-cancel": closeSheet(true); break;
      case "travel-instead": closeSheet(false); focusTravel(); break;
      case "focus-travel": focusTravel(); break;
      case "jump": jump(b.dataset.key); break;
      case "invite": invite(id); break;
      case "withdraw": withdraw(id); break;
      case "day": toggleDay(b.dataset.day, b); break;
      case "saved-only": S.savedOnly = !S.savedOnly; sync(true); break;
      case "show-all": S.savedOnly = false; sync(true); focusFirst(visibleIds()[0] && $("#" + visibleIds()[0] + "-name"), tabEl()); break;
      case "setaside": S.setasideOpen = !S.setasideOpen; paintSetAside(); break;
      case "show-setaside": S.setasideOpen = true; paintSetAside(); focusFirst($('#setaside-list [data-act="restore"]'), tabEl()); break;
      case "restore": restore(b.dataset.id); break;
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name && t.name.startsWith("travel-")) setTravel(Number(t.value), t.name.slice(7));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#picker").hidden) { e.preventDefault(); closePicker(true); return; }
    if ($("form.inline")) { e.preventDefault(); closeSheet(true); }
  });
  $("#tabs").addEventListener("click", (e) => { const t = e.target.closest("[role=tab]"); if (t) goView(t.dataset.view); });
  $("#tabs").addEventListener("keydown", (e) => {
    const tabs = $$("#tabs [role=tab]"), i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const j = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault(); tabs[j].focus(); goView(tabs[j].dataset.view);
  });
  const dropEl = $("#drop");
  dropEl.addEventListener("dragover", (e) => { e.preventDefault(); dropEl.dataset.over = "true"; });
  dropEl.addEventListener("dragleave", (e) => { if (!dropEl.contains(e.relatedTarget)) dropEl.dataset.over = "false"; });
  dropEl.addEventListener("drop", (e) => {
    e.preventDefault(); dropEl.dataset.over = "false";
    const dt = e.dataTransfer;
    if (dt && [...dt.types].includes("text/x-relay-doc")) { addDoc(); return; }
    if (dt && dt.files && dt.files.length) K.toast({ msg: "This board only reads synthetic documents", sub: "Nothing was uploaded", icon: "x", action: { label: "Choose one", doneLabel: "Opened", run: () => openPicker() } });
  });
  $("#picker").addEventListener("dragstart", (e) => { const it = e.target.closest(".picker__item"); if (it && !it.disabled) e.dataTransfer.setData("text/x-relay-doc", "molecular"); });
  $("#nav-me").addEventListener("click", (e) => { e.preventDefault(); goView("profile"); focusEl(tabEl()); });
  window.addEventListener("resize", () => placeLine(false));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeLine(false));

  /* ======================= Board chrome (same as the coordinator board) ======================= */
  const THEMES = ["auto", "light", "dark"];
  let themeI = Math.max(0, THEMES.indexOf(params.get("theme") || "auto"));
  function paintChrome() {
    const th = THEMES[themeI];
    $("#ch-theme").innerHTML = K.icon(th === "dark" ? "moon" : th === "light" ? "sun" : "spark");
    $("#ch-theme").setAttribute("aria-label", "Theme: " + th);
    const on = document.documentElement.dataset.motion !== "off";
    $("#ch-motion").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 12c3-6 5-6 8 0s5 6 8 0"/>' + (on ? "" : '<path d="M4 20L20 4"/>') + "</svg>";
    $("#ch-motion").setAttribute("aria-pressed", String(on)); $("#ch-motion").setAttribute("aria-label", "Motion " + (on ? "on" : "off"));
    $("#ch-reset").innerHTML = K.icon("undo");
  }
  $("#ch-theme").addEventListener("click", () => { themeI = (themeI + 1) % 3; K.setTheme(THEMES[themeI]); paintChrome(); });
  $("#ch-motion").addEventListener("click", () => { K.setMotion(document.documentElement.dataset.motion === "off"); paintChrome(); });
  $("#ch-reset").addEventListener("click", () => { init(true); focusEl($("#tab-profile")); });

  /* ======================= Boot ======================= */
  $$("[data-icon]").forEach((el) => (el.outerHTML = K.icon(el.dataset.icon)));
  $(".brand").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 15a7 7 0 0112-5"/><path d="M19 9a7 7 0 01-12 5"/><path d="M15 6.5h2.6V3.9"/><path d="M9 17.5H6.4v2.6"/></svg>';

  // Seeded states for screenshots: ?scene=evidence|interest|mutual  ?view=profile|opps|convos  ?travel=15|30|60|100  ?open=<id>  ?sheet=<id>
  function applyScene() {
    const sc = params.get("scene");
    if (sc === "evidence" || sc === "interest" || sc === "mutual") S.doc = true;
    if (sc === "evidence") S.receipt = { cbk: 3, kan: 1, kra: 4 };
    if (sc === "interest") S.interest.cbk = "reviewing";
    if (sc === "mutual") S.interest.cbk = "offered";
    const t = Number(params.get("travel"));
    if (TRAVEL.includes(t)) S.travel = t;
  }
  function init(isReset) {
    $$(".toasts .toast").forEach((t) => t.remove());
    S = seed();
    docBusy = false;
    buildProfile();
    $("#opp-list").innerHTML = "";
    STUDIES.forEach((st) => { cards[st.id] = buildCard(st); });
    $("#threads").innerHTML = ""; threads = {};
    $("#next").dataset.mode = ""; $("#opp-empty").dataset.kind = ""; $("#setaside").dataset.sig = "";
    if (!isReset) applyScene();
    sync(false);
    const v = !isReset && VIEWS.includes(params.get("view")) ? params.get("view") : "profile";
    goView(v, { anim: false, force: true });
    if (!isReset && cards[params.get("open")]) toggleAbout(cards[params.get("open")], false);
    if (!isReset && cards[params.get("sheet")]) openSheet(params.get("sheet"));
    placeLine(false);
    requestAnimationFrame(() => placeLine(false));
    paintChrome();
  }

  /* ======================= Self-test ======================= */
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function until(fn, ms, what) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > (ms || 4000)) throw new Error("timed out: " + (typeof what === "function" ? what() : what || "")); await new Promise((r) => setTimeout(r, 15)); } }
  const press = (el, key) => el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  const focusOk = () => !lost();
  const live = () => $$(".toasts .toast:not([data-leaving])");
  const lastToast = () => live().pop();
  async function undo() { const t = lastToast(); assert(t, "no toast to undo"); const b = $(".toast__act", t); assert(b && b.textContent === "Undo", "toast has no Undo"); b.click(); await tick(); await tick(); }
  const ids = () => $$("#opp-list > .opp").map((e) => e.dataset.id);
  const tab = (v) => $("#tab-" + v);
  const reset = async () => { $("#ch-reset").click(); await tick(); };
  const cO = (id) => $(".c-o", cards[id]).textContent;
  async function pick(id, reason) {
    $(".act-not", cards[id]).click(); await tick();
    const r = $('form.inline input[value="' + reason + '"]'); assert(r, "reason radio " + reason);
    r.click(); await tick();
  }

  window.BoardSteps = [
    { name: "seeded: 3 studies from the registry snapshot with source links; no percentage or success rate", run: async () => {
      await reset(); tab("opps").click(); await tick();
      assert(ids().join() === "cbk,kra,kan", "seeded order at 60 mi (got " + ids().join() + ")");
      STUDIES.forEach((st) => assert($('.srclink[href="https://clinicaltrials.gov/study/' + st.nct + '"]', cards[st.id]), "source link for " + st.nct));
      const txt = document.body.textContent;
      assert(txt.includes(SNAPSHOT), "snapshot label");
      assert((txt.match(/Not listed in the registry — ask the team/g) || []).length >= 6, "registry gaps shown as Not listed");
      assert(!/\d\s*%/.test(txt) && !/success rate/i.test(txt), "no percentage or success rate");
      assert(cards.kan.dataset.out === "true" && !$(".away", cards.kan).hidden, "KANDLELIT dimmed and labelled at 60 mi");
      assert(cO("cbk") === "3" && cO("kra") === "4" && cO("kan") === "1", "to-check counts 3/4/1");
      assert($$(".synthetic").some(shown), "synthetic mark visible");
    } },
    { name: "tabs: ArrowRight, ArrowLeft, Home and End move between views", run: async () => {
      await reset();
      tab("profile").focus();
      press(tab("profile"), "ArrowRight"); await tick();
      assert(S.view === "opps" && document.activeElement === tab("opps") && !$("#view-opps").hidden && $("#view-profile").hidden, "ArrowRight → Opportunities");
      press(document.activeElement, "End"); await tick();
      assert(S.view === "convos" && tab("convos").getAttribute("aria-selected") === "true", "End → Conversations");
      press(document.activeElement, "ArrowRight"); await tick(); assert(S.view === "profile", "ArrowRight wraps to Profile");
      press(document.activeElement, "ArrowLeft"); await tick(); assert(S.view === "convos", "ArrowLeft wraps to Conversations");
      press(document.activeElement, "Home"); await tick(); assert(S.view === "profile" && document.activeElement === tab("profile"), "Home → Profile");
      assert(Math.abs(parseFloat($("#tabs-line").style.width) - tab("profile").offsetWidth) < 1, "underline under the selected tab");
    } },
    { name: "conversations: empty state, 'See opportunities' opens the list", run: async () => {
      await reset(); tab("convos").click(); await tick();
      assert(shown($("#conv-empty")) && !$("#threads").children.length, "empty state visible");
      $('#conv-empty [data-act="go-opps"]').click(); await tick();
      assert(S.view === "opps" && focusOk(), "Opportunities with focus placed");
    } },
    { name: "profile: dashed molecular slots, outdated bloods with a clock, preferences kept separate", run: async () => {
      await reset();
      assert($("#slotgroup").dataset.filled === "false" && $$("#slots .slot .glyph--unknown").length === 3, "3 dashed slots");
      assert(/Requested 7 Nov/.test($("#slot-head").textContent), "requested date");
      const labs = $("#fact-labs");
      assert($(".clockgl", labs) && /Outdated/.test(labs.textContent) && /18 Sep 2026/.test(labs.textContent), "bloods outdated, clock glyph");
      assert(/Referral summary/.test($("#fact-diag").textContent) && /30 Oct 2026/.test($("#fact-diag").textContent), "facts cite the referral summary");
      const prefs = $(".prefs");
      assert(!prefs.contains($("#facts")) && $(".segctl", prefs) && $("#days", prefs), "preferences in their own group");
      assert($$("#docs .doc").length === 2, "two documents on file");
    } },
    { name: "document picker: opens, Escape closes it and returns focus; outside click closes", run: async () => {
      await reset();
      $("#choose").click(); await tick();
      assert(!$("#picker").hidden && document.activeElement === $("#picker .picker__item"), "picker open, item focused");
      press(document.activeElement, "Escape"); await tick();
      assert($("#picker").hidden && document.activeElement === $("#choose") && !S.doc, "closed, focus on Choose, nothing added");
      $("#choose").click(); await tick(); document.body.click(); await tick();
      assert($("#picker").hidden, "outside click closes");
    } },
    { name: "doc → profile: three facts condense into their slots; studies re-checked 3→0, 1→0, 4→1", run: async () => {
      await reset();
      $("#choose").click(); await tick(); $("#picker .picker__item").click();
      await until(() => S.doc && $("#receipt-title"), 4000, "document read");
      assert($$("#slots .slot").every((s) => s.dataset.filled === "true") && $$("#slots .glyph--supported").length === 3, "slots filled and ticked");
      assert(/G12C/.test($("#fact-kras").textContent) && /Negative/.test($("#fact-pdl1").textContent), "values shown");
      assert($('#docs [data-doc="mol"]'), "report listed with documents");
      const rc = (id) => $('.rrow[data-id="' + id + '"] .rc').textContent;
      await until(() => rc("cbk") === "0" && rc("kan") === "0" && rc("kra") === "1", 2000, () => "receipt " + ["cbk", "kan", "kra"].map(rc).join("/"));
      assert($("#next").dataset.mode === "done", "head card says received");
      assert(/3 facts added/.test(lastToast().textContent), "toast confirms");
      assert(focusOk(), "focus placed");
    } },
    { name: "doc → opportunities: resolved checks move into 'Why it was suggested'; strips and statuses update", run: async () => {
      tab("opps").click(); await tick(); await tick();
      const c = cards.cbk;
      assert(cO("cbk") === "0" && cO("kan") === "0" && cO("kra") === "1", "to-check counts rolled down (" + ["cbk", "kan", "kra"].map(cO).join("/") + ")");
      assert($('.why [data-key="kras"]', c) && !$('.tocheck [data-flip="cbk-2"]', c), "KRAS moved into the reasons");
      assert($('.tocheck .tc[data-kind="pending"]', c), "PD-L1 stays visible until the study's lab confirms");
      assert($('.strip [data-flip="cbk-2"]', c).dataset.state === "supported", "strip segment filled");
      assert(/Ready for the study team/.test($(".opp__status", c).textContent), "CodeBreaK ready for review");
      assert(/clinician/.test($(".opp__status", cards.kan).textContent), "KANDLELIT: a clinician checks");
      assert(/Waiting for information/.test($(".opp__status", cards.kra).textContent) && $('.tocheck [data-kind="stale"]', cards.kra), "Krascendo still needs current bloods");
    } },
    { name: "doc: Undo empties the slots and restores every count", run: async () => {
      await undo();
      assert(!S.doc && $$("#slots .slot").every((s) => s.dataset.filled === "false"), "slots empty again");
      assert(!$('#docs [data-doc="mol"]') && !$("#receipt-title"), "report and receipt gone");
      assert(cO("cbk") === "3" && cO("kra") === "4" && cO("kan") === "1", "counts restored");
      assert($("#next").dataset.mode === "wait" && focusOk(), "head card waiting; focus placed");
    } },
    { name: "doc: a real file is refused; the synthetic report can be dropped in", run: async () => {
      await reset();
      const dz = $("#drop");
      const dt1 = new DataTransfer(); dt1.items.add(new File(["x"], "scan.pdf", { type: "application/pdf" }));
      dz.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt1, bubbles: true, cancelable: true }));
      assert(dz.dataset.over === "true", "drop zone highlights");
      dz.dispatchEvent(new DragEvent("drop", { dataTransfer: dt1, bubbles: true, cancelable: true })); await tick();
      assert(!S.doc && /synthetic/.test(lastToast().textContent) && dz.dataset.over === "false", "real file refused");
      const dt2 = new DataTransfer(); dt2.setData("text/x-relay-doc", "molecular");
      dz.dispatchEvent(new DragEvent("drop", { dataTransfer: dt2, bubbles: true, cancelable: true }));
      await until(() => S.doc && $("#receipt-title"), 4000, "dropped report read");
    } },
    { name: "a reason chip opens the matching fact in the profile", run: async () => {
      tab("opps").click(); await tick();
      $('.why [data-key="stage"]', cards.cbk).click(); await tick();
      assert(S.view === "profile" && document.activeElement === $("#fact-stage") && $("#fact-stage").dataset.hl === "true", "Stage fact focused and highlighted");
      tab("opps").click(); await tick();
      assert($("#fact-stage").dataset.hl === "false", "highlight clears on leaving");
    } },
    { name: "interest: button morphs, line drawn to the research team, Conversations count rolls to 1", run: async () => {
      await reset(); tab("opps").click(); await tick();
      const c = cards.cbk, b = $(".act-interest", c);
      b.click(); await tick();
      assert(S.interest.cbk === "reviewing" && c.dataset.stage === "reviewing", "interest recorded");
      assert(b.classList.contains("is-sent") && /Interest sent/.test(b.textContent), "button morphed");
      assert(shown($(".link", c)) && !shown($(".act-not", c)), "line to the team shown, Not for me hidden");
      assert($("#cnt-convos").textContent === "1" && document.activeElement === b, "count 1, focus kept");
      assert(/Interest sent/.test(lastToast().textContent), "toast");
    } },
    { name: "interest: Undo restores the card and the count", run: async () => {
      await undo();
      const c = cards.cbk, b = $(".act-interest", c);
      assert(!S.interest.cbk && c.dataset.stage === "none" && !b.classList.contains("is-sent") && !shown($(".link", c)) && shown($(".act-not", c)), "card restored");
      assert($("#cnt-convos").textContent === "0" && document.activeElement === b, "count 0, focus on the button");
    } },
    { name: "mutual: 'Simulate: team invites' offers a discussion and the two marks meet; Undo", run: async () => {
      await reset(); tab("opps").click(); await tick();
      $(".act-interest", cards.cbk).click(); await tick();
      $(".act-interest", cards.cbk).click(); await tick();
      assert(S.view === "convos" && document.activeElement === $("#t-cbk-name"), "sent pill opens the conversation");
      const th = $('.thread[data-id="cbk"]');
      assert(th.dataset.stage === "reviewing" && $('.step[data-s="current"] .step__label', th).textContent === "Team reviewing", "Team reviewing is current");
      assert($(".meet", th).dataset.met === "false", "marks apart");
      $(".simbtn", th).click(); await tick();
      assert(S.interest.cbk === "offered" && $(".meet", th).dataset.met === "true", "marks met");
      assert($$(".step", th).every((s) => s.dataset.s === "done") && /both said yes/.test(th.textContent), "Discussion offered");
      assert(focusOk(), "focus placed after the control hid");
      tab("opps").click(); await tick();
      assert(cards.cbk.dataset.stage === "offered" && /Discussion offered/.test($(".act-interest", cards.cbk).textContent), "card shows the offer when you return");
      tab("convos").click(); await tick();
      await undo();
      assert(S.interest.cbk === "reviewing" && $(".meet", th).dataset.met === "false" && shown($(".simbtn", th)) && focusOk(), "Undo returns to Team reviewing");
    } },
    { name: "withdraw interest removes the conversation; Undo brings it back", run: async () => {
      $('.thread[data-id="cbk"] [data-act="withdraw"]').click(); await tick();
      assert(!S.interest.cbk && !$('.thread[data-id="cbk"]') && !$("#conv-empty").hidden, "conversation gone, empty state");
      assert($("#cnt-convos").textContent === "0" && focusOk(), "count 0, focus placed");
      await undo();
      assert(S.interest.cbk === "reviewing" && $('.thread[data-id="cbk"]') && $("#conv-empty").hidden && focusOk(), "conversation restored");
    } },
    { name: "not for me: the reason sheet opens; Escape and Cancel close it and return focus", run: async () => {
      await reset(); tab("opps").click(); await tick();
      const n = $(".act-not", cards.kra);
      n.click(); await tick();
      const f = $("form.inline", cards.kra);
      assert(f && n.getAttribute("aria-expanded") === "true" && $$("input[type=radio]", f).length === 4, "sheet with four reasons");
      assert(document.activeElement === $("input", f) && $('button[type="submit"]', f).disabled, "first reason focused; remove waits for a reason");
      press(document.activeElement, "Escape"); await tick();
      assert(!$("form.inline") && document.activeElement === n && ids().length === 3, "Escape cancels, focus back");
      n.click(); await tick(); $('[data-act="sheet-cancel"]').click(); await tick();
      assert(!$("form.inline") && document.activeElement === n, "Cancel works too");
    } },
    { name: "not for me: 'Too far to travel' offers to change the travel distance instead", run: async () => {
      await pick("kra", "Too far to travel");
      const alt = $("form.inline .inline__alt");
      assert(alt && !alt.hidden, "travel offer shown");
      $('[data-act="travel-instead"]', alt).click(); await tick();
      assert(!$("form.inline") && ids().includes("kra"), "card kept");
      assert(document.activeElement.name === "travel-o" && document.activeElement.checked, "focus on the travel control");
    } },
    { name: "not for me: Enter submits the reason, the card leaves, Undo puts it back in the same place", run: async () => {
      const i = ids().indexOf("kra");
      await pick("kra", "Timing doesn't work");
      press($("form.inline input:checked"), "Enter"); await tick(); await tick();
      assert(S.removed.kra === "Timing doesn't work" && !ids().includes("kra"), "card left the list");
      assert(!$("#setaside").hidden && /Set aside \(1\)/.test($("#setaside").textContent) && $("#cnt-opps").textContent === "2", "set aside, tab count 2");
      assert(focusOk() && /Timing doesn't work/.test(lastToast().textContent), "focus moved on; toast shows the reason");
      await undo();
      assert(ids().indexOf("kra") === i && !S.removed.kra && document.activeElement === $("#kra-name"), "back in the same place, focused");
    } },
    { name: "travel: 100 mi re-sorts and un-dims KANDLELIT-007; 30 mi dims it again; Undo", run: async () => {
      await reset(); tab("opps").click(); await tick();
      $('.segctl[data-travel="o"] input[value="100"]').click(); await tick();
      assert(S.travel === 100 && ids().join() === "kan,cbk,kra", "re-sorted (" + ids().join() + ")");
      assert(cards.kan.dataset.out === "false" && $(".away", cards.kan).hidden, "KANDLELIT in range");
      assert($('.segctl[data-travel="p"] input[value="100"]').checked, "profile preference follows");
      $('.segctl[data-travel="o"] input[value="30"]').click(); await tick();
      assert(cards.kan.dataset.out === "true" && ids()[2] === "kan" && /beyond your 30 mi/.test($(".away", cards.kan).textContent) && ids().length === 3, "dimmed and labelled, not removed");
      await undo();
      assert(S.travel === 100 && ids()[0] === "kan" && focusOk(), "Undo restores 100 mi");
    } },
    { name: "travel set in Profile preferences drives the same list", run: async () => {
      tab("profile").click(); await tick();
      $('.segctl[data-travel="p"] input[value="60"]').click(); await tick();
      tab("opps").click(); await tick();
      assert(S.travel === 60 && ids().join() === "cbk,kra,kan" && cards.kan.dataset.out === "true", "list follows the preference");
    } },
    { name: "save: toggles, the Saved filter shows only saved studies, Undo", run: async () => {
      await reset(); tab("opps").click(); await tick();
      const s = $(".save", cards.kra);
      s.click(); await tick();
      assert(s.getAttribute("aria-pressed") === "true" && $("#cnt-saved").textContent === "1", "saved");
      $("#saved-only").click(); await tick();
      assert(ids().join() === "kra" && $("#saved-only").getAttribute("aria-pressed") === "true", "filter shows only saved");
      $("#saved-only").click(); await tick();
      assert(ids().length === 3, "filter off");
      await undo();
      assert(!S.saved.includes("kra") && s.getAttribute("aria-pressed") === "false" && document.activeElement === s, "Undo unsaves, focus on Save");
    } },
    { name: "empty state: every study set aside, then restored from the set-aside list; Undo", run: async () => {
      await reset(); tab("opps").click(); await tick();
      for (const id of ["cbk", "kra", "kan"]) { await pick(id, "Prefer another option"); press($("form.inline input:checked"), "Enter"); await tick(); await tick(); }
      assert(!ids().length && !$("#opp-empty").hidden && /No studies in your list/.test($("#opp-empty").textContent), "empty state");
      assert($("#cnt-opps").textContent === "0" && focusOk(), "count 0, focus placed");
      $('#opp-empty [data-act="show-setaside"]').click(); await tick();
      assert(!$("#setaside-list").hidden && $$("#setaside-list .setaside__row").length === 3, "set-aside list open");
      assert(document.activeElement.dataset.act === "restore", "focus on Restore");
      document.activeElement.click(); await tick(); await tick();
      assert(ids().length === 1 && $("#opp-empty").hidden && focusOk(), "one study back in the list");
      await undo();
      assert(!ids().length && focusOk(), "Undo sets it aside again");
    } },
    { name: "days available: toggle and Undo", run: async () => {
      await reset();
      const wed = $('#days [data-day="Wed"]');
      wed.click(); await tick();
      assert(wed.getAttribute("aria-pressed") === "true" && S.days.join() === "Mon,Tue,Wed,Thu", "Wednesday added in order");
      await undo();
      assert(wed.getAttribute("aria-pressed") === "false" && document.activeElement === wed, "Undo, focus back");
    } },
    { name: "board chrome: theme cycles, motion toggles, Reset restores the seed", run: async () => {
      const root = document.documentElement, start = themeI;
      for (let k = 1; k <= 3; k++) {
        $("#ch-theme").click();
        const th = THEMES[(start + k) % 3];
        assert(th === "auto" ? !root.dataset.theme : root.dataset.theme === th, "theme " + th);
      }
      $("#ch-motion").click(); assert(root.dataset.motion !== "off", "motion on");
      $("#ch-motion").click(); assert(root.dataset.motion === "off", "motion off");
      tab("opps").click(); await tick(); $(".act-interest", cards.cbk).click(); await tick();
      await reset();
      assert(!Object.keys(S.interest).length && S.view === "profile" && !S.doc && S.travel === 60 && $("#cnt-convos").textContent === "0" && !live().length, "seed restored");
    } },
    { name: "no horizontal scroll in any view at this width (with sheets and panels open)", run: async () => {
      await reset();
      const W = () => document.documentElement.scrollWidth;
      const heights = {};
      for (const v of VIEWS) { tab(v).click(); await tick(); heights[v] = document.documentElement.scrollHeight; assert(W() <= innerWidth, v + ": scrollWidth " + W() + " > " + innerWidth); }
      tab("opps").click(); await tick();
      $(".more", cards.cbk).click(); $(".act-not", cards.kra).click(); await tick();
      assert(W() <= innerWidth, "opps with details and sheet open: " + W());
      $(".act-interest", cards.cbk).click(); $(".act-interest", cards.cbk).click(); await tick();
      $(".simbtn", threads.cbk).click(); await tick();
      assert(W() <= innerWidth, "conversation with marks met: " + W());
      document.documentElement.dataset.heights = JSON.stringify(heights);
      document.documentElement.dataset.width = String(innerWidth);
    } },
  ];

  async function selftest() {
    const out = []; let pass = 0;
    for (const s of window.BoardSteps) {
      try { await s.run(); out.push("PASS " + s.name); pass++; } catch (e) { out.push("FAIL " + s.name + ": " + ((e && e.message) || e)); }
    }
    out.push("RESULT: " + pass + "/" + window.BoardSteps.length + " steps passed");
    $("#selftest-log").textContent = out.join("\n");
    document.documentElement.dataset.selftest = pass === window.BoardSteps.length ? "pass" : "fail";
  }

  init(false);
  if (SELFTEST) selftest();
})();
