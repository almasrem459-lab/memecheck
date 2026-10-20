// GET /api/devrep?wallet=<solana pubkey>  OR  /api/devrep?ca=<mint>
// → Dev Reputation Score 0–100 + label + evidence (M1 v1).
// Reuses pump.fun creator lists + DexScreener markets (same as /api/dev) and scoring in ../../devrep-core.js.
// Optional soft LP sample: up to 5 RugCheck reports on graduated prior coins (skipped on timeout / fail). M2 strengthen.
// Cache API only (15 min full / 2 min incomplete). Never writes KV. No secrets in response.
import { summarize, dexMarkets, MAX_DS } from '../../devhist-core.js';
import { repFromHist, launchCadenceHours } from '../../devrep-core.js';
import { pumpGet, heliusCreatedCoins } from '../_lib/pump.js';

const ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TTL = 900, TTL_ERR = 120, MAX_COINS = 200;
const UA = 'Mozilla/5.0 (MemeCheck/1.0)';
const json = (status, body, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra },
});

async function get(url, ms = 6000) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': UA } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(tm); }
}

async function creatorOf(mint, src, waitUntil) {
  const { json: coin, state } = await pumpGet(`/coins-v2/${mint}`, { waitUntil });
  if (coin) src.pump = state === 'STALE' ? 'stale' : 'ok';
  else src.pump = state === 'FAIL' ? 'fail' : 'empty';
  if (coin?.creator) return { creator: coin.creator, via: 'pump.fun', coin };
  const rc = await get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, 7000).catch(() => { src.rugcheck = 'fail'; return null; });
  if (rc) src.rugcheck = 'ok';
  if (rc?.creator && ADDR_RE.test(rc.creator)) return { creator: rc.creator, via: 'RugCheck' };
  return null;
}

async function createdCoins(creator, src, waitUntil) {
  const page = async (off) => {
    const { json: d, state } = await pumpGet(`/coins-v2/user-created-coins/${creator}?offset=${off}&limit=50&includeNsfw=true`, { waitUntil });
    return { d, state };
  };
  const first = await page(0);
  if (!first.d) {
    src.pumpList = first.state === 'FAIL' ? 'fail' : 'ok';
    return { coins: [], count: 0 };
  }
  const count = +first.d.count || (first.d.coins || []).length;
  const coins = [...(first.d.coins || [])];
  const offs = [];
  for (let o = 50; o < Math.min(count, MAX_COINS); o += 50) offs.push(o);
  const rest = await Promise.all(offs.map(o => page(o).catch(() => ({ d: null, state: 'FAIL' }))));
  rest.forEach(r => coins.push(...(r.d?.coins || [])));
  const anyFail = rest.some(r => !r.d);
  const anyStale = first.state === 'STALE' || rest.some(r => r.state === 'STALE');
  src.pumpList = anyFail ? 'partial' : anyStale ? 'stale' : 'ok';
  const seen = new Set();
  return { coins: coins.filter(c => c?.mint && !seen.has(c.mint) && seen.add(c.mint)), count };
}

async function lpSample(gradMints, src) {
  const take = gradMints.slice(0, 5);
  if (!take.length) { src.lpSample = 'skip'; return null; }
  const locks = [];
  await Promise.all(take.map(async (mint) => {
    try {
      const rc = await get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, 5000);
      let pct = null;
      if (rc?.markets?.length) {
        const vals = rc.markets.map(m => m?.lp?.lpLockedPct).filter(x => x != null && !Number.isNaN(+x)).map(Number);
        if (vals.length) pct = Math.max(...vals);
      }
      if (pct == null && rc?.lpLockedPct != null) pct = +rc.lpLockedPct;
      if (pct != null && !Number.isNaN(pct)) locks.push(pct);
    } catch {}
  }));
  src.lpSample = locks.length ? 'ok' : 'fail';
  if (!locks.length) return null;
  return { n: locks.length, lockedPctAvg: locks.reduce((a, b) => a + b, 0) / locks.length };
}

async function build({ wallet, mint, waitUntil, env }) {
  const src = {}, now = Date.now();
  let creator = wallet || null;
  let via = wallet ? 'wallet' : null;
  let excludeMint = mint || null;

  if (!creator && mint) {
    const who = await creatorOf(mint, src, waitUntil);
    if (!who) return { ok: false, mint, reason: 'no_creator', sources: src };
    creator = who.creator; via = who.via;
  }
  if (!creator || !ADDR_RE.test(creator)) return { ok: false, reason: 'bad_wallet', sources: src };

  let coins = [], count = 0;
  try { ({ coins, count } = await createdCoins(creator, src, waitUntil)); }
  catch { src.pumpList = 'fail'; coins = []; count = 0; }
  if ((!coins.length) && env) {
    const h = await heliusCreatedCoins(creator, env).catch(() => null);
    if (h?.coins?.length) {
      coins = h.coins; count = h.count; src.pumpList = 'helius'; src.helius = 'ok';
    } else if (h) { src.helius = 'empty'; }
    else { src.helius = 'skip'; }
  }

  const prev = coins
    .filter(c => c.mint !== excludeMint)
    .map(c => ({
      mint: c.mint,
      symbol: String(c.symbol || '').slice(0, 20),
      name: String(c.name || '').slice(0, 40),
      created: +c.created_timestamp || null,
      ath: Math.round(+c.ath_market_cap || 0),
      grad: !!c.complete,
    }))
    .sort((a, b) => (b.created || 0) - (a.created || 0));

  const listedSelf = excludeMint ? coins.some(c => c.mint === excludeMint) : false;
  const total = Math.max(prev.length, (count || coins.length) - (listedSelf ? 1 : 0));
  const judged = prev.slice(0, MAX_DS);
  let map = await dexMarkets(judged.map(c => c.mint), (u) => get(u, 7000));
  src.dexscreener = !judged.length ? 'skip' : !map ? 'fail' : map.partial ? 'partial' : 'ok';

  const hist = {
    ok: true,
    wallet: creator,
    creator,
    creatorSource: via,
    mint: excludeMint || null,
    total,
    listed: prev.length,
    graduated: prev.filter(c => c.grad).length,
    ...summarize(judged, total, map, now),
    sources: src,
    at: now,
  };
  if (!map) { hist.needMarket = true; hist.judged = judged; }

  const cadenceHours = launchCadenceHours(prev.length ? prev : judged);
  hist.cadenceHours = cadenceHours;

  let extra = {};
  if (map && prev.some(c => c.grad)) {
    const sample = await lpSample(prev.filter(c => c.grad).map(c => c.mint), src);
    if (sample) extra.lpSample = sample;
  }

  const rep = repFromHist(hist, extra);
  const out = {
    ok: true,
    wallet: creator,
    creatorSource: via,
    mint: excludeMint || null,
    score: rep.score,
    label: rep.label,
    version: rep.version,
    components: rep.components,
    evidence: rep.evidence,
    gaps: rep.gaps,
    methodology: rep.methodology,
    history: {
      total: hist.total,
      checked: hist.checked,
      live: hist.live,
      dead: hist.dead,
      rugged: hist.rugged,
      bad: hist.bad,
      new: hist.new,
      graduated: hist.graduated,
      flag: hist.flag,
      recent: (hist.recent || []).slice(0, 8),
      cadenceHours,
    },
    sources: src,
    at: now,
  };
  if (src.pumpList === 'fail' && !prev.length) out.listPartial = true;
  if (hist.needMarket) { out.needMarket = true; out.judged = judged; out.partial = true; }
  return out;
}

export const onRequest = async ({ request: req, waitUntil, env }) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type' } });
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const u = new URL(req.url);
  const wallet = u.searchParams.get('wallet') || '';
  const mint = u.searchParams.get('ca') || u.searchParams.get('mint') || '';
  if (wallet && !ADDR_RE.test(wallet)) return json(400, { ok: false, error: 'bad wallet' });
  if (mint && !ADDR_RE.test(mint)) return json(400, { ok: false, error: 'bad mint' });
  if (!wallet && !mint) return json(400, { ok: false, error: 'wallet or ca required' });

  const cacheKey = 'https://memecheck-cache.internal/devrep/v3/' + (wallet || ('ca:' + mint));
  const key = new Request(cacheKey);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  try {
    const hit = cache && await cache.match(key);
    if (hit) return json(200, await hit.text(), { 'cache-control': 'public, max-age=120', 'x-cache': 'HIT' });
  } catch {}

  let res, tm;
  try {
    res = await Promise.race([
      build({ wallet: wallet || null, mint: mint || null, waitUntil, env }),
      new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('timeout')), 22000); }),
    ]);
  } catch (e) {
    res = { ok: false, wallet: wallet || null, mint: mint || null, reason: 'error', error: String(e?.message || e).slice(0, 80) };
  } finally { clearTimeout(tm); }

  const body = JSON.stringify(res);
  const full = res.ok && !res.needMarket && ['ok', 'skip'].includes(res.sources?.dexscreener) && ['ok', 'stale'].includes(res.sources?.pumpList);
  if (cache) {
    const p = cache.put(key, new Response(body, {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${full ? TTL : TTL_ERR}` },
    })).catch(() => {});
    waitUntil ? waitUntil(p) : await p;
  }
  return json(200, body, { 'cache-control': 'public, max-age=120', 'x-cache': 'MISS' });
};
