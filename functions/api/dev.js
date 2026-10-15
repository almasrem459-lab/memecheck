// GET /api/dev?ca=<solana mint> -> developer (creator) history: who launched this coin and what happened to their other coins.
// Sources (all free, no keys): pump.fun frontend API (coin -> creator, creator -> created coins, up to 200),
// RugCheck report (creator for tokens pump.fun does not know), DexScreener batch tokens API (current market of the 150 most recent).
// Classification/flag rules: devhist-core.js. If DexScreener rate-limits this edge, the response carries needMarket + judged[]
// and the browser finishes the market lookup itself (same code). Read-only, Cache API (15 min; 2 min if incomplete). Never writes KV.
import { summarize, dexMarkets, MAX_DS } from '../../devhist-core.js';
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const PUMP = 'https://frontend-api-v3.pump.fun';
const TTL = 900, TTL_ERR = 120, MAX_COINS = 200;
const UA = 'Mozilla/5.0 (MemeCheck/1.0)';
const json = (status, body, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra } });
async function get(url, ms = 6000) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': UA } }); if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(tm); }
}
async function creatorOf(mint, src) {
  const coin = await get(`${PUMP}/coins-v2/${mint}`).catch(() => { src.pump = 'fail'; return null; });
  if (coin) src.pump = 'ok';
  if (coin?.creator) return { creator: coin.creator, via: 'pump.fun', coin };
  const rc = await get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, 7000).catch(() => { src.rugcheck = 'fail'; return null; });
  if (rc) src.rugcheck = 'ok';
  if (rc?.creator && MINT_RE.test(rc.creator)) return { creator: rc.creator, via: 'RugCheck' };
  return null;
}
async function createdCoins(creator, src) {
  const page = (off) => get(`${PUMP}/coins-v2/user-created-coins/${creator}?offset=${off}&limit=50&includeNsfw=true`);
  const first = await page(0); if (!first) { src.pumpList = 'ok'; return { coins: [], count: 0 }; }
  const count = +first.count || (first.coins || []).length; const coins = [...(first.coins || [])];
  const offs = []; for (let o = 50; o < Math.min(count, MAX_COINS); o += 50) offs.push(o);
  const rest = await Promise.all(offs.map(o => page(o).catch(() => null)));
  rest.forEach(d => coins.push(...(d?.coins || [])));
  src.pumpList = rest.some(d => !d) ? 'partial' : 'ok';
  const seen = new Set(); return { coins: coins.filter(c => c?.mint && !seen.has(c.mint) && seen.add(c.mint)), count };
}
async function build(mint) {
  const src = {}, now = Date.now();
  const who = await creatorOf(mint, src);
  if (!who) return { ok: false, mint, reason: 'no_creator', sources: src };
  let coins = [], count = 0;
  try { ({ coins, count } = await createdCoins(who.creator, src)); } catch { src.pumpList = 'fail'; return { ok: false, mint, creator: who.creator, creatorSource: who.via, reason: 'no_list', sources: src }; }
  const prev = coins.filter(c => c.mint !== mint).map(c => ({ mint: c.mint, symbol: String(c.symbol || '').slice(0, 20), name: String(c.name || '').slice(0, 40), created: +c.created_timestamp || null, ath: Math.round(+c.ath_market_cap || 0), grad: !!c.complete }))
    .sort((a, b) => (b.created || 0) - (a.created || 0));
  const listedSelf = coins.some(c => c.mint === mint) || (who.via === 'pump.fun' && count > 0);
  const total = Math.max(prev.length, (count || coins.length) - (listedSelf ? 1 : 0));
  const judged = prev.slice(0, MAX_DS);
  let map = await dexMarkets(judged.map(c => c.mint), (u) => get(u, 7000));
  src.dexscreener = !judged.length ? 'skip' : !map ? 'fail' : map.partial ? 'partial' : 'ok';
  const cur = who.coin || coins.find(c => c.mint === mint);
  const out = { ok: true, mint, creator: who.creator, creatorSource: who.via, current: cur ? { created: +cur.created_timestamp || null, grad: !!cur.complete } : null,
    total, listed: prev.length, graduated: prev.filter(c => c.grad).length, ...summarize(judged, total, map, now), sources: src, at: now };
  if (!map) { out.needMarket = true; out.judged = judged; } // browser completes the DexScreener lookup
  return out;
}
export const onRequest = async ({ request: req, waitUntil }) => {
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const mint = new URL(req.url).searchParams.get('ca') || '';
  if (!MINT_RE.test(mint)) return json(400, { ok: false, error: 'bad mint' });
  const key = new Request('https://memecheck-cache.internal/dev-hist/v2/' + mint);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  try { const hit = cache && await cache.match(key); if (hit) return json(200, await hit.text(), { 'cache-control': 'public, max-age=120', 'x-cache': 'HIT' }); } catch {}
  let res, tm;
  try { res = await Promise.race([build(mint), new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('timeout')), 20000); })]); }
  catch (e) { res = { ok: false, mint, reason: 'error', error: String(e?.message || e).slice(0, 80) }; }
  finally { clearTimeout(tm); }
  const body = JSON.stringify(res), full = res.ok && ['ok', 'skip'].includes(res.sources?.dexscreener) && res.sources?.pumpList === 'ok';
  if (cache) { const p = cache.put(key, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${full ? TTL : TTL_ERR}` } })).catch(() => {}); waitUntil ? waitUntil(p) : await p; }
  return json(200, body, { 'cache-control': 'public, max-age=120', 'x-cache': 'MISS' });
};
