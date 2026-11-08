// Builds data/trials/encoded/<NCT>.json from the raw ClinicalTrials.gov API v2 snapshot plus the
// hand-written defs in scripts/trial-criteria.ts. Fails loudly if any criterion text is not verbatim.
// Usage: npm run encode

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cityCoords } from '../src/engine/geo';
import { ruleKeys } from '../src/engine/rules';
import type { Criterion, Rule, Site, Trial } from '../src/engine/types';
import { TRIAL_SPECS, type TrialSpec } from './trial-criteria';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const RAW = path.join(ROOT, 'data', 'trials', 'raw');
const OUT = path.join(ROOT, 'data', 'trials', 'encoded');

interface Item {
  kind: 'bullet' | 'sub' | 'line';
  content: string;
  section: string;
  parent?: number; // index of parent bullet for sub-bullets
  children: number[];
}

function parseEligibility(text: string): Item[] {
  const items: Item[] = [];
  let section = 'Inclusion Criteria';
  let lastTop = -1;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    const indent = raw.length - raw.trimStart().length;
    const t = raw.trim();
    const bullet = /^\*\s+/.exec(t) ?? /^\d+\.\s+/.exec(t);
    if (bullet) {
      const content = t.slice(bullet[0].length);
      if (indent >= 2 && lastTop >= 0) {
        items.push({ kind: 'sub', content, section, parent: lastTop, children: [] });
        items[lastTop].children.push(items.length - 1);
      } else {
        items.push({ kind: 'bullet', content, section, children: [] });
        lastTop = items.length - 1;
      }
    } else {
      if (/criteria/i.test(t) || /:\s*$/.test(t)) section = t.replace(/:\s*$/, '');
      items.push({ kind: 'line', content: t, section, children: [] });
      lastTop = -1;
    }
  }
  return items;
}

function kindFromSection(section: string): 'inclusion' | 'exclusion' {
  return /exclusion/i.test(section) ? 'exclusion' : 'inclusion';
}

function isCohortSection(section: string): boolean {
  return /cohort|phase ia/i.test(section);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function replacePlaceholders(rule: Rule, pacc: string[]): Rule {
  if (rule.op === 'in' && rule.values.includes('@PACC_LIST')) return { ...rule, values: pacc };
  if (rule.op === 'and' || rule.op === 'or') return { ...rule, args: rule.args.map((r) => replacePlaceholders(r, pacc)) };
  if (rule.op === 'not') return { ...rule, arg: replacePlaceholders(rule.arg, pacc) };
  return rule;
}

function encode(spec: TrialSpec, snapshotDate: string): Trial {
  const doc = JSON.parse(readFileSync(path.join(RAW, `${spec.nct}.json`), 'utf8'));
  const ps = doc.protocolSection;
  const elig: string = ps.eligibilityModule.eligibilityCriteria;
  const officialTitle: string = ps.identificationModule.officialTitle;
  const items = parseEligibility(elig);

  const findOne = (needle: string): number => {
    const hits = items.map((it, i) => (it.content.includes(needle) ? i : -1)).filter((i) => i >= 0);
    if (hits.length !== 1) throw new Error(`${spec.nct}: "${needle}" matched ${hits.length} registry lines`);
    return hits[0];
  };

  const used = new Set<number>();

  // PACC list (ALPACCA) copied from the registry line.
  let pacc: string[] = [];
  if (spec.nct === 'NCT07185997') {
    const line = items[findOne('E709X, E709A')].content;
    pacc = line
      .replace(/\\_/g, '_')
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  const criteria: Criterion[] = [];
  const push = (c: Omit<Criterion, 'needsFacts' | 'checkable'>) => {
    if (criteria.some((x) => x.id === c.id)) throw new Error(`duplicate criterion id ${c.id}`);
    const keys = ruleKeys(c.logic);
    criteria.push({ ...c, needsFacts: keys, checkable: keys.length > 0 && !c.atScreening });
  };

  // Age from structured fields.
  if (spec.structuredAge) {
    const min: string | undefined = ps.eligibilityModule.minimumAge;
    const max: string | undefined = ps.eligibilityModule.maximumAge;
    const text = [min ? `minimumAge: ${min}` : '', max ? `maximumAge: ${max}` : ''].filter(Boolean).join('; ');
    const minN = min ? parseInt(min, 10) : undefined;
    const maxN = max ? parseInt(max, 10) : undefined;
    const args: Rule[] = [];
    if (minN !== undefined) args.push({ op: 'cmp', key: 'age', cmp: '>=', value: minN, unit: 'years' });
    if (maxN !== undefined) args.push({ op: 'cmp', key: 'age', cmp: '<=', value: maxN, unit: 'years' });
    push({
      id: `${spec.prefix}-age`,
      trialId: spec.nct,
      kind: 'inclusion',
      text,
      plain: maxN ? `Aged ${minN}–${maxN}` : `Aged ${minN} or over`,
      logic: args.length === 1 ? args[0] : { op: 'and', args },
      mandatory: true,
      derivedFrom: 'structured_fields',
      section: 'eligibilityModule',
    });
  }

  for (const td of spec.titleDefs ?? []) {
    if (!officialTitle.includes(td.text)) throw new Error(`${spec.nct}: title text not verbatim: ${td.text}`);
    push({
      id: td.id,
      trialId: spec.nct,
      kind: td.kind,
      text: td.text,
      plain: td.plain,
      logic: td.logic,
      mandatory: true,
      derivedFrom: 'title',
      section: 'officialTitle',
    });
  }

  // Every registry bullet must be covered by a def (as its own row, or folded into a row's detail).
  const defsByItem = new Map<number, typeof spec.defs>();
  for (const d of spec.defs) {
    const i = findOne(d.find);
    defsByItem.set(i, [...(defsByItem.get(i) ?? []), d]);
  }

  items.forEach((it, i) => {
    const defs = defsByItem.get(i);
    if (!defs) return;
    used.add(i);
    for (const d of defs) {
      const detail: string[] = [];
      for (const f of d.detailFind ?? []) {
        const j = findOne(f);
        detail.push(items[j].content);
        used.add(j);
      }
      if (d.sectionDetail) {
        items.forEach((x, j) => {
          if (j !== i && x.kind !== 'line' && x.section === it.content.replace(/:\s*$/, '')) {
            detail.push(x.content);
            used.add(j);
          }
        });
        if (!detail.length) throw new Error(`${d.id}: sectionDetail found no bullets`);
      }
      for (const c of it.children) {
        if (!defsByItem.has(c)) {
          detail.push(items[c].content);
          used.add(c);
        }
      }
      if (!elig.includes(it.content)) throw new Error(`not verbatim: ${it.content}`);
      push({
        id: d.id,
        trialId: spec.nct,
        kind: d.kind ?? kindFromSection(it.section),
        text: it.content,
        plain: d.plain,
        logic: replacePlaceholders(d.logic, pacc),
        mandatory: d.mandatory ?? !isCohortSection(it.section),
        derivedFrom: 'criteria',
        section: it.section,
        ...(d.atScreening ? { atScreening: true } : {}),
        ...(d.completeness ? { completeness: true } : {}),
        ...(detail.length ? { detail } : {}),
      } as Criterion);
    }
  });

  const uncovered = items.filter((it, i) => it.kind !== 'line' && !used.has(i)).map((it) => it.content.slice(0, 80));
  if (uncovered.length) throw new Error(`${spec.nct}: registry lines with no encoding:\n  ${uncovered.join('\n  ')}`);

  // Sites: UK only, coordinates from the approximate city table.
  const locs: any[] = ps.contactsLocationsModule?.locations ?? [];
  const sites: Site[] = locs
    .filter((l) => l.country === 'United Kingdom')
    .map((l) => {
      const city: string = l.city;
      const c = cityCoords(city);
      if (!c) throw new Error(`${spec.nct}: add ${city} to UK_CITY_TABLE`);
      const open = l.status === 'RECRUITING';
      return {
        id: `${spec.prefix}-${slug(l.facility)}`,
        facility: l.facility,
        city,
        country: 'United Kingdom',
        recruitmentStatus: l.status ?? 'UNKNOWN',
        lat: c.lat,
        lon: c.lon,
        geoSource: 'relay_city_table_approx' as const,
        availability: {
          open,
          simulated: true as const,
          basis: `SIMULATED: starts from registry site status ${l.status ?? 'UNKNOWN'} (snapshot ${snapshotDate}); real cohort capacity is unknown`,
        },
      };
    });
  const siteIds = new Set<string>();
  for (const s of sites) {
    if (siteIds.has(s.id)) s.id = `${s.id}-${slug(s.city)}`;
    siteIds.add(s.id);
  }

  const aim = ps.armsInterventionsModule ?? {};
  return {
    id: spec.nct,
    nct: spec.nct,
    acronym: spec.acronym,
    briefTitle: ps.identificationModule.briefTitle,
    officialTitle,
    phase: ps.designModule?.phases ?? [],
    sponsor: ps.sponsorCollaboratorsModule.leadSponsor.name,
    status: ps.statusModule.overallStatus,
    conditions: ps.conditionsModule?.conditions ?? [],
    minimumAge: ps.eligibilityModule.minimumAge,
    maximumAge: ps.eligibilityModule.maximumAge,
    briefSummary: ps.descriptionModule?.briefSummary ?? '',
    arms: (aim.armGroups ?? []).map((a: any) => ({
      label: a.label,
      type: a.type,
      description: a.description,
      interventionNames: a.interventionNames ?? [],
    })),
    interventions: (aim.interventions ?? []).map((x: any) => ({ type: x.type, name: x.name })),
    sites,
    snapshotDate,
    source: {
      url: `https://clinicaltrials.gov/study/${spec.nct}`,
      api: `https://clinicaltrials.gov/api/v2/studies/${spec.nct}`,
      licence:
        'ClinicalTrials.gov record (U.S. National Library of Medicine). Public registry content; see ClinicalTrials.gov Terms and Conditions. Cite the source and snapshot date.',
    },
    criteria,
    encodingNotes: [`Acronym source: ${spec.acronymSource}.`, ...spec.notes],
  };
}

function main() {
  const snapshotDate = readFileSync(path.join(RAW, 'SNAPSHOT_DATE'), 'utf8').trim().slice(0, 10);
  mkdirSync(OUT, { recursive: true });
  for (const spec of TRIAL_SPECS) {
    const t = encode(spec, snapshotDate);
    writeFileSync(path.join(OUT, `${spec.nct}.json`), JSON.stringify(t, null, 2) + '\n', 'utf8');
    const checkable = t.criteria.filter((c) => c.checkable).length;
    console.log(`${spec.nct} ${t.acronym.padEnd(16)} criteria ${String(t.criteria.length).padStart(3)} (checkable ${checkable}) UK sites ${t.sites.length}`);
  }
}

main();
