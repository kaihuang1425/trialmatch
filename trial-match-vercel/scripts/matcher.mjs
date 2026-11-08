// Reads the deployed matcher out of public/app/index.html, so the eval (scripts/eval.mjs) and the tests check the
// code the demo app runs. The app keeps its rules and trials inline; this slice of it has no DOM code: the rule
// helpers, the trials and evaluate().
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app', 'index.html');
const START = "var OK = 'met'";
const END = '/* ================= helpers ================= */';

export function loadMatcher() {
  const html = readFileSync(APP, 'utf8');
  const a = html.indexOf(START), b = html.indexOf(END, a);
  if (a < 0 || b < 0) throw new Error(`Couldn't find the matcher in public/app/index.html (looked for "${START}" up to "${END}"). Update scripts/matcher.mjs.`);
  const code = html.slice(a, b);
  const ctx = vm.createContext({});
  vm.runInContext(code, ctx, { filename: 'public/app/index.html' });
  if (!ctx.TRIALS || typeof ctx.evaluate !== 'function') throw new Error('The matcher slice no longer defines TRIALS and evaluate().');
  return { trials: ctx.TRIALS, evaluate: ctx.evaluate, OK: ctx.OK, NO: ctx.NO, U: ctx.U, sha256: createHash('sha256').update(code).digest('hex') };
}
