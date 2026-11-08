/* TrialMatch protein view: the patient's driver protein in 3D, the change lit up, a drug in its pocket.
 *
 *   <script src="protein/protein-view.js"></script>           (small; loads nothing else until open)
 *   TMProtein.resolve(patientRecord, trial)  -> plain description of what would be shown
 *   TMProtein.open({record, trial, opener, theme: 'light'|'dark'|'auto', mode, onReady, onClose})
 *   TMProtein.close()
 *   TMProtein.mount(container, {record, trial, theme, resolved, onReady, surface}) -> {setMode, setTheme, destroy}
 *     Same stage, control, caption and honesty line inside a host element; no scrim, focus trap or Esc.
 *
 * On first open() it injects <script> tags for ../vendor/3Dmol-min.js and ./structures.js (relative to this
 * file), so it works from file:// with no fetch/XHR and no network. Honesty rules (see docs/3d-viewer-research.md):
 * every view names the crystal structure and says it is not this patient's tumour; the trial's drug is only
 * called the trial's drug when the trial names it. All classes use the pv- prefix.
 */
(function (root) {
  'use strict';

  var HAS_DOM = typeof document !== 'undefined';
  var SELF = HAS_DOM && document.currentScript ? document.currentScript.src : '';
  var BASE = SELF ? SELF.replace(/[^/]*$/, '') : 'protein/';
  var PATHS = { lib: BASE + '../vendor/3Dmol-min.js', data: BASE + 'structures.js', still: BASE + 'fallback/', body3d: BASE + 'body3d.js?v=1.0.3', targets: BASE + 'targets.js?v=1.0.0' };

  // ------------------------------------------------------------------ knowledge tables
  // Biomarker keys as in trialmatch/patients.py. Order = which driver is shown when several are positive
  // and the trial does not target any of them.
  var ORDER = ['EGFR', 'KRAS_G12C', 'KRAS_G12D', 'BRAF_V600E', 'ALK', 'ROS1', 'RET', 'MET_ex14'];
  var LABEL = { EGFR: 'EGFR', KRAS_G12C: 'KRAS G12C', KRAS_G12D: 'KRAS G12D', BRAF_V600E: 'BRAF V600E',
    ALK: 'ALK', ROS1: 'ROS1', RET: 'RET', MET_ex14: 'MET exon 14' };

  // Default structure per biomarker, and how its drug may be described when the trial does not use it.
  // approved: approved for this change (NSCLC); otherwise the label says the drug targets the change.
  var GENE = {
    KRAS_G12C: { pdb: '6OIM', gene: 'KRAS', change: 'G12C', focus: 'G12C', approved: true },
    KRAS_G12D: { pdb: '9CTB', gene: 'KRAS', change: 'G12D', focus: 'G12D', approved: false },
    EGFR: { pdb: '6JWL', gene: 'EGFR', change: '', focus: null, approved: true },
    BRAF_V600E: { pdb: '3OG7', gene: 'BRAF', change: 'V600E', focus: 'V600E', approved: false },
    ALK: { pdb: '4CLI', gene: 'ALK', change: 'fusion', focus: 'domain', approved: true, fusion: true },
    ROS1: { pdb: '3ZBF', gene: 'ROS1', change: 'fusion', focus: 'domain', approved: true, fusion: true },
    RET: { pdb: '7JU6', gene: 'RET', change: 'fusion', focus: 'domain', approved: true, fusion: true },
    MET_ex14: { pdb: '9SXJ', gene: 'MET', change: 'exon 14 skipping', focus: 'domain', approved: true }
  };

  // Drugs a trial may name. pdb: biomarker -> entry with this exact drug bound. Others are the same drug
  // class for those biomarkers (shown with the default structure and labelled as such).
  var DRUGS = [
    { name: 'Sotorasib', re: /sotorasib|\bAMG[\s-]?510\b/i, bm: ['KRAS_G12C'], pdb: { KRAS_G12C: '6OIM' } },
    { name: 'Adagrasib', re: /adagrasib|\bMRTX[\s-]?849\b/i, bm: ['KRAS_G12C'], pdb: { KRAS_G12C: '6UT0' } },
    { name: 'Divarasib', re: /divarasib|\bGDC[\s-]?6036\b/i, bm: ['KRAS_G12C'], pdb: { KRAS_G12C: '9DMM' } },
    { name: 'Calderasib', re: /calderasib|\bMK[\s-]?1084\b/i, bm: ['KRAS_G12C'], pdb: { KRAS_G12C: '8S8C' } },
    { name: 'Olomorasib', re: /olomorasib|\bLY3537982\b/i, bm: ['KRAS_G12C'] },
    { name: 'Glecirasib', re: /glecirasib|\bJAB[\s-]?21822\b/i, bm: ['KRAS_G12C'] },
    { name: 'Fulzerasib', re: /fulzerasib|\bGFH[\s-]?925\b/i, bm: ['KRAS_G12C'] },
    { name: 'Zoldonrasib', re: /zoldonrasib|\bRMC[\s-]?9805\b/i, bm: ['KRAS_G12D'], pdb: { KRAS_G12D: '9CTB' } },
    { name: 'Osimertinib', re: /osimertinib|\bAZD[\s-]?9291\b/i, bm: ['EGFR'], pdb: { EGFR: '6JWL' } },
    { name: 'Lazertinib', re: /lazertinib/i, bm: ['EGFR'] },
    { name: 'Furmonertinib', re: /furmonertinib|firmonertinib|alflutinib/i, bm: ['EGFR'] },
    { name: 'Aumolertinib', re: /aumolertinib|almonertinib/i, bm: ['EGFR'] },
    { name: 'Befotertinib', re: /befotertinib/i, bm: ['EGFR'] },
    { name: 'Sunvozertinib', re: /sunvozertinib/i, bm: ['EGFR'] },
    { name: 'Zipalertinib', re: /zipalertinib/i, bm: ['EGFR'] },
    { name: 'Afatinib', re: /afatinib/i, bm: ['EGFR'] },
    { name: 'Dacomitinib', re: /dacomitinib/i, bm: ['EGFR'] },
    { name: 'Gefitinib', re: /gefitinib/i, bm: ['EGFR'] },
    { name: 'Erlotinib', re: /erlotinib/i, bm: ['EGFR'] },
    { name: 'Lorlatinib', re: /lorlatinib|\bPF[\s-]?06463922\b/i, bm: ['ALK', 'ROS1'], pdb: { ALK: '4CLI' } },
    { name: 'Alectinib', re: /alectinib/i, bm: ['ALK'] },
    { name: 'Brigatinib', re: /brigatinib/i, bm: ['ALK'] },
    { name: 'Ensartinib', re: /ensartinib/i, bm: ['ALK'] },
    { name: 'Ceritinib', re: /ceritinib/i, bm: ['ALK'] },
    { name: 'Neladalkib', re: /neladalkib|\bNVL[\s-]?655\b/i, bm: ['ALK'] },
    { name: 'Crizotinib', re: /crizotinib/i, bm: ['ROS1', 'ALK', 'MET_ex14'], pdb: { ROS1: '3ZBF' } },
    { name: 'Entrectinib', re: /entrectinib/i, bm: ['ROS1'] },
    { name: 'Repotrectinib', re: /repotrectinib/i, bm: ['ROS1'] },
    { name: 'Taletrectinib', re: /taletrectinib/i, bm: ['ROS1'] },
    { name: 'Zidesamtinib', re: /zidesamtinib|\bNVL[\s-]?520\b/i, bm: ['ROS1'] },
    { name: 'Vemurafenib', re: /vemurafenib|\bPLX[\s-]?4032\b/i, bm: ['BRAF_V600E'], pdb: { BRAF_V600E: '3OG7' } },
    { name: 'Dabrafenib', re: /dabrafenib/i, bm: ['BRAF_V600E'] },
    { name: 'Encorafenib', re: /encorafenib/i, bm: ['BRAF_V600E'] },
    { name: 'Capmatinib', re: /capmatinib/i, bm: ['MET_ex14'], pdb: { MET_ex14: '9SXJ' } },
    { name: 'Tepotinib', re: /tepotinib/i, bm: ['MET_ex14'] },
    { name: 'Savolitinib', re: /savolitinib/i, bm: ['MET_ex14'] },
    { name: 'Selpercatinib', re: /selpercatinib/i, bm: ['RET'], pdb: { RET: '7JU6' } },
    { name: 'Pralsetinib', re: /pralsetinib/i, bm: ['RET'] }
  ];

  // Trials whose drug doesn't aim at a driver change still get a structure: the drug's own target (targets.js).
  // Each is a real crystal structure of that kind of drug on its target, labelled as such.
  var TARGETS = {
    PDL1: { pdb: '5X8M', gene: 'PD-L1', drug: 'Durvalumab', mine: /durvalumab/i, membrane: true,
      label: 'Durvalumab, a PD-L1 antibody: the kind of immunotherapy this trial uses',
      site: '<span class="pv-k">PD-L1</span>, which the cancer uses to switch immune cells off. Coral is where an antibody grips it',
      cell: '<span class="pv-k">PD-L1</span> sits on the cancer cell and switches immune cells off.', honest: 'The antibody is shown as its Fab arm.' },
    VEGF: { pdb: '1BJ1', gene: 'VEGF', drug: 'An anti-VEGF antibody', mine: null, membrane: false,
      label: 'An anti-VEGF antibody: the kind of blood-vessel blocker this trial adds',
      site: '<span class="pv-k">VEGF</span>, the signal a tumour sends to grow blood vessels. Coral is where the antibody covers it',
      cell: 'The tumour releases <span class="pv-k">VEGF</span> to grow new blood vessels.', honest: 'Two copies of VEGF, with one antibody Fab arm.' },
    EGFR_ECD: { pdb: '1YY9', gene: 'EGFR', drug: 'Cetuximab', mine: /cetuximab/i, membrane: true,
      label: 'Cetuximab, an antibody that grips EGFR\u2019s outer part, as this trial\u2019s antibody does',
      site: '<span class="pv-k">EGFR\u2019s outer part</span>, outside the cell. Coral is where an antibody grips it so EGFR can\u2019t switch on',
      cell: '<span class="pv-k">EGFR</span> sits in the cell\u2019s surface; this trial\u2019s antibody grips its outer part.', honest: 'Only EGFR\u2019s outer part is shown, with the antibody\u2019s Fab arm.' },
    TOP1: { pdb: '1K4T', gene: 'Topoisomerase I', drug: 'Topotecan', mine: /topotecan/i, membrane: false,
      label: 'Topotecan, from the same drug family as the payload this trial\u2019s antibody\u2013drug conjugate carries',
      site: '<span class="pv-k">Topoisomerase I</span> on DNA. It nicks DNA so the cell can copy it; coral is where the payload wedges in',
      cell: 'The payload works in the nucleus, on <span class="pv-k">topoisomerase I</span>.', honest: 'Shown on a 22-base-pair stretch of DNA.' }
  };
  var TARGET_DRUGS = [   // live registry trials: drug names -> target
    { key: 'PDL1', re: /pembrolizumab|nivolumab|atezolizumab|durvalumab|cemiplimab|tislelizumab|toripalimab|sintilimab|camrelizumab|ivonescimab|dostarlimab|serplulimab|sugemalimab|benmelstobart|\bPD-?L?1\b/i },
    { key: 'VEGF', re: /bevacizumab|ramucirumab|aflibercept|\bVEGF/i },
    { key: 'TOP1', re: /deruxtecan|govitecan|\bDXd\b|topotecan|irinotecan|exatecan/i },
    { key: 'EGFR_ECD', re: /amivantamab|cetuximab|necitumumab|panitumumab/i }
  ];
  function trialTarget(trial, drugs) {   // what the trial's drug aims at: a driver key (EGFR, KRAS_G12C...) or a TARGETS key
    if (trial && trial.target) return trial.target;
    if (drugs.length) return drugs[0].bm[0];
    var hay = trialText(trial), hit = TARGET_DRUGS.filter(function (t) { return t.re.test(hay); })[0];
    return hit ? hit.key : null;
  }

  var AA = { A: ['Ala', 'alanine'], R: ['Arg', 'arginine'], N: ['Asn', 'asparagine'], D: ['Asp', 'aspartate'],
    C: ['Cys', 'cysteine'], E: ['Glu', 'glutamate'], Q: ['Gln', 'glutamine'], G: ['Gly', 'glycine'],
    H: ['His', 'histidine'], I: ['Ile', 'isoleucine'], L: ['Leu', 'leucine'], K: ['Lys', 'lysine'],
    M: ['Met', 'methionine'], F: ['Phe', 'phenylalanine'], P: ['Pro', 'proline'], S: ['Ser', 'serine'],
    T: ['Thr', 'threonine'], W: ['Trp', 'tryptophan'], Y: ['Tyr', 'tyrosine'], V: ['Val', 'valine'] };
  var THREE = {};
  Object.keys(AA).forEach(function (k) { THREE[AA[k][0].toUpperCase()] = k; });
  var SENSITISING = /exon ?19|L858R|L861Q|G719|S768I/i;   // same rule as trialmatch/patients.py

  // ------------------------------------------------------------------ helpers
  function data() { return root.TM_STRUCTURES || null; }
  function meta(pdb) { var d = data(); return d && d[pdb] ? d[pdb].meta : null; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function res3(resn) { return resn.charAt(0) + resn.slice(1).toLowerCase(); }
  function fmtRes(r) {   // 2.551 -> "2.55", 2.2 -> "2.20" (decimal half-up, no float surprises)
    var v = Math.round(Math.round(r * 1000) / 10) / 100;
    return v.toFixed(2);
  }

  var residueCache = {};
  function residueMap(pdb) {   // "A:858" -> "ARG", parsed from the shipped PDB text (CA atoms)
    if (residueCache[pdb]) return residueCache[pdb];
    var d = data();
    if (!d || !d[pdb]) return null;
    var map = {};
    d[pdb].pdb.split('\n').forEach(function (l) {
      if (l.lastIndexOf('ATOM', 0) === 0 && l.substr(12, 4) === ' CA ') {
        map[l.charAt(21) + ':' + parseInt(l.substr(22, 4), 10)] = l.substr(17, 3).trim();
      }
    });
    residueCache[pdb] = map;
    return map;
  }

  function trialText(trial) {
    if (!trial) return '';
    var parts = [trial.title, trial.short, trial.officialTitle, trial.briefTitle];
    (trial.drugs || []).forEach(function (d) { parts.push(typeof d === 'string' ? d : (d && d.name)); });
    (trial.interventions || []).forEach(function (i) {
      if (!i) return;
      parts.push(i.name);
      (i.otherNames || []).forEach(function (n) { parts.push(n); });
    });
    return parts.filter(Boolean).join(' | ');
  }

  function trialDrugs(trial) {
    var hay = trialText(trial);
    return DRUGS.filter(function (d) { return d.re.test(hay); });
  }

  // ------------------------------------------------------------------ EGFR variant parsing
  // Reads the exact change from the record's evidence line (e.g. "EGFR: L861Q (clinical test)") when the
  // structured field only says "sensitising".
  function egfrVariants(rec) {
    var ev = (rec && rec.evidence && rec.evidence.EGFR) || '';
    var txt = String((rec && rec.biomarkers && rec.biomarkers.EGFR_variant) || ev).replace(/^EGFR:\s*/i, '');
    var out = [];
    if (/exon\s*19\s*del|\bdel\s*19\b|\b19\s*del\b|E746_A750del/i.test(txt)) {
      out.push({ key: 'ex19del', label: 'exon 19 deletion', sensitising: true });
    }
    var ins = /exon\s*20\s*ins/i.test(txt);
    var re = /\b([ACDEFGHIKLMNPQRSTVWY])(\d{3,4})(?:_([ACDEFGHIKLMNPQRSTVWY])(\d{3,4}))?(ins[A-Z]*|dup|del|[ACDEFGHIKLMNPQRSTVWYX*])?/g;
    var m;
    while ((m = re.exec(txt))) {
      if (!m[5] && !m[3]) continue;                       // a bare "A123" is not a change
      var tok = m[0];
      var pos = [+m[2]];
      if (m[4]) pos.push(+m[4]);
      var point = m[5] && m[5].length === 1 && !m[3];
      out.push({ key: point ? tok : 'pos' + pos.join('_'), token: tok, wt: m[1], pos: pos,
        to: point ? m[5] : null, kind: point ? 'point' : (/dup/.test(m[5] || '') ? 'dup' : 'ins'),
        sensitising: SENSITISING.test(tok), insertion: ins });
    }
    if (ins && !out.some(function (v) { return v.insertion; })) out.push({ key: 'ex20ins', label: 'exon 20 insertion', insertion: true });
    return out;
  }

  // ------------------------------------------------------------------ resolve
  function chipsFor(bm) {
    return ORDER.filter(function (k) { return bm[k] !== 'positive'; }).map(function (k) {
      return { key: k, label: LABEL[k], state: bm[k] === 'negative' ? 'negative' : 'unknown' };
    });
  }

  function chooseDrug(biomarker, drugs, g) {
    var forGene = drugs.filter(function (d) { return d.bm.indexOf(biomarker) >= 0; });
    var exact = forGene.filter(function (d) { return d.pdb && d.pdb[biomarker]; })[0];
    if (exact) return { pdb: exact.pdb[biomarker], relation: 'trial', trialDrug: exact.name };
    if (forGene.length) return { pdb: g.pdb, relation: 'class', trialDrug: forGene[0].name };
    return { pdb: g.pdb, relation: 'default', trialDrug: null };
  }

  function resolve(record, trial) {
    var bm = (record && record.biomarkers) || {};
    var positives = ORDER.filter(function (k) { return bm[k] === 'positive'; });
    var drugs = trialDrugs(trial);
    var base = { patient: record && record.id, trial: trial && (trial.nct || trial.nctId) || null,
      trialDrugs: drugs.map(function (d) { return d.name; }) };
    var tkey = trialTarget(trial, drugs);
    if (tkey && TARGETS[tkey]) return targetView(base, tkey, trial);
    if (tkey && GENE[tkey] && positives.indexOf(tkey) < 0) return changeElsewhere(base, tkey, drugs);
    if (!positives.length) {
      return extend(base, { kind: 'nodriver', title: { gene: 'No driver change found', change: '' },
        chips: chipsFor(bm),
        captions: { change: { text: 'Nothing to show in 3D until a driver change is found.' } },
        aria: 'No driver change on record. Tested negative: ' + chipsFor(bm).filter(function (c) { return c.state === 'negative'; }).map(function (c) { return c.label; }).join(', ') +
          '. No result: ' + chipsFor(bm).filter(function (c) { return c.state === 'unknown'; }).map(function (c) { return c.label; }).join(', ') + '.' });
    }
    var biomarker = positives.filter(function (k) {
      return drugs.some(function (d) { return d.bm.indexOf(k) >= 0; });
    })[0] || positives[0];
    var g = GENE[biomarker];
    var pick = chooseDrug(biomarker, drugs, g);
    var M = meta(pick.pdb);
    var drugName = (M && M.drug) || DRUGS.filter(function (d) { return d.pdb && d.pdb[biomarker] === pick.pdb; })[0].name;

    var out = extend(base, { kind: 'structure', biomarker: biomarker, gene: g.gene, pdb: pick.pdb,
      others: positives.filter(function (k) { return k !== biomarker; }) });

    // what to light up, and the "change" caption
    var focus, changeHtml, changeText, title, extraHonest = [];
    if (biomarker === 'EGFR') {
      var vars = egfrVariants(record);
      var rmap = residueMap(pick.pdb);
      var hs = M ? M.hotspots : {};
      var rows = [], parts = [], labels = [], keys = [];
      vars.forEach(function (v) {
        if (v.key === 'ex19del') {
          keys.push('ex19del'); labels.push('exon 19 deletion');
          (hs.ex19del ? hs.ex19del.residues : [['A', 746, 'GLU'], ['A', 750, 'ALA']]).forEach(function (r) { rows.push(r); });
          parts.push({ html: '<b class="pv-k">Glu746&ndash;Ala750</b>: the stretch exon 19 deletions cut out',
            text: 'Glu746 to Ala750: the stretch exon 19 deletions cut out', sens: true });
          return;
        }
        if (v.key === 'ex20ins') { labels.push('exon 20 insertion'); return; }
        labels.push(v.insertion ? 'exon 20 insertion (' + v.token + ')' : v.token);
        v.pos.forEach(function (p) {
          var resn = rmap ? rmap['A:' + p] : null;
          if (rmap && !resn) return;                       // not modelled: do not paint it
          rows.push(['A', p, resn || (AA[v.wt] ? AA[v.wt][0].toUpperCase() : 'UNK')]);
        });
        keys.push(v.key);
        var have = rmap ? rmap['A:' + v.pos[0]] : null;
        var res = (have ? res3(have) : (AA[v.wt] ? AA[v.wt][0] : v.wt)) + v.pos[0];
        if (v.kind === 'point') {
          var crystalHasIt = have && THREE[have] === v.to;
          parts.push({
            html: '<b class="pv-k">' + res + '</b>: ' + (crystalHasIt ? AA[v.wt][1] + ' swapped for ' + AA[v.to][1]
              : 'this patient\u2019s change swaps it for ' + (AA[v.to] ? AA[v.to][1] : 'another amino acid')),
            text: res + ': ' + (crystalHasIt ? AA[v.wt][1] + ' swapped for ' + AA[v.to][1]
              : 'this patient\u2019s change swaps it for ' + (AA[v.to] ? AA[v.to][1] : 'another amino acid')),
            sens: v.sensitising });
        } else {
          parts.push({ html: 'The insertion sits at <b class="pv-k">' + res + '</b> (' + esc(v.token) + ')',
            text: 'The insertion sits at ' + res + ' (' + v.token + ')', sens: false });
        }
      });
      if (!rows.length && bm.EGFR_type === 'sensitising') {
        // exact variant not recorded: show both common hotspots
        title = { gene: 'EGFR', change: '· sensitising' };
        focus = { key: 'sens', residues: (hs.L858R ? hs.L858R.residues : []).concat(hs.ex19del ? hs.ex19del.residues : []) };
        changeText = 'Sensitising change, exact variant not recorded. Both usual sites are lit (858 and 746 to 750)';
        changeHtml = 'Sensitising change, exact variant not recorded. Both usual sites are lit ' +
          '(<b class="pv-k">858</b> and <b class="pv-k">746&ndash;750</b>)';
        extraHonest.push('The crystal carries L858R.');
      } else if (!rows.length) {
        title = { gene: 'EGFR', change: labels.length ? labels.join(' + ') : '' };
        focus = { key: 'plain', residues: [] };
        changeHtml = changeText = labels.length ? 'EGFR ' + labels.join(' + ') + ': that position is not in this crystal'
          : 'EGFR change, exact variant not recorded';
      } else {
        title = { gene: 'EGFR', change: labels.join(' + ') };
        focus = { key: keys.join('+'), residues: rows };
        var tail = parts.length === 1 && parts[0].sens ? ', which keeps EGFR switched on' : '';
        changeHtml = parts.map(function (p) { return p.html; }).join('; ') + tail;
        changeText = parts.map(function (p) { return p.text; }).join('; ') + tail;
        var hasL858R = vars.some(function (v) { return v.token === 'L858R'; });
        if (!hasL858R) extraHonest.push('The crystal carries L858R, not this patient\u2019s change.');
      }
    } else if (g.fusion) {
      title = { gene: g.gene, change: 'fusion' };
      focus = { key: 'domain', domain: true, residues: [] };
      changeHtml = changeText = 'A gene fusion keeps this kinase switched on';
    } else if (biomarker === 'MET_ex14') {
      title = { gene: 'MET', change: 'exon 14' };
      focus = { key: 'domain', domain: true, residues: [] };
      changeHtml = changeText = 'Exon 14 skipping keeps this kinase switched on for longer';
      extraHonest.push('The exon 14 region is not in this crystal' + (M ? ' (residues ' + M.modelled[0] + '–' + M.modelled[1] + ' only).' : '.'));
    } else {
      var hk = g.focus;
      var hrows = M && M.hotspots[hk] ? M.hotspots[hk].residues : [];
      title = { gene: g.gene, change: g.change };
      focus = { key: hk, residues: hrows };
      var mm = /^([A-Z])(\d+)([A-Z])$/.exec(g.change);
      var name = AA[mm[3]][0] + mm[2];
      changeHtml = '<b class="pv-k">' + name + '</b>: ' + AA[mm[1]][1] + ' swapped for ' + AA[mm[3]][1] +
        ', which keeps ' + g.gene + ' switched on';
      changeText = name + ': ' + AA[mm[1]][1] + ' swapped for ' + AA[mm[3]][1] + ', which keeps ' + g.gene + ' switched on';
      if (biomarker === 'BRAF_V600E' && hrows.length && M && hrows[0][0] !== M.ligand.chain) {
        extraHonest.push('Glu600 is modelled in one copy of the protein, the drug in the other.');
      }
    }
    out.title = title;
    out.change = title.change;
    out.focus = focus;

    // the drug, labelled honestly
    var label;
    var approvedHere = g.approved && (biomarker !== 'EGFR' || focus.key === 'sens' ||
      egfrVariants(record).some(function (v) { return v.key === 'ex19del' || v.token === 'L858R'; }));
    if (pick.relation === 'trial') label = drugName + ', this trial’s drug';
    else if (pick.relation === 'class') label = drugName + ', same drug class as ' + pick.trialDrug.toLowerCase() + ' in this trial';
    else if (focus.key === 'sens') label = drugName + ', approved for common sensitising changes, not this trial’s treatment';
    else if (approvedHere) label = drugName + ', an approved drug for this change, not this trial’s treatment';
    else label = drugName + ', a drug that targets ' + (biomarker === 'EGFR' ? 'EGFR' : 'this change') + ', not this trial’s treatment';
    out.drug = { name: drugName, ccd: M ? M.ligand.ccd : null, relation: pick.relation, trialDrug: pick.trialDrug, label: label };

    var drugHtml = '<b class="pv-d">' + esc(drugName) + '</b>' + esc(label.slice(drugName.length));
    out.captions = { change: { html: changeHtml, text: changeText }, drug: { html: drugHtml, text: label } };

    // honesty line
    var honest = M ? 'Crystal structure from the Protein Data Bank (' + M.pdb + ', ' + fmtRes(M.resolution) +
      ' Å), not this patient’s tumour.' : 'Crystal structure from the Protein Data Bank (' + pick.pdb + '), not this patient’s tumour.';
    if (M && M.construct) honest += ' ' + M.construct + '.';
    if (extraHonest.length) honest += ' ' + extraHonest.join(' ');
    out.honesty = honest;
    out.resolution = M ? M.resolution : null;

    var where = focus.domain ? 'The kinase is highlighted in coral.' :
      focus.residues.length ? 'The changed site is highlighted in coral.' : '';
    out.aria = {
      change: g.gene + ' protein in 3D, crystal structure ' + pick.pdb + '. ' + where + ' ' + changeText + '.',
      drug: g.gene + ' protein in 3D, crystal structure ' + pick.pdb + '. ' + drugName + ' is shown in teal in its pocket. ' + label + '.'
    };
    out.fallback = [pick.pdb + '-' + focus.key, pick.pdb + '-plain'];
    return out;
  }

  function targetView(base, key, trial) {   // the trial's drug on its target (immunotherapy, antibodies, ADC payloads)
    var T = TARGETS[key], M = meta(T.pdb), rows = M ? M.hotspots.site.residues : [];
    var mine = T.mine && T.mine.test(trialText(trial)), label = mine ? T.drug + ', this trial\u2019s drug' : T.label;
    var siteText = T.site.replace(/<[^>]+>/g, '');
    return extend(base, { kind: 'structure', target: key, biomarker: null, gene: T.gene, pdb: T.pdb, others: [],
      title: { gene: T.gene, change: '' }, change: '',
      focus: { key: 'site', residues: rows, domain: false },
      captions: { change: { html: T.site, text: siteText }, drug: { html: '<b class="pv-d">' + esc(T.drug) + '</b>' + esc(label.slice(T.drug.length)), text: label } },
      drug: { name: T.drug, ccd: M && M.ligand ? M.ligand.ccd : null, relation: mine ? 'trial' : 'class', trialDrug: null, label: label },
      honesty: 'Crystal structure from the Protein Data Bank (' + T.pdb + (M ? ', ' + fmtRes(M.resolution) + ' \u00c5' : '') + '), not this patient\u2019s tumour. ' + T.honest,
      resolution: M ? M.resolution : null,
      aria: { change: T.gene + ' in 3D, crystal structure ' + T.pdb + '. Where the drug binds is highlighted in coral. ' + siteText + '.',
        drug: T.gene + ' in 3D, crystal structure ' + T.pdb + ', with the drug shown in teal. ' + label + '.' },
      segLabels: { change: 'The target', drug: 'The drug' }, cellCaption: T.cell, membrane: T.membrane, fallback: [] });
  }
  function changeElsewhere(base, key, drugs) {   // a trial for a driver change this patient's record doesn't show
    var g = GENE[key], pick = chooseDrug(key, drugs, g), M = meta(pick.pdb);
    var drugName = (M && M.drug) || (DRUGS.filter(function (d) { return d.pdb && d.pdb[key] === pick.pdb; })[0] || {}).name || 'The drug';
    var hs = M ? M.hotspots : {}, f = g.focus && hs[g.focus] ? hs[g.focus] : (key === 'EGFR' && hs.L858R ? hs.L858R : null);
    var focus = g.focus === 'domain' || !f ? { key: 'domain', residues: [], domain: true } : { key: g.focus || 'L858R', residues: f.residues || [], domain: false };
    var label = pick.relation === 'trial' ? drugName + ', this trial\u2019s drug' : drugName + ', a drug for ' + LABEL[key] + ', not this trial\u2019s treatment';
    var html = '<span class="pv-k">' + esc(LABEL[key]) + '</span>: the change this trial is for. This patient\u2019s record doesn\u2019t show it';
    return extend(base, { kind: 'structure', target: key, biomarker: key, gene: g.gene, pdb: pick.pdb, others: [],
      title: { gene: g.gene, change: '' }, change: '', focus: focus,
      captions: { change: { html: html, text: html.replace(/<[^>]+>/g, '') }, drug: { html: '<b class="pv-d">' + esc(drugName) + '</b>' + esc(label.slice(drugName.length)), text: label } },
      drug: { name: drugName, ccd: M ? M.ligand.ccd : null, relation: pick.relation, trialDrug: pick.trialDrug, label: label },
      honesty: 'Crystal structure from the Protein Data Bank (' + pick.pdb + (M ? ', ' + fmtRes(M.resolution) + ' \u00c5' : '') + '), not this patient\u2019s tumour.' + (M && M.construct ? ' ' + M.construct + '.' : ''),
      resolution: M ? M.resolution : null,
      aria: { change: g.gene + ' protein in 3D, crystal structure ' + pick.pdb + '. ' + html.replace(/<[^>]+>/g, '') + '.', drug: g.gene + ' protein in 3D with ' + drugName + ' in teal. ' + label + '.' },
      fallback: [pick.pdb + '-' + focus.key, pick.pdb + '-plain'] });
  }

  function extend(a, b) { for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; return a; }

  // ================================================================== UI (browser only below)
  // .pv-root carries the theme tokens; .pv-layer is the floating sheet; .pv-embed is a mount() host.
  var CSS = [
    '.pv-root{--pv-ink:#14202e;--pv-muted:#5b6878;--pv-line:#dde3ea;--pv-line2:#eef1f5;--pv-bg:#f3f6f9;--pv-surface:#ffffff;',
    '--pv-staff:#127c72;--pv-staff-ink:#0f6b62;--pv-staff-soft:#e3f3f1;--pv-change:#e2445c;--pv-change-ink:#c8304a;--pv-change-soft:#fdecef;',
    '--pv-unk:#6b5bd2;--pv-unk-ink:#4f43b3;--pv-unk-soft:#efedfc;--pv-neg-ink:#3d4a5a;--pv-neg-soft:#eef1f5;--pv-link:#2b6fd6;',
    '--pv-cartoon:#a7b2c1;--pv-partner:#d5dce4;--pv-scrim:rgba(20,32,46,.32);--pv-toast:#14202e;--pv-toast-ink:#ffffff;',
    '--pv-rail:rgba(255,255,255,.82);--pv-rail-on:#d3e3fd;--pv-rail-on-ink:#041e49;',
    '--pv-shadow:0 10px 40px rgba(20,32,46,.18),0 2px 6px rgba(20,32,46,.06);',
    '--pv-display:"Bricolage Grotesque","IBM Plex Sans","Segoe UI",system-ui,sans-serif;',
    '--pv-body:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--pv-mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;',
    '--pv-ease:cubic-bezier(.22,1,.36,1);color-scheme:light;font-family:var(--pv-body);',
    'font-size:15px;line-height:1.4;color:var(--pv-ink);-webkit-tap-highlight-color:transparent}',
    '.pv-root[data-pv-theme=dark]{DARK}',
    '@media (prefers-color-scheme:dark){.pv-root[data-pv-theme=auto]{DARK}}',
    '.pv-root[hidden],.pv-root [hidden]{display:none!important}',
    '.pv-root *{box-sizing:border-box}',
    '.pv-root button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;margin:0;padding:0}',
    '.pv-root :focus-visible{outline:2px solid var(--pv-link);outline-offset:3px}',
    '.pv-layer{position:fixed;inset:0;z-index:80}',
    '.pv-scrim{position:absolute;inset:0;background:var(--pv-scrim);opacity:0;transition:opacity .28s ease}',
    '.pv-layer.pv-in .pv-scrim{opacity:1}',
    '.pv-sheet{position:absolute;top:0;right:0;bottom:0;width:min(480px,100vw);display:flex;flex-direction:column;',
    'background:var(--pv-surface);border-radius:24px 0 0 24px;box-shadow:var(--pv-shadow);outline:none;overflow:hidden;',
    'transform:translateX(104%);transition:transform .44s var(--pv-ease)}',
    '.pv-layer.pv-in .pv-sheet{transform:none}',
    '.pv-grab{display:none;width:40px;height:5px;border-radius:5px;background:var(--pv-line);margin:8px auto 0;flex:none}',
    '.pv-head{position:relative;flex:none;padding:22px 72px 10px 24px;min-height:76px}',
    '.pv-title{margin:0;font:800 30px/1.08 var(--pv-display);letter-spacing:-.02em;text-wrap:balance}',
    '.pv-title .pv-chg{font-weight:700;color:var(--pv-change-ink)}',
    '.pv-x{position:absolute;top:14px;right:14px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;',
    'color:var(--pv-muted);transition:background .15s ease,color .15s ease,transform .2s cubic-bezier(.34,1.56,.64,1)}',
    '.pv-x:hover{background:var(--pv-bg);color:var(--pv-ink)}.pv-x:active{transform:scale(.9)}',
    '.pv-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}',
    '.pv-view{position:relative}',
    '.pv-stage{position:relative;height:55vh;margin:0 12px;border-radius:20px;overflow:hidden;background:var(--pv-surface);touch-action:none}',
    '.pv-gl{position:absolute;inset:0;opacity:0;transition:opacity .18s ease}',
    '.pv-gl.pv-on{opacity:1}',
    '.pv-gl canvas{outline:none}',
    '.pv-still{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .24s ease}',
    '.pv-still.pv-on{opacity:1}',
    '.pv-load{position:absolute;inset:18% 22%;border-radius:50%;background:radial-gradient(closest-side,var(--pv-line2),transparent);',
    'opacity:.9;animation:pv-breathe 1.4s ease-in-out 3 alternate}',
    '.pv-ctl{padding:14px 24px 22px;display:grid;gap:10px}',
    '.pv-seg{position:relative;display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--pv-line)}',
    '.pv-segb{height:46px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600;font-size:15px;',
    'color:var(--pv-muted);transition:color .2s ease}',
    '.pv-segb[aria-checked=true]{color:var(--pv-ink)}',
    '.pv-dot{width:9px;height:9px;border-radius:50%;flex:none}',
    '.pv-dot-c{background:var(--pv-change)}.pv-dot-d{background:var(--pv-staff)}',
    '.pv-ink{position:absolute;left:0;bottom:-1px;width:50%;height:3px;border-radius:3px;background:var(--pv-change);',
    'transition:transform .22s var(--pv-ease),background-color .22s ease}',
    '.pv-seg[data-mode=drug] .pv-ink{transform:translateX(100%);background:var(--pv-staff)}',
    '.pv-cap{display:grid;min-height:44px;margin:0;font-size:15.5px;line-height:1.38}',
    '.pv-cap>span{grid-area:1/1;transition:opacity .2s ease,transform .24s var(--pv-ease)}',
    '.pv-cap>span.pv-out{opacity:0;transform:translateY(-4px)}',
    '.pv-cap>span.pv-pre{opacity:0;transform:translateY(4px)}',
    '.pv-k{font-weight:700;color:var(--pv-change-ink)}.pv-d{font-weight:700;color:var(--pv-staff-ink)}',
    '.pv-honest{margin:0;font-size:12.5px;line-height:1.45;color:var(--pv-muted)}',
    '.pv-pdb{justify-self:start;font:500 12.5px var(--pv-mono);color:var(--pv-link);text-decoration:underline;',
    'text-decoration-thickness:1px;text-underline-offset:3px}',
    '.pv-calm{display:grid;align-content:center;justify-items:start;gap:16px;padding:8px 24px 6px}',
    '.pv-calm>svg{color:var(--pv-muted);opacity:.55}',
    '.pv-grp{display:grid;gap:8px}',
    '.pv-gl-h{margin:0;font:600 12px var(--pv-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--pv-muted)}',
    '.pv-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}',
    '.pv-chip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px 0 8px;border-radius:999px;font-size:13.5px;font-weight:600;',
    'opacity:0;transform:translateY(6px);animation:pv-rise .42s var(--pv-ease) forwards}',
    '.pv-chip svg{flex:none}',
    '.pv-neg{background:var(--pv-neg-soft);color:var(--pv-neg-ink)}',
    '.pv-unk{background:var(--pv-unk-soft);color:var(--pv-unk-ink);box-shadow:inset 0 0 0 1.5px var(--pv-unk)}',
    '.pv-toast{position:absolute;left:12px;right:12px;bottom:12px;z-index:3;display:flex;align-items:center;gap:10px;min-height:50px;',
    'padding:0 14px;border-radius:14px;background:var(--pv-toast);color:var(--pv-toast-ink);font-size:14px;overflow:hidden;',
    'box-shadow:0 12px 28px rgba(20,32,46,.3);animation:pv-toast .45s cubic-bezier(.34,1.56,.64,1) both}',
    '.pv-toast i{position:absolute;left:0;bottom:0;height:3px;background:var(--pv-staff);animation:pv-drain 4.2s linear forwards}',
    '.pv-toast.pv-gone{opacity:0;transform:translateY(10px);transition:opacity .25s ease,transform .25s ease}',
    '.pv-embed{display:flex;flex-direction:column;height:100%;min-height:420px;background:var(--pv-surface);color:var(--pv-ink)}',
    '.pv-embed .pv-stage{flex:1 1 auto;height:auto;min-height:240px;margin:0}',
    '.pv-embed .pv-ctl{flex:none;padding:12px 4px 4px}.pv-embed .pv-calm{flex:1;padding:8px 4px}',
    // zoom levels: illustrated body, lung and cell over the 3D stage, with a rail to move between them
    '.pv-zoom{position:absolute;inset:0;z-index:1;overflow:hidden}',
    '.pv-zbg{position:absolute;inset:0;background:var(--pv-surface)}',
    '.pv-sc{position:absolute;inset:0;will-change:transform,opacity}',
    '.pv-sc svg{display:block;width:100%;height:100%}',
    '.pv-w3{position:absolute;inset:0}',
    '.pv-w3 canvas{cursor:grab}.pv-w3 canvas:active{cursor:grabbing}',
    '.pv-root .pv-hot{position:absolute;z-index:2;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%}',
    '.pv-hot::before,.pv-hot::after{content:"";position:absolute;inset:12px;border-radius:50%;box-shadow:0 0 0 2px var(--pv-change);animation:pv-ping 2s var(--pv-ease) infinite}',
    '.pv-hot::after{animation-delay:1s}',
    '.pv-hot:focus-visible{outline-offset:-4px}',
    '.pv-rail{position:absolute;z-index:3;top:10px;left:10px;display:flex;gap:2px;padding:3px;border-radius:999px;background:var(--pv-rail);',
    '-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px var(--pv-line)}',
    '.pv-root .pv-railb{height:28px;padding:0 11px;border-radius:999px;font-size:12.5px;font-weight:600;color:var(--pv-muted);white-space:nowrap;',
    'transition:background-color .2s ease,color .2s ease}',
    '.pv-root .pv-railb:hover{color:var(--pv-ink)}',
    '.pv-root .pv-railb[aria-pressed=true]{background:var(--pv-rail-on);color:var(--pv-rail-on-ink)}',
    '@keyframes pv-ping{0%{transform:scale(.55);opacity:1}100%{transform:scale(1.6);opacity:0}}',
    '@keyframes pv-rise{to{opacity:1;transform:none}}',
    '@keyframes pv-breathe{from{transform:scale(.92);opacity:.5}to{transform:scale(1);opacity:.95}}',
    '@keyframes pv-toast{0%{opacity:0;transform:translateY(16px) scale(.97)}100%{opacity:1;transform:none}}',
    '@keyframes pv-drain{from{width:100%}to{width:0}}',
    '@media (max-width:600px){',
    '.pv-sheet{top:auto;left:0;width:auto;max-height:94vh;max-height:94dvh;border-radius:24px 24px 0 0;transform:translateY(104%)}',
    '.pv-grab{display:block}',
    '.pv-head{padding:36px 20px 8px;min-height:0}.pv-title{font-size:27px}',   // close sits beside the grab handle, so the title gets the full width
    '.pv-x{top:0;right:6px}',
    '.pv-sheet .pv-stage{height:45vh;margin:0 8px}',
    '.pv-sheet .pv-ctl{padding:12px 20px 20px}.pv-sheet .pv-calm{padding:4px 20px}}'
    // reduced motion keeps these transitions and fades; only the camera flights and zooms jump (see reduced() below)
  ].join('\n');
  var DARK = '--pv-ink:#e8edf3;--pv-muted:#9aa7b6;--pv-line:#2a3644;--pv-line2:#223040;--pv-bg:#0f1620;--pv-surface:#17212d;' +
    '--pv-staff:#3cc2b3;--pv-staff-ink:#5fd6c8;--pv-staff-soft:#12302d;--pv-change:#ff6b81;--pv-change-ink:#ff8a9b;--pv-change-soft:#3a1c24;' +
    '--pv-unk:#a99bff;--pv-unk-ink:#c3b9ff;--pv-unk-soft:#26214a;--pv-neg-ink:#c9d2dc;--pv-neg-soft:#223040;--pv-link:#7fb0ff;' +
    '--pv-cartoon:#9aa8bb;--pv-partner:#56657a;--pv-scrim:rgba(4,8,14,.55);--pv-toast:#e8edf3;--pv-toast-ink:#14202e;' +
    '--pv-rail:rgba(16,17,18,.74);--pv-rail-on:#004a77;--pv-rail-on-ink:#c2e7ff;' +
    '--pv-shadow:0 10px 40px rgba(0,0,0,.5);color-scheme:dark';

  var ICON = {
    x: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    minus: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M5.2 8h5.6"/></svg>',
    q: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.2" stroke-dasharray="2.4 2"/><path d="M6.4 6.3a1.7 1.7 0 1 1 2.3 1.6c-.5.2-.7.6-.7 1.1"/><path d="M8 11.3h.01"/></svg>',
    ribbon: '<svg width="64" height="40" viewBox="0 0 64 40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M4 30c6-14 12-14 16 0s10 14 14 0 10-24 16-12 8 10 10 4"/></svg>'
  };

  // ------------------------------------------------------------------ zoom levels: body -> lung -> cell -> protein
  // The first three are illustrations (never the patient's scan); the last is the real crystal structure.
  var LEVELS = ['body', 'lung', 'cell', 'protein'];
  var LEVEL_NAME = { body: 'Body', lung: 'Lung', cell: 'Cell', protein: 'Protein' };
  var UID = 0;
  var MEMBRANE = /^(EGFR|MET)$/;   // receptors that sit in the cell's surface; the rest work just inside it
  function sceneSvg(level, gene, uid, membrane) {
    var g = 'pvz' + uid + level, line = 'fill:none;stroke:var(--pv-cartoon);stroke-linecap:round;stroke-linejoin:round;';
    var defs = '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4285F4"/>' +
      '<stop offset=".55" stop-color="#9B72CB"/><stop offset="1" stop-color="#D96570"/></linearGradient>' +
      '<radialGradient id="' + g + 'h"><stop offset="0" style="stop-color:var(--pv-change);stop-opacity:.55"/>' +
      '<stop offset="1" style="stop-color:var(--pv-change);stop-opacity:0"/></radialGradient></defs>';
    var o = '<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + defs;
    if (level === 'body') {
      o += '<circle cx="200" cy="58" r="30" style="' + line + 'stroke-opacity:.55;stroke-width:2"/>' +
        '<path d="M188 88v20M212 88v20M100 300C100 222 104 172 132 154C152 141 176 134 188 108M212 108C224 134 248 141 268 154C296 172 300 222 300 300" style="' + line + 'stroke-opacity:.55;stroke-width:2"/>' +
        '<path d="M192 166C178 154 150 162 142 198C134 236 138 270 154 282C170 292 190 282 192 262Z" fill="url(#' + g + ')" fill-opacity=".2" stroke="url(#' + g + ')" stroke-width="1.6"/>' +
        '<path d="M208 166C222 154 250 162 258 198C266 236 262 270 246 282C230 292 210 282 208 262Z" fill="url(#' + g + ')" fill-opacity=".2" stroke="url(#' + g + ')" stroke-width="1.6"/>' +
        '<path d="M200 112V160M200 160L188 174M200 160L212 174" style="' + line + 'stroke-opacity:.6;stroke-width:2"/>' +
        '<circle cx="160" cy="196" r="18" fill="url(#' + g + 'h)"/><circle data-focus cx="160" cy="196" r="5" style="fill:var(--pv-change)"/>';
    } else if (level === 'lung') {
      var dots = [[150, 236], [176, 262], [128, 200], [210, 252], [120, 168], [232, 214], [226, 160], [174, 54], [212, 40], [118, 140]];
      o += '<path d="M262 26C218 10 150 30 122 104C96 176 100 254 140 282C182 306 244 290 262 240Z" fill="url(#' + g + ')" fill-opacity=".13" stroke="url(#' + g + ')" stroke-width="2"/>' +
        '<path d="M304 0L262 58L222 100L190 142L164 184L146 224M222 100L210 160L204 222L182 256M190 142L150 138M262 58L246 120L240 190M246 120L270 150M204 222L222 262" style="' + line + 'stroke-opacity:.45;stroke-width:3"/>' +
        '<path d="M164 184L136 190M210 160L232 170M240 190L250 222M150 138L128 118M222 100L200 64" style="' + line + 'stroke-opacity:.35;stroke-width:1.6"/>' +
        dots.map(function (d) { return '<circle cx="' + d[0] + '" cy="' + d[1] + '" r="4" style="' + line + 'stroke-opacity:.3;stroke-width:1.2"/>'; }).join('') +
        '<circle cx="154" cy="102" r="40" fill="url(#' + g + 'h)"/>' +
        '<path data-focus d="M140 92c5-12 22-14 29-5 9 3 11 16 4 23-3 11-18 13-27 8-11-1-13-16-6-26z" style="fill:var(--pv-change);fill-opacity:.85"/>';
    } else {
      var rad = Math.PI / 180, pt = function (a, r) { return [(200 + r * Math.cos(a * rad)).toFixed(1), (150 + r * Math.sin(a * rad)).toFixed(1)]; };
      var y = function (a, r0, len, style) {   // a Y-shaped receptor standing out of the membrane at angle a
        var b = pt(a, r0), m = pt(a, r0 + len), l = pt(a - 7, r0 + len * 1.55), r = pt(a + 7, r0 + len * 1.55);
        return '<path d="M' + b + 'L' + m + 'M' + m + 'L' + l + 'M' + m + 'L' + r + '" style="' + style + '"/>';
      };
      var others = [-150, -120, -90, -30, 0, 30, 60, 90, 120, 150, 180].map(function (a) { return y(a, 112, 14, line + 'stroke-opacity:.45;stroke-width:2.4'); }).join('');
      var onSurface = membrane != null ? membrane : MEMBRANE.test(gene), f = onSurface ? pt(-60, 136) : pt(-60, 92), lab = onSurface ? pt(-60, 160) : pt(-60, 66);
      o += '<circle cx="200" cy="150" r="112" fill="url(#' + g + ')" fill-opacity=".08" stroke="url(#' + g + ')" stroke-width="3"/>' +
        '<circle cx="200" cy="150" r="104" style="' + line + 'stroke-opacity:.22;stroke-width:1.4"/>' +
        '<circle cx="186" cy="162" r="40" style="fill:var(--pv-cartoon);fill-opacity:.1;stroke:var(--pv-cartoon);stroke-opacity:.4;stroke-width:1.4"/>' +
        '<circle cx="176" cy="154" r="9" style="fill:var(--pv-cartoon);fill-opacity:.22"/>' +
        '<ellipse cx="250" cy="196" rx="16" ry="7" transform="rotate(-24 250 196)" style="' + line + 'stroke-opacity:.35;stroke-width:1.4"/>' +
        '<ellipse cx="132" cy="112" rx="13" ry="6" transform="rotate(30 132 112)" style="' + line + 'stroke-opacity:.35;stroke-width:1.4"/>' +
        others +
        '<circle cx="' + f[0] + '" cy="' + f[1] + '" r="26" fill="url(#' + g + 'h)"/>' +
        (onSurface ? y(-60, 112, 14, 'fill:none;stroke:var(--pv-change);stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round')
          : '<circle cx="' + f[0] + '" cy="' + f[1] + '" r="7" style="fill:var(--pv-change)"/>') +
        '<circle data-focus cx="' + f[0] + '" cy="' + f[1] + '" r="3" style="fill:var(--pv-change)"/>' +
        '<text x="' + lab[0] + '" y="' + lab[1] + '" text-anchor="middle" dominant-baseline="middle" style="fill:var(--pv-change-ink);font:600 14px var(--pv-body)">' + esc(gene) + '</text>';
    }
    return o + '</svg>';
  }
  function levelCaption(level, gene) {
    if (level === 'body') return '<span class="pv-k">The tumour</span> grows in the lung.';
    if (level === 'lung') return 'It is made of cancer cells that carry <span class="pv-k">the same change</span>.';
    return '<span class="pv-k">' + esc(gene) + '</span> ' + (MEMBRANE.test(gene) ? 'sits in the cell’s surface' : 'works just inside the cell') + ' and tells it to grow.';
  }
  var LEVEL_ARIA = { body: 'Illustration: a body with a tumour in the right lung', lung: 'Illustration: the right lung with the tumour',
    cell: 'Illustration: a cancer cell with the changed protein highlighted' };

  var LIVE = { views: 0 };   // views holding a 3Dmol viewer; the last one out releases the WebGL context

  function reduced() { return HAS_DOM && root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function schemeDark() { return !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches); }
  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }
  function raf(fn) { return (root.requestAnimationFrame || function (f) { return setTimeout(function () { f(now()); }, 16); })(fn); }

  function injectCss() {
    if (document.getElementById('pv-style')) return;
    var st = document.createElement('style');
    st.id = 'pv-style';
    st.textContent = CSS.split('DARK').join(DARK);
    document.head.appendChild(st);
  }

  function loadScript(src, test) {
    return new Promise(function (ok, fail) {
      if (test()) return ok();
      var existing = document.querySelector('script[data-pv-src="' + src + '"]');
      var s = existing || document.createElement('script');
      s.addEventListener('load', function () { test() ? ok() : fail(new Error('loaded but empty: ' + src)); });
      s.addEventListener('error', function () { fail(new Error('could not load ' + src)); });
      if (!existing) { s.src = src; s.async = true; s.setAttribute('data-pv-src', src); document.head.appendChild(s); }
    });
  }
  var loadP = null;
  function load() {
    if (!loadP) {
      loadP = Promise.all([
        loadScript(PATHS.data, function () { return !!root.TM_STRUCTURES; }).then(function () {
          return loadScript(PATHS.targets, function () { return !!(root.TM_STRUCTURES && root.TM_STRUCTURES['5X8M']); }).catch(function () { return null; });
        }),
        loadScript(PATHS.lib, function () { return !!root.$3Dmol; }).then(function () { return true; }, function () { return false; })
      ]).then(function (r) { return { lib: r[1] }; });
      loadP.catch(function () { loadP = null; });
    }
    return loadP;
  }

  function webglOk() {
    try {
      var c = document.createElement('canvas');
      return !!(root.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function calmHtml(c) {   // no driver: tested-negative and no-result chips, kept visibly apart
    var neg = c.chips.filter(function (x) { return x.state === 'negative'; });
    var unk = c.chips.filter(function (x) { return x.state === 'unknown'; });
    var i = 0;
    function chips(list, cls, icon) {
      return '<ul class="pv-chips">' + list.map(function (x) {
        return '<li class="pv-chip ' + cls + '" style="animation-delay:' + (60 + 45 * i++) + 'ms">' + icon + esc(x.label) + '</li>';
      }).join('') + '</ul>';
    }
    return ICON.ribbon +
      (neg.length ? '<div class="pv-grp"><p class="pv-gl-h">Tested negative</p>' + chips(neg, 'pv-neg', ICON.minus) + '</div>' : '') +
      (unk.length ? '<div class="pv-grp"><p class="pv-gl-h">No result</p>' + chips(unk, 'pv-unk', ICON.q) + '</div>' : '');
  }

  // ------------------------------------------------------------------ geometry helpers
  function splitPdb(text, focusRows, drugChains) {
    var want = {}, abs = {};
    (drugChains || []).forEach(function (c) { abs[c] = 1; });
    focusRows.forEach(function (r) { want[r[0] + ':' + r[1]] = 1; });
    var prot = [], lig = [], hot = [], ss = [];
    text.split('\n').forEach(function (l) {
      var rec = l.substr(0, 6);
      if (rec === 'HELIX ' || rec === 'SHEET ') { ss.push(l); return; }
      if (rec === 'HETATM') { lig.push(l); return; }
      if (rec === 'ATOM  ' && abs[l.charAt(21)]) { lig.push(l); return; }
      if (rec === 'ATOM  ') {
        prot.push(l);
        var nm = l.substr(12, 4);   // side chain + CA as sticks; the ribbon already shows the backbone
        if (want[l.charAt(21) + ':' + parseInt(l.substr(22, 4), 10)] && nm !== ' N  ' && nm !== ' C  ' && nm !== ' O  ') hot.push(l);
      }
    });
    return { prot: ss.concat(prot).join('\n') + '\nEND\n', lig: lig.join('\n') + '\nEND\n', hot: hot.join('\n') + '\nEND\n' };
  }
  function centroid(atoms) {
    var x = 0, y = 0, z = 0;
    atoms.forEach(function (a) { x += a.x; y += a.y; z += a.z; });
    var n = Math.max(1, atoms.length);
    return { x: x / n, y: y / n, z: z / n };
  }
  function norm(v) { var l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; }
  function quatFromTo(a, b) {          // shortest rotation taking unit vector a onto b, as [x,y,z,w]
    var d = a.x * b.x + a.y * b.y + a.z * b.z;
    if (d < -0.9999) return [0, 1, 0, 0];
    var q = [a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x, 1 + d];
    var l = Math.hypot(q[0], q[1], q[2], q[3]);
    return q.map(function (v) { return v / l; });
  }
  function slerp(a, b, t) {
    var d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (d < 0) { b = b.map(function (v) { return -v; }); d = -d; }
    if (d > 0.9995) {
      var r = a.map(function (v, i) { return v + (b[i] - v) * t; });
      var l = Math.hypot(r[0], r[1], r[2], r[3]);
      return r.map(function (v) { return v / l; });
    }
    var th = Math.acos(d), s = Math.sin(th);
    var wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return a.map(function (v, i) { return v * wa + b[i] * wb; });
  }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function settle(t) { t = t - 1; return t * t * (1.9 * t + 0.9) + 1; }   // ease-out, one small overshoot (moment 4)
  function near(a, b, d) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < d; }

  // ------------------------------------------------------------------ the view (stage + control + caption + honesty)
  // Shared by open() (inside the sheet) and mount() (inside a host element).
  function createView(host, opts, embed) {
    injectCss();
    opts = opts || {};
    var V = { c: null, mode: opts.mode === 'drug' ? 'drug' : 'change', alive: true, theme: 'auto', viewer: null, models: null,
      still: null, frames: null, colors: null, meta: null, tween: 0, glow: 0, fade: 0, req: 0, ro: null, offs: [] };
    var w = document.createElement('div');
    w.className = 'pv-view' + (embed ? ' pv-root pv-embed' : '');
    w.innerHTML =
      '<div class="pv-stage" role="img" aria-label=""><div class="pv-gl"></div>' +
        '<div class="pv-zoom" hidden><div class="pv-zbg"></div></div><div class="pv-rail" role="group" aria-label="Zoom level" hidden></div></div>' +
      '<div class="pv-calm" hidden></div>' +
      '<div class="pv-ctl">' +
        '<div class="pv-seg" role="radiogroup" aria-label="What to show" data-mode="change">' +
          '<button type="button" class="pv-segb" role="radio" aria-checked="true" data-pv-mode="change"><span class="pv-dot pv-dot-c" aria-hidden="true"></span>The change</button>' +
          '<button type="button" class="pv-segb" role="radio" aria-checked="false" tabindex="-1" data-pv-mode="drug"><span class="pv-dot pv-dot-d" aria-hidden="true"></span>The drug</button>' +
          '<span class="pv-ink" aria-hidden="true"></span>' +
        '</div>' +
        '<p class="pv-cap" aria-live="polite"></p>' +
        '<p class="pv-honest"></p>' +
        '<span class="pv-pdb"></span>' +
      '</div>';
    if (embed && opts.surface) w.style.setProperty('--pv-surface', opts.surface);
    host.appendChild(w);
    var el = V.el = { root: w, stage: w.querySelector('.pv-stage'), gl: w.querySelector('.pv-gl'), calm: w.querySelector('.pv-calm'),
      seg: w.querySelector('.pv-seg'), cap: w.querySelector('.pv-cap'), honest: w.querySelector('.pv-honest'), pdb: w.querySelector('.pv-pdb'),
      zoom: w.querySelector('.pv-zoom'), zbg: w.querySelector('.pv-zbg'), rail: w.querySelector('.pv-rail') };

    function on(target, ev, fn, o) { target.addEventListener(ev, fn, o); V.offs.push(function () { target.removeEventListener(ev, fn, o); }); }
    on(w, 'click', function (e) {
      var b = e.target.closest('[data-pv-mode]');
      if (b) setMode(b.getAttribute('data-pv-mode'), true);
      var lv = e.target.closest('[data-pv-level]');
      if (lv) go(lv.getAttribute('data-pv-level'), false);
    });
    on(el.seg, 'keydown', function (e) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].indexOf(e.key) < 0) return;
      e.preventDefault();
      setMode(e.key === 'Home' ? 'change' : e.key === 'End' ? 'drug' : (V.mode === 'change' ? 'drug' : 'change'), true);
    });
    ['pointerdown', 'wheel', 'touchstart'].forEach(function (ev) {   // the user grabbed the model: stop any camera move
      on(el.stage, ev, function () { V.tween++; }, { passive: true });
    });
    if (root.ResizeObserver) {
      V.ro = new root.ResizeObserver(function () {
        if (V.viewer && V.alive) { try { V.viewer.resize(); V.viewer.render(); } catch (e) { /* ignore */ } }
        if (J) placeHot();
      });
      V.ro.observe(el.stage);
    }
    if (root.matchMedia) {
      var mq = root.matchMedia('(prefers-color-scheme: dark)');
      var onScheme = function () { if (V.theme === 'auto') refreshColors(); };
      if (mq.addEventListener) { mq.addEventListener('change', onScheme); V.offs.push(function () { mq.removeEventListener('change', onScheme); }); }
    }

    function isDark() { return V.theme === 'dark' || (V.theme === 'auto' && schemeDark()); }
    function tokens() {
      var cs = getComputedStyle(w);
      var g = function (n) { return cs.getPropertyValue(n).trim(); };
      return { cartoon: g('--pv-cartoon'), partner: g('--pv-partner'), change: g('--pv-change'), drug: g('--pv-staff'), surface: g('--pv-surface') };
    }

    // ---------------- text
    function fill() {
      var c = V.c, structure = c.kind === 'structure';
      el.stage.hidden = !structure; el.seg.hidden = !structure; el.honest.hidden = !structure; el.pdb.hidden = !structure;
      el.calm.hidden = structure;
      if (structure) {
        el.honest.textContent = c.honesty;
        el.pdb.textContent = 'PDB ' + c.pdb;
        el.pdb.title = 'rcsb.org/structure/' + c.pdb;
        setCaption(c.captions[V.mode].html, false);
        el.stage.setAttribute('aria-label', c.aria[V.mode]);
        var labels = c.segLabels || { change: 'The change', drug: 'The drug' };
        Array.prototype.forEach.call(el.seg.querySelectorAll('[data-pv-mode]'), function (b) { b.lastChild.textContent = labels[b.getAttribute('data-pv-mode')]; });
      } else {
        setCaption(esc(c.captions.change.text), false);
        el.calm.innerHTML = calmHtml(c);
      }
      syncSeg();
      if (structure && J) syncLevel(false);
    }
    function setCaption(html, animate) {
      var cap = el.cap, olds = Array.prototype.slice.call(cap.children), span = document.createElement('span');
      span.innerHTML = html;
      if (!animate) { cap.innerHTML = ''; cap.appendChild(span); return; }
      span.className = 'pv-pre';
      cap.appendChild(span);
      olds.forEach(function (o) { o.className = 'pv-out'; setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 260); });
      raf(function () { raf(function () { span.className = ''; }); });
    }
    function syncSeg() {
      el.seg.setAttribute('data-mode', V.mode);
      Array.prototype.forEach.call(el.seg.querySelectorAll('[data-pv-mode]'), function (b) {
        var onb = b.getAttribute('data-pv-mode') === V.mode;
        b.setAttribute('aria-checked', onb ? 'true' : 'false');
        b.tabIndex = onb ? 0 : -1;
      });
    }
    function setMode(mode, user) {
      if (!V.alive || !V.c || V.c.kind !== 'structure' || (mode !== 'change' && mode !== 'drug')) return;
      var changed = mode !== V.mode;
      V.mode = mode;
      syncSeg();
      if (J && J.level !== 'protein') { if (V.viewer && V.models) toMode(mode, false); go('protein', false); return; }
      if (user) {
        var b = el.seg.querySelector('[data-pv-mode="' + mode + '"]');
        if (b && document.activeElement !== b && el.seg.contains(document.activeElement)) b.focus();
      }
      if (!changed) return;
      setCaption(V.c.captions[mode].html, true);
      el.stage.setAttribute('aria-label', V.c.aria[mode]);
      if (V.viewer && V.models) toMode(mode, true);
      else if (V.still) showStill(mode);
    }

    // ---------------- 3D
    function frameView(atoms, faceDir, pad) {   // [px,py,pz, zoomZ, qx,qy,qz,qw] that frames `atoms`, turned so faceDir points at the camera
      var v = V.viewer, c = centroid(atoms), r = 5;
      atoms.forEach(function (a) { r = Math.max(r, Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z)); });
      var wpx = el.stage.clientWidth || 1, hpx = el.stage.clientHeight || 1;
      var fov = (v.fov || 20) * Math.PI / 180, camZ = v.CAMERA_Z || 150;
      var dist = (r * (pad || 1.15)) / Math.tan(fov / 2) / Math.min(1, wpx / hpx);
      var q = faceDir ? quatFromTo(norm(faceDir), { x: 0, y: 0, z: 1 }) : v.getView().slice(4, 8);
      return [-c.x, -c.y, -c.z, camZ - dist, q[0], q[1], q[2], q[3]];
    }
    function tweenTo(to, ms, done) {
      var id = ++V.tween;
      if (ms <= 0 || reduced()) { V.viewer.setView(to); if (done) done(); return; }
      var from = V.viewer.getView().slice(0, 8), qa = from.slice(4, 8), qb = to.slice(4, 8), t0 = now();
      (function step() {
        if (id !== V.tween || !V.alive) return;
        var t = Math.min(1, (now() - t0) / ms), e = ease(t), z = settle(t), q = slerp(qa, qb, e);
        V.viewer.setView([from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e, from[2] + (to[2] - from[2]) * e,
          from[3] + (to[3] - from[3]) * z, q[0], q[1], q[2], q[3]]);
        if (t < 1) raf(step); else if (done) done();
      })();
    }
    function glowShapes(level, scale) {   // soft translucent spheres on the changed residue's atoms
      var m = V.models;
      if (!m.hot) return;
      var st = { stick: { color: V.colors.change, radius: 0.42 } };
      if (level > 0.001) st.sphere = { radius: 1.7 * scale, color: V.colors.change, opacity: level };
      m.hot.setStyle({}, st);
    }
    var REST = 0.4;
    function pulse() {   // moment 1: the residue glows once on landing
      var id = ++V.glow;
      if (!V.models.hot) return;
      var t0 = now(), ms = 700;
      (function step() {
        if (id !== V.glow || !V.alive || V.mode !== 'change') return;
        var t = Math.min(1, (now() - t0) / ms);
        var up = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
        glowShapes(REST + 0.33 * Math.max(0, up), 0.75 + 0.4 * ease(Math.min(1, t / 0.5)) - 0.15 * Math.max(0, (t - 0.5) / 0.5));
        V.viewer.render();
        if (t < 1) raf(step); else { glowShapes(REST, 1); V.viewer.render(); }
      })();
    }
    function ligandStyle(op) {
      var m = V.models;
      m.cov.forEach(function (s) { V.viewer.removeShape(s); });
      m.cov = [];
      if (op <= 0.001) { m.lig.setStyle({}, {}); return; }
      if (V.meta.ligand && V.meta.ligand.antibody) { m.lig.setStyle({}, { cartoon: { color: V.colors.drug, opacity: op, style: 'oval', thickness: 0.3 } }); return; }
      m.lig.setStyle({}, { stick: { color: V.colors.drug, radius: 0.27, opacity: op } });
      m.cov = m.links.map(function (k) {
        return V.viewer.addCylinder({ start: k.a, end: k.b, radius: 0.24, color: V.colors.drug, opacity: op, fromCap: 2, toCap: 2 });
      });
    }
    function proteinStyle(mode) {
      var m = V.models, col = V.colors, domainOn = V.c.focus.domain && mode === 'change';
      m.prot.setStyle({}, { cartoon: { color: domainOn ? col.change : col.cartoon, style: 'oval', thickness: 0.3 } });
      if (V.meta.partner) m.prot.setStyle({ chain: V.meta.partner.chain }, { cartoon: { color: col.partner, style: 'oval', thickness: 0.3 } });
      if (m.hot) m.hot.setStyle({}, { stick: { color: col.change, radius: 0.42 } });
    }
    function fadeLigand(to, ms) {
      var id = ++V.fade, from = V.models.ligOp;
      if (ms <= 0) { V.models.ligOp = to; ligandStyle(to); V.viewer.render(); return; }
      var t0 = now();
      (function step() {
        if (id !== V.fade || !V.alive) return;
        var t = Math.min(1, (now() - t0) / ms), o = from + (to - from) * ease(t);
        V.models.ligOp = o;
        ligandStyle(o);
        V.viewer.render();
        if (t < 1) raf(step);
      })();
    }
    function frames() {
      var m = V.models, c = V.c;
      var protAtoms = m.prot.selectedAtoms({});
      var core = V.meta.partner ? protAtoms.filter(function (a) { return a.chain !== V.meta.partner.chain; }) : protAtoms;
      var pc = centroid(core), ligAtoms = m.lig.selectedAtoms({}), lc = centroid(ligAtoms);
      var focusAtoms, faceChange;
      if (c.focus.residues.length) {
        var hc = centroid(m.hot.selectedAtoms({}));
        focusAtoms = protAtoms.filter(function (a) { return near(a, hc, 12); });
        faceChange = { x: hc.x - pc.x, y: hc.y - pc.y, z: hc.z - pc.z };
      } else {
        focusAtoms = core;
        faceChange = { x: lc.x - pc.x, y: lc.y - pc.y, z: lc.z - pc.z };
      }
      var pocket = protAtoms.filter(function (a) { return ligAtoms.some(function (l) { return near(a, l, 7); }); }).concat(ligAtoms);
      return {
        overview: frameView(protAtoms, faceChange, 1.05),
        change: c.focus.residues.length ? frameView(focusAtoms, faceChange, 1.35) : frameView(core, faceChange, 1.0),
        drug: frameView(pocket, { x: lc.x - pc.x, y: lc.y - pc.y, z: lc.z - pc.z }, 1.3)
      };
    }
    function toMode(mode, animate) {   // moment 2: drug in the pocket, and back
      ++V.glow;
      proteinStyle(mode);
      if (mode === 'drug') {
        glowShapes(0, 1);
        fadeLigand(1, animate ? 320 : 0);
        tweenTo(V.frames.drug, animate ? 680 : 0);
      } else {
        fadeLigand(0, animate ? 240 : 0);
        tweenTo(V.frames.change, animate ? 680 : 0, function () { if (V.models.hot) { glowShapes(REST, 1); V.viewer.render(); } });
      }
      V.viewer.render();
    }
    function startGl() {
      var c = V.c, D = root.TM_STRUCTURES[c.pdb];
      V.meta = D.meta;
      V.colors = tokens();
      V.viewer = root.$3Dmol.createViewer(el.gl, { backgroundColor: V.colors.surface, backgroundAlpha: 1, antialias: true, cartoonQuality: 10 });
      LIVE.views++;
      V.counted = true;
      var v = V.viewer;
      // opaque background in the sheet's own colour (looks transparent; translucent glows need an opaque backdrop)
      v.setBackgroundColor(V.colors.surface, 1);
      var parts = splitPdb(D.pdb, c.focus.residues, V.meta.ligand && V.meta.ligand.antibody ? V.meta.ligand.chains : null);
      var prot = v.addModel(parts.prot, 'pdb'), lig = v.addModel(parts.lig, 'pdb');
      var hot = c.focus.residues.length ? v.addModel(parts.hot, 'pdb') : null;
      V.models = { prot: prot, lig: lig, hot: hot, cov: [], links: [], ligOp: V.mode === 'drug' ? 1 : 0 };
      (V.meta.covalent || []).forEach(function (k) {   // covalent drug links from the file, drawn when the residue is drawn
        var pa = hot ? hot.selectedAtoms({ chain: k.protein[0], resi: k.protein[1], atom: k.protein[3] })[0] : null;
        var la = lig.selectedAtoms({ atom: k.ligand[3] })[0];
        if (pa && la) V.models.links.push({ a: { x: pa.x, y: pa.y, z: pa.z }, b: { x: la.x, y: la.y, z: la.z } });
      });
      proteinStyle(V.mode);
      ligandStyle(V.models.ligOp);
      v.resize();
      v.zoomTo();                                   // sets a permissive slab for the whole scene
      V.frames = frames();
      var target = V.frames[V.mode], motion = !reduced();
      v.setView(motion ? V.frames.overview : target);
      if (!motion && V.mode === 'change' && V.models.hot) glowShapes(REST, 1);
      v.render();
      el.gl.classList.add('pv-on');                 // moment 1: fade in (CSS, 180 ms) ...
      ready('3d');
      if (!motion) return;
      if (J && J.level !== 'protein') return;      // the zoom levels hand over to the 3D view when they reach it
      var id = V.tween;
      setTimeout(function () {                      // ... then fly to the fault and glow once
        if (id !== V.tween || !V.alive) return;
        tweenTo(target, 720, function () { if (V.mode === 'change') pulse(); });
      }, 260);
    }
    function showStill(mode) {
      var names = V.c.fallback.map(function (k) { return PATHS.still + k + '-' + mode + '-' + (isDark() ? 'dark' : 'light') + '.png'; });
      var img = V.still;
      if (!img) {
        img = V.still = document.createElement('img');
        img.className = 'pv-still';
        img.alt = '';
        el.stage.appendChild(img);
      }
      var i = 0;
      img.onerror = function () { i++; if (i < names.length) img.src = names[i]; else img.removeAttribute('src'); };
      img.onload = function () { img.classList.add('pv-on'); ready('still'); };
      img.classList.remove('pv-on');
      img.src = names[0];
    }
    function toast(text) {
      var t = document.createElement('div');
      t.className = 'pv-toast';
      t.setAttribute('role', 'status');
      t.innerHTML = '<span>' + esc(text) + '</span><i aria-hidden="true"></i>';
      el.stage.appendChild(t);
      setTimeout(function () { t.classList.add('pv-gone'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300); }, 4200);
    }
    function fallback(reason) {
      el.gl.classList.remove('pv-on');
      w.setAttribute('data-pv-fallback', reason);
      showStill(V.mode);
      if (reason !== 'forced') toast('3D is not available here, so this is a still image.');
    }
    var readyOnce = false;
    function ready(kind) {
      w.setAttribute('data-pv-ready', kind);
      if (!readyOnce && opts.onReady) { readyOnce = true; try { opts.onReady({ render: kind, resolved: V.c }); } catch (e) { /* host error */ } }
    }
    function refreshColors() {
      if (!V.alive) return;
      if (V.viewer && V.models) {
        V.colors = tokens();
        V.viewer.setBackgroundColor(V.colors.surface, 1);
        proteinStyle(V.mode);
        ligandStyle(V.models.ligOp);
        if (V.mode === 'change' && V.models.hot) glowShapes(REST, 1);
        V.viewer.render();
      } else if (V.still && V.c) showStill(V.mode);
    }
    function setTheme(theme) {
      V.theme = theme === 'light' || theme === 'dark' ? theme : 'auto';
      if (embed) w.setAttribute('data-pv-theme', V.theme);
      refreshColors();
    }

    // ---------------- zoom levels (body -> lung -> cell -> protein)
    var J = null;
    function gene() { return (V.c && V.c.title && V.c.title.gene) || 'The protein'; }
    function initJourney() {
      if (J || opts.journey === false || !V.c || V.c.kind !== 'structure') return;
      var uid = ++UID;
      J = { level: 'protein', busy: false, user: false, auto: 0, next: null, cool: 0, sc: {}, three: null, mode3: 'none', p3: null };
      ['body', 'lung', 'cell'].forEach(function (l) {   // flat drawings: shown while the 3D loads, and kept if it can't run
        var d = document.createElement('div');
        d.className = 'pv-sc'; d.hidden = true; d.innerHTML = sceneSvg(l, gene(), uid, V.c.membrane);
        el.zoom.appendChild(d); J.sc[l] = d;
      });
      J.w3 = document.createElement('div');
      J.w3.className = 'pv-w3'; J.w3.hidden = true;
      el.zoom.appendChild(J.w3);
      J.hot = document.createElement('button');
      J.hot.type = 'button'; J.hot.className = 'pv-hot';
      el.zoom.appendChild(J.hot);
      el.rail.innerHTML = LEVELS.map(function (l) { return '<button type="button" class="pv-railb" data-pv-level="' + l + '" aria-pressed="false">' + LEVEL_NAME[l] + '</button>'; }).join('');
      el.rail.hidden = false;
      on(el.zoom, 'wheel', function (e) { e.preventDefault(); step(e.deltaY < 0 ? 1 : -1); }, { passive: false });
      var d0 = 0;   // two-finger pinch moves a level
      function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
      on(el.zoom, 'touchstart', function (e) { d0 = e.touches.length === 2 ? dist(e.touches) : 0; }, { passive: true });
      on(el.zoom, 'touchmove', function (e) {
        if (!d0 || e.touches.length !== 2) return;
        var r = dist(e.touches) / d0;
        if (r > 1.3 || r < .75) { step(r > 1 ? 1 : -1); d0 = 0; }
      }, { passive: true });
      var seen = false;
      try { seen = root.sessionStorage.getItem('pv-zoom-seen') === '1'; } catch (e) { /* storage blocked */ }
      if (!seen && !reduced()) { jump('body'); ensure3D(); watchIntro(); } else syncLevel(false);
    }
    // The 3D body, lungs and cell (body3d.js, three.js) load only when someone zooms out of the protein.
    function ensure3D() {
      if (J.p3) return J.p3;
      J.mode3 = 'loading';
      var give = new Promise(function (ok) { setTimeout(function () { ok(false); }, 8000); });   // never wait on it for long
      var load3 = (root.WebGLRenderingContext ? loadScript(PATHS.body3d, function () { return !!root.TMBody3D; }) : Promise.reject(new Error('no webgl')))
        .then(function () {
          if (!V.alive || !root.TMBody3D.supported()) throw new Error('3D not supported');
          var b = root.TMBody3D.create(J.w3, { gene: gene(), membrane: V.c.membrane != null ? V.c.membrane : MEMBRANE.test(gene()), dark: isDark(), level: J.level, onFrame: onFrame3 });
          return b.ready.then(function () { return b; });
        });
      J.p3 = Promise.race([load3, give]).then(function (b) {
        if (!b || !V.alive) throw new Error('3D too slow');
        J.three = b; J.mode3 = 'on';
        LEVELS.forEach(function (l) { if (J.sc[l]) J.sc[l].hidden = true; });
        J.w3.hidden = false;
        if (J.w3.animate) J.w3.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease' });
        placeHot();
        return true;
      }).catch(function (e) {
        if (root.console) root.console.warn('TMProtein: 3D zoom unavailable, using drawings.', e && e.message);
        J.mode3 = 'off'; J.w3.hidden = true;
        if (J.level !== 'protein' && J.sc[J.level]) J.sc[J.level].hidden = false;
        placeHot();
        return false;
      });
      return J.p3;
    }
    function onFrame3(f) {   // keep the pulsing ring on the 3D target as the model turns
      if (!J || !J.hot) return;
      var show = !J.busy && J.level !== 'protein' && f && f.visible;
      J.hot.hidden = !show;
      if (show) { J.hot.style.left = f.x + 'px'; J.hot.style.top = f.y + 'px'; }
    }
    function step(d) {
      if (!J || J.busy || now() < J.cool) return;
      var i = LEVELS.indexOf(J.level) + d;
      if (i < 0 || i >= LEVELS.length) return;
      J.cool = now() + 420;
      go(LEVELS[i], false);
    }
    function focusOf(sc, rel) {   // centre of the scene's [data-focus] element, in px from `rel`'s corner
      var f = sc.querySelector('[data-focus]'), b = (rel || sc).getBoundingClientRect();
      if (!f) return { x: b.width / 2, y: b.height / 2 };
      var r = f.getBoundingClientRect();
      return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
    }
    function placeHot() {
      if (!J || !J.hot) return;
      var nxt = LEVELS[LEVELS.indexOf(J.level) + 1];
      if (nxt) {
        J.hot.setAttribute('data-pv-level', nxt);
        J.hot.setAttribute('aria-label', 'Zoom in to the ' + (nxt === 'protein' ? gene() + ' protein' : nxt === 'cell' ? 'cancer cell' : nxt));
      }
      if (J.three) { if (J.busy || J.level === 'protein') J.hot.hidden = true; return; }   // the frame loop places it
      var sc = J.sc[J.level];
      J.hot.hidden = !sc || J.busy || sc.hidden;
      if (J.hot.hidden) return;
      var p = focusOf(sc, el.zoom);
      J.hot.style.left = p.x + 'px'; J.hot.style.top = p.y + 'px';
    }
    function syncLevel(animate) {
      var l = J.level, P = l === 'protein';
      Array.prototype.forEach.call(el.rail.querySelectorAll('[data-pv-level]'), function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-pv-level') === l ? 'true' : 'false');
      });
      el.honest.textContent = P ? V.c.honesty : 'Illustration, not this patient’s scan.';
      el.pdb.hidden = !P;
      setCaption(P ? V.c.captions[V.mode].html : (l === 'cell' && V.c.cellCaption ? V.c.cellCaption : levelCaption(l, gene())), animate);
      el.stage.setAttribute('aria-label', P ? V.c.aria[V.mode] : LEVEL_ARIA[l]);
      placeHot();
      if (opts.onLevel) { try { opts.onLevel(l); } catch (e) { /* host error */ } }
    }
    function jump(level) {   // no animation
      J.level = level;
      LEVELS.forEach(function (l) { if (J.sc[l]) J.sc[l].hidden = J.three ? true : l !== level; });
      el.zoom.hidden = level === 'protein';
      if (J.three) J.three.go(level, 0);
      syncLevel(false);
    }
    function watchIntro() {
      if (!root.IntersectionObserver) { playIntro(); return; }
      var io = new root.IntersectionObserver(function (es) {
        if (es.some(function (x) { return x.intersectionRatio >= .6; })) { io.disconnect(); playIntro(); }
      }, { threshold: [.6] });
      io.observe(el.stage);
      V.offs.push(function () { io.disconnect(); });
    }
    function playIntro() {   // once per visit: body, lungs, cell, then the protein
      try { root.sessionStorage.setItem('pv-zoom-seen', '1'); } catch (e) { /* storage blocked */ }
      var steps = ['lung', 'cell', 'protein'], i = 0;
      ensure3D().then(function (has3d) {
        var holds = has3d ? [1900, 1400, 1400] : [1100, 700, 700];   // time to look at each level before moving on
        (function next() {
          if (!V.alive || J.user || i >= steps.length) return;
          J.auto = setTimeout(function () { if (V.alive && !J.user) go(steps[i++], true, next); }, holds[i]);
        })();
      });
    }
    var DUR3 = { 'body>lung': 1400, 'lung>body': 1300, 'lung>cell': 1700, 'cell>lung': 1600, 'cell>protein': 1200, 'protein>cell': 1000 };
    function go(target, auto, done) {
      if (!J || !V.alive || LEVELS.indexOf(target) < 0) return;
      if (!auto) { J.user = true; clearTimeout(J.auto); }
      if (J.busy) { J.next = target; return; }
      var from = J.level;
      if (target === from) { if (done) done(); return; }
      J.busy = true;
      if (J.mode3 === 'on') go3(from, target, done);
      else if (J.mode3 === 'off') goFlat(from, target, done);
      else ensure3D().then(function (ok) { if (V.alive) (ok ? go3 : goFlat)(from, target, done); });
    }
    function animator(on) {   // Web Animations with fill, collected so they can be cancelled together
      var A = [], total = 0;
      return { list: A, total: function () { return total; }, run: function (node, frames, o) {
        if (!node || !node.animate || !on) return;
        o.fill = 'both'; total = Math.max(total, (o.delay || 0) + o.duration); A.push(node.animate(frames, o));
      } };
    }
    function landed(done) {   // shared ending: the zoom layer goes away at the protein, which flies to the change
      el.zoom.hidden = J.level === 'protein';
      J.busy = false;
      placeHot();
      if (J.three) J.three.pause(J.level === 'protein');
      if (J.level === 'protein' && V.viewer && V.frames && !reduced()) {
        tweenTo(V.frames[V.mode], 720, function () { if (V.mode === 'change' && V.models && V.models.hot) pulse(); });
      }
      if (J.next) { var n = J.next; J.next = null; go(n, false); } else if (done) done();
    }
    function go3(from, target, done) {
      var ms = reduced() ? 0 : (DUR3[from + '>' + target] || 2000), an = animator(ms > 0);
      var easeIn = 'cubic-bezier(.55,.05,.8,.35)', easeOut = 'cubic-bezier(.2,.8,.25,1)', world = [el.gl].concat(V.still ? [V.still] : []);
      J.level = target;
      el.zoom.hidden = false; J.w3.hidden = false;
      J.three.pause(false);
      if (target === 'protein') {   // the camera dives into the target while the real structure grows in behind it
        if (V.viewer && V.frames && ms) { V.tween++; V.viewer.setView(V.frames.overview); V.viewer.render(); }
        an.run(el.zbg, [{ opacity: 1 }, { opacity: 0 }], { duration: ms * .45, delay: ms * .55, easing: 'ease' });
        world.forEach(function (n) { an.run(n, [{ transform: 'scale(.35)' }, { transform: 'none' }], { duration: ms * .5, delay: ms * .5, easing: easeOut }); });
      } else if (from === 'protein') {
        V.tween++;
        an.run(el.zbg, [{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease' });
        world.forEach(function (n) { an.run(n, [{ transform: 'none' }, { transform: 'scale(.35)' }], { duration: 320, easing: easeIn }); });
      }
      syncLevel(true);
      var timer = new Promise(function (ok) { setTimeout(ok, an.list.length ? an.total() + 40 : 0); });
      Promise.all([J.three.go(target, ms), timer]).then(function () {
        if (!V.alive) return;
        an.list.forEach(function (a) { try { a.cancel(); } catch (e) { /* done */ } });
        landed(done);
      });
    }
    function goFlat(from, target, done) {
      var inward = LEVELS.indexOf(target) > LEVELS.indexOf(from), dur = reduced() ? 0 : 720, an = animator(dur > 0);
      var outEl = J.sc[from] || null, inEl = J.sc[target] || null;
      var easeIn = 'cubic-bezier(.55,.05,.8,.35)', easeOut = 'cubic-bezier(.2,.8,.25,1)';
      J.level = target;
      el.zoom.hidden = false;
      if (inEl) inEl.hidden = false;
      // zooming in grows the old scene around its highlighted spot; zooming out does the same to the scene we return to
      if (outEl && inward) { var fo = focusOf(outEl); outEl.style.transformOrigin = fo.x + 'px ' + fo.y + 'px'; }
      if (inEl && !inward) { var fi = focusOf(inEl); inEl.style.transformOrigin = fi.x + 'px ' + fi.y + 'px'; }
      an.run(outEl, [{ transform: 'none', opacity: 1 }, { transform: inward ? 'scale(7)' : 'scale(.35)', opacity: 0 }], { duration: dur, easing: easeIn });
      an.run(inEl, [{ transform: inward ? 'scale(.35)' : 'scale(7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: dur, delay: dur * .3, easing: easeOut });
      var world = [el.gl].concat(V.still ? [V.still] : []);
      if (target === 'protein') {
        if (V.viewer && V.frames && dur) { V.tween++; V.viewer.setView(V.frames.overview); V.viewer.render(); }
        an.run(el.zbg, [{ opacity: 1 }, { opacity: 0 }], { duration: dur * .7, delay: dur * .45, easing: 'ease' });
        world.forEach(function (n) { an.run(n, [{ transform: 'scale(.35)' }, { transform: 'none' }], { duration: dur, delay: dur * .3, easing: easeOut }); });
      } else if (from === 'protein') {
        V.tween++;
        an.run(el.zbg, [{ opacity: 0 }, { opacity: 1 }], { duration: dur * .6, easing: 'ease' });
        world.forEach(function (n) { an.run(n, [{ transform: 'none' }, { transform: 'scale(.35)' }], { duration: dur * .7, easing: easeIn }); });
      }
      syncLevel(true);
      // finish on a timer rather than on the animations' own events: those stall in a background tab
      setTimeout(function () {
        if (!V.alive) return;
        LEVELS.forEach(function (l) { var sc = J.sc[l]; if (sc) { sc.hidden = l !== J.level; sc.style.transformOrigin = ''; } });
        an.list.forEach(function (a) { try { a.cancel(); } catch (e) { /* done */ } });
        landed(done);
      }, an.list.length ? an.total() + 40 : 0);
    }

    // ---------------- lifecycle
    function show() {
      var req = ++V.req;
      V.c = opts.resolved || resolve(opts.record, opts.trial);
      fill();
      if (opts.onResolved) opts.onResolved(V.c);
      if (V.c.kind !== 'structure') { ready('none'); return V.c; }
      initJourney();
      var spin = document.createElement('div');
      spin.className = 'pv-load';
      el.stage.appendChild(spin);
      load().then(function (r) {
        if (req !== V.req || !V.alive) return;
        if (spin.parentNode) spin.parentNode.removeChild(spin);
        if (!opts.resolved) { V.c = resolve(opts.record, opts.trial); fill(); if (opts.onResolved) opts.onResolved(V.c); }
        if (!root.TM_STRUCTURES[V.c.pdb]) { fallback('nodata'); return; }
        if (opts.forceStill) { fallback('forced'); return; }
        if (!r.lib || !webglOk()) { fallback('nowebgl'); return; }
        try { startGl(); } catch (e) {
          if (root.console) root.console.warn('TMProtein: 3D failed, showing a still.', e);
          releaseGl();
          fallback('error');
        }
      }, function () {
        if (spin.parentNode) spin.parentNode.removeChild(spin);
        if (req === V.req && V.alive) fallback('noscript');
      });
      return V.c;
    }
    function releaseGl() {
      var v = V.viewer;
      if (!v) return null;
      var gl = null;
      try { gl = v.renderer && v.renderer.getContext ? v.renderer.getContext() : null; } catch (e) { /* ignore */ }
      try { v.clear(); } catch (e) { /* ignore */ }
      V.viewer = null; V.models = null;
      el.gl.innerHTML = '';
      if (V.counted) { V.counted = false; LIVE.views--; }
      // 3Dmol shares one WebGL context between its viewers; release it when no view is left
      if (LIVE.views <= 0 && gl && gl.getExtension && !gl.isContextLost()) {
        var ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
      return gl;
    }
    function destroy() {
      if (!V.alive) return;
      V.alive = false;
      V.req++; V.tween++; V.glow++; V.fade++;
      if (J) { clearTimeout(J.auto); if (J.three) J.three.destroy(); }
      releaseGl();
      V.offs.forEach(function (f) { f(); });
      V.offs = [];
      if (V.ro) V.ro.disconnect();
      if (w.parentNode) w.parentNode.removeChild(w);
    }

    if (embed) setTheme(opts.theme || 'auto');
    return { el: el, state: V, show: show, setMode: setMode, setTheme: setTheme, destroy: destroy, level: function (l) { if (l) go(l, false); return J ? J.level : null; },
      mode: function () { return V.mode; }, resolved: function () { return V.c; } };
  }

  // ------------------------------------------------------------------ the floating sheet (open / close)
  var SH = { root: null, el: null, view: null, closing: null, open: false, opener: null, onClose: null, htmlOverflow: '', theme: 'auto', timer: 0 };

  function buildSheet() {
    injectCss();
    var r = document.createElement('div');
    r.className = 'pv-root pv-layer';
    r.hidden = true;
    r.innerHTML =
      '<div class="pv-scrim" data-pv-close></div>' +
      '<section class="pv-sheet" role="dialog" aria-modal="true" aria-labelledby="pv-title" tabindex="-1">' +
        '<div class="pv-grab" aria-hidden="true"></div>' +
        '<header class="pv-head"><h2 class="pv-title" id="pv-title"></h2>' +
        '<button type="button" class="pv-x" data-pv-close aria-label="Close">' + ICON.x + '</button></header>' +
        '<div class="pv-body"></div>' +
      '</section>';
    document.body.appendChild(r);
    SH.root = r;
    SH.el = { sheet: r.querySelector('.pv-sheet'), title: r.querySelector('.pv-title'), body: r.querySelector('.pv-body'),
      head: r.querySelector('.pv-head'), grab: r.querySelector('.pv-grab'), x: r.querySelector('.pv-x') };
    r.addEventListener('click', function (e) { if (e.target.closest('[data-pv-close]')) close(); });
    r.addEventListener('keydown', function (e) {
      if (!SH.open) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;                         // keep focus inside the sheet
      var f = Array.prototype.filter.call(r.querySelectorAll('button:not([tabindex="-1"]),[href],[tabindex="0"]'),
        function (x) { return x.getClientRects().length && !x.closest('[hidden]'); });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === SH.el.sheet)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    swipeToClose();
    document.addEventListener('tm:layer-open', function (e) { if (SH.open && !(e.detail && e.detail.id === 'pv')) close(); });
  }

  function swipeToClose() {   // phone: drag the sheet's top edge down to dismiss
    var y0 = null, dy = 0;
    function down(e) {
      if (!root.matchMedia('(max-width: 600px)').matches || e.target.closest('button')) return;
      y0 = e.clientY; dy = 0;
      SH.el.sheet.style.transition = 'none';
    }
    function move(e) {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      SH.el.sheet.style.transform = 'translateY(' + dy + 'px)';
    }
    function up() {
      if (y0 === null) return;
      y0 = null;
      SH.el.sheet.style.transition = '';
      SH.el.sheet.style.transform = '';
      if (dy > 90) close();
    }
    [SH.el.head, SH.el.grab].forEach(function (h) { h.addEventListener('pointerdown', down); });
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  function setTitle(c) {
    SH.el.title.innerHTML = '<span class="pv-gene">' + esc(c.title.gene) + '</span>' +
      (c.title.change ? ' <span class="pv-chg">' + esc(c.title.change) + '</span>' : '');
  }
  function sheetTheme(theme) {
    SH.theme = theme === 'light' || theme === 'dark' ? theme : 'auto';
    SH.root.setAttribute('data-pv-theme', SH.theme);
  }

  function open(opts) {
    if (!HAS_DOM) return null;
    opts = opts || {};
    if (!SH.root) buildSheet();
    var wasOpen = SH.open;
    clearTimeout(SH.timer);
    if (SH.closing) { SH.closing.destroy(); SH.closing = null; }
    if (SH.view) { SH.view.destroy(); SH.view = null; }
    document.dispatchEvent(new root.CustomEvent('tm:layer-open', { detail: { id: 'pv' } }));
    SH.opener = opts.opener || (wasOpen ? SH.opener : document.activeElement);
    SH.onClose = opts.onClose || null;
    sheetTheme(opts.theme || 'auto');
    SH.root.removeAttribute('data-pv-ready');
    var vopts = extend({}, opts);
    vopts.onResolved = setTitle;
    vopts.onReady = function (info) { SH.root.setAttribute('data-pv-ready', info.render); if (opts.onReady) opts.onReady(info); };
    SH.view = createView(SH.el.body, vopts, false);
    SH.view.state.theme = SH.theme;
    SH.root.hidden = false;
    SH.open = true;
    SH.htmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    var c = SH.view.show();
    void SH.root.offsetWidth;                    // so the enter transition runs
    SH.root.classList.add('pv-in');
    SH.el.x.focus({ preventScroll: true });
    return c;
  }

  function close() {
    if (!SH.open) return;
    SH.open = false;
    SH.root.classList.remove('pv-in');
    document.documentElement.style.overflow = SH.htmlOverflow;
    SH.closing = SH.view;                         // kept on screen while the sheet slides out
    SH.view = null;
    SH.timer = setTimeout(function () {
      if (SH.closing) { SH.closing.destroy(); SH.closing = null; }
      if (!SH.open) SH.root.hidden = true;
    }, 440);
    var back = SH.opener;
    SH.opener = null;
    if (back && back.focus && document.contains(back) && back.getClientRects().length) back.focus({ preventScroll: true });
    if (SH.onClose) { var cb = SH.onClose; SH.onClose = null; cb(); }
  }

  function setTheme(theme) {
    if (!SH.root) return;
    sheetTheme(theme);
    if (SH.view) SH.view.setTheme(SH.theme);
  }

  function mount(container, opts) {
    if (!HAS_DOM || !container) return null;
    var view = createView(container, opts || {}, true);
    view.show();
    return {
      get resolved() { return view.resolved(); },
      element: view.el.root,
      setMode: function (m) { view.setMode(m, false); },
      level: view.level,
      setTheme: view.setTheme,
      mode: view.mode,
      destroy: view.destroy,
      _state: view.state
    };
  }

  root.TMProtein = {
    version: '1.4.0',
    resolve: resolve,
    open: open,
    close: close,
    mount: mount,
    load: load,
    setTheme: setTheme,
    isOpen: function () { return SH.open; },
    mode: function (m) { if (SH.view && m) SH.view.setMode(m, false); return SH.view ? SH.view.mode() : null; },
    _internals: { sheet: function () { return SH; }, live: function () { return LIVE.views; }, egfrVariants: egfrVariants,
      trialDrugs: function (t) { return trialDrugs(t).map(function (d) { return d.name; }); }, DRUGS: DRUGS, GENE: GENE }
  };
})(typeof window !== 'undefined' ? window : globalThis);
