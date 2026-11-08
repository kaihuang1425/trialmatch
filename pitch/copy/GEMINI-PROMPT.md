# Humanising the landing text with Gemini

Files:
- `landing-copy.csv` — every piece of text on the landing page, one row each (105 rows). Open it in Excel or Google Sheets and type into **your version**, or let Gemini fill it in.
- `../../trial-match-vercel/LANDING-COPY.md` — the same text, in page order, as a readable document.

When you're done, send the file back and the edits can be applied to the page. Leave a row's "your version" empty to keep the current text.

## How to use Gemini

1. Open Gemini, choose the strongest model you have, and turn thinking up to high if your plan offers it.
2. Attach `landing-copy.csv` (or paste its contents).
3. Paste the prompt below.
4. Read every changed row before you accept it. The rules at the bottom of the prompt are the ones the judges' brief cares about.

## Prompt

```
You're editing the text of a landing page for "Trial Match", a hackathon prototype that matches lung cancer patients to clinical trials. The attached CSV has one row per piece of text. Fill in the "your version" column only. Keep every other column exactly as it is, and return the full CSV with every row, in the same order.

Make the text sound like a careful human wrote it for patients and NHS clinicians in the UK:
- Plain British English. Short sentences. Concrete words.
- Keep each line within about 20% of its current length. Headings stay short.
- No em dashes, no "Moreover/Furthermore", no "revolutionise", "seamless", "cutting-edge", "unlock", "empower" or "game-changer".
- No rhetorical questions, no exclamation marks, no emoji.
- If a line already reads well, copy it unchanged.

Hard rules (do not break these):
1. Keep every number, percentage, date and unit exactly as written (95%, 63%, 122, 169, 4 in 10, 93%, 0%, 11×, 1.6, 16.7, 45,600, 2,400, 19).
2. Keep every source name and link text exactly as written.
3. Keep the words "synthetic", "illustrative", "prototype" and "not a medical device" wherever they appear. Never make the results sound like real-world performance.
4. Don't add any claim, number, certification, partner or feature that isn't already in the text.
5. Keep product and agent names as they are: Trial Match, MedGemma, ClinicalTrials.gov, Records Reader, Skeptic, Trial Scout, Matcher, LT-301.
6. Button text must stay a short action, 4 words or fewer, keeping any "→".
```

## Notes

- Headings marked *word by word* in `LANDING-COPY.md` animate one word at a time. Any sentence works; the page splits it into words.
- If you change a number that counts up (95, 63, 122, 4, 93, 11, 98), the animation's start value has to change too. Say so when you send the file back.
