# Contributing

## Local Setup

### Python Engine (Python 3.10+)
Run from the repository root:
```sh
python -m pip install -r requirements.txt
```

### Web App (Node 22)
Run from the `trial-match-vercel/` directory:
```sh
cp .env.example .env.local
npm run dev
```

## Credentials and Data Safety
For local web app runs, keep credentials in `trial-match-vercel/.env.local`. Never commit credentials. Use synthetic fixtures because real patient records are unsuitable for this prototype.

## Validation Commands

### Python Engine Tests
Run from the repository root:
```sh
python -m pytest tests/
```

### Web App Tests
Run from the `trial-match-vercel/` directory:
```sh
npm test
```

### Ranking Changes Evaluation
Run from the `trial-match-vercel/` directory when making ranking changes:
```sh
npm run eval
```
