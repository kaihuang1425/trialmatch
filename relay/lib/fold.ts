// state = fold(fixture, actions). The fixture is SYN-0417 with its initial documents (referral +
// labs) after the agent's `start` run; each action that changes engine state becomes one engine
// trigger, run in replay mode (deterministic, no network). Runs in the browser and on the server.
// Results are cached by the chain of engine-relevant action ids, so appending one action runs one
// trigger, and an undo re-folds from the nearest cached prefix.

import { runAgent } from '@/src/engine/agent';
import { TRIALS } from '@/src/engine/data';
import type { AgentEvent, Trigger } from '@/src/engine/events';
import { createPatientState } from '@/src/engine/state';
import type { RelayState } from '@/src/engine/types';
import { effectiveActions, triggerFor, type DeckAction } from './actions';

export const PATIENT_ID = 'SYN-0417';

export interface RunResult {
  state: RelayState;
  events: AgentEvent[];
}

export async function runTrigger(state: RelayState, trigger: Trigger, mode: 'replay' | 'live' = 'replay'): Promise<RunResult> {
  const events: AgentEvent[] = [];
  let next = state;
  for await (const ev of runAgent({ mode, state, trigger })) {
    events.push(ev);
    if (ev.type === 'done') next = ev.state;
  }
  return { state: next, events };
}

let base: Promise<RunResult> | null = null;
/** The fixture after the agent's first run (extract referral + labs, assess, plan). */
export function baseRun(): Promise<RunResult> {
  if (!base) base = runTrigger(createPatientState(PATIENT_ID), { type: 'start' });
  return base;
}

const MAX_CACHE = 64;
const cache = new Map<string, RelayState>();
function remember(key: string, s: RelayState) {
  cache.set(key, s);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
}
/** Seed the cache with a state computed elsewhere (a live run streamed from the server). */
export function primeCache(key: string, s: RelayState) {
  remember(key, s);
}
export function clearFoldCache() {
  cache.clear();
}

export interface FoldStep {
  action: DeckAction;
  trigger: Trigger;
  key: string;
  /** Present only when the step actually ran now (not served from the cache). */
  events?: AgentEvent[];
}

export interface FoldResult {
  state: RelayState;
  effective: DeckAction[];
  key: string;
  steps: FoldStep[];
}

export interface FoldOptions {
  /** Run the final step another way (live mode through the server). Falls back to replay on throw. */
  runLast?: (state: RelayState, trigger: Trigger, action: DeckAction, key: string) => Promise<RunResult>;
}

export async function foldLog(log: DeckAction[], opts: FoldOptions = {}): Promise<FoldResult> {
  const effective = effectiveActions(log);
  let state = (await baseRun()).state;
  let key = 'base';
  const steps: FoldStep[] = [];
  const lastIdx = effective.length - 1; // runLast applies only to the newest action
  for (let i = 0; i < effective.length; i++) {
    const a = effective[i];
    const trigger = triggerFor(state, TRIALS, a);
    if (!trigger) continue;
    const nextKey = `${key}>${a.id}`;
    const hit = cache.get(nextKey);
    if (hit) {
      state = hit;
      steps.push({ action: a, trigger, key: nextKey });
    } else {
      let res: RunResult | undefined;
      if (opts.runLast && i === lastIdx) {
        try {
          res = await opts.runLast(state, trigger, a, nextKey);
        } catch {
          res = undefined;
        }
      }
      if (!res) res = await runTrigger(state, trigger, 'replay');
      state = res.state;
      remember(nextKey, state);
      steps.push({ action: a, trigger, key: nextKey, events: res.events });
    }
    key = nextKey;
  }
  return { state, effective, key, steps };
}
