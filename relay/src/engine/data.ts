// Static data bundled with the engine (JSON imports work in Next, Vitest and tsx alike).
// Trials: encoded ClinicalTrials.gov snapshot. Patients: SYNTHETIC only.

import t1 from '../../data/trials/encoded/NCT05920356.json';
import t2 from '../../data/trials/encoded/NCT07190248.json';
import t3 from '../../data/trials/encoded/NCT06793215.json';
import t4 from '../../data/trials/encoded/NCT06881784.json';
import t5 from '../../data/trials/encoded/NCT07185997.json';
import t6 from '../../data/trials/encoded/NCT06667076.json';
import t7 from '../../data/trials/encoded/NCT06765109.json';
import t8 from '../../data/trials/encoded/NCT04886804.json';
import t9 from '../../data/trials/encoded/NCT05642572.json';

import p0417 from '../../data/patients/SYN-0417/patient.json';
import d0417 from '../../data/patients/SYN-0417/documents.json';
import p0288 from '../../data/patients/SYN-0288/patient.json';
import d0288 from '../../data/patients/SYN-0288/documents.json';
import p0532 from '../../data/patients/SYN-0532/patient.json';
import d0532 from '../../data/patients/SYN-0532/documents.json';
import p0610 from '../../data/patients/SYN-0610/patient.json';
import d0610 from '../../data/patients/SYN-0610/documents.json';
import p0745 from '../../data/patients/SYN-0745/patient.json';
import d0745 from '../../data/patients/SYN-0745/documents.json';

import type { DocKind, SourceDoc, Trial } from './types';

/** Portfolio in SPEC order. */
export const TRIALS: Trial[] = [t1, t2, t3, t4, t5, t6, t7, t8, t9] as unknown as Trial[];

export function getTrial(id: string): Trial {
  const t = TRIALS.find((x) => x.id === id || x.acronym === id);
  if (!t) throw new Error(`unknown trial ${id}`);
  return t;
}

export interface PatientBundle {
  patientId: string;
  synthetic: true;
  summary: string;
  profile: Record<string, string>;
  preferences: { homeCity: string; travelLimitMiles: number; daysAvailable?: string[] };
  documents: { id: string; kind: DocKind; date: string; initial: boolean }[];
  docs: SourceDoc[];
}

const bundle = (p: unknown, d: unknown): PatientBundle => ({ ...(p as Omit<PatientBundle, 'docs'>), docs: d as SourceDoc[] });

export const PATIENTS: Record<string, PatientBundle> = {
  'SYN-0417': bundle(p0417, d0417),
  'SYN-0288': bundle(p0288, d0288),
  'SYN-0532': bundle(p0532, d0532),
  'SYN-0610': bundle(p0610, d0610),
  'SYN-0745': bundle(p0745, d0745),
};

export function listPatients(): { patientId: string; summary: string; synthetic: true }[] {
  return Object.values(PATIENTS).map((p) => ({ patientId: p.patientId, summary: p.summary, synthetic: true }));
}
