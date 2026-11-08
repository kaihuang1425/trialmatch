'use client';

// Research coordinator deck (/staff). One referral per card; swipe right to invite, left if not
// suitable, Later to move it to the back. The agent card holds the single next step.

import { AnimatePresence, motion, type MotionValue } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { TRIALS } from '@/src/engine/data';
import { formatValue } from '@/src/engine/labels';
import { MOLECULAR_OPTIONS, type MolecularReportInput } from '@/src/engine/synthetic/templates';
import type { CriterionResult, DocKind, RelayState, Trial } from '@/src/engine/types';
import { CLOSE_REASONS, INVITE_REASONS, REPORT_DATE, cleanMolecular, pendingInvite, pendingRequest } from '@/lib/actions';
import { copyFor } from '@/lib/copy';
import {
  STATUS_SHORT,
  deckStatus,
  distanceText,
  nearestOpenSite,
  openItems,
  patientLine,
  segAria,
  segCounts,
  segOf,
  segments,
  shortDate,
  shortText,
  staffOrder,
  staffPending,
  stripParens,
  type DeckStatus,
  type Seg,
} from '@/lib/deck';
import { useRelay, type RunView } from '@/lib/useRelay';
import { Burst, KeyCap, ModeDot, RollingCount, Segments, SynMark, Toast, type ToastData } from './Bits';
import { Check, Chevron, Cross, Deck, DocIcon, Heart, Logo, Person, Pin, Reset } from './Icons';
import { Stamp, SwipeDeck, type SwipeDir } from './SwipeDeck';

const T = TRIALS;
const byId = new Map(T.map((t) => [t.id, t]));
const indexOf = (id: string) => T.findIndex((t) => t.id === id);

const DOC_PHRASE: Record<DocKind, string> = {
  molecular: 'the molecular report',
  labs: 'current bloods',
  imaging: 'an imaging report',
  referral_summary: 'an updated referral summary',
  pathology: 'a histopathology report',
  letter: 'a clinic letter',
};

const VALUE_NAME: Record<string, string> = { not_detected: 'Not detected' };
const optLabel = (v: string) => VALUE_NAME[v] ?? v.replace(/_/g, ' ');

function siteFor(state: RelayState, t: Trial) {
  const inv = pendingInvite(state, t);
  return nearestOpenSite(state, t, inv?.siteId);
}

let toastSeq = 0;

export function StaffDeck() {
  const relay = useRelay('staff');
  const { state, decisions, run, pops, mode, sessionId, dispatch, undo } = relay;
  const [pinned, setPinned] = useState<string>();
  const [confirm, setConfirm] = useState<{ kind: 'close' | 'invite'; trialId: string } | null>(null);
  const [drawer, setDrawer] = useState<{ kind: 'why'; trialId: string } | { kind: 'changes' } | null>(null);
  const [judge, setJudge] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [exitDir, setExitDir] = useState<Record<string, SwipeDir>>({});
  const [burst, setBurst] = useState(0);
  const [yesOn, setYesOn] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const wantFocus = useRef(false);

  const notify = useCallback((msg: string, sub?: string, undoIds?: string[]) => {
    toastSeq += 1;
    setToast({ id: toastSeq, msg, sub, undo: undoIds?.length ? () => undo(undoIds) : undefined });
  }, [undo]);

  // ---------- order ----------
  const pending = useMemo(() => (state ? staffPending(T, state, decisions).filter((t) => state.assessments[t.id]) : []), [state, decisions]);
  const statusOf = useCallback((id: string) => deckStatus(state?.assessments[id]), [state]);
  const liveOrder = useMemo(() => staffOrder(pending.map((t) => t.id), statusOf, decisions.later, indexOf, pinned), [pending, statusOf, decisions.later, pinned]);
  // While the agent re-checks studies, cards keep their places; the deck re-sorts when it is done.
  const frozen = useRef<string[] | null>(null);
  const holding = !!run?.active && !run.base;
  let order = liveOrder;
  if (holding) {
    if (!frozen.current) frozen.current = liveOrder;
    const f = frozen.current;
    order = [...f.filter((id) => liveOrder.includes(id)), ...liveOrder.filter((id) => !f.includes(id))];
  } else frozen.current = null;
  const cards = order.map((id) => byId.get(id)!).filter(Boolean);
  const top = cards[0];
  const readyIds = state ? order.filter((id) => pendingInvite(state, byId.get(id)!)) : [];

  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    const id = window.setTimeout(() => topRef.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(id);
  }, [top?.id]);

  useEffect(() => {
    if (pinned && !order.includes(pinned)) setPinned(undefined);
  }, [order, pinned]);

  // ---------- patient interest arriving from the other tab ----------
  const seenInterest = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!state) return;
    const now = Object.values(decisions.patient).filter((d) => d.kind === 'interested');
    if (!seenInterest.current) {
      seenInterest.current = new Set(now.map((d) => d.id));
      return;
    }
    for (const d of now) {
      if (seenInterest.current.has(d.id)) continue;
      seenInterest.current.add(d.id);
      const t = byId.get(d.trialId);
      const staff = decisions.staff[d.trialId];
      if (t) notify(staff?.type === 'invite' ? `You both said yes · ${t.acronym}` : `Patient is interested · ${t.acronym}`, 'From the patient view · simulated');
    }
  }, [decisions, state, notify]);

  // ---------- decisions ----------
  const leave = (id: string, dir: SwipeDir) => {
    setExitDir((m) => ({ ...m, [id]: dir }));
    wantFocus.current = true;
    if (pinned === id) setPinned(undefined);
  };

  const fireYes = () => {
    setBurst((b) => b + 1);
    setYesOn(true);
    window.setTimeout(() => setYesOn(false), 420);
  };

  const invite = (t: Trial, reason?: string) => {
    if (!state) return;
    const a = state.assessments[t.id];
    const open = (a?.results ?? []).filter((r) => r.state !== 'supported' && !r.atScreening).map((r) => r.criterionId);
    leave(t.id, 'right');
    fireYes();
    setConfirm(null);
    const [act] = dispatch({ type: 'invite', trialId: t.id, ...(reason ? { reason, openItems: open, recordVersion: state.version } : {}) });
    const site = siteFor(state, t);
    const mutual = decisions.patient[t.id]?.kind === 'interested';
    notify(mutual ? `You both said yes · ${t.acronym}` : 'Invitation approved (simulated)', [t.acronym, site?.name, reason ? `reason saved: ${reason}` : ''].filter(Boolean).join(' · '), [act.id]);
  };

  const right = (t: Trial | undefined) => {
    if (!t || !state || confirm) return false;
    if (pendingInvite(state, t)) {
      invite(t);
      return true;
    }
    setConfirm({ kind: 'invite', trialId: t.id });
    return false;
  };
  const left = (t: Trial | undefined) => {
    if (!t || confirm) return false;
    setConfirm({ kind: 'close', trialId: t.id });
    return false;
  };
  const later = (t: Trial | undefined) => {
    if (!t || confirm) return;
    leave(t.id, 'up');
    const [act] = dispatch({ type: 'later', trialId: t.id });
    notify('Moved to the back', t.acronym, [act.id]);
  };
  const close = (t: Trial, reason: (typeof CLOSE_REASONS)[number]) => {
    if (!state) return;
    const site = siteFor(state, t);
    leave(t.id, 'left');
    setConfirm(null);
    const [act] = dispatch({ type: 'close', trialId: t.id, reason, ...(site ? { siteId: site.site.id } : {}) });
    const cohort = reason === 'Cohort full (simulated)';
    notify(`Closed · ${reason}`, cohort ? `${t.acronym} · profile kept, looking for the next site` : t.acronym, [act.id]);
  };
  const approveAll = () => {
    if (!state || readyIds.length < 2) return;
    readyIds.forEach((id) => leave(id, 'right'));
    fireYes();
    const acts = dispatch(readyIds.map((trialId) => ({ type: 'invite' as const, trialId })));
    notify(`${acts.length} invitations approved (simulated)`, readyIds.map((id) => byId.get(id)?.acronym).join(' · '), acts.map((a) => a.id));
  };

  const openWhy = (t: Trial | undefined, from?: HTMLElement | null) => {
    if (!t) return;
    returnFocus.current = from ?? (document.activeElement as HTMLElement | null);
    setDrawer({ kind: 'why', trialId: t.id });
  };
  const closeDrawer = () => {
    setDrawer(null);
    window.setTimeout(() => (returnFocus.current ?? topRef.current)?.focus({ preventScroll: true }), 30);
  };

  // ---------- keyboard ----------
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (drawer || judge) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (drawer) closeDrawer();
        else setJudge(false);
      }
      return;
    }
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.closest('input, textarea, select') || tgt.isContentEditable)) return;
    if (confirm) {
      const t = byId.get(confirm.trialId)!;
      const reasons = confirm.kind === 'close' ? CLOSE_REASONS : INVITE_REASONS;
      if (e.key === 'Escape') {
        e.preventDefault();
        setConfirm(null);
        topRef.current?.focus({ preventScroll: true });
      } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= reasons.length) {
        e.preventDefault();
        const r = reasons[Number(e.key) - 1];
        if (confirm.kind === 'close') close(t, r as (typeof CLOSE_REASONS)[number]);
        else invite(t, r);
      }
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      right(top);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      left(top);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      later(top);
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      if (tgt && tgt.closest('button, a, summary')) return; // Space activates the focused control
      e.preventDefault();
      openWhy(top);
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    if (!confirm) return;
    const id = window.setTimeout(() => document.querySelector<HTMLButtonElement>('.confirm .rchip')?.focus({ preventScroll: true }), 40);
    return () => window.clearTimeout(id);
  }, [confirm]);

  const resetAll = () => {
    setPinned(undefined);
    setConfirm(null);
    setDrawer(null);
    setJudge(false);
    setToast(null);
    setExitDir({});
    seenInterest.current = null;
    void relay.reset();
  };

  const n = cards.length;
  const tally = useMemo(() => {
    const v = Object.values(decisions.staff);
    return { inv: v.filter((d) => d.type === 'invite').length, closed: v.filter((d) => d.type === 'close').length, later: decisions.later.length };
  }, [decisions]);

  const confirmTrial = confirm ? byId.get(confirm.trialId) : undefined;

  return (
    <div className="sd">
      <nav className="rail" aria-label="Main">
        <Link className="logo" href="/" aria-label="Relay home">
          <Logo size={22} />
        </Link>
        <a className="rb on" href="#deck" aria-current="page" aria-label={`Review deck, ${n} waiting`}>
          <Deck size={22} />
          {n ? <span className="badge" key={n} aria-hidden="true">{n}</span> : null}
        </a>
        <a className="rb" href={sessionId ? `/patient?s=${sessionId}` : '/patient'} target="_blank" rel="noopener" aria-label="Open the patient view in a new tab">
          <Person size={22} />
        </a>
      </nav>
      <main className="sd-main">
        <div className="sd-bar">
          <SynMark />
          <div className="grow" />
          <ModeDot mode={mode} />
          <button className="btn btn-sm" type="button" onClick={resetAll}>
            <Reset size={16} />
            Reset
          </button>
        </div>

        <div className="sd-hero">
          <div>
            <div className="sd-count">
              <RollingCount value={n} label={`${n} referrals to review`} />
              <div className="cl dsp">{n === 1 ? 'referral to review' : 'referrals to review'}</div>
            </div>
            {state ? (
              <AgentCard
                state={state}
                run={run}
                onApprove={(kind) => {
                  const [act] = dispatch({ type: 'request.approved', documentKind: kind });
                  notify('Request sent (simulated)', `${DOC_PHRASE[kind]} · referring team`, [act.id]);
                }}
                onAddReport={() => setJudge(true)}
                onChanges={() => setDrawer({ kind: 'changes' })}
              />
            ) : (
              <section className="agent" aria-busy="true">
                <div className="al">
                  <span className="dot work" />
                  Agent
                </div>
                <div className="ah">Opening the record…</div>
              </section>
            )}
          </div>

          <div className="deckwrap" id="deck">
            <SwipeDeck
              items={cards}
              getId={(t) => t.id}
              exitDir={exitDir}
              dragEnabled={!confirm}
              topRef={topRef}
              label={(t) => `${t.acronym}, ${STATUS_SHORT[deckStatus(state?.assessments[t.id])]}. Right arrow invites, left arrow if not suitable, down arrow for later, space for why.`}
              onSwipe={(t, dir) => (dir === 'right' ? right(t) : left(t))}
              render={(t, { depth, x }) =>
                state ? (
                  <StaffCard
                    t={t}
                    state={state}
                    depth={depth}
                    pop={pops[t.id] ?? 0}
                    interested={decisions.patient[t.id]?.kind === 'interested'}
                    x={x}
                    onWhy={(el) => openWhy(t, el)}
                    confirm={depth === 0 && confirm?.trialId === t.id ? confirm.kind : null}
                    onReason={(r) => (confirm?.kind === 'close' ? close(t, r as (typeof CLOSE_REASONS)[number]) : invite(t, r))}
                    onCancel={() => {
                      setConfirm(null);
                      topRef.current?.focus({ preventScroll: true });
                    }}
                  />
                ) : null
              }
              empty={
                state && !run?.active ? (
                  <div className="empty-card">
                    <div>
                      <div className="dsp">Nothing left to review.</div>
                      <button className="btn" type="button" onClick={resetAll}>
                        Start again
                      </button>
                    </div>
                  </div>
                ) : null
              }
            />
            <div className="acts sd-acts">
              <button className="big no" type="button" aria-label="Not suitable" aria-keyshortcuts="ArrowLeft" disabled={!top} onClick={() => left(top)}>
                <Cross size={26} />
                <KeyCap>←</KeyCap>
              </button>
              <button className="pill" type="button" aria-keyshortcuts="ArrowDown" disabled={!top} onClick={() => later(top)}>
                Later
                <KeyCap>↓</KeyCap>
              </button>
              <button className={`big yes ${yesOn ? 'on' : ''}`} type="button" aria-label="Invite for prescreening" aria-keyshortcuts="ArrowRight" disabled={!top} onClick={() => right(top)}>
                <Check size={28} />
                <Burst fire={burst} />
                <KeyCap>→</KeyCap>
              </button>
            </div>
            {readyIds.length >= 2 ? (
              <div className="allready">
                <button className="btn btn-ok" type="button" onClick={approveAll}>
                  <Check size={18} />
                  Approve all ready ({readyIds.length})
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <section className="next" aria-labelledby="nx-h">
          <div className="nh">
            <h2 id="nx-h" className="dsp">
              Up next
            </h2>
            <div className="tally">
              <span className="tc">Invited {tally.inv}</span>
              <span className="tc">Later {tally.later}</span>
              <span className="tc">Closed {tally.closed}</span>
            </div>
          </div>
          <div className="ngrid">
            <AnimatePresence initial={false}>
              {state
                ? cards.slice(1).map((t) => (
                    <UpNextCard
                      key={t.id}
                      t={t}
                      state={state}
                      pop={pops[t.id] ?? 0}
                      later={decisions.later.includes(t.id)}
                      interested={decisions.patient[t.id]?.kind === 'interested'}
                      onPick={() => {
                        setPinned(t.id);
                        wantFocus.current = true;
                      }}
                    />
                  ))
                : null}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {drawer?.kind === 'why' && state && byId.get(drawer.trialId) ? <WhyDrawer t={byId.get(drawer.trialId)!} state={state} onClose={closeDrawer} /> : null}
      {drawer?.kind === 'changes' ? <ChangesDrawer run={run} onClose={closeDrawer} /> : null}
      {judge ? (
        <JudgeSheet
          onClose={() => setJudge(false)}
          onSubmit={(m) => {
            setJudge(false);
            const [act] = dispatch({ type: 'doc.generated', molecular: m });
            notify('Report added (synthetic)', `KRAS ${optLabel(m.kras)} · PD-L1 TPS ${m.pdl1Tps}%`, [act.id]);
          }}
        />
      ) : null}
      {confirmTrial ? <span className="sr" aria-live="polite">{confirm?.kind === 'close' ? `Choose why ${confirmTrial.acronym} is not suitable` : `Choose why to invite ${confirmTrial.acronym} anyway`}</span> : null}
      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ---------------- the card ----------------

function StaffCard({
  t,
  state,
  depth,
  pop,
  interested,
  x,
  onWhy,
  confirm,
  onReason,
  onCancel,
}: {
  t: Trial;
  state: RelayState;
  depth: number;
  pop: number;
  interested: boolean;
  x: MotionValue<number>;
  onWhy: (el: HTMLElement) => void;
  confirm: 'close' | 'invite' | null;
  onReason: (r: string) => void;
  onCancel: () => void;
}) {
  const a = state.assessments[t.id];
  const st = deckStatus(a);
  const items = openItems(a, t, 3);
  const counts = segCounts(a);
  const site = siteFor(state, t);
  const inv = pendingInvite(state, t);
  const copy = copyFor(t.id, t.briefTitle);
  const openN = counts.open + counts.conflict + counts.review;
  return (
    <article className="sc">
      {depth === 0 ? (
        <>
          <Stamp x={x} side="right">
            Invite
          </Stamp>
          <Stamp x={x} side="left">
            Not suitable
          </Stamp>
        </>
      ) : null}
      <div className="sc-top">
        <span className="mono who">{patientLine(state)}</span>
        <Segments segs={segments(a)} pop={pop} label={segAria(a)} />
      </div>
      <div>
        <h2 className="sc-title dsp">{t.acronym}</h2>
        <div className="sc-drug">{copy.drug}</div>
      </div>
      <div className="sc-status">
        <span className={`st t-${st}`} key={st}>
          <i />
          {STATUS_SHORT[st]}
        </span>
        {interested ? (
          <span className="chip chip-int">
            <Heart size={14} />
            Patient interested
          </span>
        ) : null}
        {inv ? <span className="chip chip-inv">Invite drafted</span> : null}
      </div>
      <ul className="sc-open">
        {items.length ? (
          items.map((it) => (
            <li className="oi" key={it.criterionId}>
              <span className={`k k-${it.seg}`} aria-hidden="true" />
              <span>{it.text}</span>
            </li>
          ))
        ) : (
          <li className="oi">
            <span className="k k-ok" aria-hidden="true" />
            <span>Every checked requirement is supported{counts.screen ? ` · ${counts.screen} checked at screening` : ''}</span>
          </li>
        )}
      </ul>
      <div className="sc-site">
        <Pin size={16} />
        <span className="nm">{site ? `${site.name} · ${distanceText(site.miles, site.site.city)}` : 'No UK site open'}</span>
        <span className="sim mono">simulated</span>
        {depth === 0 ? (
          <button className="why" type="button" onClick={(e) => onWhy(e.currentTarget)} aria-keyshortcuts="Space">
            Why?
            <KeyCap>Space</KeyCap>
          </button>
        ) : null}
      </div>
      {confirm ? (
        <div className="confirm" role="group" aria-labelledby={`cf-${t.id}`} onPointerDownCapture={(e) => e.stopPropagation()}>
          <h3 id={`cf-${t.id}`}>{confirm === 'close' ? 'Why isn’t it suitable?' : `${openN} open item${openN === 1 ? '' : 's'} · invite anyway because…`}</h3>
          <div className="rchips">
            {(confirm === 'close' ? CLOSE_REASONS : INVITE_REASONS).map((r, i) => (
              <button className="rchip" type="button" key={r} onClick={() => onReason(r)}>
                <KeyCap>{i + 1}</KeyCap>
                {r}
              </button>
            ))}
            <button className="rchip cancel" type="button" onClick={onCancel}>
              Cancel
              <KeyCap>Esc</KeyCap>
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function UpNextCard({ t, state, pop, later, interested, onPick }: { t: Trial; state: RelayState; pop: number; later: boolean; interested: boolean; onPick: () => void }) {
  const a = state.assessments[t.id];
  const st: DeckStatus = deckStatus(a);
  const first = openItems(a, t, 1)[0];
  return (
    <motion.button
      layout
      type="button"
      className="rc"
      onClick={onPick}
      aria-label={`Bring ${t.acronym} to the top`}
      initial={{ opacity: 0, y: -18, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
    >
      <div className="rct dsp">
        {t.acronym}
        {interested ? <Heart size={15} className="mini-int" aria-hidden="true" /> : null}
      </div>
      <div className={`rcs d-${st}`}>
        <i />
        {later ? `Later · ${STATUS_SHORT[st]}` : STATUS_SHORT[st]}
      </div>
      <Segments segs={segments(a)} pop={pop} tone="light" label={segAria(a)} />
      <div className="rcr">{first ? first.text : 'Every checked requirement is supported'}</div>
    </motion.button>
  );
}

// ---------------- agent card ----------------

function AgentCard({ state, run, onApprove, onAddReport, onChanges }: { state: RelayState; run: RunView | null; onApprove: (k: DocKind) => void; onAddReport: () => void; onChanges: () => void }) {
  const [preview, setPreview] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const req = pendingRequest(state);
  const kind = req?.nextAction?.documentKind;
  const hasMol = state.documents.some((d) => d.kind === 'molecular');
  const asked = new Set(state.proposals.filter((p) => p.kind === 'send_request' && (p.status === 'sent' || p.status === 'approved')).map((p) => p.nextAction?.documentKind));
  const running = !!run?.active;

  let head: string;
  let sub = '';
  let dot = '';
  if (running) {
    const cur = run!.steps.filter((s) => !s.finished).at(-1) ?? run!.steps.at(-1);
    head = cur ? `${cur.finished ? cur.done : cur.doing}…` : 'Working…';
    dot = 'work';
  } else if (req && kind) {
    const na = req.nextAction!;
    const studies = na.unblocks.length;
    head = `Ask for ${DOC_PHRASE[kind]}. It would settle ${na.openCount} open check${na.openCount === 1 ? '' : 's'} across ${studies} ${studies === 1 ? 'study' : 'studies'}.`;
    dot = 'wait';
  } else if (asked.has('molecular') && !hasMol) {
    head = 'Waiting for the molecular report';
    sub = 'Requested · simulated';
    dot = 'wait';
  } else if (asked.size) {
    head = asked.has('labs') ? 'Waiting for current bloods' : 'Waiting for the requested document';
    sub = 'Requested · simulated';
  } else {
    head = 'Nothing is blocked on evidence';
  }
  if (!running && run?.alternative) sub = `Profile kept. ${run.alternative.acronym} is open at ${run.alternative.facility}, ${Math.round(run.alternative.distanceMiles)} mi (simulated).`;
  else if (!running && run?.alternative === null) sub = 'Profile kept. No other open site within the travel preference (simulated).';
  const realChanges = (run?.changes ?? []).filter((c) => c.from !== null && c.from !== c.to);
  const steps = run?.steps ?? [];

  return (
    <section className="agent" aria-labelledby="ag-h" aria-busy={running}>
      <div className="al" id="ag-h">
        <span className={`dot ${dot}`} aria-hidden="true" />
        Agent
        <span className="grow" />
      </div>
      <div className="ah swap" key={head} aria-live="polite">
        {head}
      </div>
      {sub ? <div className="asub">{sub}</div> : null}
      {steps.length && (running || showSteps) ? (
        <ol className="steps">
          {steps.map((s) => (
            <li key={s.id} className={s.finished ? (s.ok ? 'done' : 'bad') : ''}>
              <span className="tick" aria-hidden="true">
                <Check size={11} />
              </span>
              <span>{s.finished ? s.done : s.doing}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {!running && run?.error ? <div className="amsg">{run.error}</div> : null}
      <div className="abtns">
        {!running && req && kind ? (
          <>
            <button className="btn btn-b" type="button" onClick={() => onApprove(kind)}>
              Approve request
            </button>
            <button className="disc" type="button" aria-expanded={preview} aria-controls="draft" onClick={() => setPreview((p) => !p)}>
              Preview
              <Chevron size={16} />
            </button>
          </>
        ) : null}
        {!running && !req && asked.has('molecular') && !hasMol ? (
          <button className="btn btn-b" type="button" onClick={onAddReport}>
            Add the report
          </button>
        ) : null}
        {!running && realChanges.length ? (
          <button className="btn btn-sm" type="button" onClick={onChanges}>
            See what changed
          </button>
        ) : null}
        {!running && steps.length ? (
          <button className="disc" type="button" aria-expanded={showSteps} onClick={() => setShowSteps((v) => !v)}>
            {steps.length} steps
            <Chevron size={16} />
          </button>
        ) : null}
      </div>
      {preview && !running && req ? (
        <div className="draft" id="draft" tabIndex={0} aria-label="Drafted request">
          {req.draft}
        </div>
      ) : null}
    </section>
  );
}

// ---------------- drawers ----------------

function valueText(r: CriterionResult, state: RelayState): string {
  const f = r.evidence[0];
  if (r.atScreening) return 'Study team';
  if (r.state === 'needs_review') return f ? formatValue(f.value, f.unit) : 'Clinician';
  if (r.state === 'unknown') {
    const stale = r.staleAll?.[0] ?? r.stale;
    if (stale) return `Outdated · ${shortDate(stale.observedOn)}`;
    if (r.notTested?.length) return 'Not tested';
    return 'Not documented';
  }
  if (!f) return '';
  const doc = state.documents.find((d) => d.id === f.source.docId);
  return `${formatValue(f.value, f.unit)} · ${shortDate(f.observedOn ?? doc?.date)}`;
}

function Passage({ r, state }: { r: CriterionResult; state: RelayState }) {
  const f = r.evidence[0];
  if (!f) return <div className="nodoc">No passage: this is not documented in the record yet.</div>;
  const doc = state.documents.find((d) => d.id === f.source.docId);
  if (!doc) return null;
  let { start, end } = f.source;
  if (doc.text.slice(start, end) !== f.source.quote) {
    start = doc.text.indexOf(f.source.quote);
    end = start + f.source.quote.length;
  }
  if (start < 0) return null;
  const from = Math.max(0, doc.text.lastIndexOf('\n', Math.max(0, start - 120)) + 1);
  const toNl = doc.text.indexOf('\n', end + 80);
  const to = toNl < 0 ? doc.text.length : toNl;
  return (
    <div className="psg">
      <div className="psrc">
        <DocIcon size={16} />
        {doc.title} · {shortDate(doc.date)} · SYNTHETIC
      </div>
      <div className="ptxt">
        {from > 0 ? '…' : ''}
        {doc.text.slice(from, start)}
        <mark className="hl">{doc.text.slice(start, end)}</mark>
        {doc.text.slice(end, to)}
        {to < doc.text.length ? '…' : ''}
      </div>
    </div>
  );
}

function useDialogFocus(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = window.setTimeout(() => ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }), 40);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = prev;
    };
  }, []);
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const els = [...ref.current.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex="0"]')].filter((x) => !x.hasAttribute('disabled'));
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return { ref, onKeyDown };
}

const GROUP_RANK: Record<Seg, number> = { conflict: 0, open: 1, review: 2, screen: 3, ok: 4 };

function WhyDrawer({ t, state, onClose }: { t: Trial; state: RelayState; onClose: () => void }) {
  const a = state.assessments[t.id];
  const crit = new Map(t.criteria.map((c) => [c.id, c]));
  const rows = (a?.results ?? []).map((r) => ({ r, seg: segOf(r) })).sort((x, y) => GROUP_RANK[x.seg] - GROUP_RANK[y.seg]);
  const firstWithEvidence = rows.find((x) => x.seg !== 'ok' && x.seg !== 'screen' && x.r.evidence.length) ?? rows.find((x) => x.seg === 'ok' && x.r.evidence.length);
  const [open, setOpen] = useState<string | undefined>(firstWithEvidence?.r.criterionId);
  const { ref, onKeyDown } = useDialogFocus(onClose);
  const groups: { title: string; segs: Seg[] }[] = [
    { title: 'Open', segs: ['conflict', 'open', 'review'] },
    { title: 'Checked at screening', segs: ['screen'] },
    { title: 'Supported', segs: ['ok'] },
  ];
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <aside className="drawer light" role="dialog" aria-modal="true" aria-labelledby="dw-h" ref={ref} onKeyDown={onKeyDown}>
        <div className="dh">
          <div className="dh-row">
            <h2 id="dw-h" className="dsp">
              {t.acronym}
            </h2>
            <button className="ibtn" type="button" aria-label="Close" onClick={onClose} data-autofocus>
              <Cross size={18} />
            </button>
          </div>
          <div className="sub">
            {state.patientId} · record v{state.version} · registry snapshot {shortDate(t.snapshotDate)} ·{' '}
            <a href={t.source.url} target="_blank" rel="noopener noreferrer">
              {t.nct}
            </a>
          </div>
        </div>
        <div className="db">
          {groups.map((g) => {
            const list = rows.filter((x) => g.segs.includes(x.seg));
            if (!list.length) return null;
            return (
              <div key={g.title}>
                <div className="dgroup">
                  {g.title} · {list.length}
                </div>
                {list.map(({ r, seg }) => {
                  const c = crit.get(r.criterionId);
                  const isOpen = open === r.criterionId;
                  return (
                    <div key={r.criterionId}>
                      <button className="cr" type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : r.criterionId)}>
                        <span className={`k k-${seg}`} aria-hidden="true" />
                        <span className="cr-name">{seg === 'ok' || seg === 'screen' ? stripParens(c?.plain ?? r.criterionId) : shortText(r, c)}</span>
                        <span className="cr-val mono">{valueText(r, state)}</span>
                      </button>
                      {isOpen ? (
                        <div className="cr-more">
                          {c ? (
                            <div className="req">
                              <b>{c.kind === 'exclusion' ? 'Exclusion · registry text' : 'Requirement · registry text'}</b>
                              {c.text.length > 520 ? `${c.text.slice(0, 520)}…` : c.text}
                            </div>
                          ) : null}
                          <Passage r={r} state={state} />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}

const STATUS_FROM: Record<string, DeckStatus> = { ready: 'ready', needs_review: 'review', needs_evidence: 'evidence', not_match: 'no' };
const STATUS_GLYPH: Record<DeckStatus, Seg> = { ready: 'ok', review: 'review', evidence: 'open', no: 'conflict' };

function ChangesDrawer({ run, onClose }: { run: RunView | null; onClose: () => void }) {
  const { ref, onKeyDown } = useDialogFocus(onClose);
  const rows = (run?.changes ?? []).filter((c) => c.from !== null && c.from !== c.to);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <aside className="drawer light" role="dialog" aria-modal="true" aria-labelledby="ch-h" ref={ref} onKeyDown={onKeyDown}>
        <div className="dh">
          <div className="dh-row">
            <h2 id="ch-h" className="dsp">
              What changed
            </h2>
            <button className="ibtn" type="button" aria-label="Close" onClick={onClose} data-autofocus>
              <Cross size={18} />
            </button>
          </div>
          <div className="sub">The agent re-checked every study against the new evidence.</div>
        </div>
        <div className="db">
          {rows.map((c) => {
            const to = STATUS_FROM[c.to];
            return (
              <div className="cr" key={c.trialId}>
                <span className={`k k-${STATUS_GLYPH[to]}`} aria-hidden="true" />
                <span className="cr-name">{c.acronym}</span>
                <span className="cr-val mono">
                  {STATUS_SHORT[STATUS_FROM[c.from ?? 'needs_evidence']]} → {STATUS_SHORT[to]}
                </span>
              </div>
            );
          })}
          {!rows.length ? <div className="nodoc">No study changed status in the last run.</div> : null}
        </div>
      </aside>
    </>
  );
}

// ---------------- judge sheet ----------------

const TPS_CHIPS = [0, 0.5, 1, 50, 60];
const MORE: (keyof typeof MOLECULAR_OPTIONS)[] = ['egfr', 'alk', 'ros1', 'braf', 'met', 'ret', 'her2'];
const GENE_NAME: Record<string, string> = { egfr: 'EGFR', alk: 'ALK', ros1: 'ROS1', braf: 'BRAF', met: 'MET', ret: 'RET', her2: 'HER2' };

function JudgeSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (m: MolecularReportInput) => void }) {
  const [kras, setKras] = useState('G12C');
  const [tps, setTps] = useState('0');
  const [more, setMore] = useState(false);
  const [genes, setGenes] = useState<Record<string, string>>({});
  const { ref, onKeyDown } = useDialogFocus(onClose);
  const tpsNum = Number(tps.replace(',', '.'));
  const valid = tps.trim() !== '' && Number.isFinite(tpsNum) && tpsNum >= 0 && tpsNum <= 100;
  const submit = () => {
    const m = cleanMolecular({ kras, pdl1Tps: tpsNum, reportDate: REPORT_DATE, ...Object.fromEntries(MORE.map((g) => [g, genes[g] ?? 'not_detected'])) });
    if (m) onSubmit(m);
  };
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="jd-h" ref={ref} onKeyDown={onKeyDown}>
        <h2 id="jd-h" className="dsp">
          Synthetic molecular report
        </h2>
        <div className="asub">Set the results, then add it to the record. Synthetic only.</div>
        <div className="field" role="group" aria-labelledby="jd-kras">
          <span className="lbl" id="jd-kras">
            KRAS
          </span>
          <div className="opts">
            {MOLECULAR_OPTIONS.kras.map((v, i) => (
              <button key={v} className="opt" type="button" aria-pressed={kras === v} onClick={() => setKras(v)} {...(i === 1 ? { 'data-autofocus': true } : {})}>
                {optLabel(v)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="lbl" htmlFor="jd-tps">
            PD-L1 TPS (%)
          </label>
          <div className="num">
            <input id="jd-tps" inputMode="decimal" autoComplete="off" value={tps} aria-invalid={!valid} onChange={(e) => setTps(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && valid && submit()} />
            <div className="opts">
              {TPS_CHIPS.map((v) => (
                <button key={v} className="opt" type="button" aria-pressed={valid && tpsNum === v} onClick={() => setTps(String(v))}>
                  {v}%
                </button>
              ))}
            </div>
          </div>
          {!valid ? <div className="err">Enter a number from 0 to 100 (decimals are fine).</div> : null}
        </div>
        <div className="field">
          <button className="disc" type="button" aria-expanded={more} aria-controls="jd-more" onClick={() => setMore((v) => !v)}>
            Other genes · not detected
            <Chevron size={16} />
          </button>
          {more ? (
            <div className="sel" id="jd-more">
              {MORE.map((g) => (
                <label key={g}>
                  {GENE_NAME[g]}
                  <select value={genes[g] ?? 'not_detected'} onChange={(e) => setGenes((s) => ({ ...s, [g]: e.target.value }))}>
                    {(MOLECULAR_OPTIONS[g] as readonly string[]).map((v) => (
                      <option key={v} value={v}>
                        {optLabel(v)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mfoot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-b" type="button" disabled={!valid} onClick={submit}>
            Add to the record
          </button>
        </div>
      </div>
    </>
  );
}

