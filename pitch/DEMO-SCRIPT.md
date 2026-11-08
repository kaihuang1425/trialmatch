# Trial Match: 5-minute demo script

One presenter drives the laptop and talks. It splits easily into two voices: one person for the patient side (0:50–2:55), another for the trial team (2:55–4:05).

Spoken lines are in quotes. At a normal pace (about 140 words a minute) the words take about 4 minutes 20 seconds, which leaves time for the clicks and waits. Every click and wait below was timed on 8 Nov on the same setup as the live site: Gemini as "Hospital server (simulated)", with demo changes kept in the browser.

## Before you go on

- **Two tabs.** Tab 1: https://trial-match-ebon.vercel.app at the top of the page. Tab 2: https://trial-match-ebon.vercel.app/app/ on the sign-in screen.
- **Reset the data.** On the sign-in screen, tap **Reset demo data** (in the small print at the bottom). Demo changes stay in that browser, so this undoes your rehearsal. Mei should then show "4 fit you · 8 to check · 7 not a fit".
- **Warm it up.** About 5 minutes before you start, ask Mei's chat one question so Gemini isn't cold, then reset again.
- **Wi-Fi.** The chat and the letter reader call Gemini, PubMed and FDA labels live. Keep a screen recording of a clean run as a backup.
- **Window.** Laptop screen at 1280 px or wider, browser zoom 100%.

---

## 0:00–0:30 · The problem

**Screen:** Tab 1, landing page, top.

> "95% of UK cancer patients say they'd consider a clinical trial if they were eligible. 63% were never told about one. Meanwhile, 4 in 10 UK studies still had no patient a month after opening.
>
> Patients are willing, and trials are open. What's missing is the match. Today that's a research nurse checking each referral against each trial's entry rules by hand, often 20 to 45 minutes a chart."

## 0:30–0:50 · What it is

**Do:** Click **Try the demo**, or switch to Tab 2.

> "Trial Match puts an agent on each side. The patient's agent reads their record and finds every trial they qualify for. The trial team gets a ranked shortlist, with the evidence for every rule. MedGemma reads, code checks, rules match, and people decide."

## 0:50–1:45 · The patient: Mei

**Do:** **I'm a patient** → **Mei L.**

> "This is Mei. She's synthetic, like every patient here: stage 4 lung cancer, an EGFR exon 19 deletion, growing on osimertinib. Her agent has checked 19 trials. 4 fit, 7 don't, and 8 need a fact checked."

**Point at:** "Your turn · Has a scan checked your brain?"

> "Instead of thirty questions, it asks the one that settles the most trials."

**Do:** Tap **Yes, and there was no spread**.

> "One tap. Seven trials become strong matches, and LT-317, a trial for cancer that has spread to the brain, drops out. Her answer is saved as hers until the care team confirms it."

**Do:** On the LT-301 card ("9/9"), tap **Apply**.

> "LT-301 now meets all 9 of its rules, so she applies. The trial team sees an ID, not her name."

## 1:45–2:20 · Asking about a drug

**Do:** In **Ask your agent anything**, type `What's the drug in the first one?` and press Enter. It takes about 15 seconds, so talk over it.

> "She asks about the drug in her next trial. The line down the middle is a privacy line. Her record stays on her side, and only public words cross, like the drug's name.
>
> Gemini searches PubMed, FDA labels and the trial registry, and every sentence must cite something it read. Back on her side, that's checked against her record, and it never tells her she's eligible. The trial team decides that."

**Expect:** "Worked with 2 agents". The first trial is now LT-310, so the drug should be amivantamab, cited to its FDA label and trial papers (the wording changes from run to run). Under it is "What it means for you".

## 2:20–2:55 · A letter written to fool the AI

*If you're behind at 2:20, skip to 2:55.*

**Do:** Close the chat → **My health** → **Add data** → **Read a clinic letter** → **Try a trick letter** → **Read it** (about 5–8 seconds).

> "Records can mislead, or be written to fool an AI. This test letter mentions a sister's ALK result, a brain scan that hasn't happened yet, and a hidden line telling any AI to mark the patient eligible for everything.
>
> Four facts come back, each with the exact words it came from, and none of the planted ones. If a model ever takes the bait, our Skeptic drops any fact whose quote isn't in the letter word for word."

**Do:** Tap **Where each fact came from** to show the quotes, then close the sheet. Don't add the facts to her record.

## 2:55–4:05 · The trial team

**Do:** Click **Mei L.** (top right) to sign out → **I'm a clinician** → **Dr Amira Rahman**.

> "Now the other side. Dr Rahman runs trials at the Thames Chest Centre. Her agent has already checked every rule on 30 applications, so ranking is what's left."

**Do:** **Applications** → top row, **P-0412 · LT-301 · 98 · New**.

> "Here's Mei, under an ID. Every rule shows its evidence: the lab report, the hospital record, and for the brain rule, 'You answered'. The nurse knows exactly what to confirm."

**Do:** Tap **All 9 rules**, then in the 3D box tap **Protein**.

> "This is the drug's target, EGFR, from a real Protein Data Bank structure, labelled as not this patient's tumour."

**Do:** **Invite to pre-screening**.

> "She invites Mei to pre-screening. Now say the MRI finds untreated spread to the brain."

**Do:** Scroll down inside the sheet → **Brain MRI: Untreated spread** → **Save results**.

> "LT-301 is out. Normally that's a dead end. Here, the result goes straight back to Mei's agent."

**Do:** Close the sheet → click **Dr Amira Rahman** (top right) → **I'm a patient** → **Mei L.**

> "And the top of her list is now LT-317, the brain-spread trial that ruled her out a minute ago. Every rejection builds a better match."

## 4:05–4:35 · Does it work?

**Do:** Switch to Tab 1 and go to the Results section (add `#results` to the address).

> "On 45,600 synthetic patient–trial pairs, a plain registry search got 93% of its 'eligible' matches wrong. Trial Match got none of its full matches wrong, flagged every other real match 'to check', and cut the trials to review from 16.7 per patient to 1.6.
>
> These patients are synthetic and the labels are our own rules, so this shows the agent follows the rules. It isn't clinical accuracy."

## 4:35–5:00 · Limits and next step

> "It's a prototype on synthetic data, not a medical device. The agent finds and checks; a nurse screens every applicant, and a doctor signs off every enrolment. Next, we want to pilot it at one NHS lung cancer centre and measure nurse minutes per referral.
>
> Every patient deserves to be asked."

---

## If something goes wrong

| What happens | What to do |
|---|---|
| The chat is still working after 20 seconds | Say "It's calling PubMed and the FDA live; let's come back to it," and go to 2:20. |
| The letter reader shows an error | Skip to 2:55. The trial team section doesn't need the internet. |
| Mei doesn't show "4 fit you · 8 to check · 7 not a fit" | Sign out, tap **Reset demo data**, and sign in as Mei again (about 10 seconds). |
| You're past 4:05 | Cut "Does it work?" to one line: "On 45,600 synthetic pairs, registry search was wrong 93% of the time; we were never wrong on a full match." |

## If the judges take the keyboard

These inputs work live and are worth rehearsing:

1. **Their own letter.** As Mei: **My health → Add data → Read a clinic letter**, then paste any made-up letter. Every fact comes back with its quote.
2. **An action from the chat.** As Dr Rahman, tap the chip **Invite people who could fit LT-319**. The chat offers a card, and nothing happens until they tap it.
3. **Live trials.** As Mei, tap **Search live trials for me**. It searches ClinicalTrials.gov from her record, checks the closest trials and asks her one question. It runs in rounds, so give it time, and keep it out of the 5 minutes.

## Where the numbers come from

| Line | Source |
|---|---|
| 95% would consider a trial if eligible | BMJ Open Respiratory Research, June 2026, citing the ICR's 2021 survey |
| 63% never told about one | Institute of Cancer Research survey of 500+ patients, 2021 |
| 4 in 10 studies with no patient after a month | UK Clinical Research Delivery KPIs, 2025, all studies |
| 20–45 minutes a chart | A published range, not one study (see `evidence/STATISTICS.md`) |
| 93%, 0%, 16.7 to 1.6 | `npm run eval` in `trial-match-vercel/`, written to `eval/results.md` (exact figures: 92.7%, and 10.7× fewer trials to review) |
