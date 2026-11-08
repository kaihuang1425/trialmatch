// The API route contract, called in-process (no server).
import { describe, expect, it } from 'vitest';
import { GET, POST } from '../app/api/agent/route';
import { DEFAULT_DEMO_MOLECULAR } from '../src/engine/synthetic/templates';

async function ndjson(res: Response) {
  const text = await res.text();
  return text
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
}

describe('/api/agent', () => {
  it('GET returns a fresh synthetic state, the patient list and the portfolio', async () => {
    const res = await GET(new Request('http://x/api/agent?patientId=SYN-0417&sessionId=t-get'));
    const body = await res.json();
    expect(body.state.synthetic).toBe(true);
    expect(body.state.documents.map((d: { kind: string }) => d.kind)).toEqual(['referral_summary', 'labs']);
    expect(body.availableDocuments.map((d: { kind: string }) => d.kind)).toEqual(['molecular']);
    expect(body.trials).toHaveLength(9);
  });

  it('POST streams NDJSON events and keeps the session state between triggers', async () => {
    const r1 = await POST(new Request('http://x/api/agent', { method: 'POST', body: JSON.stringify({ sessionId: 't-post', patientId: 'SYN-0417', trigger: { type: 'start' } }) }));
    expect(r1.headers.get('content-type')).toMatch(/ndjson/);
    const e1 = await ndjson(r1);
    expect(e1.at(-1).type).toBe('done');
    const r2 = await POST(new Request('http://x/api/agent', { method: 'POST', body: JSON.stringify({ sessionId: 't-post', trigger: { type: 'document_added', molecular: { ...DEFAULT_DEMO_MOLECULAR, pdl1Tps: 60 } } }) }));
    const e2 = await ndjson(r2);
    const done = e2.at(-1);
    expect(done.type).toBe('done');
    expect(done.state.assessments.NCT05920356.status).toBe('not_match');
    expect(e2.some((e: { type: string }) => e.type === 'assessment_changed')).toBe(true);
  });

  it('POST in live mode without a key reports the problem in the stream', async () => {
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const res = await POST(new Request('http://x/api/agent', { method: 'POST', body: JSON.stringify({ patientId: 'SYN-0417', mode: 'live', trigger: { type: 'start' } }) }));
    const ev = await ndjson(res);
    if (saved) process.env.GEMINI_API_KEY = saved;
    expect(ev[0].type).toBe('error');
    expect(ev[0].message).toMatch(/GEMINI_API_KEY/);
  });

  it('POST without a trigger is a 400', async () => {
    const res = await POST(new Request('http://x/api/agent', { method: 'POST', body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
  });
});
