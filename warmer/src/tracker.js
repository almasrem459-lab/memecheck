// Accuracy-study tracker (replaces the old operator-box evidence job that stopped on 2026-10-18).
// Runs inside memecheck-warmer (Workers Free has no spare cron slot): minute 7 = SCAN, minute 37 = RECHECK.
// State: ONE KV key `study:v2` = { updated, records: [...] } -> 2 KV writes/hour (48/day), inside the shared write budget.
// SCAN    : DexScreener boosts/profiles (+ GeckoTerminal when not 429) -> DexScreener batch -> entry criteria
//           (mcap >= $30K, liq >= $5K, age < 24h, not already down >= 50% from peak, live PumpSwap/Raydium/Meteora pool)
//           -> MemeCheckShield core score (analyze()).
// RECHECK : records past 24h / 48h get their outcome from GeckoTerminal OHLCV (study-outcome.js). Nothing is invented:
//           missing candles = 'nodata'.
import { analyze } from '../../cf-dist/core.js';
import { outcome } from '../../cf-dist/study-outcome.js';
import { guardedPut } from '../../cf-dist/functions/_lib/shared.js';
const KEY = 'study:v2', MAX_RECORDS = 4000, SCAN_MAX = 6, RECHECK_MAX = 18;
const GT = 'https://api.geckoterminal.com/api/v2/networks/solana';
const H = { accept: 'application/json', 'user-agent': 'memecheck-tracker/1.0 (+https://memecheck.pages.dev)' };
const j = async (u, retry = 1) => {
  const r = await fetch(u, { headers: H });
  if (r.status === 429 && retry) { await new Promise(ok => setTimeout(ok, 1200)); return j(u, retry - 1); }
  if (!r.ok) throw new Error(new URL(u).hostname + ' ' + r.status);
  return r.json();
};
async function load(KV) { return (await KV.get(KEY, 'json').catch(() => null)) || { updated: null, records: [] }; }
async function save(KV, db) { db.updated = new Date().toISOString(); db.records = db.records.slice(-MAX_RECORDS); return guardedPut(KV, KEY, JSON.stringify(db), {}, 'pages'); }

async function discoverCas(log) {
  const out = new Set();
  // Primary: DexScreener (reliable from CF egress; GT often 429s Workers IPs)
  for (const u of [
    'https://api.dexscreener.com/token-boosts/latest/v1',
    'https://api.dexscreener.com/token-boosts/top/v1',
    'https://api.dexscreener.com/token-profiles/latest/v1',
  ]) {
    try {
      const a = await j(u);
      for (const x of a || []) if (x.chainId === 'solana' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x.tokenAddress || '')) out.add(x.tokenAddress);
    } catch (e) { log.push('ds ' + String(e?.message || e).slice(0, 40)); }
  }
  // Secondary: GeckoTerminal (skip quietly on 429)
  for (const u of [`${GT}/trending_pools?duration=1h&page=1`, `${GT}/trending_pools?duration=6h&page=1`, `${GT}/new_pools?page=1`]) {
    try {
      const data = (await j(u)).data || [];
      for (const p of data) {
        const ca = String(p.relationships?.base_token?.data?.id || '').replace(/^solana_/, '');
        if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ca)) out.add(ca);
      }
    } catch (e) { log.push('gt ' + String(e?.message || e).slice(0, 40)); }
  }
  return [...out];
}

export async function trackerScan(env, log) {
  const KV = env.MEMECHECK_CACHE, db = await load(KV), have = new Set(db.records.map(r => r.ca));
  const found = await discoverCas(log);
  const cas = found.filter(ca => !have.has(ca)).slice(0, 30);
  log.push(`feeds found=${found.length} new=${cas.length}`);
  if (!cas.length) {
    if (!db.updated) log.push('tracker scan: no new kv=' + await save(KV, db));
    else log.push('tracker scan: no new');
    return;
  }
  // DexScreener tokens batch (up to ~30)
  let ds = [];
  try { ds = await j(`https://api.dexscreener.com/tokens/v1/solana/${cas.join(',')}`); }
  catch (e) { log.push('ds tokens ' + String(e?.message || e).slice(0, 40)); if (!db.updated) await save(KV, db); return; }
  const best = new Map(); for (const p of ds || []) { const ca = p.baseToken?.address; if (!ca) continue; const o = best.get(ca); if (!o || (p.liquidity?.usd || 0) > (o.liquidity?.usd || 0)) best.set(ca, p); }
  const now = Date.now(), cand = [...best.values()].filter(p => {
    const age = (now - (p.pairCreatedAt || 0)) / 36e5, mc = p.marketCap || p.fdv || 0, liq = p.liquidity?.usd || 0;
    const ch = [p.priceChange?.m5, p.priceChange?.h1, p.priceChange?.h6, p.priceChange?.h24].filter(x => x != null).map(c => 1 / (1 + c / 100));
    const drop = (1 - 1 / Math.max(1, ...ch)) * 100;
    return mc >= 30000 && liq >= 5000 && age < 24 && drop < 50 && /pumpswap|raydium|meteora|orca/i.test(p.dexId || '');
  }).slice(0, SCAN_MAX);
  let added = 0;
  for (const p of cand) {
    try {
      const r = await analyze(p.baseToken.address, 'solana');
      if (!r?.verdict || r.verdict.level === 'unknown' || r.sources?.DexScreener !== 'ok') continue;
      db.records.push({ ca: r.addr, sym: '$' + String(r.meta?.symbol || p.baseToken.symbol || '?').slice(0, 24), scanned: new Date().toISOString(), level: r.verdict.level, pts: r.verdict.points,
        pump: !!r.meta?.pump, pool: p.pairAddress, mcap: Math.round(p.marketCap || p.fdv || 0), liq: Math.round(p.liquidity?.usd || 0), ageH: +((now - p.pairCreatedAt) / 36e5).toFixed(2),
        reasons: (r.findings || []).filter(f => f.status === 'fail' || f.status === 'warn').map(f => f.status + ':' + f.id).slice(0, 8), o24: { st: 'pending' }, o48: { st: 'pending' } });
      added++;
    } catch (e) { log.push('scan err ' + String(e?.message || e).slice(0, 40)); }
  }
  if (added || !db.updated) log.push(`tracker scan +${added} kv=${await save(KV, db)}`);
  else log.push('tracker scan: 0 eligible');
}

export async function trackerRecheck(env, log) {
  const KV = env.MEMECHECK_CACHE, db = await load(KV), now = Date.now() / 1000;
  const due = db.records.filter(r => r.pool && ['o24', 'o48'].some(k => r[k]?.st === 'pending' && now >= Date.parse(r.scanned) / 1000 + (k === 'o24' ? 24 : 48) * 3600 + 600)).slice(0, RECHECK_MAX);
  let n = 0;
  const liqNow = new Map();
  for (let i = 0; i < due.length; i += 30) { try { const ps = await j(`https://api.dexscreener.com/tokens/v1/solana/${due.slice(i, i + 30).map(r => r.ca).join(',')}`); for (const p of ps || []) if (p.pairAddress) liqNow.set(p.pairAddress, p.liquidity?.usd ?? 0); } catch {} }
  for (const r of due) {
    try {
      const ts = Date.parse(r.scanned) / 1000;
      const o = await j(`${GT}/pools/${r.pool}/ohlcv/minute?aggregate=15&before_timestamp=${Math.floor(ts + 49 * 3600)}&limit=1000&currency=usd&token=${r.ca}`);
      const c = o?.data?.attributes?.ohlcv_list || [];
      const liq = { liq0: r.liq || 0, liqNow: liqNow.has(r.pool) ? liqNow.get(r.pool) : null, gone: !liqNow.has(r.pool) && liqNow.size > 0 };
      for (const k of ['o24', 'o48']) if (r[k]?.st === 'pending' && now >= ts + (k === 'o24' ? 24 : 48) * 3600) r[k] = { ...outcome(c, ts, k === 'o24' ? 24 : 48, now, liq), at: new Date().toISOString() };
      n++;
    } catch (e) { if (/ 404/.test(e.message)) { r.o24 = r.o24?.st === 'pending' ? { st: 'nodata' } : r.o24; r.o48 = r.o48?.st === 'pending' ? { st: 'nodata' } : r.o48; n++; } }
  }
  if (n) log.push(`tracker recheck ${n} kv=${await save(KV, db)}`); else log.push('tracker recheck: none due');
}
