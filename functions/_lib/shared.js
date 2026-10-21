// Server-only helpers shared by the Pages Functions (/api/deep) and the memecheck-warmer Worker.
// KV is written ONLY from here (server code). Browsers can read results, never write them.
import { cfg, devCheck, bundleCheck, exitTrace, setCreated } from '../../devbundle.js';
import { analyze } from '../../core.js';
import { enc } from '../../mccache.js';

export const KINDS = new Set(['dev', 'exit', 'core']);
export const validCa = (ca, chain) => chain === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ca || '') : ['ethereum', 'bsc', 'base', 'arbitrum'].includes(chain) && /^0x[0-9a-fA-F]{40}$/.test(ca || '');
export const keyOf = (kind, chain, ca) => `${kind}:${chain}:${chain === 'solana' ? ca : ca.toLowerCase()}`;
// TTL (s): tokens < 24 h old change fast. core = market/security snapshot, short-lived.
export const ttlFor = (created, kind) => kind === 'core' ? 15 * 60 : (created && Date.now() - created < 24 * 36e5) ? 30 * 60 : 6 * 3600;

// ---- KV write budget (free tier: 1000 writes/day) ----
// Counter key wc:<UTC day>. Bumping it on every write would double the cost, so it is bumped by 10 with probability 1/10
// (unbiased estimate, ~10% overhead). Hard stop at LIMIT estimated writes incl. the counter's own writes.
// The warmer is additionally paced (share of the day elapsed) so it can't burn the budget early and starve on-demand checks.
export const LIMIT = 880, WARMER_LIMIT = 600;
const day = () => new Date().toISOString().slice(0, 10);
export async function writesToday(KV) { return +(await KV.get('wc:' + day()).catch(() => 0)) || 0; }
export async function budgetOk(KV, who) {
  const n = await writesToday(KV);
  if (n >= LIMIT) return false;
  if (who === 'warmer') { const frac = (Date.now() % 864e5) / 864e5; return n < Math.min(WARMER_LIMIT, 40 + WARMER_LIMIT * frac); }
  return true;
}
export async function guardedPut(KV, key, value, opts, who = 'pages') {
  if (!(await budgetOk(KV, who))) return false;
  await KV.put(key, value, opts);
  if (Math.random() < 0.1) { const n = await writesToday(KV); await KV.put('wc:' + day(), String(n + 11), { expirationTtl: 2 * 86400 }); } // 10 data + 1 counter write
  return true;
}

// ---- hot copy in the Cache API (free, per colo) ----
const hotKey = (k) => new Request('https://memecheck-deep.internal/' + encodeURIComponent(k));
const C = () => (typeof caches !== 'undefined' ? caches.default : null);
export async function hotGet(k) { try { const r = await C()?.match(hotKey(k)); return r ? await r.text() : null; } catch { return null; } }
export async function hotPut(k, txt, ttl) { try { await C()?.put(hotKey(k), new Response(txt, { headers: { 'cache-control': `public, max-age=${ttl}` } })); } catch {} }
export async function hotDel(k) { try { await C()?.delete(hotKey(k)); } catch {} }

// Version of the core (market + risk) logic. Bump it whenever core.js scoring/pair-picking changes: cached core results
// written by older code (no/older `lv`) are treated as a miss, so /api/deep recomputes and overwrites them.
// v2 = live-pair picker (ignores the frozen pump.fun bonding-curve pair after graduation).
export const CORE_LV = 5; // v5 = pump.fun weighting + deduped/capped holder & insider % (audit 2026-10-21)
// prev // v4 = Base + Arbitrum, Uniswap V3/V4 LP handling
// prev // v3 = unified EVM scoring (evmFindings), Four.meme awareness, BNB/ETH auto-detect
const stale = (k, txt) => { if (!k.startsWith('core:')) return false; try { return JSON.parse(txt).lv !== CORE_LV; } catch { return true; } };
// read: Cache API first, then KV (backfilling the Cache API)
export async function readShared(KV, k) {
  const h = await hotGet(k); if (h && !stale(k, h)) return h;
  const v = KV && await KV.get(k).catch(() => null);
  if (v && stale(k, v)) return null;
  if (v) { const j = JSON.parse(v); const left = Math.max(30, Math.min(300, ((j.exp || 0) - Date.now()) / 1000 | 0)); await hotPut(k, v, left); }
  return v;
}
export async function store(KV, kind, chain, ca, data, created, src, who) {
  const ttl = ttlFor(created, kind), k = keyOf(kind, chain, ca);
  const txt = JSON.stringify({ at: Date.now(), exp: Date.now() + ttl * 1000, created: created || null, src, ...(kind === 'core' ? { lv: CORE_LV } : {}), data: enc(data) });
  await hotPut(k, txt, Math.min(ttl, 600));
  const kv = KV ? await guardedPut(KV, k, txt, { expirationTtl: ttl, metadata: { at: Date.now(), c: created || 0 } }, who) : false;
  return { txt, kv };
}

export function useHelius(key, rate = 120) { if (key) { cfg.rpc = 'https://mainnet.helius-rpc.com/?api-key=' + key; cfg.batch = 20; cfg.rate = rate; } }

// Compute one result. dev = dev check + bundle (~15-25 subrequests). exit needs the dev result (creator/curve) and ~30-40.
// core = the main risk score (DexScreener + GoPlus/honeypot.is or RugCheck, ~3-5 subrequests).
export async function compute(kind, chain, ca, { devData, created } = {}) {
  if (kind === 'core') {
    const r = await analyze(ca, chain === 'solana' ? 'solana' : chain);
    const ok = Object.values(r.sources).some(x => x === 'ok') && r.sources.DexScreener === 'ok';
    return ok ? { data: r, created: r.meta?.created || null } : null;
  }
  if (created) setCreated(ca, created);
  if (kind === 'dev') {
    const d = await devCheck(ca);
    if (!d.pump) return { data: { pump: false }, created: null };
    try { d.bundle = await bundleCheck(ca, d.creator, d.coin.curve); } catch { d.bundle = { error: true }; }
    if (d.bundle.error) return null; // do not cache failures as results
    return { data: d, created: d.coin.created };
  }
  if (kind === 'exit') {
    if (!devData?.pump) return null;
    setCreated(ca, devData.coin?.created);
    const e = await exitTrace(ca, devData.creator, devData.coin.curve);
    if (e.error || (!e.available && e.reason === 'rpc')) return null;
    return { data: e, created: devData.coin?.created };
  }
  return null;
}
