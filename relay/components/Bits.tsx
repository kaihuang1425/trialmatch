'use client';

// Small shared pieces: rolling count, evidence strip, invite burst, key caps, marks and the toast.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Seg } from '@/lib/deck';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Big number whose digits roll to the new value (a column of 0–9 per digit). */
export function RollingCount({ value, label, className = '' }: { value: number; label: string; className?: string }) {
  const digits = String(Math.max(0, value)).split('');
  return (
    <div className={`count dsp ${className}`} role="img" aria-label={label}>
      {digits.map((d, i) => (
        <span className="dg" key={digits.length - i} aria-hidden="true">
          <span className="stk" style={{ transform: `translateY(-${d}em)` }}>
            {DIGITS.map((x) => (
              <span key={x}>{x}</span>
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * The evidence strip: one segment per criterion. When `pop` changes, segments whose state changed
 * recolour left to right with a small bounce.
 */
export function Segments({ segs, pop = 0, label, tone = 'dark', className = '' }: { segs: Seg[]; pop?: number; label: string; tone?: 'dark' | 'light'; className?: string }) {
  // `committed` = segments as last painted; `flags` = which ones changed at the latest pop. Both are
  // computed during render so the colour change and its left-to-right delay land in the same frame.
  const committed = useRef<Seg[]>(segs);
  const flags = useRef<{ pop: number; changed: boolean[] }>({ pop, changed: [] });
  if (pop !== flags.current.pop) {
    const before = committed.current;
    flags.current = { pop, changed: segs.map((s, i) => s !== before[i]) };
  }
  useEffect(() => {
    committed.current = segs;
  });
  const changed = flags.current.changed;
  const n = segs.length;
  return (
    <div className={`segs segs-${tone} ${n > 18 ? 'dense' : ''} ${className}`} role="img" aria-label={label}>
      {segs.map((s, i) => (
        <span
          key={i}
          className={`seg s-${s}${changed[i] ? (pop % 2 ? ' popA' : ' popB') : ''}`}
          style={{ animationDelay: `${i * 32}ms`, transitionDelay: changed[i] ? `${i * 32}ms` : '0ms' }}
        />
      ))}
    </div>
  );
}

const RAYS = ['#FF5B2E', '#3158DB', '#197654', '#F0508C', '#6C63FF', '#FF8A3D', '#4CC38A', '#8FA8FF'];

/** Eight dots that fly out of a button. Re-fires whenever `fire` changes (and is > 0). */
export function Burst({ fire }: { fire: number }) {
  if (!fire) return null;
  return (
    <span className="burst on" key={fire} aria-hidden="true">
      {RAYS.map((c, i) => (
        <span className="ray" key={i} style={{ transform: `rotate(${i * 45}deg)` }}>
          <span className="pt" style={{ background: c }} />
        </span>
      ))}
    </span>
  );
}

export function KeyCap({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={`keycap ${className}`} aria-hidden="true">
      {children}
    </kbd>
  );
}

export function SynMark({ className = '' }: { className?: string }) {
  return (
    <span className={`syn mono ${className}`} title="Every patient and document in this demo is synthetic.">
      SYNTHETIC DATA
    </span>
  );
}

export function ModeDot({ mode }: { mode: 'replay' | 'live' }) {
  return (
    <span className={`mode mono mode-${mode}`} title={mode === 'live' ? 'Live: Gemini chooses the agent’s tools' : 'Replay: the same engine runs in your browser, no network'}>
      <i aria-hidden="true" />
      {mode === 'live' ? 'Live' : 'Replay'}
    </span>
  );
}

export interface ToastData {
  id: number;
  msg: string;
  sub?: string;
  undo?: () => void;
}

const TOAST_MS = 5200;

/** Toast with an Undo and a 5.2 s drain bar. Hover or focus pauses it. */
export function Toast({ toast, onDone, className = '' }: { toast: ToastData | null; onDone: () => void; className?: string }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const left = useRef(TOAST_MS);
  const started = useRef(0);
  const [paused, setPaused] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const start = () => {
    started.current = Date.now();
    timer.current = setTimeout(() => doneRef.current(), left.current);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    left.current = Math.max(0, left.current - (Date.now() - started.current));
  };

  useEffect(() => {
    if (!toast) return;
    left.current = TOAST_MS;
    setPaused(false);
    start();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id]);

  if (!toast) return null;
  const pause = () => {
    if (!paused) {
      stop();
      setPaused(true);
    }
  };
  const resume = () => {
    if (paused) {
      setPaused(false);
      start();
    }
  };
  return (
    <div
      key={toast.id}
      className={`toast ${paused ? 'paused' : ''} ${className}`}
      role="status"
      aria-live="polite"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <div className="toast-txt">
        <div className="toast-msg">{toast.msg}</div>
        {toast.sub ? <div className="toast-sub mono">{toast.sub}</div> : null}
      </div>
      {toast.undo ? (
        <button
          className="tbtn"
          type="button"
          onClick={() => {
            toast.undo?.();
            doneRef.current();
          }}
        >
          Undo
        </button>
      ) : null}
      <span className="drain" aria-hidden="true" />
    </div>
  );
}
