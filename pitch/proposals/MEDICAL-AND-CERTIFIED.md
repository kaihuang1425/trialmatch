# Proposal: make Trial Match look more medical and trustworthy

**Principle: look clinical, and claim only what's true.**

Our responsible-design score depends on honesty, and our scientifically minded judges will check claims. So the site should feel like a careful clinical tool and show a credible route to approval. It must never show a badge or certification we don't hold.

**Status today:** a prototype on synthetic data, not a medical device, with no NHS approvals. Everything below keeps that true.

## A. What to change on the page (design)

Ranked by impact for effort. Nothing here touches the deployed site until you approve it.

1. **Add a "Safety and standards" section to the landing page**, after Trust. Two columns:
   - **Where we are:** Prototype · Synthetic data only · Not a medical device · Every decision signed off by a clinician.
   - **Built to meet, before any pilot:** UK GDPR with a data protection impact assessment · NHS DTAC · Clinical safety (DCB0129) · NHS data security toolkit (DSPT).
   - The wording is always "built to meet" or "on our roadmap", never "certified" or "compliant".
2. **Give the clinician app a calmer, chart-like mode.** The clinician view would get light surfaces, slate text, one clinical blue, and the gradient kept only for brand moments. It would also get compact tables, the patient ID first, and Met / Not met / Unknown in the same three colours everywhere. Patients keep the warmer dark look. *Most medical software looks like this, and it signals "tool, not toy".*
3. **Show the evidence trail as a feature.** In each applicant's sheet, every rule gets a small "source" link that opens the quote it came from. The data already exists (the quote check). This is the strongest "a scientist could check it" signal in the brief.
4. **Publish a one-page model card for MedGemma.** It would cover version, what it's used for (reading text and drafting answers), what it never does (decide eligibility), known limits, and our test results. Link it from the chat and the footer.
5. **Add a short clinical safety summary**: the top 5 hazards and their controls, as a downloadable page (it doubles as the write-up's risk table). Example: *"A false 'eligible'. Control: the agent can't say it; a clinician signs off; the claim filter is in code."*
6. **Make the footer look like a real product:** version number, last updated, contact, accessibility statement (target WCAG 2.2 AA), privacy notice (for synthetic data: what's stored, where, for how long).
7. **Use fewer playful cues in clinical places.** Keep the sparkle icon for the patient's agent. Use plain clinical icons (document, stethoscope, check) in the clinician app, and turn animations down there.

## B. The route to real use (what we'd say to judges)

This is the "plausible next step to real use" the brief asks for. It goes in the write-up and on one pitch slide.

1. **Is it a medical device?** Recruitment support that ranks trials, while clinicians make every eligibility decision, may fall outside medical device rules. Anything that steers treatment would fall inside. **We'd confirm with the MHRA** using their software guidance and NHS England's decision tree. If it's in scope: the UK medical device route, with ISO 14971 risk management.
2. **Clinical safety:** run DCB0129 (our side, as manufacturer) with a named Clinical Safety Officer, a hazard log and a safety case. The deploying NHS trust runs DCB0160.
3. **NHS DTAC** before any NHS pilot: clinical safety, data protection, technical security, interoperability, usability and accessibility.
4. **Data:** a data protection impact assessment, NHS DSPT, Cyber Essentials Plus, and UK hosting.
5. **Evidence:** a pilot at one centre on synthetic or retrospective records, measuring nurse minutes per referral, missed eligible patients and time to first patient. Pick the matching NICE Evidence Standards Framework tier.

*NHS England is still reviewing parts of DTAC and the DCB standards (see sources), so check the current versions before quoting them.*

## C. Never do these

- No "NHS approved", "MHRA certified", "CE/UKCA marked", "HIPAA compliant" or "ISO 13485" badges, and no stock trust seals.
- No NHS logo or NHS blue lozenge. NHS identity rules restrict their use to NHS organisations and approved partners.
- No real clinician's name or photo without their written consent.
- No patient testimonials, real or AI-made.

## D. Where this lives

The proposal stays in `pitch/proposals/`. When approved, changes A1 to A7 go into `trial-match-vercel/` as one reviewed change, and the safety summary and model card become pages on the site.

Sources: [NHS England: Digital Technology Assessment Criteria](https://transform.england.nhs.uk/key-tools-and-info/digital-technology-assessment-criteria-dtac) · [DCB0129/DCB0160 status, Nov 2026 (vendor guide)](https://magora-systems.com/dcb0129-dcb0160-clinical-safety-officer-guide/) · [NHS software compliance overview (vendor guide)](https://magora-systems.com/nhs-software-compliance-dtac-dcb0129-dspt/)
