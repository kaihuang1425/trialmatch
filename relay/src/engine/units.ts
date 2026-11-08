// Unit handling for numeric thresholds. Unknown conversions return null, and the rule becomes
// needs_review instead of comparing numbers in different units.

export function normalizeUnit(u: string | undefined): string {
  if (!u) return '';
  return u
    .trim()
    .replace(/\s+/g, '')
    .replace(/[μµ]/g, 'u')
    .replace(/×/g, 'x')
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\\\^/g, '^')
    .replace(/^x(?=10\^)/, '')
    .toLowerCase();
}

type Conv = (v: number) => number;

// target unit -> source unit -> conversion into target
const TABLE: Record<string, Record<string, Conv>> = {
  'g/dl': { 'g/l': (v) => v / 10, 'mmol/l': (v) => v * 1.611 },
  '10^9/l': { '10^3/ul': (v) => v, '10^3/mm3': (v) => v, '/mm3': (v) => v / 1000, '/ul': (v) => v / 1000 },
  '10^3/ul': { '10^9/l': (v) => v, '10^3/mm3': (v) => v, '/mm3': (v) => v / 1000, '/ul': (v) => v / 1000 },
  // CKD-EPI eGFR is reported per 1.73 m2; registry texts quoting "mL/min ... CKD-EPI" mean the same quantity.
  'ml/min': { 'ml/min/1.73m2': (v) => v },
  'ml/min/1.73m2': { 'ml/min': (v) => v },
  'umol/l': {},
  'u/l': { 'iu/l': (v) => v },
  '%': {},
  years: { y: (v) => v, yr: (v) => v },
};

/** Convert `value` from `from` into `to`. Returns null when Relay does not know the conversion. */
export function convert(value: number, from: string | undefined, to: string | undefined): number | null {
  const f = normalizeUnit(from);
  const t = normalizeUnit(to);
  if (!t || !f || f === t) return value;
  const row = TABLE[t];
  const fn = row?.[f];
  return fn ? fn(value) : null;
}
