// Small helpers shared by the API functions. They work with Vercel's Node.js runtime and with scripts/dev.mjs.

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export function send(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(body));
}

// Reads a JSON body, whether or not the platform has parsed it already.
export async function readJson(req, limit = 64 * 1024) {
  let parsed;
  try { parsed = req.body; } catch { throw new HttpError(400, 'bad_json', 'The request body is not valid JSON.'); }
  if (parsed && typeof parsed === 'object' && !Buffer.isBuffer(parsed)) {
    if (JSON.stringify(parsed).length > limit) throw new HttpError(413, 'too_large', 'The request is too large.');
    return parsed;
  }
  let raw = '';
  if (typeof parsed === 'string') raw = parsed;
  else if (Buffer.isBuffer(parsed)) raw = parsed.toString('utf8');
  else {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw new HttpError(413, 'too_large', 'The request is too large.');
      chunks.push(c);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (raw.length > limit) throw new HttpError(413, 'too_large', 'The request is too large.');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'bad_json', 'The request body is not valid JSON.'); }
}

export function query(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  return Object.fromEntries(new URL(req.url, 'http://local').searchParams);
}

export function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Wraps a handler: method check, errors as JSON, nothing leaks a stack trace.
export function route(methods, fn) {
  return async function handler(req, res) {
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return send(res, 405, { error: 'method_not_allowed' });
    }
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message });
      console.error(e);
      return send(res, 502, { error: 'upstream_failed', message: 'A connected service did not answer. Try again in a moment.' });
    }
  };
}

export async function fetchJson(url, opts = {}, timeoutMs = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    const text = await r.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
    if (!r.ok) {
      const err = new HttpError(r.status >= 500 ? 502 : r.status, 'upstream_' + r.status, (body && (body.error && (body.error.message || body.error))) || ('Upstream answered ' + r.status));
      err.upstream = body;
      throw err;
    }
    return body;
  } catch (e) {
    if (e.name === 'AbortError') throw new HttpError(504, 'upstream_timeout', 'A connected service took too long to answer.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}
