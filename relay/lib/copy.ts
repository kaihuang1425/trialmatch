// Presentation copy for the two decks: short drug lines (staff) and plain-language titles (patient).
// Written by hand from the registry snapshot; where the registry does not say how a drug is given,
// the line says what is generally known about the medicine (tablets, infusion) and nothing more.

export type GivenIcon = 'tablet' | 'drip' | 'needle' | 'mixed';

export interface TrialCopy {
  /** Staff card: drug(s) and setting. */
  drug: string;
  /** Patient card: plain-language title. */
  plainTitle: string;
  /** Patient sheet: what the study is testing, in one sentence. */
  what: string;
  /** Patient card: how the treatment is given. */
  given: string;
  givenIcon: GivenIcon;
}

export const TRIAL_COPY: Record<string, TrialCopy> = {
  NCT05920356: {
    drug: 'Sotorasib + platinum doublet, first line',
    plainTitle: 'Sotorasib with chemotherapy, as a first treatment',
    what: 'Whether sotorasib tablets with chemotherapy work better than immunotherapy with chemotherapy for KRAS G12C lung cancer.',
    given: 'Tablets + infusion',
    givenIcon: 'mixed',
  },
  NCT07190248: {
    drug: 'Calderasib + pembrolizumab, first line',
    plainTitle: 'Calderasib with immunotherapy, as a first treatment',
    what: 'Whether calderasib added to immunotherapy helps people with KRAS G12C lung cancer.',
    given: 'Tablets + injection',
    givenIcon: 'mixed',
  },
  NCT06793215: {
    drug: 'Divarasib + pembrolizumab, first line',
    plainTitle: 'Divarasib with immunotherapy, as a first treatment',
    what: 'Whether divarasib with immunotherapy works better than immunotherapy with chemotherapy for KRAS G12C lung cancer.',
    given: 'Tablets + infusion',
    givenIcon: 'mixed',
  },
  NCT06881784: {
    drug: 'Daraxonrasib vs docetaxel, previously treated',
    plainTitle: 'Daraxonrasib after earlier treatment',
    what: 'Whether daraxonrasib works better than docetaxel chemotherapy for RAS-mutant lung cancer that has been treated before.',
    given: 'Tablets or infusion',
    givenIcon: 'mixed',
  },
  NCT07185997: {
    drug: 'Firmonertinib, EGFR PACC mutations',
    plainTitle: 'Firmonertinib for uncommon EGFR changes',
    what: 'Whether firmonertinib works better than standard EGFR tablets for uncommon EGFR changes.',
    given: 'Tablets',
    givenIcon: 'tablet',
  },
  NCT06667076: {
    drug: 'Amivantamab combinations, common EGFR',
    plainTitle: 'Amivantamab for common EGFR changes',
    what: 'How well amivantamab works with lazertinib tablets, or with chemotherapy, for common EGFR changes.',
    given: 'Tablets or infusion',
    givenIcon: 'mixed',
  },
  NCT06765109: {
    drug: 'Neladalkib vs alectinib, ALK-positive',
    plainTitle: 'Neladalkib for ALK-positive lung cancer',
    what: 'Whether neladalkib works better than alectinib for ALK-positive lung cancer.',
    given: 'Tablets',
    givenIcon: 'tablet',
  },
  NCT04886804: {
    drug: 'Zongertinib, HER2 aberrations',
    plainTitle: 'Zongertinib for HER2 gene changes',
    what: 'Which dose of zongertinib to use, and how well it works, for cancers with HER2 gene changes.',
    given: 'Tablets',
    givenIcon: 'tablet',
  },
  NCT05642572: {
    drug: 'Capmatinib + osimertinib ± ramucirumab, EGFR + MET',
    plainTitle: 'Capmatinib and osimertinib for EGFR and MET changes',
    what: 'Whether adding ramucirumab to capmatinib and osimertinib helps lung cancer with EGFR and MET changes.',
    given: 'Tablets ± infusion',
    givenIcon: 'mixed',
  },
};

export function copyFor(trialId: string, fallbackTitle: string): TrialCopy {
  return (
    TRIAL_COPY[trialId] ?? {
      drug: fallbackTitle,
      plainTitle: fallbackTitle,
      what: fallbackTitle,
      given: 'Ask the team',
      givenIcon: 'tablet',
    }
  );
}

/** 'PHASE3' → 'Phase 3'; ['PHASE1','PHASE2'] → 'Phase 1/2'. */
export function phaseLabel(phase: string[]): string {
  const nums = phase.map((p) => p.replace(/^PHASE/i, '')).filter(Boolean);
  return nums.length ? `Phase ${nums.join('/')}` : 'Phase not listed';
}
