// GET /api/v1/token?ca=<address>&chain=solana|ethereum|bsc|base|arbitrum   (header: x-api-key: mck_...)
// Public B2B API. Returns the SAME risk score the website shows (cached shared result; live check on miss, capped per tier).
// Rate limits: Cache-API counters per key (per minute + per UTC day), best-effort per Cloudflare location. No KV writes.
import { sha, tierOf, bump, CA_SOL, CA_EVM, CHAINS } from '../../_lib/acct.js';
import { keyOf, readShared, compute, hotPut, ttlFor, CORE_LV } from '../../_lib/shared.js';
import { enc, dec } from '../../../mccache.js';
const H = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'x-api-key, authorization', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const out = (st, b, h = {}) => new Response(JSON.stringify(b), { status: st, headers: { ...H, ...h } });
const kmem = new Map();
async function lookup(env, key) {
  const h = await sha(key), m = kmem.get(h); if (m && m.t > Date.now() - 60e3) return m.v;
  const ck = new Request('https://memecheck-key.internal/' + h); const cache = typeof caches !== 'undefined' ? caches.default : null;
  let v = null;
  try { const r = cache && await cache.match(ck); if (r) v = await r.json(); } catch {}
  if (!v) {
    const row = await env.REV.prepare('SELECT k.h, k.prefix, k.tier, k.until, k.revoked, u.pro_until FROM api_keys k LEFT JOIN users u ON u.wallet = k.wallet WHERE k.h = ?').bind(h).first();
    v = row ? { ...row } : { none: true };
    try { await cache?.put(ck, new Response(JSON.stringify(v), { headers: { 'cache-control': 'public, max-age=60' } })); } catch {}
  }
  kmem.set(h, { t: Date.now(), v }); if (kmem.size > 500) kmem.delete(kmem.keys().next().value);
  return v;
}
const pick = (r, src, at) => {
  const m = r.meta || {};
  return {
    ok: true, ca: r.addr, chain: r.chain, name: m.name || null, symbol: m.symbol || null,
    risk: { level: r.verdict?.level || 'unknown', points: r.verdict?.points ?? null, critical: (r.findings || []).filter(f => f.critical).map(f => f.id) },
    flags: (r.flags || []).map(f => ({ name: f.name, level: f.level })).slice(0, 40),
    findings: (r.findings || []).map(f => ({ id: f.id, status: f.status, critical: !!f.critical })).slice(0, 80),
    market: { priceUsd: m.priceUsd ?? null, liquidityUsd: m.liquidity ?? null, mcapUsd: m.mcap ?? null, fdvUsd: m.fdv ?? null, vol24Usd: m.vol24 ?? null, pairCreatedAt: m.created ?? null, dex: m.dex ?? null },
    sources: r.sources || {}, checkedAt: at || null, source: src,
    scanUrl: `https://memecheck.pages.dev/?ca=${encodeURIComponent(r.addr)}&chain=${r.chain}`,
    disclaimer: 'Automated on-chain heuristics, not financial advice. Paid placements never change risk scores.',
  };
};
export async function onRequestOptions() { return new Response(null, { status: 204, headers: { ...H, 'access-control-allow-methods': 'GET, OPTIONS' } }); }
export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const key = (request.headers.get('x-api-key') || (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || '').trim();
  if (!/^mck_[0-9a-f]{40}$/.test(key)) return out(401, { ok: false, err: 'missing_or_bad_api_key', docs: 'https://memecheck.pages.dev/api-docs' });
  if (!env.REV) return out(503, { ok: false, err: 'unavailable' });
  const k = await lookup(env, key);
  if (k.none || k.revoked) return out(401, { ok: false, err: 'invalid_api_key' });
  const T = tierOf(k);
  const day = await bump('d/' + k.h, 86400, waitUntil), min = await bump('m/' + k.h, 60, waitUntil);
  const RH = { 'x-ratelimit-tier': T.tier, 'x-ratelimit-limit-day': String(T.perDay), 'x-ratelimit-remaining-day': String(Math.max(0, T.perDay - day.n)), 'x-ratelimit-limit-minute': String(T.perMin), 'x-ratelimit-remaining-minute': String(Math.max(0, T.perMin - min.n)) };
  if (day.n % 20 === 0) waitUntil(env.REV.prepare('UPDATE api_keys SET used = used + 20 WHERE h = ?').bind(k.h).run().catch(() => {}));
  if (min.n > T.perMin) return out(429, { ok: false, err: 'rate_limited_minute', retry_after: Math.max(1, min.reset - (Date.now() / 1000 | 0)) }, { ...RH, 'retry-after': String(Math.max(1, min.reset - (Date.now() / 1000 | 0))) });
  if (day.n > T.perDay) return out(429, { ok: false, err: 'rate_limited_day', tier: T.tier, upgrade: 'https://memecheck.pages.dev/api-docs#pricing' }, RH);
  const ca = (url.searchParams.get('ca') || '').trim();
  let chain = (url.searchParams.get('chain') || '').toLowerCase().trim();
  if (!chain) chain = CA_SOL.test(ca) ? 'solana' : 'ethereum';
  if (!CHAINS.includes(chain) || !(chain === 'solana' ? CA_SOL.test(ca) : CA_EVM.test(ca))) return out(400, { ok: false, err: 'bad_ca_or_chain', chains: CHAINS }, RH);
  const kk = keyOf('core', chain, ca);
  const txt = await readShared(env.MEMECHECK_CACHE, kk);
  if (txt) { try { const j = JSON.parse(txt); return out(200, pick(dec(j.data), 'cache', j.at), RH); } catch {} }
  const live = await bump('l/' + k.h, 60, waitUntil);
  if (live.n > T.live) return out(429, { ok: false, err: 'live_check_limit', note: 'Not cached yet; live checks are limited per minute for your tier. Retry shortly.' }, RH);
  let r; try { r = await compute('core', chain, ca); } catch { r = null; }
  if (!r) return out(503, { ok: false, err: 'not_cached_upstream_busy', hint: 'No cached result and the live data sources are rate-limited right now. Retry in ~60 s.', retryAfter: 60 }, { ...RH, 'retry-after': '60' });
  const ttl = ttlFor(r.created, 'core'), at = Date.now();
  waitUntil(hotPut(kk, JSON.stringify({ at, exp: at + ttl * 1000, created: r.created || null, src: 'api', lv: CORE_LV, data: enc(r.data) }), Math.min(ttl, 600)));
  return out(200, pick(r.data, 'live', at), RH);
}
