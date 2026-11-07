// Local server that behaves like the Vercel deployment: serves public/, runs api/*.js, applies vercel.json
// redirects and headers, and loads .env.local / .env. Usage: npm run dev  (PORT=3000 by default)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const apiDir = path.join(root, 'api');
const conf = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

for (const f of ['.env.local', '.env']) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] !== '' && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8' };
// vercel.json sources: literal path text plus regex groups like (.*) or (protein|vendor).
const toRe = (src) => new RegExp('^' + src.split(/(\([^)]*\))/).map((part, i) => (i % 2 ? part : part.replace(/[.+?^${}[\]\\|*]/g, '\\$&'))).join('') + '$');
const headerRules = (conf.headers || []).map((h) => ({ re: toRe(h.source), headers: h.headers }));

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  let pathname;
  try { pathname = decodeURIComponent(u.pathname); } catch { res.statusCode = 400; return res.end('Bad path'); }
  for (const r of conf.redirects || []) {
    if (r.source === pathname) { res.statusCode = r.permanent ? 308 : 307; res.setHeader('Location', r.destination + u.search); return res.end(); }
  }
  for (const rule of headerRules) if (rule.re.test(pathname)) rule.headers.forEach((h) => res.setHeader(h.key, h.value));

  if (pathname.startsWith('/api/')) {
    const file = path.join(root, pathname.replace(/\/+$/, '') + '.js');
    if (!file.startsWith(apiDir + path.sep) || !fs.existsSync(file)) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); return res.end('{"error":"not_found"}'); }
    try {
      const mod = await import(pathToFileURL(file).href + '?v=' + fs.statSync(file).mtimeMs);
      req.query = Object.fromEntries(u.searchParams);
      await mod.default(req, res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) { res.statusCode = 500; res.end('{"error":"crashed"}'); }
    }
    console.log(req.method, pathname, res.statusCode);
    return;
  }

  let file = path.join(pub, pathname);
  if (!file.startsWith(pub)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

// Note: edits under lib/ need a restart (Node caches those modules); edits to api/*.js and public/ do not.
const flag = process.argv.indexOf('--port');
const port = Number(flag > 0 ? process.argv[flag + 1] : process.env.PORT || 3000);
server.listen(port, '127.0.0.1', () => {
  console.log('Trial Match on http://localhost:' + port + '  (landing at /, app at /app/)');
});
