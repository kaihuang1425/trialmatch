# Trial Match landing page: all text

Every word on the landing page (`public/index.html`), in page order. Edit the text after each label, then send the file back and the changes can be applied to the page.

Notes for editing:
- Headings marked *word by word* animate one word at a time. Write them as normal sentences; the page splits them into words.
- *Gradient* and *grey* mark the part of a heading shown in the blue-violet gradient or in grey.
- Numbers marked *counts up* animate from a start value. If you change the number, say what it should count up from.
- “→” arrows are part of the button text.

---

## Browser tab

- Page title: Trial Match

## Opening splash (plays once on load)

- Wordmark: Trial Match
- Step 1: Reading the record
- Step 1 result: 4 facts, each quoted
- Step 2: Checking entry rules
- Step 2 result: 9 of 9 met
- Step 3: Finding trials that fit
- Step 3 result: LT-301 · London
- Last line: Ready
- Label (read by screen readers): Loading Trial Match

The splash is a syringe that fills while the page loads. Each step shows large, then shrinks into a checked list. Its text lives in `public/loader/syringe-loader.js`, which the demo at `/app/` shares.

## Top bar

- Logo: Trial Match
- Section link 1: The gap
- Section link 2: Product
- Section link 3: Agents
- Section link 4: Results
- Section link 5: Trust
- Button: Try the demo →

## Hero

- Pill (not a link): Team Legacy
- Heading (*word by word*): 95% of patients are willing to join trials.
- Heading, second sentence (*gradient*): Yet few ever hear about them.
- Intro: Trial Match is a multi-agent system that connects every patient to trials they qualify for, and gives every trial team a shortlist of people ready to join.
- Main button: Try the demo →
- Second button: See how it works

### The photo

- Photo description (read by screen readers): A smiling woman receives a vaccine from a nurse
- Match notice: Matched to a trial in London
- Match notice, second line: All 9 entry rules met
- Photo credit: Photo: CDC on Unsplash. The match shown is illustrative.

## The gap (section link “The gap”)

- Heading (*word by word*): Trial teams in the UK open faster than ever.
- Heading, second sentence (*grey*): Yet spend weeks empty waiting for patients.

### Left panel

- Label: Patients
- Number (*counts up from 0*): 95%
- Text: would consider joining a trial
- Number (*counts up from 0*, shown in red): 63%
- Text: were never told about one

### Right panel

- Label: Administrative Time Taken to Open Trials
- Number (*counts down from 169*): 122
- Text: days to recruit first patient, down from 169
- Number (*counts up from 0*, shown in red): 4 in 10
- Text: trials still had no patient a month after opening

### Closing line

- Text: Patients are willing, and trials are open. What’s missing is the connection. Today that depends on a busy doctor remembering which trials exist and checking each one’s rules by hand.

## Product (section link “Product”)

- Heading (*word by word*): Trial Match makes the connection.
- Heading, second sentence (*gradient*): On both sides.

### For patients

- Label: For patients
- Heading: An agent that finds every trial you qualify for.
- Text: Connect your record once. Your agent checks every open trial, asks for required information when something is missing, and shows only the trials that fit. Swipe right to apply, or let it apply for you.
- Link: Try it as a patient →
- Video description (read by screen readers): Recording of the patient app: answering a question, then swiping right to apply
- Badge under the video: Recorded live from the working app

### For trial teams

- Window title above the video: Trial Match · Rank applicants
- Video description (read by screen readers): Recording of the clinician app: swiping to rank applicants, then inviting the top three
- Badge under the video: Recorded live from the working app
- Label: For trial teams
- Heading: A ranked shortlist in minutes, not weeks.
- Text: Eligibility is checked before patients even arrive. From there, a quick swipe between two candidates builds the ranking, and the strongest matches are invited to pre-screening.
- Link: Try it as a clinician →

### No dead ends

- Heading: Every rejection builds a stronger match.
- Text: If a patient doesn’t qualify after pre-screening, those results go straight back to their agent, which finds the next trial that fits. When someone finishes a trial, their results start the next search.

## Agents (section link “Agents”)

An animated relay. A light runs along a track, and each card plays its own short animation when it arrives. The cards are pictures, so these are the only words.

- Label: Under the hood
- Heading (*word by word*): Each agent does one job.
- Heading, second sentence (*grey*): Every claim is checked against the record.

### The five steps (in order)

1. Name: Records Reader
   Tag: MedGemma
   In the picture: EGFR ex19del
2. Name: Skeptic
   Tag: Quote check
   In the picture (kept): EGFR ex19del ✓
   In the picture (struck out): KRAS G12C ✕
3. Name: Trial Scout
   Tag: ClinicalTrials.gov
   In the picture: LIVE
4. Name: Matcher
   Tag: Rules, not AI
5. Name: Care team
   Tag (*gradient*): People decide
   In the picture: Invite
- Step list description (read by screen readers): How a match is made, step by step

### Closing line (each phrase in its step’s colour)

- Text: MedGemma reads. Code checks. Rules match. People decide.

## Results (section link “Results”)

- Heading (*word by word*): Every rejection costs both patients and researchers weeks in lost time.
- Heading, second sentence (*grey*): So we measured that first.

## Agent team (no section link)

An animated scene that plays while it is on screen and then starts again: a patient’s question types in, the Coordinator hands it on, three public words cross a privacy line to the Researcher, its sources light up and count, a cited brief comes back, and the Analyst types its answer. With reduced motion it shows the finished scene. It mirrors what the app’s chat does for drug questions.

- Label: Watch them work
- Heading (*word by word*): Agents hand work to each other.
- Heading, second sentence (*grey*): Your record never crosses the line.
- Intro: Ask about a drug and a small team gets to work. Gemini researches it online, with public words only. MedGemma reads what it finds against your record, on your own computer. You see every hand-off as it happens.

### The scene

- Question (types in): How does sotorasib compare with docetaxel?
- Coordinator: Coordinator · on this device · This needs outside evidence. I’ll hand it to the Researcher online, and the Analyst reads what comes back here.
- Left lane: On this device
  - Analyst · MedGemma · your computer
  - Status, in turn: Waiting for the brief → Reading the brief against your record → Done. Your record stayed on your computer
  - Your record · 19 facts · stays here
- Middle (the privacy line): Privacy guard · Going online: compare, sotorasib, vs docetaxel · Kept here: what you typed, your name, age and ID, and your record
- Right lane: Online
  - Researcher · Gemini · online
  - Status, in turn: Waiting for the request → Got 3 public words. Planning what to look up → Searching PubMed for “sotorasib docetaxel” → Reading the FDA label for Lumakras → Checking ClinicalTrials.gov → Writing the brief, citing every sentence → Brief ready: 3 sentences, each citing a source it read
  - Sources (count up): PubMed 214 · FDA label 1 · ClinicalTrials.gov 6
- Moving across the line: 3 public words (out) · brief · 2 sources (back)
- Card 1: What the research says · Researcher · Gemini · public sources only
  - Sotorasib blocks KRAS G12C, a gene change in some lung cancers. [1] In a phase III trial it held the cancer back longer than docetaxel chemotherapy: 5.6 against 4.5 months. [2] Its common side effects include diarrhoea, tiredness and liver changes. [1]
  - Sources: [1] FDA label: Lumakras (sotorasib) · [2] CodeBreaK 200 · The Lancet · 2023
- Card 2 (types in): What it means for you · Analyst · MedGemma · your record never left your computer
  - Who was studied: Adults whose KRAS G12C lung cancer grew after earlier treatment.
  - What fits: Your record shows EGFR, not KRAS G12C, so this research isn’t about your cancer’s change.
  - Worth asking: Your care team which EGFR trials are open near you.
  - Checked by rules on this device: ✕ The research is in people with KRAS G12C, but your record shows EGFR.
- Steps along the bottom: Route · Guard · Research · Hand back · Analyse · Answer
- When it finishes: Nothing about you went online
- Scene description (read by screen readers): Animation: a patient asks how sotorasib compares with docetaxel. The Coordinator hands the question to the Researcher, Gemini, online, which receives three public words and reads PubMed, the FDA label and ClinicalTrials.gov. It sends a cited brief back across the privacy line to the Analyst, MedGemma, on the patient’s own computer, which reads it against the record and finds the research is about KRAS G12C while the record shows EGFR.

### Below the scene

- Closing line (each phrase in its agent’s colour): Gemini researches. MedGemma reads your record, at home. Only public words cross. You see every hand-off.
- Link: Ask the team in the demo →
- Small print: The patient is synthetic. The sources are real: PubMed, FDA labels and ClinicalTrials.gov.

Every number below comes from `npm run eval` (`eval/results.md`). Change them only by rerunning it.

### Comparison

- Left label: Registry search
- Left number (*counts up from 0*): 93%
- Left text: of “eligible” matches were wrong
- Right label: Trial Match
- Right number (*gradient*): 0%
- Right text: wrong, with every real match still found

### Below the comparison

- Bold part (*11 counts up from 1*): 11× fewer trials to review:
- Rest of the line: 1.6 trials per patient instead of 16.7.
- Small print: Offline test, 45,600 synthetic patient–trial pairs.

## Trust (section link “Trust”)

- Heading (*word by word*): The agent finds and checks.
- Heading, second sentence (*grey*): People decide.

### Four points

1. Title: Patients choose what to share
   Text: Each record is read only with explicit patient consent.
2. Title: Patient’s name stays hidden
   Text: Trial teams see an ID until the patient says yes.
3. Title: Real humans make the call
   Text: Clinicians make the decision for every enrolment.
4. Title: Patient data remains secure throughout.
   Text: Data management is designed with UK GDPR in mind.

## Closing

- Heading (*word by word*): Every patient deserves
- Heading, end (*gradient*): to be asked.
- Button: Try the demo →

## Footer

- Name: Trial Match
- Line: Built for AgentVerse 2026, UCL AI Society. A prototype, not a medical device. Demo data is synthetic.
- Sources (each linked part is in square brackets, with its link after it):
  Sources: 95% from [BMJ Open Respiratory Research](https://doi.org/10.1136/bmjresp-2025-003702) (UK cancer patients). 63% from an [Institute of Cancer Research survey](https://ca.news.yahoo.com/let-cancer-patients-check-trial-000500467.html) of 500+ patients, 2021. 122 and 169 days (median, industry drug trials) and 4 in 10 (all studies, 2025) from [UK Clinical Research Delivery KPIs](https://www.gov.uk/government/statistics/uk-clinical-research-delivery-key-performance-indicators-data-to-august-2026/uk-clinical-research-delivery-key-performance-indicators-data-to-august-2026), 2026.

## Link targets (not visible text)

- All five “Try the demo” / “Try it as…” buttons open the demo at `/app/` in this package (live at https://trial-match-ebon.vercel.app/app/).
- Section links jump to: The gap → `#gap`, Product → `#product`, Agents → `#agents`, Results → `#results`, Trust → `#trust`. “See how it works” goes to `#product`. The hero pill is not a link.
