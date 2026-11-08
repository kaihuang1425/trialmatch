# MedGemma: where it runs, what we can say, how to show it

## Short answer

Yes, deploy it, but only say it's running once it really is. Judges get 2 minutes to test the app themselves, and the chat shows which source is answering ("Built-in", "MedGemma · this computer" or "MedGemma · this site"). If the pitch claims MedGemma and the chat says "Built-in", that costs us the responsible-design marks.

## Why MedGemma helps the privacy story

MedGemma is an open-weights model. Unlike Gemini or ChatGPT, you download it and run it on your own hardware. That gives us one honest line:

> "The model runs where the records are. In a hospital, that's the trust's own servers, so no patient record goes to an outside AI company."

Two things limit what we can claim:

- **A hosted endpoint is still someone else's computer.** If we rent a GPU from Hugging Face or Modal, the text goes to them. That's fine for a demo on synthetic data, but then we can't say "data never leaves the device".
- **The licence.** MedGemma comes under Google's Health AI Developer Foundations terms. It's a developer model, not a medical device: clinical use needs our own validation, and the terms forbid uses that would make Google the "manufacturer" of a medical device.

## The plan: two modes, each labelled truthfully

| | On this laptop | Hosted, for judges' phones |
|---|---|---|
| Where it runs | Ollama on the pitch laptop (`medgemma1.5:4b`, already installed and tested, about 13 s an answer) | Our own MedGemma endpoint, rented by the hour |
| What the chat shows | "MedGemma on this computer · nothing leaves it" | "MedGemma on this site’s server" |
| What we can say | "Wi-Fi is off and it still answers. Nothing left this laptop." | "Our own MedGemma deployment. It only ever sees synthetic data." |
| Setup | One setting on the laptop (below) | An account with a GPU host, then 3 environment variables in Vercel |

### Mode 1: on this laptop (the privacy proof)

1. Let the live site talk to the laptop's MedGemma. Ollama blocks other websites by default, so it needs the site's address in `OLLAMA_ORIGINS`. When you pick "MedGemma · this computer" in the chat, its setup steps include a one-line command for this. It sets a lasting Windows setting and restarts Ollama.
2. Open https://trial-match-ebon.vercel.app/app/ in Chrome, open the chat, and choose "MedGemma · this computer". If Chrome asks to let the site reach devices on your local network, click Allow.
3. **On stage:** load the page, turn Wi-Fi off, ask a question, and point at the line under the chat: "nothing leaves it". Rehearse this once: everything outside the chat (live trials, FHIR) needs the internet, so stay inside the chat while offline.

### Mode 2: hosted (so judges' own phones get MedGemma)

The site already supports any OpenAI-compatible server, so this is configuration, not code.

| Host | Region | Cost (check before buying) | Setup | Choose it if |
|---|---|---|---|---|
| **Hugging Face Inference Endpoint** (recommended) | AWS eu-west-1, Ireland | About $0.80 an hour for one L4 GPU; can sleep when idle | About 15 minutes in a web form | You want the quickest route that works |
| Vertex AI (Google Cloud) | europe-west2, London | Similar GPU hourly rate | An hour or more: new projects often need a GPU quota increase first | You want "hosted in London" in the pitch |
| Modal | Pick a region (extra charge to pin one) | About $0.80 an hour for an L4, plus the region charge | We'd write a short deploy script | The event gave us Modal credits |

**Hugging Face steps:**

1. Sign in to Hugging Face and accept the terms on the `google/medgemma-1.5-4b-it` model page.
2. Create an Inference Endpoint for that model: AWS, eu-west-1, one NVIDIA L4, Protected access. Turn on scale-to-zero after 15 minutes so it costs nothing while idle.
3. Create an access token that can call Inference Endpoints.
4. In Vercel → trial-match → Settings → Environment Variables, set these, then redeploy:
   - `MEDGEMMA_BASE_URL`: the endpoint URL with `/v1` on the end
   - `MEDGEMMA_API_KEY`: the token
   - `MEDGEMMA_MODEL`: `google/medgemma-1.5-4b-it`
5. **On pitch day:** turn scale-to-zero off an hour before, so the judges never wait for a cold start. Pause the endpoint afterwards.

Once it's up, we test it end to end on the live site, including a check that the model's private reasoning (MedGemma 1.5 "thinks" before answering) doesn't leak into the replies. It hid correctly through Ollama; a different server may format it differently.

## Lines we can use, and lines we can't

**Can say:**
- "MedGemma is open, so it runs inside the hospital. Records don't go to an outside AI company."
- "Right now it's running on this laptop. Wi-Fi is off." (Mode 1 only)
- "On your phones, it's our own MedGemma deployment, and it only ever sees synthetic patients."
- "Every fact it reads is checked against a quote from the letter, and a person decides eligibility."

**Can't say:**
- "GDPR compliant", "NHS approved", "certified": none of these is true yet.
- "Your data never leaves your device" while using the hosted mode.
- "MedGemma is approved for clinical use": it isn't, and its licence says so.

## Sources

- MedGemma 1.5 4B model page: https://huggingface.co/google/medgemma-1.5-4b-it
- Health AI Developer Foundations terms: https://developers.google.com/health-ai-developer-foundations/terms
- Hugging Face Inference Endpoints pricing and regions: https://huggingface.co/docs/inference-endpoints/pricing and https://huggingface.co/docs/inference-endpoints/support/faq
- Modal pricing: https://modal.com/pricing
