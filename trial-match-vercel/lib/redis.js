// Upstash Redis over its REST API (the store Vercel's Marketplace sets up). No SDK needed.
// Reads KV_REST_API_URL / KV_REST_API_TOKEN (Vercel's names) or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
import { HttpError, fetchJson } from './http.js';

function conf() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

export function redisConfigured() { return !!conf(); }

export async function pipeline(commands) {
  const c = conf();
  if (!c) throw new HttpError(503, 'store_not_configured', 'The shared data store is not connected.');
  const out = await fetchJson(c.url + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  }, 15000);
  return out.map((r) => {
    if (r && r.error) throw new HttpError(502, 'store_error', String(r.error));
    return r ? r.result : null;
  });
}

export async function redis(...command) { return (await pipeline([command]))[0]; }

// Fixed-window limit per key. Uses Redis when connected, otherwise memory (per server instance).
const mem = new Map();
export async function rateLimit(key, limit, windowSec) {
  let count;
  if (redisConfigured()) {
    const k = 'tm:rl:' + key;
    [count] = await pipeline([['INCR', k], ['EXPIRE', k, String(windowSec), 'NX']]);
  } else {
    const now = Date.now(), cur = mem.get(key);
    if (!cur || cur.until < now) { mem.set(key, { n: 1, until: now + windowSec * 1000 }); count = 1; }
    else count = ++cur.n;
    if (mem.size > 5000) mem.clear();
  }
  if (count > limit) throw new HttpError(429, 'resource_exhausted', 'Too many requests. Wait a few minutes and try again.');
}
