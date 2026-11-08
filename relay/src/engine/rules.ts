// Deterministic rule evaluator over plain-JSON rules. Four states, never a guess:
//   fact not documented          -> unknown (missing)
//   document says "not tested"   -> unknown (not_tested)   — never treated as negative
//   fact outside its time window -> unknown (stale)
//   ambiguous value / bad unit   -> needs_review
//   study-team step at screening -> unknown (at_screening), excluded from the trial status
// Three-valued AND/OR: AND is conflicting if any input is conflicting (even with others missing);
// OR is supported if any input is supported. A missing fact never produces `conflicting`, even under NOT.

import { FACT_LABEL, formatValue } from './labels';
import { RELAY_POLICY, policyWindowDays } from './policy';
import type {
  Criterion,
  CriterionResult,
  CriterionState,
  Fact,
  FactKey,
  Rule,
  StaleInfo,
  UnknownReason,
  Verification,
  Window,
} from './types';
import { convert } from './units';

export interface EvalContext {
  facts: Fact[];
  asOf: string; // ISO date
  verifications?: Verification[];
}

interface Partial {
  state: CriterionState;
  evidence: Fact[];
  missing: FactKey[];
  notTested: FactKey[];
  stale: StaleInfo[];
  reasons: string[];
}

const RANK_AND: Record<CriterionState, number> = { conflicting: 3, unknown: 2, needs_review: 1, supported: 0 };
const RANK_OR: Record<CriterionState, number> = { supported: 3, unknown: 2, needs_review: 1, conflicting: 0 };

/** The fact Relay uses for a key: a coordinator correction wins, then the most recent observation. */
export function currentFact(facts: Fact[], key: FactKey): Fact | undefined {
  let best: Fact | undefined;
  let bestIdx = -1;
  facts.forEach((f, i) => {
    if (f.key !== key || !f.verified) return;
    if (!best) {
      best = f;
      bestIdx = i;
      return;
    }
    const fh = f.extractedBy === 'human' ? 1 : 0;
    const bh = best.extractedBy === 'human' ? 1 : 0;
    if (fh !== bh) {
      if (fh > bh) {
        best = f;
        bestIdx = i;
      }
      return;
    }
    const fd = f.observedOn ?? '';
    const bd = best.observedOn ?? '';
    if (fd > bd || (fd === bd && i > bestIdx)) {
      best = f;
      bestIdx = i;
    }
  });
  return best;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso.slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(toIso.slice(0, 10) + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
}

export function windowDays(w: Window): number {
  return w.source === 'protocol' ? w.days : policyWindowDays(w.policy);
}

function windowLabel(w: Window): string {
  return w.source === 'protocol'
    ? `protocol window: ${w.text}`
    : `Relay policy: results older than ${policyWindowDays(w.policy)} days are outdated for prescreening`;
}

const empty = (): Omit<Partial, 'state' | 'reasons'> => ({ evidence: [], missing: [], notTested: [], stale: [] });
const leaf = (state: CriterionState, reasons: string[], evidence: Fact[] = []): Partial => ({ ...empty(), state, reasons, evidence });

/** Resolve the fact for a leaf; returns a terminal Partial when the leaf cannot be decided from it. */
function resolve(key: FactKey, ctx: EvalContext, window?: Window): { fact: Fact } | { done: Partial } {
  const fact = currentFact(ctx.facts, key);
  if (!fact) {
    return { done: { ...empty(), state: 'unknown', missing: [key], reasons: [`${FACT_LABEL[key]}: not documented`] } };
  }
  if (fact.value === 'uncertain') {
    return { done: leaf('needs_review', [`${FACT_LABEL[key]}: the source is ambiguous ("${fact.source.quote}") — a clinician decides`], [fact]) };
  }
  if (fact.value === 'not_tested') {
    return {
      done: { ...empty(), state: 'unknown', evidence: [fact], notTested: [key], reasons: [`${FACT_LABEL[key]}: not tested (the document says testing was not performed)`] },
    };
  }
  if (window) {
    const limit = windowDays(window);
    if (!fact.observedOn) {
      return { done: leaf('needs_review', [`${FACT_LABEL[key]}: result has no date, so the ${windowLabel(window)} cannot be checked`], [fact]) };
    }
    const age = daysBetween(fact.observedOn, ctx.asOf);
    if (age > limit) {
      const stale: StaleInfo = { key, observedOn: fact.observedOn, windowDays: limit, windowSource: window.source };
      return {
        done: { ...empty(), state: 'unknown', evidence: [fact], stale: [stale], reasons: [`${FACT_LABEL[key]} dated ${fact.observedOn} is ${age} days old (${windowLabel(window)})`] },
      };
    }
  }
  return { fact };
}

const CMP: Record<string, (a: number, b: number) => boolean> = {
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
};
const CMP_TEXT: Record<string, string> = { '<': '<', '<=': '≤', '>': '>', '>=': '≥', '==': '=', '!=': '≠' };

function eqValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

/** Variant patterns: exact (case-insensitive), "G12*" prefix, or registry style "G719X" (X = any residue). */
export function matchesPattern(value: string, pattern: string): boolean {
  const v = value.trim();
  const p = pattern.trim();
  if (p === '*') return true;
  if (p.endsWith('*')) return v.toLowerCase().startsWith(p.slice(0, -1).toLowerCase());
  const x = /^([A-Z])(\d+)X$/.exec(p);
  if (x) return new RegExp(`^${x[1]}${x[2]}[A-Z]$`).test(v);
  return v.toLowerCase() === p.toLowerCase();
}

function combine(op: 'and' | 'or', parts: Partial[]): Partial {
  const rank = op === 'and' ? RANK_AND : RANK_OR;
  const state = parts.reduce<CriterionState>((s, p) => (rank[p.state] > rank[s] ? p.state : s), parts[0].state);
  const deciding = parts.filter((p) => p.state === state);
  const unknowns = parts.filter((p) => p.state === 'unknown');
  return {
    state,
    evidence: (state === 'conflicting' || state === 'supported' ? deciding : parts).flatMap((p) => p.evidence),
    missing: state === 'unknown' ? unknowns.flatMap((p) => p.missing) : [],
    notTested: state === 'unknown' ? unknowns.flatMap((p) => p.notTested) : [],
    stale: state === 'unknown' ? unknowns.flatMap((p) => p.stale) : [],
    reasons: deciding.flatMap((p) => p.reasons),
  };
}

export function evalRule(rule: Rule, ctx: EvalContext): Partial {
  switch (rule.op) {
    case 'and':
    case 'or': {
      if (!Array.isArray(rule.args) || rule.args.length === 0) throw new Error(`empty ${rule.op}`);
      return combine(rule.op, rule.args.map((r) => evalRule(r, ctx)));
    }
    case 'not': {
      const p = evalRule(rule.arg, ctx);
      const flip: Record<CriterionState, CriterionState> = {
        supported: 'conflicting',
        conflicting: 'supported',
        unknown: 'unknown',
        needs_review: 'needs_review',
      };
      return { ...p, state: flip[p.state] };
    }
    case 'cmp': {
      const r = resolve(rule.key, ctx, rule.window);
      if ('done' in r) return r.done;
      const f = r.fact;
      if (typeof f.value !== 'number') return leaf('needs_review', [`${FACT_LABEL[rule.key]} "${String(f.value)}" is not a number`], [f]);
      let v: number | null = f.value;
      let shown = formatValue(f.value, f.unit);
      if (rule.unit && rule.unit.toLowerCase() === 'xuln') {
        if (!f.refHigh) return leaf('needs_review', [`${FACT_LABEL[rule.key]}: no upper limit of normal on the report`], [f]);
        v = Math.round((f.value / f.refHigh) * 100) / 100;
        shown = `${formatValue(f.value, f.unit)} (${v} x ULN ${f.refHigh})`;
      } else if (rule.unit && f.unit) {
        v = convert(f.value, f.unit, rule.unit);
        if (v === null) return leaf('needs_review', [`${FACT_LABEL[rule.key]}: cannot convert ${f.unit} to ${rule.unit}`], [f]);
        if (v !== f.value) shown = `${formatValue(f.value, f.unit)} (= ${Math.round(v * 100) / 100} ${rule.unit})`;
      }
      const ok = CMP[rule.cmp](v, rule.value);
      const target = `${CMP_TEXT[rule.cmp]} ${rule.value}${rule.unit ? (rule.unit === '%' ? '%' : ' ' + rule.unit) : ''}`;
      const reason = `${FACT_LABEL[rule.key]} ${shown} ${ok ? 'meets' : 'does not meet'} ${target}${rule.note ? ` (${rule.note})` : ''}`;
      return leaf(ok ? 'supported' : 'conflicting', [reason], [f]);
    }
    case 'is': {
      const r = resolve(rule.key, ctx, rule.window);
      if ('done' in r) return r.done;
      const f = r.fact;
      const ok = eqValue(f.value, rule.value);
      return leaf(ok ? 'supported' : 'conflicting', [`${FACT_LABEL[rule.key]}: ${formatValue(f.value, f.unit)} ${ok ? '=' : '≠'} ${formatValue(rule.value)}`], [f]);
    }
    case 'in': {
      const r = resolve(rule.key, ctx, rule.window);
      if ('done' in r) return r.done;
      const f = r.fact;
      const ok = rule.values.some((p) => matchesPattern(String(f.value), p));
      const list = rule.values.length > 6 ? `${rule.values.slice(0, 6).join(', ')}, … (${rule.values.length} listed)` : rule.values.join(', ');
      return leaf(
        ok ? 'supported' : 'conflicting',
        [`${FACT_LABEL[rule.key]}: ${formatValue(f.value, f.unit)} ${ok ? 'is' : 'is not'} in [${list}]${rule.note ? ` (${rule.note})` : ''}`],
        [f],
      );
    }
    case 'present': {
      const r = resolve(rule.key, ctx, rule.window);
      if ('done' in r) return r.done;
      return leaf('supported', [`${FACT_LABEL[rule.key]} documented: ${formatValue(r.fact.value, r.fact.unit)}`], [r.fact]);
    }
    case 'current': {
      const parts = rule.keys.map((k) => {
        const r = resolve(k, ctx, rule.window);
        return 'done' in r ? r.done : leaf('supported', [], [r.fact]);
      });
      const p = combine('and', parts);
      const reasons = [...new Set(parts.flatMap((x) => x.reasons))];
      if (p.state === 'supported') reasons.push(`Results dated within the ${windowLabel(rule.window)}`);
      return { ...p, evidence: parts.flatMap((x) => x.evidence), reasons };
    }
    case 'not_within': {
      const r = resolve(rule.key, ctx);
      if ('done' in r) return r.done;
      const f = r.fact;
      if (f.value === 'none' || f.value === false) return leaf('supported', [`${FACT_LABEL[rule.key]}: none`], [f]);
      if (typeof f.value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f.value)) {
        const ago = daysBetween(f.value, ctx.asOf);
        const ok = ago > rule.days;
        return leaf(ok ? 'supported' : 'conflicting', [`${FACT_LABEL[rule.key]} on ${f.value}, ${ago} days ago (${rule.what}: ${ok ? 'outside' : 'inside'} ${rule.days} days)`], [f]);
      }
      return leaf('needs_review', [`${FACT_LABEL[rule.key]} "${String(f.value)}" has no usable date`], [f]);
    }
    case 'table': {
      const table = RELAY_POLICY.tables[rule.table];
      const parts = rule.genes.map((gene): Partial => {
        const r = resolve(gene, ctx);
        if ('done' in r) return r.done;
        const f = r.fact;
        const value = String(f.value);
        if (value === 'not_detected' || value === 'negative') return leaf('supported', [`${FACT_LABEL[gene]}: not detected`], [f]);
        const entry = table.entries.find((e) => e.gene === gene && e.values.some((p) => matchesPattern(value, p)));
        if (!entry) return leaf('needs_review', [`${FACT_LABEL[gene]}: ${formatValue(value)} is not in Relay's alteration table (as of ${table.asOf})`], [f]);
        const cell = entry[rule.column];
        const label = `${FACT_LABEL[gene]} ${formatValue(value)} — ${rule.column}: ${cell} (Relay table as of ${table.asOf}, unverified against NICE/MHRA)`;
        if (cell === 'approved' || cell === 'yes') return leaf('conflicting', [label], [f]);
        if (cell === 'uncertain') return leaf('needs_review', [label], [f]);
        return leaf('supported', [label], [f]);
      });
      return combine('and', parts);
    }
    case 'any_positive': {
      for (const c of rule.checks) {
        const f = currentFact(ctx.facts, c.key);
        if (f && f.value !== 'uncertain' && f.value !== 'not_tested' && c.values.some((p) => matchesPattern(String(f.value), p))) {
          return leaf('supported', [`${FACT_LABEL[c.key]}: ${formatValue(f.value)} documented`], [f]);
        }
      }
      return evalRule(rule.otherwise, ctx);
    }
    case 'review':
      return leaf('needs_review', [rule.reason]);
    case 'at_screening':
      return { ...empty(), state: 'unknown', reasons: [rule.reason] };
    case 'unparseable':
      return leaf('needs_review', [`Relay cannot read this requirement reliably: ${rule.reason}`]);
    default:
      throw new Error(`unknown rule op ${(rule as { op?: string }).op}`);
  }
}

function uniqBy<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** A coordinator verification counts only while doc, value and quote span are unchanged. */
export function isVerified(f: Fact, verifications: Verification[] = []): boolean {
  return verifications.some(
    (v) => v.factId === f.id && v.docId === f.source.docId && v.value === f.value && v.start === f.source.start && v.end === f.source.end,
  );
}

export function evaluateCriterion(c: Criterion, ctx: EvalContext): CriterionResult {
  if (c.atScreening || c.logic.op === 'at_screening') {
    const reason = c.logic.op === 'at_screening' ? c.logic.reason : 'Checked by the study team at screening';
    return { criterionId: c.id, state: 'unknown', reason, evidence: [], atScreening: true, unknownReasons: ['at_screening'] };
  }
  let p: Partial;
  try {
    p = evalRule(c.logic, ctx);
  } catch (e) {
    p = leaf('needs_review', [`Relay cannot evaluate this rule (${(e as Error).message}); a clinician decides`]);
  }
  const evidence = uniqBy(p.evidence, (f) => f.id);
  const result: CriterionResult = {
    criterionId: c.id,
    state: p.state,
    reason: uniqBy(p.reasons, (r) => r).join('; '),
    evidence,
  };
  if (p.state === 'unknown') {
    const reasons: UnknownReason[] = [];
    const missing = [...new Set(p.missing)];
    if (missing.length) {
      result.missing = missing;
      reasons.push('missing');
    }
    const notTested = [...new Set(p.notTested)];
    if (notTested.length) {
      result.notTested = notTested;
      reasons.push('not_tested');
    }
    const stale = uniqBy(p.stale, (s) => s.key);
    if (stale.length) {
      result.stale = stale[0];
      result.staleAll = stale;
      reasons.push('stale');
    }
    if (reasons.length) result.unknownReasons = reasons;
  }
  if (p.state === 'supported') {
    result.pendingVerification = evidence.some((f) => !isVerified(f, ctx.verifications));
  }
  return result;
}

/** Fact keys a rule can read. */
export function ruleKeys(rule: Rule): FactKey[] {
  const out = new Set<FactKey>();
  const walk = (r: Rule) => {
    switch (r.op) {
      case 'and':
      case 'or':
        r.args.forEach(walk);
        break;
      case 'not':
        walk(r.arg);
        break;
      case 'cmp':
      case 'is':
      case 'in':
      case 'present':
      case 'not_within':
        out.add(r.key);
        break;
      case 'current':
        r.keys.forEach((k) => out.add(k));
        break;
      case 'table':
        r.genes.forEach((k) => out.add(k));
        break;
      case 'any_positive':
        r.checks.forEach((c) => out.add(c.key));
        walk(r.otherwise);
        break;
      default:
        break;
    }
  };
  walk(rule);
  return [...out];
}
