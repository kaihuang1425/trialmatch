'use client';

// Tinder-style card stack on Motion. The top card follows the pointer and tilts with its offset;
// a flick (velocity) or a drag past the threshold hands the decision to the parent, otherwise the
// card springs back. The card underneath scales up as the top card moves away. Removed cards fly
// out in the direction the parent recorded in `exitDir`. Buttons and keys use the same path.

import { AnimatePresence, animate, motion, useIsPresent, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useRef, type ReactNode, type Ref } from 'react';

export type SwipeDir = 'left' | 'right' | 'up' | 'down';

export interface SwipeDeckProps<T> {
  items: T[];
  getId: (t: T) => string;
  render: (item: T, ctx: { depth: number; x: MotionValue<number> }) => ReactNode;
  /** Gesture crossed the threshold. Return true if the card leaves (the parent removes it), false to spring back. */
  onSwipe: (item: T, dir: 'left' | 'right') => boolean;
  exitDir: Record<string, SwipeDir>;
  dragEnabled: boolean;
  label: (item: T) => string;
  topRef?: Ref<HTMLDivElement>;
  threshold?: number;
  tilt?: number;
  className?: string;
  empty?: ReactNode;
}

const DEPTH = [
  { y: 0, scale: 1, opacity: 1 },
  { y: 14, scale: 0.95, opacity: 1 },
  { y: 28, scale: 0.9, opacity: 0.7 },
];

function exitFor(dir: SwipeDir | undefined, reduce: boolean) {
  if (reduce) return { opacity: 0, transition: { duration: 0.15 } };
  const w = typeof window !== 'undefined' ? Math.max(window.innerWidth, 600) : 900;
  const ease = [0.5, 0, 0.2, 1] as const;
  switch (dir) {
    case 'left':
      return { x: -w, y: -24, rotate: -16, opacity: 0, transition: { duration: 0.36, ease } };
    case 'up':
      return { y: -70, scale: 0.9, opacity: 0, transition: { duration: 0.32, ease } };
    case 'down':
      return { y: 160, scale: 0.92, opacity: 0, transition: { duration: 0.34, ease } };
    case 'right':
    default:
      return { x: w, y: -24, rotate: 16, opacity: 0, transition: { duration: 0.36, ease } };
  }
}

function Card({
  id,
  depth,
  dragX,
  drag,
  threshold,
  tilt,
  label,
  topRef,
  onRelease,
  children,
}: {
  id: string;
  depth: number;
  dragX: MotionValue<number>;
  drag: boolean;
  threshold: number;
  tilt: number;
  label: string;
  topRef?: Ref<HTMLDivElement>;
  onRelease: (dir: 'left' | 'right') => boolean;
  children: (x: MotionValue<number>) => ReactNode;
}) {
  const reduce = !!useReducedMotion();
  const present = useIsPresent();
  const x = useMotionValue(0);
  const rotate = useTransform(x, (v) => (reduce ? 0 : v / tilt));
  const top = depth === 0 && present;
  const topNow = useRef(top);
  topNow.current = top;
  useMotionValueEvent(x, 'change', (v) => {
    if (topNow.current) dragX.set(v);
  });
  useEffect(() => {
    if (top) dragX.set(x.get());
  }, [top, dragX, x]);
  // The card underneath grows toward full size as the top card is pulled away.
  const grow = useTransform(dragX, [-240, 0, 240], [1 / 0.95, 1, 1 / 0.95]);
  const lift = useTransform(dragX, [-240, 0, 240], [-14, 0, -14]);

  return (
    <motion.div
      className={`dk-slot depth-${Math.min(depth, 2)}`}
      style={{ zIndex: 10 - depth }}
      initial={{ y: 44, scale: 0.86, opacity: 0 }}
      animate={DEPTH[Math.min(depth, 2)]}
      exit="gone"
      variants={{ gone: (m: Record<string, SwipeDir> | undefined) => exitFor(m?.[id], reduce) }}
      transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 }}
      aria-hidden={depth > 0 ? true : undefined}
      inert={depth > 0 ? true : undefined}
    >
      <motion.div className="dk-grow" style={depth === 1 && !reduce ? { scale: grow, y: lift } : undefined}>
        <motion.div
          ref={top ? topRef : undefined}
          className={`dk-card ${top && drag ? 'grab' : ''}`}
          style={{ x, rotate }}
          tabIndex={top ? 0 : -1}
          role="group"
          aria-roledescription="card"
          aria-label={top ? label : undefined}
          drag={top && drag ? 'x' : false}
          dragMomentum={false}
          dragElastic={1}
          onDragEnd={(_e, info) => {
            const dx = info.offset.x;
            const vx = info.velocity.x;
            const flick = Math.abs(vx) > 650 && Math.abs(dx) > 30;
            if (dx > threshold || (flick && vx > 0)) {
              if (onRelease('right')) return;
            } else if (dx < -threshold || (flick && vx < 0)) {
              if (onRelease('left')) return;
            }
            animate(x, 0, reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 520, damping: 30 });
          }}
        >
          {children(x)}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function SwipeDeck<T>({ items, getId, render, onSwipe, exitDir, dragEnabled, label, topRef, threshold = 110, tilt = 24, className = '', empty }: SwipeDeckProps<T>) {
  const dragX = useMotionValue(0);
  const shown = items.slice(0, 3);
  const topId = shown.length ? getId(shown[0]) : '';
  useEffect(() => {
    dragX.set(0);
  }, [topId, dragX]);
  return (
    <div className={`dk ${className}`}>
      <AnimatePresence custom={exitDir}>
        {shown
          .map((item, depth) => (
            <Card
              key={getId(item)}
              id={getId(item)}
              depth={depth}
              dragX={dragX}
              drag={dragEnabled}
              threshold={threshold}
              tilt={tilt}
              label={label(item)}
              topRef={topRef}
              onRelease={(dir) => onSwipe(item, dir)}
            >
              {(x) => render(item, { depth, x })}
            </Card>
          ))
          .reverse()}
      </AnimatePresence>
      {!items.length ? empty : null}
    </div>
  );
}

/** "INVITE" / "NOT SUITABLE" stamp that fades in with the drag offset. */
export function Stamp({ x, side, children }: { x: MotionValue<number>; side: 'left' | 'right'; children: ReactNode }) {
  const opacity = useTransform(x, side === 'right' ? [20, 120] : [-120, -20], side === 'right' ? [0, 1] : [1, 0]);
  return (
    <motion.span className={`stamp st-${side}`} style={{ opacity }} aria-hidden="true">
      {children}
    </motion.span>
  );
}
