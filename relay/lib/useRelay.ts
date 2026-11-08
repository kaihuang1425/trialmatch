'use client';

// One hook for both decks: the shared session, the action log, the folded engine state and the
// paced playback of the agent's event stream (tool steps tick in, cards update one by one).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TRIALS } from '@/src/engine/data';
import type { AgentEvent } from '@/src/engine/events';
import type { RelayState, TrialStatus } from '@/src/engine/types';
import { decisionsOf, effectiveActions, isExtension, makeAction, triggerFor, type DeckAction, type DeckActionBody } from './actions';
import { baseRun, foldLog, primeCache } from './fold';
import { announceSession, appendActions, loadLog, newSessionId, resolveSessionId, subscribe } from './session';

export type Role = 'staff' | 'patient';

export interface Step {
  id: string;
  tool: string;
  doing: string;
  done: string;
  finished: boolean;
  ok: boolean;
}

export interface Change {
  trialId: string;
  acronym: string;
  from: TrialStatus | null;
  to: TrialStatus;
}

export interface RunView {
  id: number;
  active: boolean;
  action?: DeckAction;
  base?: boolean;
  steps: Step[];
  changes: Change[];
  messages: string[];
  error?: string;
  /** Result line of find_alternatives, when the run looked for another site. */
  alternative?: { facility: string; city: string; distanceMiles: number; acronym: string } | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function docTitle(state: RelayState | null, docId: string): string {
  const d = state?.documents.find((x) => x.id === docId);
  if (d) return d.title.toLowerCase().startsWith('molecular') ? 'the molecular report' : `the ${d.title.toLowerCase()}`;
  return docId.includes('-MOL') ? 'the molecular report' : 'the document';
}

function stepText(ev: Extract<AgentEvent, { type: 'tool_call' }>, state: RelayState | null): { doing: string; done: string } {
  const input = (ev.input ?? {}) as Record<string, unknown>;
  switch (ev.tool) {
    case 'add_document':
      return { doing: 'Adding the synthetic report', done: 'Added the synthetic report' };
    case 'extract_facts': {
      const t = docTitle(state, String(input.docId ?? ''));
      return { doing: `Reading ${t}`, done: `Read ${t}` };
    }
    case 'assess':
      return { doing: `Re-checking ${TRIALS.length} studies`, done: `Re-checked ${TRIALS.length} studies` };
    case 'plan_next_action':
      return { doing: 'Choosing the next step', done: 'Chose the next step' };
    case 'draft_request':
      return { doing: 'Drafting the request', done: 'Drafted the request' };
    case 'propose_request':
      return { doing: 'Queuing it for your approval', done: 'Queued for your approval' };
    case 'propose_invitations':
      return { doing: 'Preparing invitations', done: 'Prepared invitations' };
    case 'record_decision':
      return { doing: 'Recording your approval', done: 'Recorded your approval' };
    case 'send_request':
    case 'send_invitation':
      return { doing: 'Sending', done: 'Sent (simulated)' };
    case 'record_site_unavailable':
      return { doing: 'Recording the full cohort', done: 'Cohort full recorded (simulated)' };
    case 'find_alternatives':
      return { doing: 'Looking for another site', done: 'Looked for another site' };
    default:
      return { doing: String(ev.tool), done: String(ev.tool) };
  }
}

function resultNote(ev: Extract<AgentEvent, { type: 'tool_result' }>): string {
  const out = ev.output as Record<string, unknown> | undefined;
  if (!ev.ok) return 'failed';
  switch (ev.tool) {
    case 'extract_facts': {
      const a = Number(out?.accepted ?? 0);
      const r = Number(out?.rejected ?? 0);
      if (out?.skipped) return 'already read';
      return `${a} facts cited${r ? ` · ${r} rejected` : ''}`;
    }
    case 'assess':
      return `${(out?.changed as unknown[] | undefined)?.length ?? 0} changed`;
    case 'propose_invitations': {
      const n = Array.isArray(ev.output) ? ev.output.length : 0;
      return n ? `${n} waiting for you` : 'none yet';
    }
    case 'find_alternatives': {
      const n = (out?.options as unknown[] | undefined)?.length ?? 0;
      return `${n} open within ${out?.travelLimitMiles ?? '?'} mi`;
    }
    default:
      return '';
  }
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

async function* readNdjson(res: Response): AsyncGenerator<AgentEvent> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) yield JSON.parse(line) as AgentEvent;
    }
  }
  if (buf.trim()) yield JSON.parse(buf) as AgentEvent;
}

/** Which trials' evidence strips differ between two states (for silent re-folds, e.g. after Undo). */
function changedTrials(a: RelayState | null, b: RelayState): string[] {
  if (!a) return [];
  return TRIALS.filter((t) => {
    const x = a.assessments[t.id];
    const y = b.assessments[t.id];
    if (!x || !y) return !!x !== !!y;
    return x.status !== y.status || x.results.map((r) => r.state).join() !== y.results.map((r) => r.state).join();
  }).map((t) => t.id);
}

export function useRelay(role: Role) {
  const [sessionId, setSessionId] = useState('');
  const [log, setLog] = useState<DeckAction[]>([]);
  const [state, setState] = useState<RelayState | null>(null);
  const [run, setRun] = useState<RunView | null>(null);
  const [pops, setPops] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<'replay' | 'live'>('replay');

  const sessionRef = useRef('');
  const logRef = useRef<DeckAction[]>([]);
  const effRef = useRef<DeckAction[] | null>(null);
  const stateRef = useRef<RelayState | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const liveRef = useRef(false);
  const runSeq = useRef(0);
  const epoch = useRef(0); // bumps on session change: stale playback stops

  const setDisplay = useCallback((s: RelayState | null | ((p: RelayState | null) => RelayState | null)) => {
    setState((prev) => {
      const next = typeof s === 'function' ? s(prev) : s;
      stateRef.current = next;
      return next;
    });
  }, []);

  const bump = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setPops((p) => {
      const n = { ...p };
      for (const id of ids) n[id] = (n[id] ?? 0) + 1;
      return n;
    });
  }, []);

  /** Play an event stream with pacing; events may still be arriving (live mode). */
  const play = useCallback(
    async (events: AsyncIterable<AgentEvent> | AgentEvent[], opts: { action?: DeckAction; base?: boolean }) => {
      const my = epoch.current;
      const id = ++runSeq.current;
      const k = reducedMotion() ? 0.3 : 1;
      setRun({ id, active: true, action: opts.action, base: opts.base, steps: [], changes: [], messages: [] });
      const upd = (f: (r: RunView) => RunView) => setRun((r) => (r && r.id === id ? f(r) : r));
      for await (const ev of events as AsyncIterable<AgentEvent>) {
        if (epoch.current !== my) return;
        switch (ev.type) {
          case 'tool_call': {
            const t = stepText(ev, stateRef.current);
            upd((r) => ({ ...r, steps: [...r.steps, { id: ev.callId, tool: String(ev.tool), doing: t.doing, done: t.done, finished: false, ok: true }] }));
            await sleep(300 * k);
            break;
          }
          case 'tool_result': {
            const note = resultNote(ev);
            upd((r) => ({ ...r, steps: r.steps.map((s) => (s.id === ev.callId ? { ...s, finished: true, ok: ev.ok, done: note ? `${s.done} · ${note}` : s.done } : s)) }));
            if (ev.tool === 'find_alternatives' && ev.ok) {
              const best = ((ev.output as { options?: { facility: string; city: string; distanceMiles: number; acronym: string }[] })?.options ?? [])[0];
              upd((r) => ({ ...r, alternative: best ? { facility: best.facility, city: best.city, distanceMiles: best.distanceMiles, acronym: best.acronym } : null }));
            }
            await sleep(170 * k);
            break;
          }
          case 'assessment_changed': {
            setDisplay((s) => (s ? { ...s, assessments: { ...s.assessments, [ev.trialId]: ev.assessment } } : s));
            bump([ev.trialId]);
            upd((r) => ({ ...r, changes: [...r.changes, { trialId: ev.trialId, acronym: ev.acronym, from: ev.diff.statusFrom, to: ev.diff.statusTo }] }));
            await sleep(240 * k);
            break;
          }
          case 'message':
            upd((r) => ({ ...r, messages: [...r.messages, ev.text] }));
            break;
          case 'error':
            upd((r) => ({ ...r, error: ev.message }));
            break;
          case 'done':
            setDisplay(ev.state);
            break;
          default:
            await sleep(60 * k);
        }
      }
      upd((r) => ({ ...r, active: false }));
    },
    [bump, setDisplay],
  );

  /** Bring engine state in line with `next` (already shown as decisions). Runs one at a time. */
  const syncTo = useCallback(
    (next: DeckAction[], opts: { local?: DeckAction[]; animateBase?: boolean } = {}) => {
      const my = epoch.current;
      queueRef.current = queueRef.current
        .then(async () => {
          if (epoch.current !== my) return;
          const prevEff = effRef.current;
          const nextEff = effectiveActions(next);
          const appended = prevEff && isExtension(prevEff, nextEff) ? new Set(nextEff.slice(prevEff.length).map((a) => a.id)) : null;

          // Live mode: stream the newest local action from the server and play it as it arrives.
          const last = opts.local?.at(-1);
          if (liveRef.current && last && appended?.has(last.id) && opts.local?.length === 1) {
            const prior = await foldLog(next.slice(0, next.findIndex((a) => a.id === last.id)));
            const trigger = triggerFor(prior.state, TRIALS, last);
            if (trigger) {
              try {
                const res = await fetch('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ log: next.slice(0, next.findIndex((a) => a.id === last.id)), action: last }) });
                if (!res.ok || !res.body) throw new Error(`live run failed (${res.status})`);
                let final: RelayState | null = null;
                let fatal = false;
                const tee = async function* () {
                  for await (const ev of readNdjson(res)) {
                    if (ev.type === 'error' && !ev.recoverable) fatal = true;
                    if (ev.type === 'done') final = ev.state;
                    yield ev;
                  }
                };
                await play(tee(), { action: last });
                if (fatal || !final) throw new Error('live run did not finish');
                primeCache(`${prior.key}>${last.id}`, final);
              } catch {
                liveRef.current = false;
                setMode('replay');
              }
            }
          }

          const res = await foldLog(next);
          if (epoch.current !== my) return;
          effRef.current = res.effective;
          const toPlay = res.steps.filter((s) => s.events && (appended?.has(s.action.id) ?? false));
          if (toPlay.length && stateRef.current) {
            for (const s of toPlay) await play(s.events!, { action: s.action });
            setDisplay(res.state);
          } else if (opts.animateBase) {
            const base = await baseRun();
            setDisplay({ ...base.state, assessments: {} });
            await sleep(250);
            await play(base.events, { base: true });
            setDisplay(res.state);
          } else {
            bump(changedTrials(stateRef.current, res.state));
            setDisplay(res.state);
          }
        })
        .catch((e) => {
          setRun((r) => ({ ...(r ?? { id: ++runSeq.current, steps: [], changes: [], messages: [] }), active: false, error: (e as Error).message }));
        });
      return queueRef.current;
    },
    [bump, play, setDisplay],
  );

  const openSession = useCallback(
    (s: string, opts: { animateBase?: boolean } = {}) => {
      epoch.current += 1;
      sessionRef.current = s;
      setSessionId(s);
      const l = loadLog(s);
      logRef.current = l;
      setLog(l);
      effRef.current = null;
      setRun(null);
      queueRef.current = Promise.resolve();
      return syncTo(l, { animateBase: opts.animateBase && l.length === 0 });
    },
    [syncTo],
  );

  useEffect(() => {
    const s = resolveSessionId();
    void openSession(s, { animateBase: role === 'staff' });
    const unsub = subscribe(
      () => sessionRef.current,
      (l) => {
        if (l.length === logRef.current.length && l.every((a, i) => a.id === logRef.current[i]?.id)) return;
        logRef.current = l;
        setLog(l);
        void syncTo(l);
      },
      (s2) => void openSession(s2, { animateBase: role === 'staff' }),
    );
    const ctl = new AbortController();
    fetch('/api/run', { signal: ctl.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { live: false }))
      .then((j: { live?: boolean }) => {
        liveRef.current = !!j.live;
        setMode(j.live ? 'live' : 'replay');
      })
      .catch(() => {});
    return () => {
      unsub();
      ctl.abort();
    };
  }, [openSession, role, syncTo]);

  const dispatch = useCallback(
    (bodies: DeckActionBody | DeckActionBody[]): DeckAction[] => {
      const list = (Array.isArray(bodies) ? bodies : [bodies]).map((b) => makeAction(b, role));
      const next = appendActions(sessionRef.current, logRef.current, list);
      logRef.current = next;
      setLog(next);
      void syncTo(next, { local: list });
      return list;
    },
    [role, syncTo],
  );

  const undo = useCallback((actionIds: string[]) => dispatch(actionIds.map((target) => ({ type: 'undo', target }) as DeckActionBody)), [dispatch]);

  const reset = useCallback(() => {
    const s = newSessionId();
    announceSession(s);
    setPops({});
    return openSession(s, { animateBase: role === 'staff' });
  }, [openSession, role]);

  const effective = useMemo(() => effectiveActions(log), [log]);
  const decisions = useMemo(() => decisionsOf(effective), [effective]);

  return { sessionId, log, effective, decisions, state, run, pops, mode, dispatch, undo, reset };
}

export type Relay = ReturnType<typeof useRelay>;
