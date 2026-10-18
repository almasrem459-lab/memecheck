// Newest Solana meme tokens for the homepage "New" list, server-side with source fallback:
//   1) pump.fun coins API (newest launches)  2) DexScreener token-profiles/latest (pump mints, enriched)  3) GeckoTerminal new_pools (solana)
// Cached in the Cloudflare Cache API for TTL seconds; the last good list is kept (up to 24 h) and served stale if every source fails.
const TTL = 90, STALE = 86400, UA = 'Mozilla/5.0 (MemeCheck/1.0)';
const json = (status, body, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra } });
const get = async (u, ms = 7000) => {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(u, { headers: { accept: 'application/json', 'user-agent': UA }, signal: ctl.signal }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); }
  finally { clearTimeout(tm); }
};
const n = (v) => v == null || v === '' || isNaN(+v) ? null : +v;
async function fromPump() {
  const d = await get('https://frontend-api-v3.pump.fun/coins?sort=created_timestamp&order=DESC&limit=30&offset=0&includeNsfw=false');
  if (!Array.isArray(d)) throw new Error('shape');
  const out = d.filter(c => !c.nsfw && c.mint).slice(0, 15).map(c => ({ a: c.mint, n: c.name, s: c.symbol, img: c.image_uri || null, ts: c.created_timestamp || null, mc: n(c.usd_market_cap), c: 'solana' }));
  if (!out.length) throw new Error('empty'); return out;
}
async function fromDex() {
  const d = await get('https://api.dexscreener.com/token-profiles/latest/v1');
  const ps = (Array.isArray(d) ? d : []).filter(x => x.chainId === 'solana' && x.tokenAddress).slice(0, 30); if (!ps.length) throw new Error('empty');
  const pr = await get('https://api.dexscreener.com/tokens/v1/solana/' + ps.map(x => x.tokenAddress).join(',')).catch(() => []);
  const info = {}; for (const p of Array.isArray(pr) ? pr : []) { const k = p.baseToken?.address; if (k && (!info[k] || (p.pairCreatedAt || 9e15) < (info[k].pairCreatedAt || 9e15))) info[k] = p; }
  return ps.map(x => { const p = info[x.tokenAddress]; return { a: x.tokenAddress, n: p?.baseToken?.name || x.tokenAddress.slice(0, 6) + '…', s: p?.baseToken?.symbol || '', img: x.icon || null, ts: p?.pairCreatedAt || null, mc: p ? n(p.marketCap ?? p.fdv) : null, p: p ? n(p.priceUsd) : null, liq: p ? n(p.liquidity?.usd) : null, vol: p ? n(p.volume?.h24) : null, ch6: p ? n(p.priceChange?.h6) : null, ch24: p ? n(p.priceChange?.h24) : null, c: 'solana' }; })
    .sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 15);
}
const MAJOR = /^(w?sol|usdc|usdt|usd1|pyusd)$/i;
async function fromGecko() {
  const d = await get('https://api.geckoterminal.com/api/v2/networks/solana/new_pools?include=base_token&page=1');
  const inc = Object.fromEntries((d?.included || []).map(x => [x.id, x.attributes])); const seen = new Set(), out = [];
  for (const p of d?.data || []) {
    const a = p.attributes || {}, t = inc[p.relationships?.base_token?.data?.id]; if (!t?.address || seen.has(t.address) || MAJOR.test(t.symbol || '')) continue; seen.add(t.address);
    const pc = a.price_change_percentage || {};
    out.push({ a: t.address, n: t.name, s: t.symbol, img: t.image_url && !/missing/.test(t.image_url) ? t.image_url : null, ts: a.pool_created_at ? Date.parse(a.pool_created_at) : null, mc: n(a.market_cap_usd) ?? n(a.fdv_usd), liq: n(a.reserve_in_usd), p: n(a.base_token_price_usd), vol: n(a.volume_usd?.h24), ch6: n(pc.h6), ch24: n(pc.h24), c: 'solana' });
  }
  if (!out.length) throw new Error('empty'); return out.slice(0, 15);
}
const SOURCES = [['pump.fun', fromPump], ['DexScreener', fromDex], ['GeckoTerminal', fromGecko]];
export const onRequest = async ({ request: req, waitUntil }) => {
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const key = new Request('https://memecheck-cache.internal/new-tokens/v1');
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  let hit = null; try { hit = cache && await cache.match(key); } catch {}
  let old = null; if (hit) { try { old = await hit.json(); } catch {} }
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  if (old?.items?.length && Date.now() - (old.at || 0) < TTL * 1000 && !fresh) return json(200, old, { 'cache-control': 'public, max-age=30', 'x-cache': 'HIT' });
  const tried = [];
  for (const [name, fn] of SOURCES) {
    try {
      const items = await fn(); const body = { ok: true, source: name, at: Date.now(), items, tried };
      if (cache) { const p = cache.put(key, new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${STALE}` } })).catch(() => {}); waitUntil ? waitUntil(p) : await p; }
      return json(200, body, { 'cache-control': 'public, max-age=30', 'x-cache': 'MISS' });
    } catch (e) { tried.push(name + ': ' + String(e?.message || e).slice(0, 40)); }
  }
  if (old?.items?.length) return json(200, { ...old, stale: true, tried }, { 'cache-control': 'no-store', 'x-cache': 'STALE' });
  return json(200, { ok: false, items: [], tried, at: Date.now() }, { 'cache-control': 'no-store' }); // UI shows a friendly empty state
};
