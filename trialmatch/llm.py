"""Optional Gemini pass over the criteria the rule-based parser does not cover.

Runs only on each patient's top few trials (cost control). Needs either
  GEMINI_API_KEY                         (Gemini API), or
  GOOGLE_CLOUD_PROJECT [+ GOOGLE_CLOUD_LOCATION]  (Vertex AI, uses the hackathon credits)
pip install google-genai

Not run in our offline build: treat as a starting point to test on the day.
"""
import json
import os

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")  # swap for the newest Flash your project lists

PROMPT = """You check a lung cancer patient against clinical trial eligibility criteria.

Patient record (each value is quoted exactly as recorded):
{record}

Criteria to check (I = inclusion, E = exclusion):
{criteria}

For EVERY criterion return one JSON object:
{{"id": <number>, "status": "met" | "not_met" | "unknown" | "not_applicable",
  "patient_evidence": "<exact quote from the record above, or 'none'>",
  "reason": "<one plain-English sentence>"}}
Rules:
- For an exclusion criterion, "met" means the patient is NOT excluded by it.
- Use "not_met" only when a quoted value in the record proves it. Missing information is "unknown".
- Consent, contraception, organ-function labs and similar items the record does not cover are "unknown".
- Administrative lines that are not criteria are "not_applicable".
Return a JSON list only."""


def _client():
    from google import genai
    if os.environ.get("GEMINI_API_KEY"):
        return genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return genai.Client(vertexai=True, project=os.environ["GOOGLE_CLOUD_PROJECT"],
                        location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"))


def llm_labels(patient, trial, used_evidence, max_lines=40):
    from google.genai import types
    lines = [("I", l) for l in trial["inclusion"]] + [("E", l) for l in trial["exclusion"]]
    lines = [(k, l) for k, l in lines if l not in used_evidence][:max_lines]
    if not lines:
        return []
    record = "\n".join(f"- {v}" for v in patient["evidence"].values())
    criteria = "\n".join(f"{i}. [{k}] {l}" for i, (k, l) in enumerate(lines))
    resp = _client().models.generate_content(
        model=MODEL, contents=PROMPT.format(record=record, criteria=criteria),
        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0))
    out = []
    for item in json.loads(resp.text):
        i = int(item["id"])
        if i >= len(lines) or item["status"] == "not_applicable":
            continue
        out.append({"field": f"criterion_{lines[i][0]}{i}", "status": item["status"],
                    "patient_evidence": item.get("patient_evidence", "none"),
                    "trial_evidence": lines[i][1], "reason": item.get("reason", ""), "source": "gemini"})
    return out
