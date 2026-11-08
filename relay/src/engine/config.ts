// Runtime configuration: model ids, provider endpoint, demo date. Model ids live ONLY in this file.

/**
 * Live model: Gemini Flash via the Google Gen AI SDK (@google/genai).
 * `gemini-3.6-flash` verified on 2026-11-07 at https://aistudio.google.com/docs/models (badge "Stable")
 * and https://aistudio.google.com/docs/models/gemini-3.6-flash (function calling: supported,
 * structured outputs: supported, latest update July 2026, no deprecation date listed).
 * Newer alternative: `gemini-3.8-flash` (badge "New" on the same page; capabilities not checked).
 * Override without code changes: RELAY_MODEL / RELAY_EXTRACTION_MODEL.
 */
export const DEFAULT_MODEL = 'gemini-3.6-flash';

export const LLM_CONFIG = {
  provider: 'gemini' as const,
  model: readEnv('RELAY_MODEL') ?? DEFAULT_MODEL,
  extractionModel: readEnv('RELAY_EXTRACTION_MODEL') ?? readEnv('RELAY_MODEL') ?? DEFAULT_MODEL,
  /** Gemini API key (Google AI Studio). */
  apiKeyEnv: 'GEMINI_API_KEY',
  /**
   * Gemini API endpoint, pinned so a machine-level GOOGLE_GEMINI_BASE_URL cannot reroute synthetic
   * records. Not used on Vertex AI.
   */
  geminiBaseUrl: 'https://generativelanguage.googleapis.com/',
  /**
   * Vertex AI (Google Cloud) instead of an API key: set RELAY_USE_VERTEXAI=true plus
   * GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION (e.g. europe-west2), and authenticate with
   * Application Default Credentials (`gcloud auth application-default login`, or the Cloud Run
   * service account). Not exercised on this machine.
   */
  useVertexAI: readEnv('RELAY_USE_VERTEXAI') === 'true',
  vertexProject: readEnv('GOOGLE_CLOUD_PROJECT'),
  vertexLocation: readEnv('GOOGLE_CLOUD_LOCATION') ?? 'europe-west2',
  maxTokens: 8192,
  maxAgentTurns: 12,
  timeoutMs: 120_000,
};

/** The date time windows are measured from in the demo and in tests (judging day). */
export const DEMO_AS_OF = '2026-11-08';

/** The ClinicalTrials.gov snapshot the encoded trials were built from (data/trials/raw/SNAPSHOT_DATE). */
export const TRIAL_SNAPSHOT_DATE = '2026-11-07';

/** Simulated recipients. Nothing is ever sent anywhere. */
export const SIMULATED_RECIPIENTS = {
  referringTeam: 'Referring thoracic oncology team (simulated)',
  studyTeam: (acronym: string, facility: string) => `${acronym} study team, ${facility} (simulated)`,
};

function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}
