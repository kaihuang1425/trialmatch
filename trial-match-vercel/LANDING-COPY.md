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

### The photos

Seven photos take turns, about every 9 seconds. Each has its own description (read by screen readers) and credit.

1. A nurse checks an older man’s blood pressure. Credit: Photo: Nappy on Unsplash
2. A doctor gives a patient an injection on a ward. Credit: Photo: National Cancer Institute on Unsplash
3. An older doctor listens to a man’s chest. Credit: Photo: National Cancer Institute on Unsplash
4. An older woman gets a shot in the shoulder. Credit: Photo: CDC on Unsplash
5. A smiling woman in a gown in a screening room. Credit: Photo: National Cancer Institute on Unsplash
6. An older doctor goes over a chart with a patient. Credit: Photo: National Cancer Institute on Unsplash
7. Clinicians review a scan on screen. Credit: Photo: Accuray on Unsplash

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
- Text: Connect your record once. Your agent checks every open trial, asks for required information when something is missing, and shows only the trials that fit. Apply when you’re ready, or let it apply for you.
- Link: Try it as a patient →

#### The phone animation

Drawn in code inside the phone frame (no video, no swiping). It plays while it is on screen, about 18 seconds, then starts again. With reduced motion it shows the last screen. The data matches the demo app: Mei (P-0412) and trial LT-301.

Small motions, no words: the ring and the rule count tick up together, each rule gets a green sweep as it checks off, the open rule pulses amber, the answered rule flips to a check and the ring pulses when it reaches 9 of 9, the Apply button gets a shine when it turns on, a spinner while it sends, and a check that draws itself.

- Status bar: 9:41
- App bar: Trial Match · Patient · M
- Greeting: Hello, Mei
- Agent card title: Your agent
- Agent card lines, in order: Checking LT-301 against your record / 8 of 9 met. One question for you / All 9 rules met. Ready when you are / Applied. Your name stays hidden
- Trial card: LT-301 · Phase III · Targeted tablet (becomes “Strong match · all rules met”) / A new targeted tablet after EGFR treatment stops working / Thames Chest Centre, London
- Rules heading: Entry rules. Counter (*ticks up*): 0 of 9 met, up to 8 of 9 met, then “· 1 to check” pops in beside it, then 9 of 9 met
- The 9 rules, each with where it was found: Lung cancer, stage IV (GP record) · EGFR exon 19 deletion (Genomic lab) · Grew on osimertinib (Hospital) · Last treatment 2+ weeks ago (Hospital) · Fitness (ECOG) 0–1 (Hospital) · No untreated brain spread (Not in record, then Your answer) · No lung inflammation (Hospital) · Blood counts in range (Blood test) · Kidney function in range (Blood test)
- Question sheet: Your turn / One answer settles the last rule / Has a scan checked your brain? / Yes, and there was no spread · Spread was found, treated, and is stable · Spread was found and isn’t treated yet · I’m not sure. My team can check.
- Button: Apply to LT-301 (then “Applied to LT-301”)
- Confirm sheet: Apply to LT-301? / Your agent fills in the application from your record and sends it under your ID, P-0412. / You meet all 9 entry rules / Your name stays hidden until you say yes / Apply · Not now (Apply shows “Sending” with a spinner when tapped)
- Message at the top: Applied to LT-301. You’ll hear back in your inbox.
- Tabs: Discover · My trials · My health · Inbox
- Steps under the phone: Check · Ask · Apply
- Description (read by screen readers): Animation of the patient app. Mei’s agent checks trial LT-301’s 9 entry rules against her record and finds 8 met. It asks her the one thing the record doesn’t say: has a scan checked her brain? She answers, all 9 rules are met, and she applies with one tap. Her name stays hidden from the trial team until she says yes.

### For trial teams

#### The window animation

Drawn in code inside the window frame, like the phone. About 19 seconds, then it starts again. On narrow screens the window gets taller and hides the extra tabs.

Small motions, no words: each applicant lands with a glow, its “Checking” chip spins and then pops into its result, and its fit score *counts up* as the ring fills before the list re-sorts. The quotes get a highlighter sweep, the pointer shows hover before each click, checkboxes pop, and the invite button shows a spinner (“Sending”) and then a check.

- Window title: Trial Match · Applicants
- App bar: Trial Match · Clinician · Overview · Applicants · Invites · A
- Above the heading: LT-301 · Phase III · Thames Chest Centre, London
- Heading: Applicants
- Agent line, in order: Reading 5 new applications / Reading application 1 of 5 (*ticks up* to 5 as each one lands) / Checked all 9 rules for each. 1 misses a rule, so you can decline fast / Invited 3 to pre-screening. Replies come through their agents
- Column labels: Applicant · Entry rules · Fit
- Applicants (they arrive one at a time and sort by fit): P-0412, 63 · F · London, 9 of 9 met, 98 · P-0388, 58 · M · Manchester, 9 of 9 met, 95 · P-0431, 70 · F · London, 8 met · 1 to check, 86 · P-0409, 66 · M · Leeds, 8 met · 1 to check, 81 · P-0397, 55 · M · Bristol, Misses 1 rule, 31. Each starts as “Checking”.
- Evidence panel (opens on P-0412): P-0412 / 63 · F · London · 9 of 9 rules met / Quoted from the record / EGFR exon 19 deletion: “EGFR exon 19 deletion detected” (Genomic lab report) / Grew on osimertinib: “Progression on osimertinib, stopped 3 weeks ago” (Hospital record) / No untreated brain spread: “Yes, and there was no spread” (Her answer to her agent, today) / Every quote is checked against the record before you see it.
- Bar at the bottom: 1 selected (counts to 3) · Invite to pre-screening, then 3 invited · Invitations sent. The three chosen show “Invited”.
- Steps under the window: Check · Review · Invite
- Description (read by screen readers): Animation of the trial team’s view. Five applicants for LT-301 arrive already checked against its 9 entry rules and sort by how well they fit; one is flagged for missing a rule. The clinician opens the top applicant and sees the record quoted for each rule, then selects the three strongest and invites them to pre-screening.

- Label: For trial teams
- Heading: A ranked shortlist in minutes, not weeks.
- Text: Eligibility is checked before patients even arrive. Applicants come ranked by fit, with the record quoted for every rule, and the strongest matches are invited to pre-screening.
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

## Results (section link “Results”)

- Heading (*word by word*): Every rejection costs both patients and researchers weeks in lost time.
- Heading, second sentence (*grey*): So we measured that first.

Every number below comes from `npm run eval` (`eval/results.md`). Change them only by rerunning it.

### Comparison

- Left label: Registry search
- Left number (*counts up from 0*): 93%
- Left text: of “eligible” matches were wrong
- Right label: Trial Match
- Right number (*gradient*, *counts down from 93*): 0%
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
