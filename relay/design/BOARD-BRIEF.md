# Board brief — Relay

A board is an interactive mockup of one page: real layout, real copy, clickable states, motion. One HTML file per board in `design/boards/`, linking `shared/tokens.css` and `shared/kit.js`. No build step, no frameworks.

## Owner's standing feedback (verbatim)

- "Make design boards first."
- "Remember, microinteraction animation is key."
- "Make the moment when new evidence changes the assessment the centre of the demonstration."
- "Show important uncertainties on the front of the card."
- Swipe is a gesture on top of labelled buttons, with Undo, never instead of them.

## Style rules

1. **Colour means one thing.** Use only the tokens in `shared/tokens.css`: `--ok` supported, `--conflict` conflict, `--open` missing/outdated + the agent's next step, `--review` needs a clinician, `--source` document/passage/location, `--alarm` waiting-count bubble only. Never decorative.
2. **State glyphs** from `Kit.glyph(state)`: shape and colour together, so states read in greyscale.
3. **Never a percentage or "success rate".** Use the evidence strip (one segment per criterion) and mono counts.
4. **Three layers, never more:** navigation, one search/filter row, one floating layer (panel, sheet or menu) at a time. Opening one closes the other.
5. **No helper paragraphs.** If a control needs a caption, redesign it. Buttons are verbs; section labels are nouns.
6. **Every surface that shows patient data carries the `.synthetic` mark** (once per view is enough) — "No real patient data, ever."
7. **One confirmation style:** `Kit.toast()` with Undo and the 5.2 s drain. No second toast style.
8. **Motion budget:** 120–320 ms, ease-out, springs only for small things (a glyph tick, a segment fill). Nothing loops. Motion answers the user; at rest the page is quiet. `prefers-reduced-motion` and `data-motion="off"` already handled by tokens.css; JS-driven motion must check `Kit.reduced()` (Kit helpers already do).
9. **Replay animations** with `Kit.replay(el, "tick", 260)` (alternates `tickA`/`tickB`), never by re-adding the same class.
10. **Phone width 390 px is an acceptance check:** titles get the full row, meta goes on the line under in mono, no horizontal scroll, hit targets ≥ 44 px. On a phone the hover action is always visible.
11. **Accessible as built:** real `<button>`/`<input>`/`<label>`, `aria-label` on icon-only buttons, inline stroke SVG icons via `Kit.icon()`, never emoji, contrast ≥ 4.5:1 in light and dark, keyboard reachable, focus goes somewhere sensible after every action (never dropped to `<body>`).
12. Any element animating with `fill-mode: both/forwards` starts a stacking context: give the wrapper of any dropdown/sheet a z-index.

## Board chrome (same on every board)

A small fixed control cluster at top-right (collapsible on phone): theme (auto/light/dark), motion on/off, "Reset". It is board chrome, visually quiet, not part of the product.

## Self-test (required)

Each board defines `window.BoardSteps = [{ name, run: async () => { ... } }]`. Steps click real buttons (`el.click()` / dispatch key events), wait with `await Kit.wait(ms)`, and assert with a local `assert(cond, msg)` that throws. Opening `board.html?selftest=1` runs every step in order after load, with motion off, and writes:

- `document.documentElement.dataset.selftest = "pass" | "fail"`
- a `<pre id="selftest-log">` (visually hidden is fine) with one line per step: `PASS name` / `FAIL name: message`, and a last line `RESULT: n/m steps passed`.

Steps must cover every signature moment, every Undo, every sheet's cancel path, the empty state, and keyboard paths (Enter/Escape at minimum). A steps list that only renders is not a check. After the run, the page state may be messy; Reset restores the seeded demo state.

## Data rules

- Patients are synthetic (IDs like `SYN-0417`). Never invent real people.
- Trials are real, from `data/trials/raw/*.json` (ClinicalTrials.gov API v2 snapshot). Use real titles, acronyms, NCT IDs, arms, UK sites. **Do not invent protocol details.** Anything not in the registry record (visit schedule, travel support) is shown as "Not listed in the registry — ask the team", not made up.
- Site availability, invitations, hospital accounts are simulated; label them "simulated" where they appear.
