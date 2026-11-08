// Loads the Relay policy file (plain JSON, readable from Python too): data/policy/relay-policy.json.
// Everything here is a Relay prescreening choice, never a protocol claim.

import raw from '../../data/policy/relay-policy.json';

export type TableCell = 'approved' | 'uncertain' | 'no' | 'yes';

export interface AlterationEntry {
  gene: string;
  values: string[];
  ukFirstLine: 'approved' | 'uncertain' | 'no';
  ukAnyLine: 'approved' | 'uncertain' | 'no';
  driver: 'yes' | 'uncertain' | 'no';
  examples?: string;
}

export interface RelayPolicy {
  labRecencyDays: { value: number; why: string };
  pdl1NegativeBelowTps: { value: number; why: string };
  egfrSensitizing: { values: string[]; why: string };
  tables: { alterations: { asOf: string; basis: string; entries: AlterationEntry[] } };
}

export const RELAY_POLICY = raw as unknown as RelayPolicy;

export function policyWindowDays(policy: 'labRecencyDays'): number {
  return RELAY_POLICY[policy].value;
}
