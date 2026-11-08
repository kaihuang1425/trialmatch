# 3D molecule, genome and body views for TrialMatch: what exists and what to build

All sources checked **2026-11-07**. PDB facts come from the RCSB data and search APIs (`data.rcsb.org`,
`search.rcsb.org`), npm facts from `registry.npmjs.org` and `data.jsdelivr.com`, HRA facts from the
`hubmapconsortium/ccf-releases` GitHub repo. **Unconfirmed** = not confirmed on an official page today.

**Bottom line.** The useful "what's at fault" picture for a prescreen nurse is the patient's driver protein with the
trial drug sitting in it (a real crystal structure), plus a plain 2D protein bar. A body map can only honestly show
"lung primary, stage, N category, distant spread yes/no (site not recorded)". 3D genome (Hi-C) views do not help an
eligibility decision. A whole-body 3D model costs a lot (80+ MB) and would mostly display things the data does not know.

**Critical constraint found in the repo.** `trialmatch/README.md` says to open `app/index.html` directly ("no server or
install needed"). From a `file://` page, Chrome and Firefox block `fetch()` of neighbouring files, so structure files and
GLBs must be **embedded in index.html by `build_app.py`** (as the app already does with its data), not fetched.
Test this; it is standard browser behaviour but was not tested on the demo laptop.

## (a) Options

| Tool or data | What it shows | Licence | Size / effort | Offline OK? | Fit for the clinician |
|---|---|---|---|---|---|
| **3Dmol.js** 2.5.5 (npm `3dmol`, pub. 2026-05-22) | Protein cartoon, ligand sticks, labels; select by `chain`/`resi`/`resn`; `addModel(text,'cif')`; BCIF parser present in build | BSD-3-Clause | `build/3Dmol-min.js` 0.54 MB; ~3-4 h | Yes, if CIF text is embedded and the JS vendored | **Best for tomorrow**: tiny, 10-line API |
| **Mol\*** (npm `molstar` 5.13.1, pub. 2026-10-08) | Same, better rendering; viewer used by RCSB, PDBe, AlphaFold DB | MIT | `build/viewer/molstar.js` 5.27 MB + 0.07 MB CSS; ~5-6 h | Yes via `loadStructureFromData(data,'mmcif')`; network calls when loading local data unconfirmed, test offline | Good, more polish, more risk |
| Mol\* MolViewSpec (`loadMvsData(json,'mvsj')`) | Declarative JSON scene: component selectors, colour, label, camera | MIT (part of Mol\*) | Same bundle; JSON per driver | Yes if structure is inside an `.mvsx` or reachable URL (mvsx offline path unconfirmed) | Nice if Mol\* is chosen |
| PDBe Molstar 3.12.0 | Mol\* wrapper with `visual.select/focus/setColor` | Apache-2.0 | 6.1 MB | Defaults call PDBe APIs; custom-data path unconfirmed | Skip (bigger, network-shaped) |
| NGL 2.5.0 | Protein + ligand viewer (COSMIC-3D uses NGL) | MIT | `dist/ngl.js` 1.29 MB | Yes | Fine, no advantage over 3Dmol |
| **RCSB PDB entries** | Experimental drug-bound structures (section b) | CC0 1.0 (attribution encouraged) | mmCIF 250-1250 KB each | Yes, embedded | Core data |
| AlphaFold DB (v6 models) | Full-length predicted protein, **no drug**, confidence colouring | CC BY 4.0; "not validated for... any clinical use" | CIF size unmeasured (file server returned 403 to curl) | Yes, embedded | Context only (e.g. where MET exon 14 region sits) |
| **Hand-made SVG protein bar + lollipop** | Domains with the patient's variant marked | Own code | ~1.5-2 h | Yes | **Good**: clinicians know this from cBioPortal/OncoKB |
| g3lollipop.js | Mutation lollipop (d3 v4) | MIT; last commit 2019, S3-hosted build | Small | Yes if vendored | Stale; hand-roll instead |
| cBioPortal MutationMapper / react-mutation-mapper 0.9.15 | Lollipop + OncoKB annotations | Apache-2.0 | React component | Needs React + APIs | Link out, don't embed |
| ProteinPaint | Lollipops, St Jude PeCan | Academic-use licence (St Jude) | Large | No | Link out only |
| ideogram.js 1.53.0 | Chromosome with gene locus | CC0-1.0 | 0.35 MB + 41 KB band JSON (`dataDir` option) | Yes if band JSON vendored | Decorative; says nothing about eligibility |
| IGV.js 3.8.10 | Reads/variants on reference genome | MIT | 1.5 MB + genome/tracks | No (needs reference data) | No fit |
| HiGlass 2.3.5, Juicebox.js | Hi-C contact maps | MIT | 2 MB + .hic/.mcool data | No | No fit: no patient has Hi-C |
| 3D Genome Browser, Nucleome Browser | Chromatin folding, TADs, 3D genome models | Research portals (Nucleome dispatch code BSD-3) | Web portals | No | No fit (see note) |
| **HRA 3D reference organs** (HuBMAP) | Lungs with each lobe, bronchopulmonary segments, hilum, bronchi as named nodes; also liver, kidney, brain, lymph node, vertebrae | CC BY 4.0 | Male lung v1.4 10.94 MB GLB (female 23.25 MB), 58 meshes, 77 nodes, no Draco; whole-body "united" 80-86 MB zipped | Yes, if embedded (base64 adds 33%) | Optional; lobe detail unusable because lobe is not recorded |
| BodyParts3D (DBCLS) | Whole-body organs, per-organ OBJ | CC BY 4.0 (current licence page; older releases said CC BY-SA 2.1 JP) | OBJ zips 62 MB / 136 MB; Blender conversion | Yes after conversion | Too heavy for 12 h |
| Z-Anatomy | Full atlas as Blender template (built on BodyParts3D) | CC BY-SA 4.0; some parts CC BY-NC-SA 4.0 | Repo ~100 MB; Blender work | Yes after export | Too heavy; share-alike |
| NIH 3D | Many models incl. copies of HRA organs | Per entry (PD/CC/more restrictive); "not intended for medical diagnosis" | Per model | Yes | Check each entry |
| Open Anatomy (Slicer atlases) | Thorax/abdomen label maps | "3D Slicer License, section B" | Slicer conversion | Yes after export | Too heavy |
| Sketchfab | Assorted lung models | Per model; unconfirmed | Per model | Yes after download | Unconfirmed, skip |
| BioDigital Human | Commercial 3D anatomy, SDK/widget | Commercial; free Personal plan excludes developer toolkits and publishing (pricing page) | Account + sales | No (online viewer) | **Not viable** |
| `<model-viewer>` 4.4.0 | GLB viewer with hotspots (`slot="hotspot-*"`, `data-position`) | Apache-2.0 | 1.07 MB | Yes; fetches Draco/KTX2 decoders from gstatic only for compressed GLBs | Hotspots fine; public API is materials-only, so no per-lobe recolour |
| three.js r180 | Any GLB; `getObjectByName('VH_M_lungs_R_upper_lobe')` to recolour one node | MIT | `three.module.min.js` 0.34 MB + `three.core.min.js` 0.38 MB + loaders 0.15 MB | Yes if vendored | Use if a 3D lung is wanted |
| **Hand-made SVG body schematic** | Torso, lungs, N-zone bands, "distant spread" badge, "not recorded" chips | Own code | ~2-3 h | Yes | **Best honesty/perf ratio** |

**3D genome, candidly.** Hi-C/3D genome tools show how chromosomes fold in a cell population. TCGA/cBioPortal
records carry no Hi-C, no trial criterion mentions chromatin folding, and the fusion drivers (ALK, ROS1, RET) are better
explained by a 2D "gene A exons + gene B kinase" diagram, and only when the partner is recorded. Isomorphic/UCL judges
will spot a decorative Hi-C map. Leave it out.

**Prior art, so no novelty claims.** Mutation-on-structure already exists: cBioPortal's Mutations tab (lollipop +
3D structure via Genome Nexus/G2S; users reported "3D structure view temporarily unavailable" in a Sept 2025 forum
thread), COSMIC-3D (Sanger/Astex, NGL-based, COSMIC is commercially licensed), PDBe/RCSB ligand views. Body maps with
genomics exist: **BodyMapR** (JAMIA Open 2022, MIT, R/Shiny; anterior/posterior body, skeleton, lymphatics, filter by
900+ genes). Commercial reports (FoundationOne CDx sample report) list therapies and trials ranked by location and phase
as text; Tempus xT adds therapy and trial matching; no 3D found in either. MTB tools are mostly tables and timelines
(JMIR 2025 scoping review); navify Tumor Board reportedly became navify Clinical Hub (secondary source, unconfirmed).
A defensible claim is narrower: "each matched trial's drug shown in its own crystal structure next to the eligibility
checklist, with unknowns flagged".

## (b) Verified structures (RCSB, checked 2026-11-07)

"In app" = drug name appears in `trialmatch/data/trials.json`. All X-ray. Ligand = PDB chemical component ID.

| Driver | Drug (in app?) | PDB | What is in the crystal | Ligand | Res. | Note |
|---|---|---|---|---|---|---|
| KRAS G12C | sotorasib (yes) | [6OIM](https://www.rcsb.org/structure/6OIM) | KRAS G12C, cysteine-light (C51S/C80L/C118S), GDP | MOV (AMG 510) | 1.65 Å | Cys12 auth 12 present, covalent |
| KRAS G12C | adagrasib (yes) | [6UT0](https://www.rcsb.org/structure/6UT0) | KRAS G12C, C51S/C80L/C118S, GDP | M1X (MRTX849) | 1.94 Å | mmCIF 1.25 MB |
| KRAS G12C | divarasib (yes) | [9DMM](https://www.rcsb.org/structure/9DMM) | KRAS G12C, C51S/C80S/C118S, GDP | A1AWR | 1.9 Å | Also [9PZY](https://www.rcsb.org/structure/9PZY) 2.17 Å |
| KRAS G12C | calderasib (yes) | [8S8C](https://www.rcsb.org/structure/8S8C) | KRAS G12C, GDP | A1H5U | 1.9 Å | Title says "MK-1084" (= calderasib per Merck news) |
| KRAS G12C | olomorasib (yes) | [9N44](https://www.rcsb.org/structure/9N44) | KRAS G12C, GDP | A1BV7 | 1.11 Å | |
| KRAS G12C | glecirasib (yes) | [9KPN](https://www.rcsb.org/structure/9KPN) | KRAS G12C, GDP | A1L6B | 1.29 Å | Title says "Compound 20 (JAB-20)" |
| KRAS G12D | MRTX1133 (no) | [7RPZ](https://www.rcsb.org/structure/7RPZ) | KRAS G12D, GDP | 6IC | 1.3 Å | Asp12 present |
| KRAS G12D | zoldonrasib (yes) | [9CTB](https://www.rcsb.org/structure/9CTB) | KRAS G12D + cyclophilin A tri-complex, GppNHp | A1AZZ | 1.29 Å | Shows the "molecular glue" mechanism |
| EGFR L858R | osimertinib (yes) | [6JWL](https://www.rcsb.org/structure/6JWL) | EGFR 696-1022 L858R | YY3 | 2.55 Å | Arg858 and Cys797 present |
| EGFR T790M | osimertinib | [6JX0](https://www.rcsb.org/structure/6JX0) | EGFR 696-1022 T790M | YY3 | 2.53 Å | Met790 present |
| EGFR WT | osimertinib | [4ZAU](https://www.rcsb.org/structure/4ZAU) | Wild-type EGFR | YY3 | 2.8 Å | Original AZD9291 complex |
| EGFR L858R/T790M/C797S | osimertinib | [6LUD](https://www.rcsb.org/structure/6LUD) | Triple mutant (+E865A/E866A/K867A) | YY3 | 2.05 Å | Resistance: covalent Cys797 gone |
| EGFR exon 20 ins | furmonertinib (app says firmonertinib; alias unconfirmed) | [9WR8](https://www.rcsb.org/structure/9WR8) | "EGFR 20ins" | A1BYK ("Alflutinib") | 2.33 Å | Released 2026-09-16 |
| EGFR | lazertinib (yes) | [7UKV](https://www.rcsb.org/structure/7UKV) | Wild-type EGFR | ZRT | 2.4 Å | |
| MET (EGFR-MET bispecific) | amivantamab (not in trials.json today) | [6WVZ](https://www.rcsb.org/structure/6WVZ) | Human MET + anti-MET Fab of amivantamab | (protein) | 3.1 Å | MET arm only; no EGFR-arm entry found |
| ALK | lorlatinib (yes) | [4CLI](https://www.rcsb.org/structure/4CLI) | ALK kinase 1093-1400, wild type | 5P8 | 2.05 Å | [4CLJ](https://www.rcsb.org/structure/4CLJ) = L1196M, 1.66 Å |
| ALK | alectinib (yes) | [3AOX](https://www.rcsb.org/structure/3AOX) | ALK kinase | EMH (CH5424802) | 1.75 Å | |
| ROS1 | lorlatinib | [4UXL](https://www.rcsb.org/structure/4UXL) | ROS1 kinase 1934-2229 | 5P8 | 2.4 Å | Crizotinib: [3ZBF](https://www.rcsb.org/structure/3ZBF) 2.2 Å |
| BRAF V600E | dabrafenib (yes) | [4XV2](https://www.rcsb.org/structure/4XV2) | BRAF V600E + 11 engineering mutations | P06 | 2.5 Å | **Residues 597-605 not modelled: Glu600 cannot be shown** |
| BRAF V600E | vemurafenib (no) | [3OG7](https://www.rcsb.org/structure/3OG7) | BRAF V600E (engineered) | 032 | 2.45 Å | Glu600 modelled in chain B |
| MEK1 | trametinib (yes) | [7JUR](https://www.rcsb.org/structure/7JUR) | KSR2:MEK1 | QOM | 2.82 Å | Partner drug of dabrafenib |
| MET | capmatinib (yes, 1 mention) | [9SXJ](https://www.rcsb.org/structure/9SXJ) | MET kinase 1057-1345, WT | A1JRF | 1.32 Å | Released 2026-02-18; exon 14 region not in construct |
| MET | tepotinib (yes) | [4R1V](https://www.rcsb.org/structure/4R1V) | MET kinase, WT | 3E8 | 1.2 Å | |
| RET | selpercatinib (no) | [7JU6](https://www.rcsb.org/structure/7JU6) | RET kinase 700-1012 | Q6G | 2.06 Å | Pralsetinib: [7JU5](https://www.rcsb.org/structure/7JU5) 1.9 Å |

**No public structure found** (RCSB full-text search on 2026-11-07): zongertinib / BI 1810631 (HER2; its discovery
paper, PMC11726021, reports no structure), taletrectinib, sunvozertinib, fulzerasib, ensartinib. For these, show the
target's AlphaFold DB model labelled "predicted, drug not shown", or text only. Do **not** generate a drug pose with
AlphaFold Server: its terms are non-commercial, outputs may not be used for docking, and it accepts only a fixed list of
ligands (EBI training page).

**AlphaFold DB** entries exist (model v6) for KRAS (AF-P01116-F1, mean pLDDT 91.5), EGFR (AF-P00533-F1, 75.9), ALK
(AF-Q9UM73-F1, 68.2), BRAF (AF-P15056-F1, 66.4), MET (AF-P08581-F1, 79.3), RET (AF-P07949-F1, 78.8), ROS1
(AF-P08922-F1, 72.2), ERBB2 (AF-P04626-F1, 74.0). Apo predictions of the wild-type protein: no drug, no fusion partner.

## (c) Recommendation for tomorrow (two people, ~12 h)

**P1. "Drug in its target" panel in the prescreen view (person A, ~4 h).**
- 3Dmol.js 2.5.5: copy `3Dmol-min.js` plus its LICENSE into `app/vendor/`, have `build_app.py` inline it (CDN
  `<script>` as the online default is fine, but inline is what survives a dead network).
- `build_app.py` embeds 6-8 mmCIF files as text (about 3-4 MB). Optional trim at build time: keep chain A, the drug and
  GDP, drop waters, to cut size roughly in half (estimate, not measured).
- Start with 6OIM, 6UT0, 9DMM, 6JWL, 4CLI, 7JU6, 4XV2, 9CTB. Map patient biomarker + matched trial drug to an entry.
- Render: grey cartoon; mutated residue as red sticks with a label ("Cys12, the G12C change"); drug as sticks with a label
  ("sotorasib, PDB 6OIM, 1.65 Å"); `zoomTo` the drug. One viewer instance, reused per patient.
- Caption under every view: "Crystal structure of a lab-made protein fragment, not this patient's tumour. Shows why the
  drug fits the altered protein." For ALK/ROS1/RET fusions highlight no residue; say "a gene fusion keeps this kinase
  domain switched on; the drug binds its ATP pocket". For BRAF say Glu600 is unresolved in 4XV2.
- Alternative if one person knows Mol\*: `molstar.Viewer.create(el,{layoutIsExpanded:false,layoutShowControls:false})`
  then `loadStructureFromData(cif,'mmcif')`. Stronger "same viewer as PDB and AlphaFold DB" story; 10x larger bundle.

**P2. 2D protein bar with the patient's variant (person B, ~2 h).** SVG: protein length, kinase or GTPase domain,
lollipop at the patient's residue, drug-binding region shaded. Domain coordinates fetched once from UniProt at build time
and bundled (not at demo time). Clinicians read this faster than 3D; it also works when WebGL fails.

**P3. Honest body schematic (person B, ~3 h).** Hand-drawn SVG torso: lungs shaded as "primary: lung, side and lobe not
recorded"; N0-N3 as labelled nodal zones (N1 hilar, N2 mediastinal, N3 contralateral/supraclavicular), not dots on
specific nodes; M1 shown as a "distant spread: yes, site not recorded" badge; brain, liver, bone, adrenal as grey "?"
chips: "not recorded; trial X requires stable/treated brain metastases, check before enrolment". This uses the app's
"unknown, not not-met" rule and gives the nurse a to-do list.

**P4. Optional 3D lung (only if P1-P3 are done, ~3 h).** HRA v1.4 male lung GLB (CC BY 4.0) in three.js, whole lungs
tinted uniformly (not a lobe). Shrink before embedding (e.g. gltf-transform simplify; resulting size unconfirmed) and
avoid Draco/meshopt so no decoder download is needed. Value over P3 is mostly visual.

**Skip:** 3D genome/Hi-C, whole-body 3D (80+ MB), BioDigital, Z-Anatomy/BodyParts3D conversion, predicted drug poses.

**Schedule:** P1 4 h + P2 2 h + P3 3 h in parallel pairs = ~6-7 h wall clock, then 1 h offline testing, 1 h captions and
attributions, the rest is buffer or P4.

**Network-failure fallback.** (1) Everything inlined by `build_app.py`: libraries, CIF text, SVGs; no runtime fetches.
(2) Check WebGL on load (`canvas.getContext('webgl')`); if absent, show pre-rendered PNGs (3Dmol `viewer.pngURI()`,
captured at build or dev time) and the P2 bar. (3) Rehearse with Wi-Fi off, in Chrome and one other browser, from the USB
copy you will actually use. (4) Keep `index.html` under ~6 MB (it is 0.7 MB today).

## (d) Risks

**Licensing and attribution.**
- PDB: CC0; still cite entries and wwPDB. AlphaFold DB: CC BY 4.0, cite Jumper 2021 and Varadi 2024, show "predicted,
  not validated for clinical use". HRA: CC BY 4.0, cite "Browne et al., HuBMAP CCF 3D Reference Object Library".
- BodyParts3D CC BY 4.0 with set attribution text; Z-Anatomy CC BY-SA 4.0 (share-alike) with some NC parts.
- 3Dmol BSD-3, Mol\* MIT, three.js MIT, model-viewer Apache-2.0: keep licence text when inlining.
- Do not embed ProteinPaint (academic-only), COSMIC-3D (commercial), BioDigital (commercial); link out instead.

**Misleading visuals.**
- Crystal constructs are engineered: 4XV2 carries 12 listed mutations, 6OIM/6UT0 are cysteine-light KRAS. Say so.
- Fusions (ALK, ROS1, RET) and MET exon 14 skipping are not point mutations; the MET exon 14 region is absent from
  kinase-domain crystals. Never paint a "faulty residue" for them.
- BRAF Glu600 is not modelled in 4XV2; don't draw it there.
- Body map: no lobe, laterality or metastasis site exists in the data. Never place a tumour in a lobe or draw organ
  metastases. N categories are zones, not specific nodes. M1a/M1b mean different things in AJCC 7th vs 8th (8th adds
  M1c); show the recorded code and edition, not an inferred site.
- "What's at fault" must stay at "recorded biomarker → protein → drug". No causal claim about this patient's tumour.
- Label it decision support for prescreening, not diagnosis (NIH 3D and AFDB carry the same disclaimers).

**Performance on a judge's laptop.** Mol\* is 5.3 MB of JS to parse; 3Dmol 0.54 MB. GLBs are 11-23 MB and base64
grows them by a third. WebGL can be disabled on locked-down or remote-desktop machines; browsers cap live WebGL contexts,
so reuse one viewer. Corporate networks may block CDNs, hence inlining.

## (e) Sources (all checked 2026-11-07)

Molecular viewers and data
- https://registry.npmjs.org/3dmol/latest ; https://data.jsdelivr.com/v1/packages/npm/3dmol@2.5.5 ; https://3dmol.org/doc/
- https://registry.npmjs.org/molstar/latest ; https://cdn.jsdelivr.net/npm/molstar@5.13.1/lib/apps/viewer/app.d.ts ; https://cdn.jsdelivr.net/npm/molstar@5.13.1/lib/apps/viewer/options.js ; https://github.com/molstar/molstar
- https://molstar.org/mol-view-spec-docs/
- https://registry.npmjs.org/pdbe-molstar/latest ; https://github.com/molstar/pdbe-molstar/wiki/1.-PDBe-Molstar-as-JS-plugin
- https://registry.npmjs.org/ngl/latest
- https://www.wwpdb.org/about/usage-policies ; https://www.rcsb.org/pages/policies
- https://data.rcsb.org/graphql ; https://search.rcsb.org/rcsbsearch/v2/query (queries listed in section b); entry pages https://www.rcsb.org/structure/{ID}
- https://alphafold.ebi.ac.uk/download ; https://alphafold.ebi.ac.uk/api/prediction/{UniProt}
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11726021/ (zongertinib discovery paper)
- https://www.biospace.com/press-releases/merck-initiates-phase-3-kandlelit-007-trial-evaluating-calderasib-mk-1084-an-investigational-oral-kras-g12c-inhibitor-in-combination-with-keytruda-qlex-pembrolizumab-and-berahyaluronidase-alfa-pmph-in-certain-patients-with-advanced-nsclc (calderasib = MK-1084)
- https://www.ebi.ac.uk/training/online/courses/alphafold/alphafold-3-and-alphafold-server/alphafold-server-your-gateway-to-alphafold-3

Genome and lollipop tools
- https://github.com/G3viz/g3lollipop.js ; https://raw.githubusercontent.com/stjude/proteinpaint/master/LICENSE
- https://registry.npmjs.org/react-mutation-mapper/latest ; https://github.com/cBioPortal/cbioportal-frontend
- https://registry.npmjs.org/ideogram/latest ; https://github.com/eweitz/ideogram/blob/master/api.md
- https://registry.npmjs.org/igv/latest ; https://registry.npmjs.org/higlass/latest ; https://github.com/aidenlab/juicebox.js ; https://igvteam.github.io/juicebox.js/docs/embedding
- https://pmc.ncbi.nlm.nih.gov/articles/PMC6172833 (3D Genome Browser) ; https://nb-docs.readthedocs.io/ (Nucleome Browser)

Body and anatomy
- https://hubmapconsortium.github.io/ccf/pages/ccf-3d-reference-library.html (CC BY 4.0, citation)
- https://github.com/hubmapconsortium/ccf-releases (v1.2-v2.0 `models/`, `v2.0/models/asct-b-3d-models-crosswalk.csv`)
- https://raw.githubusercontent.com/hubmapconsortium/ccf-releases/main/v1.4/models/3d-vh-m-lung.glb (header read only: 58 meshes, 77 nodes, no extensions)
- https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html ; https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html ; https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/README_e.html
- https://github.com/Z-Anatomy/Models-of-human-anatomy
- https://3d.nih.gov/terms ; https://3d.nih.gov/faqs
- https://openanatomy.org/atlas-pages/atlas-mauritania-thorax.html
- https://pricing.biodigital.com/ (free plan excludes developer toolkits and publishing)
- https://registry.npmjs.org/@google/model-viewer/latest ; https://modelviewer.dev/examples/annotations/ ; https://cdn.jsdelivr.net/npm/@google/model-viewer@4.4.0/lib/features/scene-graph/api.d.ts
- https://data.jsdelivr.com/v1/packages/npm/three@0.180.0

Prior art
- https://pmc.ncbi.nlm.nih.gov/articles/PMC8903180/ (BodyMapR) ; https://github.com/TheMillerLab/BodyMapR
- https://groups.google.com/g/cbioportal/c/TRAe7gcFID8 (cBioPortal 3D view status)
- https://sanger.ac.uk/tool/cosmic-3d ; https://cancer.sanger.ac.uk/cosmic3d/protein/BRAF
- https://chat.fhir.org/user_uploads/10155/K5ufmbKB5E6xjFm7z6osVhJE/FoundationOne_CDx_Sample_Report.pdf ; https://www.tempus.com/oncology/genomic-profiling/xt-xr/
- https://www.jmir.org/2025/1/e69104 (MTB visualisation review) ; https://intuitionlabs.ai/articles/navify-clinical-hub-roche-digital-trial-platform

**Unconfirmed:** Sketchfab model licences (search API returned no JSON); whether Mol\* makes background calls when
loading embedded data; `.mvsx` offline loading; model-viewer/three.js loading a GLB from a `data:` URI on `file://`
(expected to work, not tested); size after gltf-transform simplification; whether separate HRA organ GLBs share one
coordinate frame; current cBioPortal 3D panel status; navify rebrand (secondary source); OncoKB and CIViC data terms (not
checked today); BioDigital terms beyond the pricing page (support article returned 403).
