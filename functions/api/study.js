// GET /api/study?view=full|summary|records — accuracy study computed on request from tracker data (never hand-edited):
//   1. /study-data.json  : backfilled records (outcomes recomputed from GeckoTerminal OHLCV, see docs/STUDY.md)
//   2. KV `study:v2`     : live records written ONLY by the memecheck-tracker Worker (hourly cron). Browsers cannot write it.
// Merged by mint (KV wins), aggregated with study-core.js. Edge cache 5 min, so /rugs and /accuracy refresh by themselves.
import { summarize, brief } from '../../study-core.js';
const json = (status, body, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=120', ...extra } });
export const onRequest = async ({ request: req, env, waitUntil }) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET' } });
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const u = new URL(req.url), view = ['full', 'summary', 'records'].includes(u.searchParams.get('view')) ? u.searchParams.get('view') : 'full';
  const cache = typeof caches !== 'undefined' ? caches.default : null, key = new Request('https://memecheck-cache.internal/study/v2/' + view);
  try { const hit = cache && await cache.match(key); if (hit) return json(200, await hit.text(), { 'x-cache': 'HIT' }); } catch {}
  let seed = [], live = [], liveAt = null;
  try { const r = await fetch(new URL('/study-data.json', u.origin)); if (r.ok) seed = (await r.json()).records || []; } catch {}
  try { const v = env.MEMECHECK_CACHE && await env.MEMECHECK_CACHE.get('study:v2', 'json'); if (v?.records) { live = v.records; liveAt = v.updated || null; } } catch {}
  const m = new Map(); for (const r of [...seed, ...live]) if (r && r.ca && r.scanned) m.set(r.ca, r);
  const recs = [...m.values()];
  if (!recs.length) return json(503, { ok: false, error: 'no tracker data yet' }, { 'cache-control': 'no-store' });
  const src = liveAt ? (live.length ? `backfill + live tracker (updated ${liveAt})` : `live tracker online (updated ${liveAt}; 0 live rows yet)`) : 'backfill only (live tracker not deployed yet)';
  const s = summarize(recs, { source: src });
  s.live_records = live.length; s.tracker_updated = liveAt;
  const body = view === 'summary' ? brief(s) : view === 'records' ? { ok: true, generated: s.generated, records: recs.sort((a, b) => a.scanned < b.scanned ? 1 : -1) } : s;
  const txt = JSON.stringify(body);
  if (cache) { const p = cache.put(key, new Response(txt, { headers: { 'cache-control': 'public, max-age=300' } })).catch(() => {}); waitUntil ? waitUntil(p) : await p; }
  return json(200, txt, { 'x-cache': 'MISS' });
};
