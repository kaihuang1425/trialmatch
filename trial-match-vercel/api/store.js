// Shared demo data (patients, applications, events, rankings) in Redis, so everyone who opens the site sees the same demo.
//   GET  /api/store?v=<version>        -> { v, same: true } or { v, data: { patients: {...}, apps: {...}, ... } }
//   POST /api/store { op: 'set', c, id, doc } | { op: 'del', c, id } | { op: 'replace', data }  -> { v }
import { HttpError, clientIp, query, readJson, route, send } from '../lib/http.js';
import { pipeline, rateLimit, redis } from '../lib/redis.js';

const COLS = ['patients', 'apps', 'events', 'rankings'];
const MAX_DOC = 64 * 1024;
const MAX_DOCS = 3000;
const P = (process.env.STORE_PREFIX || 'tm').replace(/[^a-z0-9_-]/gi, '');
const key = (c) => P + ':c:' + c;
const VER = P + ':ver';

function checkCol(c) { if (!COLS.includes(c)) throw new HttpError(400, 'bad_collection', 'Unknown collection.'); }
function checkId(id) { if (typeof id !== 'string' || !/^[\w.:\-]{1,120}$/.test(id)) throw new HttpError(400, 'bad_id', 'Bad document ID.'); }
function encode(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new HttpError(400, 'bad_doc', 'A document must be an object.');
  const s = JSON.stringify(doc);
  if (s.length > MAX_DOC) throw new HttpError(413, 'quota_exceeded', 'That document is too large.');
  return s;
}

export default route(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') {
    const v = String((await redis('GET', VER)) || '0');
    if (query(req).v === v) return send(res, 200, { v, same: true });
    const all = await pipeline(COLS.map((c) => ['HGETALL', key(c)]));
    const data = {};
    COLS.forEach((c, i) => {
      const flat = all[i] || [], m = {};
      for (let j = 0; j + 1 < flat.length; j += 2) { try { m[flat[j]] = JSON.parse(flat[j + 1]); } catch { /* skip a bad row */ } }
      data[c] = m;
    });
    return send(res, 200, { v, data });
  }

  const body = await readJson(req, 2 * 1024 * 1024);
  await rateLimit('store:' + clientIp(req), body.op === 'replace' ? 20 : 900, 600);

  if (body.op === 'set' || body.op === 'del') {
    checkCol(body.c); checkId(body.id);
    if (body.op === 'del') {
      const [, v] = await pipeline([['HDEL', key(body.c), body.id], ['INCR', VER]]);
      return send(res, 200, { v: String(v) });
    }
    const [, n, v] = await pipeline([['HSET', key(body.c), body.id, encode(body.doc)], ['HLEN', key(body.c)], ['INCR', VER]]);
    if (n > MAX_DOCS) {
      await pipeline([['HDEL', key(body.c), body.id], ['INCR', VER]]);
      throw new HttpError(413, 'quota_exceeded', 'The shared demo is full. Reset the demo data to free space.');
    }
    return send(res, 200, { v: String(v) });
  }

  if (body.op === 'replace') {
    const data = body.data || {};
    const cmds = [];
    COLS.forEach((c) => {
      const docs = data[c] || {};
      const ids = Object.keys(docs);
      if (ids.length > MAX_DOCS) throw new HttpError(413, 'quota_exceeded', 'Too many documents.');
      cmds.push(['DEL', key(c)]);
      const args = [];
      ids.forEach((id) => { checkId(id); args.push(id, encode(docs[id])); });
      if (args.length) cmds.push(['HSET', key(c), ...args]);
    });
    cmds.push(['INCR', VER]);
    const out = await pipeline(cmds);
    return send(res, 200, { v: String(out[out.length - 1]) });
  }

  throw new HttpError(400, 'bad_op', 'Unknown operation.');
});
