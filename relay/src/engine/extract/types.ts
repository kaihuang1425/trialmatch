import type { Fact, FactKey, FactValue, SourceDoc } from '../types';

/** What an extractor proposes. Nothing becomes a Fact until the verifier finds the quote verbatim. */
export interface CandidateFact {
  key: string; // validated against FACT_KEYS by the verifier
  value: FactValue;
  unit?: string;
  refHigh?: number;
  observedOn?: string;
  quote: string;
  start?: number;
  end?: number;
}

export interface Rejection {
  docId: string;
  key: string;
  quote: string;
  value: FactValue;
  reason: string;
  extractedBy: 'rules' | 'llm';
}

export interface ExtractionResult {
  accepted: Fact[];
  rejected: Rejection[];
}

export interface Extractor {
  kind: 'rules' | 'llm';
  propose(doc: SourceDoc): Promise<CandidateFact[]>;
}

export type { Fact, FactKey, SourceDoc };
