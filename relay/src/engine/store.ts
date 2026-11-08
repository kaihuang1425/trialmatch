// In-memory store of JSON-serialisable states, keyed by session id. Good for one server process
// (dev, a single Cloud Run instance); the UI can also hold the state itself and send it back.

import { createPatientState, type CreateStateOptions } from './state';
import type { RelayState } from './types';

export class StateStore {
  private readonly map = new Map<string, string>(); // stored as JSON so callers can never alias it

  get(sessionId: string): RelayState | undefined {
    const s = this.map.get(sessionId);
    return s ? (JSON.parse(s) as RelayState) : undefined;
  }

  set(sessionId: string, state: RelayState): void {
    this.map.set(sessionId, JSON.stringify(state));
  }

  create(sessionId: string, patientId: string, opts?: CreateStateOptions): RelayState {
    const s = createPatientState(patientId, opts);
    this.set(sessionId, s);
    return s;
  }

  size(): number {
    return this.map.size;
  }
}

const g = globalThis as unknown as { __relayStore?: StateStore };
/** Process-wide store (survives Next dev hot reloads). */
export const store: StateStore = g.__relayStore ?? (g.__relayStore = new StateStore());
