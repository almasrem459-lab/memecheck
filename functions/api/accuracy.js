// GET /api/accuracy — kept for old links. Same live numbers as /api/study (computed from tracker data, 24h and 48h
// measured separately, copycat tickers deduped, actual rug vs dead split, base rate). ?view=monthly groups by scan month.
import { onRequest as study } from './study.js';
export const onRequest = async (ctx) => {
  const u = new URL(ctx.request.url), view = u.searchParams.get('view');
  const r = await study({ ...ctx, request: new Request(new URL('/api/study?view=full', u.origin), { method: ctx.request.method, headers: ctx.request.headers }) });
  if (view !== 'monthly' || !r.ok) return r;
  const s = await r.json(), m = {};
  for (const d of s.daily || []) { const k = d.day.slice(0, 7); (m[k] ||= { month: k, scanned: 0, done: 0, days: 0 }); m[k].scanned += d.scanned; m[k].done += d.done; m[k].days++; }
  return new Response(JSON.stringify({ ok: true, generated: s.generated, monthly: Object.values(m), h24: s.h24, h48: s.h48, pr24: s.pr24 }), { headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=120' } });
};
