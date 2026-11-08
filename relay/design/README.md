# Relay design boards

Interactive mockups, approved before the real app is built. Plain HTML/CSS/JS, no build step.

```bash
node design/serve.js
```

Then open http://localhost:5177/boards/coordinator.html (house board) or http://localhost:5177/boards/patient.html.

| URL parameter | Effect |
|---|---|
| `?theme=light` / `?theme=dark` | Force a theme (default follows the system) |
| `?motion=off` | Reduced motion: state changes, nothing travels |
| `?state=after` | Seeds the board after the default molecular report (KRAS G12C, PD-L1 0%) |
| `?state=pd60` | Same, with PD-L1 TPS 60% |
| `?state=alt` | After the report, with KANDLELIT-007 closed for "no place in cohort" |
| `?panel=cbk&row=cbk-3` | Opens a referral's panel with one criterion expanded |
| `?sheet=1` | Opens the synthetic report sheet (the judge-input moment) |
| `?selftest=1` | Runs every interaction path and writes `RESULT: n/m` into `#selftest-log` |

Files:

- `BOARD-BRIEF.md` — style rules and the self-test contract every board follows.
- `boards/shared/tokens.css` — colour meanings, type roles, toast, evidence strip, motion budget, reduced motion.
- `boards/shared/kit.js` — icons, state glyphs, toast with Undo, count roll, FLIP, fly-to, replay.
- `boards/coordinator.html` + `coordinator.js` — the house board.
- `boards/patient.html` — the patient board.
- `shots/` — screenshots used for review.
