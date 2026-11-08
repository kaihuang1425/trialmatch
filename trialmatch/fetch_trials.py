"""Trial Scout (data step): pull recruiting Phase 3 NSCLC trials from ClinicalTrials.gov API v2."""
import json, sys, time, requests

URL = "https://clinicaltrials.gov/api/v2/studies"

def fetch(out="data/trials.json"):
    params = {
        "query.cond": "non-small cell lung cancer",
        "filter.overallStatus": "RECRUITING|NOT_YET_RECRUITING",
        "filter.advanced": "AREA[Phase]PHASE3",
        "pageSize": 200,
    }
    studies, token = [], None
    while True:
        if token:
            params["pageToken"] = token
        r = requests.get(URL, params=params, timeout=60)
        r.raise_for_status()
        j = r.json()
        studies += j.get("studies", [])
        token = j.get("nextPageToken")
        if not token:
            break
        time.sleep(0.3)
    json.dump(studies, open(out, "w"))
    print(f"saved {len(studies)} trials to {out}")

if __name__ == "__main__":
    fetch(*sys.argv[1:])
