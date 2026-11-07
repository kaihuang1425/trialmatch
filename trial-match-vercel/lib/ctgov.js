// ClinicalTrials.gov API v2 (public, no key). Used by Trial Scout and the MedGemma pre-check.
import { HttpError, fetchJson } from './http.js';

const BASE = 'https://clinicaltrials.gov/api/v2/studies';
const LIST_FIELDS = ['NCTId', 'BriefTitle', 'Phase', 'OverallStatus', 'LeadSponsorName', 'InterventionName', 'InterventionType',
  'LocationFacility', 'LocationCity', 'LocationCountry', 'LocationStatus', 'BriefSummary', 'StartDate', 'EnrollmentCount'];

function shape(study, country) {
  const p = study.protocolSection || {};
  const id = p.identificationModule || {};
  const locs = ((p.contactsLocationsModule || {}).locations || [])
    .filter((l) => !country || l.country === country)
    .filter((l) => !l.status || l.status === 'RECRUITING' || l.status === 'NOT_YET_RECRUITING');
  return {
    nct: id.nctId,
    title: id.briefTitle || id.officialTitle || id.nctId,
    phase: ((p.designModule || {}).phases || []).join(', ').replace(/PHASE/g, 'Phase ').replace(/_/g, ' '),
    status: (p.statusModule || {}).overallStatus || null,
    sponsor: ((p.sponsorCollaboratorsModule || {}).leadSponsor || {}).name || null,
    interventions: ((p.armsInterventionsModule || {}).interventions || []).slice(0, 8).map((i) => ({ type: i.type, name: i.name })),
    sites: locs.slice(0, 30).map((l) => ({ facility: l.facility, city: l.city, status: l.status || null })),
    siteCount: locs.length,
    summary: ((p.descriptionModule || {}).briefSummary || '').slice(0, 700),
    url: 'https://clinicaltrials.gov/study/' + id.nctId
  };
}

export async function searchTrials({ cond = 'non-small cell lung cancer', country = 'United Kingdom', phase = 'PHASE3', pageSize = 50 } = {}) {
  const qs = new URLSearchParams({
    'query.cond': cond,
    'query.locn': country,
    'filter.overallStatus': 'RECRUITING',
    'filter.advanced': 'AREA[Phase]' + phase,
    pageSize: String(Math.min(100, pageSize)),
    countTotal: 'true',
    fields: LIST_FIELDS.join(',')
  });
  const out = await fetchJson(BASE + '?' + qs, { headers: { Accept: 'application/json' } }, 20000);
  const trials = (out.studies || []).map((s) => shape(s, country)).filter((t) => t.nct && t.siteCount > 0);
  return { total: out.totalCount || trials.length, trials, query: { cond, country, phase, status: 'RECRUITING' } };
}

export async function getTrial(nct) {
  if (!/^NCT\d{8}$/.test(nct || '')) throw new HttpError(400, 'bad_nct', 'Give a ClinicalTrials.gov ID like NCT01234567.');
  const out = await fetchJson(BASE + '/' + nct + '?format=json', { headers: { Accept: 'application/json' } }, 20000);
  const p = out.protocolSection || {};
  const el = p.eligibilityModule || {};
  return {
    ...shape(out, 'United Kingdom'),
    criteria: (el.eligibilityCriteria || '').slice(0, 12000),
    minimumAge: el.minimumAge || null,
    maximumAge: el.maximumAge || null,
    sex: el.sex || null
  };
}
