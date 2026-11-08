// JSON-serialisable patient state and its constructors. One RelayState per synthetic patient.

import { DEMO_AS_OF, TRIAL_SNAPSHOT_DATE } from './config';
import { PATIENTS } from './data';
import type { RelayState } from './types';

export interface CreateStateOptions {
  /** 'initial' = documents marked initial (SYN-0417: referral + labs), 'all' = every document, 'none' = empty record */
  documents?: 'initial' | 'all' | 'none';
  asOf?: string;
}

export function createPatientState(patientId: string, opts: CreateStateOptions = {}): RelayState {
  const p = PATIENTS[patientId];
  if (!p) throw new Error(`unknown synthetic patient ${patientId}`);
  const which = opts.documents ?? 'initial';
  const ids = new Set(p.documents.filter((d) => which === 'all' || (which === 'initial' && d.initial)).map((d) => d.id));
  return {
    schema: 'relay.state.v1',
    patientId,
    synthetic: true,
    version: 1,
    asOf: opts.asOf ?? DEMO_AS_OF,
    trialSnapshot: TRIAL_SNAPSHOT_DATE,
    documents: p.docs.filter((d) => ids.has(d.id)).map((d) => ({ ...d })),
    extractedDocIds: [],
    facts: [],
    verifications: [],
    preferences: { ...p.preferences, setBy: 'patient', updatedAt: opts.asOf ?? DEMO_AS_OF },
    assessments: {},
    proposals: [],
    siteOverrides: [],
    outbox: [],
    audit: [],
    seq: 0,
  };
}

/** Deep copy through JSON: the state is plain data by design. */
export function cloneState(s: RelayState): RelayState {
  return JSON.parse(JSON.stringify(s)) as RelayState;
}

/** Documents of a patient that are not in the state yet (e.g. SYN-0417's molecular report). */
export function availableDocuments(state: RelayState) {
  const p = PATIENTS[state.patientId];
  const have = new Set(state.documents.map((d) => d.id));
  return p ? p.docs.filter((d) => !have.has(d.id)) : [];
}
