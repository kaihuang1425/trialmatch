// Append-only audit log. Entries are frozen; nothing in the engine removes or edits them.
// Each entry carries the patient record version and the trial snapshot date it was made against.

import type { AuditEvent, RelayState } from './types';

export function nextId(state: RelayState, prefix: string): string {
  state.seq += 1;
  return `${prefix}-${String(state.seq).padStart(4, '0')}`;
}

export function appendAudit(
  state: RelayState,
  e: { actor: AuditEvent['actor']; type: string; detail: object },
  at: string = new Date().toISOString(),
): AuditEvent {
  const event: AuditEvent = Object.freeze({
    id: nextId(state, 'AUD'),
    at,
    actor: e.actor,
    type: e.type,
    detail: e.detail,
    patientVersion: state.version,
    trialSnapshot: state.trialSnapshot,
  });
  state.audit.push(event);
  return event;
}

/** True when `next` keeps every entry of `prev` unchanged and in order (used by tests and the API). */
export function isAppendOnly(prev: AuditEvent[], next: AuditEvent[]): boolean {
  if (next.length < prev.length) return false;
  return prev.every((e, i) => JSON.stringify(e) === JSON.stringify(next[i]));
}
