# Marketing for the 4-minute talk: posters, iPads and images

**Goal:** everything around the stage should make two things obvious in five seconds: the problem (patients aren't asked) and that the demo is real (people can try it). Judges score the repo, the demo and the pitch, not the posters, so keep this cheap and make it point at the live demo.

## What to make, ranked

| # | Asset | Where it's shown | Made from | Effort |
|---|---|---|---|---|
| 1 | **"Try it" iPad**: the live demo, signed in as Mei, chat open | On the table for the judges' 2-minute test | The live site, with MedGemma running on the laptop | Low |
| 2 | **iPad loop**: 5 full-screen frames, about 7 seconds each, looping | iPads beside the stage while we talk | (1) "Most patients would join a trial. Most are never asked." (2) the agents relay animation (3) patient app video (4) clinician ranking video (5) a QR code: "Try it now" | Low (a simple web page in Safari with Guided Access) |
| 3 | **QR poster** (A3 or A4) | Stage edge, table | Big QR code to `/app/`, one line ("Find the trial that fits"), "Synthetic demo. Not a medical device." | Low |
| 4 | **Numbers poster** | Behind us | Three verified numbers with their sources printed: 41% diagnosed at stage 4, 63% never heard about trials, 1 in 3 studies with no patient after a month (see `../evidence/STATISTICS.md`) | Low |
| 5 | **Science visual**: the 3D protein view (real PDB structure) as a large loop | One iPad | The app's 3D viewer, screen-recorded | Low. Strong with the Isomorphic Labs judge |
| 6 | One-page handout | Given to judges | The one-page write-up (a required deliverable anyway) | Already needed |

## AI images of happy people: my advice

**Use them sparingly, or not at all.** The reasons:
- In a health pitch, AI faces of "patients" read as staged and lower trust. Our score depends on trust.
- The brief's data rule (never present synthetic as real) is about data, but judges apply the same instinct to visuals. A smiling "patient" next to our numbers implies a real outcome we don't have.
- Better choices: real product screens, the real 3D protein structure, abstract brand gradients, or photos of the team.

**If you still want some** (they're fine for mood, never as evidence):
- Put a small "AI-generated image" label on every one.
- Never pair a face with a quote, a name, a diagnosis or an outcome. That would be a fake testimonial.
- Show realistic, diverse, ordinary settings (a kitchen table with a laptop, a nurse at a desk), not hospital-bed drama.
- Keep the prompt you used for each image, in `images/AI-LABELS.md`.
- Generate them with Gemini's image model or Canva. Both are allowed tools at the event.

## Where it lives

```
pitch/marketing/
  PLAN.md             this file
  ipad-loop/          the looping full-screen page for the iPads (one HTML file, works offline)
  posters/            QR poster and numbers poster (Canva links + exported PDFs)
  images/             any images, plus AI-LABELS.md listing which ones are AI-made and the prompt for each
```

Nothing here goes into `trial-match-vercel/`, so it can't affect the product, the repo's code or the judged demo.

## Before the talk (checklist)

- [ ] iPads: Guided Access on, auto-lock off, brightness up, loop page saved for offline use
- [ ] "Try it" iPad: logged in as Mei, chat on "MedGemma · this computer" if the laptop is on the same network, otherwise built-in answers
- [ ] QR code tested on two phones (iPhone and Android) on venue Wi-Fi and on mobile data
- [ ] Every number on a poster has its source printed under it
- [ ] Every AI image labelled
