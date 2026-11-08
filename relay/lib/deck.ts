// View-model helpers for the two decks. Pure functions over engine state: no React, no browser APIs.
// Everything shown on a card is derived here, so the deck ordering, the evidence strip and the
// travel maths can be unit-tested.

import { siteOpen } from '@/src/engine/alternatives';
import { milesFromCity } from '@/src/engine/geo';
import { FACT_LABEL, formatValue } from '@/src/engine/labels';
import type { Assessment, Criterion, CriterionResult, FactKey, RelayState, Site, Trial } from '@/src/engine/types';
import { MOLECULAR_GENE_KEYS } from '@/src/engine/types';
import type { Decisions, StaffDecision } from './actions';

// ---------------- criterion states → evidence strip ----------------

/** ok = supported, review = clinician, screen = study team at screening, open = missing/outdated, conflict. */
export type Seg = 'ok' | 'review' | 'screen' | 'open' | 'conflict';
/** Strip order: supported fills from the left, so new evidence reads as the strip filling left to right. */
export const SEG_ORDER: Seg[] = ['ok', 'review', 'screen', 'open', 'conflict'];

export function segOf(r: CriterionResult): Seg {
  if (r.atScreening) return 'screen';
  switch (r.state) {
    case 'supported':
      return 'ok';
    case 'conflicting':
      return 'conflict';
    case 'needs_review':
      return 'review';
    default:
      return 'open';
  }
}

export function segments(a?: Assessment): Seg[] {
  if (!a) return [];
  return a.results.map(segOf).sort((x, y) => SEG_ORDER.indexOf(x) - SEG_ORDER.indexOf(y));
}

export function segCounts(a?: Assessment): Record<Seg, number> {
  const c: Record<Seg, number> = { ok: 0, review: 0, screen: 0, open: 0, conflict: 0 };
  for (const s of segments(a)) c[s] += 1;
  return c;
}

export function segAria(a?: Assessment): string {
  const c = segCounts(a);
  const n = a?.results.length ?? 0;
  const parts = [`${c.ok} of ${n} requirements supported`];
  if (c.conflict) parts.push(`${c.conflict} not met`);
  if (c.open) parts.push(`${c.open} open`);
  if (c.review) parts.push(`${c.review} for clinical review`);
  if (c.screen) parts.push(`${c.screen} checked at screening`);
  return parts.join(', ');
}

// ---------------- trial status ----------------

export type DeckStatus = 'ready' | 'review' | 'evidence' | 'no';
export const STATUS_SHORT: Record<DeckStatus, string> = {
  ready: 'Ready for prescreening',
  review: 'Needs clinical review',
  evidence: 'Needs evidence',
  no: 'Not a match',
};
export const STATUS_RANK: Record<DeckStatus, number> = { ready: 0, review: 1, evidence: 2, no: 3 };

export function deckStatus(a?: Assessment): DeckStatus {
  switch (a?.status) {
    case 'ready':
      return 'ready';
    case 'needs_review':
      return 'review';
    case 'not_match':
      return 'no';
    default:
      return 'evidence';
  }
}

// ---------------- short wording ----------------

/** Drop parentheticals that follow a space ("(Relay dated table)"), keep "anti-PD-(L)1". */
export function stripParens(s: string): string {
  return s.replace(/\s+\([^()]*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-09-20' → '20 Sep'. */
export function shortDate(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso ?? '';
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

const isLab = (k: FactKey) => k.startsWith('lab_') || k === 'urine_protein';

function factLabel(k: FactKey): string {
  return stripParens(FACT_LABEL[k] ?? k);
}

/** One line for an open, conflicting or review row: what is wrong or missing, in coordinator words. */
export function shortText(r: CriterionResult, c?: Criterion): string {
  const plain = stripParens(c?.plain ?? r.criterionId);
  if (r.state === 'unknown' && !r.atScreening) {
    const stale = r.staleAll?.[0] ?? r.stale;
    if (stale && !(r.missing?.length ?? 0)) {
      const what = isLab(stale.key) ? 'Bloods' : factLabel(stale.key);
      const verb = isLab(stale.key) ? 'are' : 'is';
      const rule = stale.windowSource === 'relay_policy' ? `the ${stale.windowDays}-day policy` : `the ${stale.windowDays}-day window`;
      return `${what} from ${shortDate(stale.observedOn)} ${verb} past ${rule}`;
    }
    const keys = [...(r.missing ?? []), ...(r.notTested ?? [])];
    if (stale && keys.length && keys.every(isLab)) return `Bloods from ${shortDate(stale.observedOn)} are outdated or incomplete`;
    if (keys.length) {
      const verb = (r.notTested?.length ?? 0) === keys.length ? 'not tested yet' : 'not documented yet';
      if (keys.every(isLab)) return `Blood results ${verb}`;
      if (keys.length <= 2) return `${keys.map(factLabel).join(' and ')} ${verb}`;
      return `${factLabel(keys[0])} and ${keys.length - 1} more results ${verb}`;
    }
    return plain;
  }
  if (r.state === 'conflicting') {
    const f = r.evidence[0];
    return f ? `${plain} · ${factLabel(f.key)} ${formatValue(f.value, f.unit)}` : plain;
  }
  if (r.state === 'needs_review') return `Review: ${plain}`;
  if (r.atScreening) return `At screening: ${plain}`;
  return plain;
}

export interface OpenItem {
  seg: Seg;
  text: string;
  criterionId: string;
}

/** What is open on a card, conflicts first, then missing/outdated, then clinical review. */
export function openItems(a: Assessment | undefined, trial: Trial, max = 3): OpenItem[] {
  if (!a) return [];
  const byId = new Map(trial.criteria.map((c) => [c.id, c]));
  const rank: Record<Seg, number> = { conflict: 0, open: 1, review: 2, screen: 3, ok: 4 };
  const seen = new Set<string>();
  return a.results
    .map((r) => ({ r, seg: segOf(r) }))
    .filter((x) => x.seg === 'conflict' || x.seg === 'open' || x.seg === 'review')
    .sort((x, y) => rank[x.seg] - rank[y.seg])
    .map((x) => ({ seg: x.seg, text: shortText(x.r, byId.get(x.r.criterionId)), criterionId: x.r.criterionId }))
    .filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true)))
    .slice(0, max);
}

// ---------------- sites and travel ----------------

export type SiteKey = 'royal-marsden' | 'royal-free' | 'barts' | 'guys' | 'uclh';
export const SITE_KEYS: SiteKey[] = ['royal-marsden', 'royal-free', 'barts', 'guys', 'uclh'];
const SITE_NAME: Record<SiteKey, string> = {
  'royal-marsden': 'Royal Marsden',
  'royal-free': 'Royal Free',
  barts: 'Barts',
  guys: "Guy's",
  uclh: 'UCLH',
};

export function siteKeyFor(facility: string): SiteKey | null {
  const f = facility.toLowerCase();
  if (f.includes('marsden')) return 'royal-marsden';
  if (f.includes('royal free')) return 'royal-free';
  if (f.includes('barts')) return 'barts';
  if (/guy['’]?s/.test(f)) return 'guys';
  if (f.includes('university college') || f.includes('uclh')) return 'uclh';
  return null;
}

/** Short display name: "Royal Free Hospital ( Site 2601)" → "Royal Free". */
export function siteName(facility: string): string {
  const k = siteKeyFor(facility);
  if (k) return SITE_NAME[k];
  return facility
    .replace(/\s*\(\s*Site\s*\d+\s*\)/i, '')
    .replace(/\s+NHS (Foundation )?Trust.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export interface SiteChoice {
  site: Site;
  miles: number | null;
  withinTravel: boolean;
  key: SiteKey | null;
  name: string;
}

/** Nearest open (simulated) site from the patient's home city; null when no site is open. */
export function nearestOpenSite(state: RelayState, trial: Trial, preferSiteId?: string): SiteChoice | null {
  const limit = state.preferences.travelLimitMiles;
  const open = trial.sites
    .filter((s) => siteOpen(state, trial, s))
    .map((s) => ({ s, d: milesFromCity(state.preferences.homeCity, s) }))
    .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
  const pick = (preferSiteId && open.find((x) => x.s.id === preferSiteId)) || open[0];
  if (!pick) return null;
  return { site: pick.s, miles: pick.d, withinTravel: pick.d !== null && pick.d <= limit, key: siteKeyFor(pick.s.facility), name: siteName(pick.s.facility) };
}

/**
 * Approximate door-to-door minutes from a straight-line distance between approximate city
 * centroids: 25 min to get going and across town, 2 min a mile for the first 20 miles, then
 * 1.1 min a mile. Rounded to 5 minutes. Always labelled "approx." in the UI.
 */
export function travelMinutes(miles: number): number {
  const m = Math.max(0, miles);
  const raw = 25 + Math.min(m, 20) * 2 + Math.max(0, m - 20) * 1.1;
  return Math.round(raw / 5) * 5;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${r}` : `${h} h`;
}

export function distanceText(miles: number | null, city: string): string {
  if (miles === null) return city;
  if (miles < 1) return `in ${city}`;
  return `${Math.round(miles)} mi`;
}

// ---------------- patient line ----------------

export function patientLine(state: RelayState): string {
  const get = (k: FactKey) => state.facts.filter((f) => f.key === k).at(-1)?.value;
  const parts: string[] = [state.patientId];
  const age = get('age');
  if (age !== undefined) parts.push(String(age));
  const hist = get('histology');
  const stage = get('stage');
  const h = hist === 'nonsquamous_adenocarcinoma' ? 'Adenocarcinoma' : hist === 'squamous' ? 'Squamous' : hist ? formatValue(hist) : '';
  const line = [h, stage ? String(stage) : ''].filter(Boolean).join(' ');
  if (line) parts.push(line);
  return parts.join(' · ');
}

// ---------------- ordering ----------------

/** Pinned first; "Later" cards at the back in the order they were moved; else by readiness, then portfolio order. */
export function staffOrder(ids: string[], statusOf: (id: string) => DeckStatus, later: string[], indexOf: (id: string) => number, pinned?: string): string[] {
  return ids.slice().sort((a, b) => {
    if (a === pinned) return -1;
    if (b === pinned) return 1;
    const la = later.indexOf(a);
    const lb = later.indexOf(b);
    if ((la >= 0) !== (lb >= 0)) return la >= 0 ? 1 : -1;
    if (la >= 0 && lb >= 0 && la !== lb) return la - lb;
    return STATUS_RANK[statusOf(a)] - STATUS_RANK[statusOf(b)] || indexOf(a) - indexOf(b);
  });
}

/** A coordinator "Not suitable" that still applies: any reason except a cohort-full whose site has since been replaced. */
export function staffClosed(d: StaffDecision | undefined, state: RelayState, trial: Trial): boolean {
  if (!d || d.type !== 'close') return false;
  if (d.reason !== 'Cohort full (simulated)') return true;
  const next = nearestOpenSite(state, trial);
  return !next || next.site.id === d.siteId;
}

/** Trials on the coordinator's deck: every study with a UK site in the registry, minus decided ones. */
export function staffPending(trials: Trial[], state: RelayState, dec: Decisions): Trial[] {
  return trials.filter((t) => {
    if (!t.sites.length) return false;
    const d = dec.staff[t.id];
    if (!d || d.type === 'later') return true;
    if (d.type === 'invite') return false;
    return !staffClosed(d, state, t);
  });
}

export interface PatientFilter {
  showFar: boolean;
}

/** Studies a patient may see: not a documented non-match, not set aside by them or closed by the team. */
export function patientCandidates(trials: Trial[], state: RelayState, dec: Decisions): { near: Trial[]; far: Trial[] } {
  const near: Trial[] = [];
  const far: Trial[] = [];
  for (const t of trials) {
    const a = state.assessments[t.id];
    if (!a || a.status === 'not_match') continue;
    const p = dec.patient[t.id];
    if (p && p.kind !== 'saved') continue;
    if (staffClosed(dec.staff[t.id], state, t)) continue;
    const site = nearestOpenSite(state, t);
    (site?.withinTravel ? near : far).push(t);
  }
  return { near, far };
}

export function patientOrder(ids: string[], saved: string[], invited: (id: string) => boolean, indexOf: (id: string) => number): string[] {
  return ids.slice().sort((a, b) => {
    const sa = saved.indexOf(a);
    const sb = saved.indexOf(b);
    if ((sa >= 0) !== (sb >= 0)) return sa >= 0 ? 1 : -1;
    if (sa >= 0 && sb >= 0 && sa !== sb) return sa - sb;
    return Number(invited(b)) - Number(invited(a)) || indexOf(a) - indexOf(b);
  });
}

// ---------------- patient wording ----------------

const MOL = new Set<FactKey>([...MOLECULAR_GENE_KEYS, 'her2_overexpression', 'molecular_lab_accredited']);
const IMAGING = new Set<FactKey>(['brain_mets', 'cns_symptomatic', 'cns_untreated', 'cns_progressing', 'leptomeningeal', 'measurable_disease', 'measurable_unirradiated']);

/** "What still needs checking", in plain words, de-duplicated. */
export function patientChecks(a: Assessment | undefined, max = 2): { seg: Seg; text: string }[] {
  if (!a) return [];
  const out: { seg: Seg; text: string }[] = [];
  const push = (seg: Seg, text: string) => {
    if (!out.some((x) => x.text === text)) out.push({ seg, text });
  };
  for (const r of a.results) {
    if (r.state !== 'unknown' || r.atScreening) continue;
    const keys = [...(r.missing ?? []), ...(r.notTested ?? []), ...(r.staleAll ?? []).map((s) => s.key), ...(r.stale ? [r.stale.key] : [])];
    if (keys.includes('kras')) push('open', 'A gene test result (KRAS)');
    else if (keys.includes('pdl1_tps')) push('open', 'A tumour marker result (PD-L1)');
    else if (keys.some((k) => MOL.has(k))) push('open', 'Other gene results');
    else if (keys.some(isLab)) push('open', 'Recent blood tests');
    else if (keys.some((k) => IMAGING.has(k))) push('open', 'A recent scan');
    else push('open', 'Some details from your records');
  }
  if (a.results.some((r) => r.state === 'needs_review' && !r.atScreening)) push('review', 'A doctor needs to look at a few points');
  if (a.results.some((r) => r.atScreening)) push('screen', 'Final checks by the study team');
  return out.slice(0, max);
}

/** "Why it might suit you": supported facts in plain words, with the document they came from. */
export function patientWhy(state: RelayState, a: Assessment | undefined, max = 4): { text: string; doc: string }[] {
  if (!a) return [];
  const out: { text: string; doc: string }[] = [];
  const docTitle = (id: string) => state.documents.find((d) => d.id === id)?.title ?? id;
  const push = (text: string, docId: string) => {
    if (!out.some((x) => x.text === text)) out.push({ text, doc: docTitle(docId) });
  };
  for (const r of a.results) {
    if (r.state !== 'supported') continue;
    for (const f of r.evidence) {
      if (f.key === 'histology' || f.key === 'stage') push('Your type and stage of lung cancer', f.source.docId);
      else if (f.key === 'kras' && f.value !== 'not_detected') push(`Your KRAS ${String(f.value)} result`, f.source.docId);
      else if (f.key === 'pdl1_tps') push('Your PD-L1 result', f.source.docId);
      else if ((f.key === 'prior_systemic_advanced' && f.value === false) || (f.key === 'prior_lines_advanced' && f.value === 0)) push('No treatment yet for advanced disease', f.source.docId);
      else if (f.key === 'ecog') push('How active you are day to day', f.source.docId);
    }
  }
  return out.slice(0, max);
}
