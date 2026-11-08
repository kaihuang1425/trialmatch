// Browser-only: the shared demo session. The session id lives in the URL (?s=) and localStorage;
// the action log lives in localStorage under that id and is broadcast to other tabs with
// BroadcastChannel (storage event as fallback), so the staff and patient decks stay in step.
// Every storage call is guarded: private windows and blocked storage still get a working deck.

import { cleanLog, type DeckAction } from './actions';

const SESSION_KEY = 'relay.session';
const CHANNEL = 'relay-demo';
const logKey = (s: string) => `relay.log.${s}`;

export function newSessionId(): string {
  return `S-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const validId = (s: string | null | undefined): s is string => !!s && /^[A-Za-z0-9_-]{3,60}$/.test(s);

function readStore(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function writeStore(k: string, v: string) {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* storage blocked: this tab still works on its own */
  }
}

/** URL ?s= wins, then the last session in this browser, else a new one. Writes both back. */
export function resolveSessionId(): string {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('s');
  const s = validId(fromUrl) ? fromUrl : validId(readStore(SESSION_KEY)) ? (readStore(SESSION_KEY) as string) : newSessionId();
  adoptSession(s);
  return s;
}

/** Make `s` the current session: URL and localStorage. */
export function adoptSession(s: string) {
  writeStore(SESSION_KEY, s);
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('s') !== s) {
      url.searchParams.set('s', s);
      window.history.replaceState(window.history.state, '', url.toString());
    }
  } catch {
    /* ignore */
  }
}

export function loadLog(s: string): DeckAction[] {
  const raw = readStore(logKey(s));
  if (!raw) return [];
  try {
    return cleanLog(JSON.parse(raw));
  } catch {
    return [];
  }
}

type Msg = { kind: 'log'; s: string; log: DeckAction[] } | { kind: 'session'; s: string };

let channel: BroadcastChannel | null | undefined;
function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  try {
    channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  } catch {
    channel = null;
  }
  return channel;
}

/**
 * Append actions to the session log. Re-reads storage first so actions another tab wrote meanwhile
 * are kept in their order; falls back to this tab's copy when storage is empty or blocked.
 */
export function appendActions(s: string, current: DeckAction[], actions: DeckAction[]): DeckAction[] {
  let base = loadLog(s);
  if (base.length < current.length) base = current;
  const ids = new Set(base.map((a) => a.id));
  const next = [...base, ...actions.filter((a) => !ids.has(a.id))];
  writeStore(logKey(s), JSON.stringify(next));
  try {
    getChannel()?.postMessage({ kind: 'log', s, log: next } satisfies Msg);
  } catch {
    /* ignore */
  }
  return next;
}

export function announceSession(s: string) {
  adoptSession(s);
  try {
    getChannel()?.postMessage({ kind: 'session', s } satisfies Msg);
  } catch {
    /* ignore */
  }
}

/** Listen for log and session changes from other tabs. Returns an unsubscribe function. */
export function subscribe(getSession: () => string, onLog: (log: DeckAction[]) => void, onSession: (s: string) => void): () => void {
  const ch = getChannel();
  const onMsg = (e: MessageEvent<Msg>) => {
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.kind === 'log' && m.s === getSession()) onLog(cleanLog(m.log));
    if (m.kind === 'session' && validId(m.s) && m.s !== getSession()) onSession(m.s);
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === logKey(getSession())) onLog(loadLog(getSession()));
    if (e.key === SESSION_KEY && validId(e.newValue) && e.newValue !== getSession()) onSession(e.newValue);
  };
  ch?.addEventListener('message', onMsg);
  window.addEventListener('storage', onStorage);
  return () => {
    ch?.removeEventListener('message', onMsg);
    window.removeEventListener('storage', onStorage);
  };
}
