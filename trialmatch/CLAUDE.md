# CLAUDE.md

Notes for Claude Code working in this repo.

## What this is
TrialMatch, a hackathon project (AgentVerse 2026, Biotech track). It matches lung cancer (NSCLC) patients to recruiting Phase III trials, ranks the trials by likely success, and runs a nurse prescreening loop. There's a single-file web app in `app/`.

## Commands
- `pip install -r requirements.txt`
- `python run.py`: run the matcher and write `results/`
- `python build_app.py`: rebuild `app/index.html` from `app/template.html` and the matcher. Always run this after changing `trialmatch/` or the template.
- `python -m pytest -q tests`: the parser tests. Keep them passing.

## Rules
- Edit `app/template.html`, never `app/index.html` (it's generated, with the data embedded).
- No real, identifiable patient data. Synthetic data must be labelled as synthetic (see `data/prescreen_outcomes_DEMO.csv`).
- A "not met" label must rest on a recorded value. Missing data is "unknown" (see `verify()` in `trialmatch/match.py`).
- Scoring weights live in `W` in `trialmatch/match.py`. Only the fresh-biopsy penalty is evidence-based; say so when changing others.
