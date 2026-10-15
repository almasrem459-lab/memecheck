// MemeCheck core: data fetching + scoring. Works in browser and Node 18+ (global fetch).
export const EVM_CHAINS = { ethereum: { id: 1, ds: 'ethereum' }, base: { id: 8453, ds: 'base' }, bsc: { id: 56, ds: 'bsc' } };

export function detectChain(addr) {
  addr = (addr || '').trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return 'evm';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return 'solana';
  return null;
}

// Proxy fallback: if a direct (CORS) fetch fails in the browser, retry via /api/proxy. Whole attempt is capped at `ms`.
export async function getJSON(url, ms = 6000) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; const timer = setTimeout(() => ctl?.abort(), ms);
  const tryFetch = async (u) => { const r = await fetch(u, { headers: { accept: 'application/json' }, signal: ctl?.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  try { return await tryFetch(url); }
  catch (e) {
    if (typeof window !== 'undefined' && location.protocol.startsWith('http') && !ctl?.signal.aborted && !/HTTP 4\d\d/.test(e.message)) {
      try { return await tryFetch('/api/proxy?url=' + encodeURIComponent(url)); } catch (_) {}
    }
    throw e;
  } finally { clearTimeout(timer); }
}
// Shared per-session caches so other modules (bubble map) reuse the same reports instead of refetching.
const memo = new Map();
export function cached(url, ms) { if (!memo.has(url)) { const p = getJSON(url, ms); memo.set(url, p); p.catch(() => memo.delete(url)); setTimeout(() => memo.delete(url), 120000); } return memo.get(url); }
export const rugReport = (mint) => cached(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, 6000);
export const dexTokens = (addr) => cached(`https://api.dexscreener.com/latest/dex/tokens/${addr}`, 8000);
// Pair picker -> [main live pair, ...other sane pairs]. Rules:
//  1. only pairs whose base token is the scanned token (when `addr` is given) with a price;
//  2. launchpad bonding-curve pairs (pump.fun etc., no liquidity field) are dropped once the coin has a real pool
//     (graduated: a pool with >= $1K liquidity, or the curve has gone quiet while a pool trades) - DexScreener keeps the
//     frozen pre-graduation curve price (~$43K mcap) there forever;
//  3. if any pair reports liquidity, pairs with no/zero liquidity are dropped;
//  4. junk filter (fake liquidity with ~no volume, absurd changes) and outliers vs the LIQUIDITY-WEIGHTED median price
//     (stale tiny pools can't drag the reference);
//  5. sort: highest liquidity, then recent activity (h6 txns), then 24h volume.
export const CURVE_DEX = /^(pumpfun|pump\.fun|moonshot|launchlab|letsbonk|bonkfun|boop|believe|heaven|jupstudio|daosfun)$/i;
const liqOf = (p) => +p?.liquidity?.usd || 0;
const txOf = (p, k) => (p?.txns?.[k]?.buys || 0) + (p?.txns?.[k]?.sells || 0);
export const isCurve = (p) => CURVE_DEX.test(p?.dexId || '') && !liqOf(p);
export function sanePairs(pairs, addr) {
  let ps = (pairs || []).filter(p => +p.priceUsd > 0);
  if (addr) { const a = String(addr).toLowerCase(), own = ps.filter(p => (p.baseToken?.address || '').toLowerCase() === a); if (own.length) ps = own; }
  if (ps.length < 2) return ps;
  const pools = ps.filter(p => !isCurve(p) && liqOf(p) > 0);
  if (pools.length) {
    const curves = ps.filter(isCurve);
    const graduated = pools.some(p => liqOf(p) >= 1000) || curves.every(c => txOf(c, 'h6') === 0 && pools.some(p => txOf(p, 'h24') > 0));
    ps = graduated || !curves.length ? pools : curves; // pre-graduation: the curve is the market, ignore stray tiny pools
  }
  if (ps.length < 2) return ps;
  const junk = (p) => { const liq = liqOf(p), vol = p.volume?.h24 || 0, ch = Math.abs(p.priceChange?.h24 || 0); return (liq > 100000 && vol < liq * 1e-4) || (ch > 5000 && vol < 1000); };
  const clean = ps.filter(p => !junk(p)); const ref = clean.length ? clean : ps;
  // liquidity-weighted median price (falls back to plain median when nothing reports liquidity)
  const w = ref.map(p => ({ x: +p.priceUsd, w: liqOf(p) || (ref.some(liqOf) ? 0 : 1) })).sort((a, b) => a.x - b.x);
  const tot = w.reduce((s, o) => s + o.w, 0); let acc = 0, med = w[w.length - 1].x;
  for (const o of w) { acc += o.w; if (acc >= tot / 2) { med = o.x; break; } }
  const ok = ref.filter(p => { const x = +p.priceUsd / med; return x > 0.5 && x < 2; });
  return (ok.length ? ok : ref).sort((a, b) => liqOf(b) - liqOf(a) || txOf(b, 'h6') - txOf(a, 'h6') || (b.volume?.h24 || 0) - (a.volume?.h24 || 0));
}
const num = (v) => (v === undefined || v === null || v === '' || isNaN(+v)) ? null : +v;

// finding: {id, status: pass|warn|fail|na, weight, critical, params}
function F(id, status, weight, params = {}, critical = false) { return { id, status, weight, params, critical: critical && status === 'fail' }; }

function marketFindings(ds, chainKey, addr) {
  const out = []; const m = {};
  const pairs = (ds?.pairs || []).filter(p => !chainKey || p.chainId === chainKey);
  if (!pairs.length) { out.push(F('noPairs', 'na', 0)); return { out, m }; }
  const good = sanePairs(pairs, addr); const p = good[0];
  const liq = good.reduce((s, x) => s + (x.liquidity?.usd || 0), 0);
  Object.assign(m, {
    name: p.baseToken?.name, symbol: p.baseToken?.symbol, priceUsd: num(p.priceUsd), mcap: num(p.marketCap), fdv: num(p.fdv), liquidity: liq,
    vol24: num(p.volume?.h24), buys24: p.txns?.h24?.buys, sells24: p.txns?.h24?.sells,
    ch: { m5: num(p.priceChange?.m5), h1: num(p.priceChange?.h1), h6: num(p.priceChange?.h6), h24: num(p.priceChange?.h24) },
    created: p.pairCreatedAt, dex: p.dexId, url: p.url, image: p.info?.imageUrl, pairs: good.length, pairAddr: p.pairAddress,
  });
  out.push(liq < 5000 ? F('liquidity', 'fail', 20, { v: liq }) : liq < 20000 ? F('liquidity', 'warn', 15, { v: liq }) : F('liquidity', 'pass', 15, { v: liq }));
  if (m.created) {
    const h = (Date.now() - m.created) / 3.6e6;
    out.push(h < 24 ? F('age', 'warn', 8, { h }) : F('age', 'pass', 8, { h }));
  } else out.push(F('age', 'na', 0));
  // 24h high-drop approximation (from the LIVE main pair): the lowest point implied by m5/h1/h6/h24 changes relative to the max implied earlier price.
  const pts = [0, m.ch.m5, m.ch.h1, m.ch.h6, m.ch.h24].filter(x => x !== null).map(c => 1 / (1 + c / 100)); // price ratio (then/now)
  const maxRatio = Math.max(...pts, 1); let drop = (1 - 1 / maxRatio) * 100, grad = null;
  // Recently graduated launchpad coin: the frozen bonding-curve price is a real earlier price (the graduation price),
  // so it is a lower bound for the recent high. Only used while the main pool is < 72 h old.
  const curve = pairs.filter(x => isCurve(x) && +x.priceUsd > 0 && (!addr || (x.baseToken?.address || '').toLowerCase() === String(addr).toLowerCase())).sort((a, b) => +b.priceUsd - +a.priceUsd)[0];
  if (curve && p !== curve && !isCurve(p) && m.priceUsd > 0 && m.created && Date.now() - m.created < 72 * 36e5) {
    const g = (1 - m.priceUsd / +curve.priceUsd) * 100; if (g > drop) { drop = g; grad = +curve.priceUsd; }
  }
  m.dropFromHigh = drop; if (grad) m.gradPrice = grad;
  const dp = { v: drop, ...(grad ? { grad } : {}), ...(drop >= 90 ? { crash: 1 } : {}) };
  out.push(drop >= 90 ? F('drop', 'fail', 20, dp) : drop > 50 ? F('drop', 'fail', 12, dp) : drop > 30 ? F('drop', 'warn', 12, dp) : F('drop', 'pass', 12, dp));
  const b = m.buys24 || 0, s = m.sells24 || 0;
  if (b + s > 0) { const r = s / (b + s); out.push(r > 0.65 ? F('pressure', 'warn', 5, { b, s }) : F('pressure', 'pass', 5, { b, s })); }
  if (m.vol24 !== null && liq > 0) out.push(m.vol24 < 1000 ? F('volume', 'warn', 5, { v: m.vol24 }) : F('volume', 'pass', 5, { v: m.vol24 }));
  return { out, m };
}

function solanaFindings(r) {
  const out = []; const extra = {};
  out.push(r.mintAuthority ? F('mintAuth', 'fail', 40, {}, true) : F('mintAuth', 'pass', 40));
  out.push(r.freezeAuthority ? F('freezeAuth', 'fail', 40, {}, true) : F('freezeAuth', 'pass', 40));
  const markets = r.markets || [];
  if (markets.length) {
    const best = markets.reduce((a, x) => ((x.lp?.quoteUSD || 0) + (x.lp?.baseUSD || 0)) > ((a.lp?.quoteUSD || 0) + (a.lp?.baseUSD || 0)) ? x : a, markets[0]);
    const lp = num(best.lp?.lpLockedPct); const mt = best.marketType || '';
    const isPumpAmm = /pump/i.test(mt) || r.launchpad?.platform === 'pump_fun' || /pump$/.test(r.mint || '');
    const conc = /clmm|whirlpool|dlmm|concentrated/i.test(mt);
    if (isPumpAmm && (lp === null || lp >= 0)) out.push(F('lpLocked', 'pass', 15, { v: lp ?? 100, pump: 1 }));   // pump.fun AMM LP is burned at migration
    else if (lp === null) out.push(F('lpLocked', 'na', 0, { unk: 1 }));
    else if (lp >= 90) out.push(F('lpLocked', 'pass', 15, { v: lp }));
    else if (conc) out.push(F('lpLocked', 'warn', 15, { v: lp, v3: 1 }));
    else out.push(F('lpLocked', lp >= 50 ? 'warn' : 'fail', 15, { v: lp }));
  } else out.push(F('lpLocked', 'na', 0, { unk: 1 }));
  // top holders excluding pools/known AMM accounts
  const poolOwners = new Set(); markets.forEach(mk => { poolOwners.add(mk.pubkey); if (mk.liquidityA) poolOwners.add(mk.liquidityA); if (mk.liquidityB) poolOwners.add(mk.liquidityB); });
  const known = r.knownAccounts || {};
  const holders = (r.topHolders || []).filter(h => !poolOwners.has(h.owner) && !poolOwners.has(h.address) && !(known[h.owner]?.type === 'AMM'));
  if (r.topHolders) {
    const top10 = holders.slice(0, 10).reduce((s, h) => s + (h.pct || 0), 0); const top1 = holders[0]?.pct || 0;
    extra.top10 = top10; extra.holders = holders.slice(0, 10);
    out.push(top10 > 50 ? F('top10', 'fail', 15, { v: top10 }) : top10 > 30 ? F('top10', 'warn', 15, { v: top10 }) : F('top10', 'pass', 15, { v: top10 }));
    out.push(top1 > 10 ? F('top1', 'warn', 8, { v: top1 }) : F('top1', 'pass', 8, { v: top1 }));
  } else out.push(F('top10', 'na', 0));
  const ins = num(r.graphInsidersDetected) || 0;
  const nets = r.insiderNetworks || [];
  const supply = r.token?.supply || 0;
  const netPct = supply ? nets.reduce((s, n) => s + (n.currentHolding || 0), 0) / supply * 100 : null;
  extra.insiderPct = netPct;
  if (r.graphInsidersDetected === undefined && !r.insiderNetworks) out.push(F('insiders', 'na', 0));
  else if (ins === 0 && !nets.length) out.push(F('insiders', 'pass', 15, { n: 0 }));
  else out.push((netPct !== null && netPct > 10) || ins >= 10 ? F('insiders', 'fail', 15, { n: ins, nets: nets.length, pct: netPct }) : F('insiders', 'warn', 15, { n: ins, nets: nets.length, pct: netPct }));
  const cpct = supply && r.creatorBalance ? r.creatorBalance / supply * 100 : 0;
  out.push(cpct > 5 ? F('creator', 'warn', 8, { v: cpct }) : F('creator', 'pass', 8, { v: cpct }));
  if (r.tokenMeta) out.push(r.tokenMeta.mutable ? F('mutable', 'warn', 4) : F('mutable', 'pass', 4));
  const tf = num(r.transferFee?.pct) || 0;
  out.push(tf > 10 ? F('tax', 'fail', 20, { b: tf, s: tf }) : tf > 0 ? F('tax', 'warn', 20, { b: tf, s: tf }) : F('tax', 'pass', 20, { b: 0, s: 0 }));
  if (r.rugged) out.push(F('rugged', 'fail', 50, {}, true));
  (r.risks || []).forEach(k => extra.flags = [...(extra.flags || []), { name: k.name, desc: k.description, level: k.level }]);
  const danger = (r.risks || []).filter(k => k.level === 'danger').length;
  out.push(danger ? F('rcFlags', 'warn', 8, { n: (r.risks || []).length, d: danger }) : F('rcFlags', 'pass', 8, { n: (r.risks || []).length, d: 0 }));
  return { out, extra };
}

function goplusFindings(g, addr) {
  const out = []; const extra = {};
  const b = (k) => g[k] === '1' ? true : g[k] === '0' ? false : null;
  const add = (id, v, w, crit = false, warnOnly = false) => out.push(v === null ? F(id, 'na', 0) : v ? F(id, warnOnly ? 'warn' : 'fail', w, {}, crit) : F(id, 'pass', w));
  add('gpHoneypot', b('is_honeypot') || (b('cannot_sell_all') ? true : b('is_honeypot')), 50, true);
  const bt = num(g.buy_tax), st = num(g.sell_tax);
  if (bt === null && st === null) out.push(F('tax', 'na', 0));
  else { const mx = Math.max(bt || 0, st || 0) * 100; out.push(mx > 50 ? F('tax', 'fail', 25, { b: (bt || 0) * 100, s: (st || 0) * 100 }, true) : mx > 10 ? F('tax', 'fail', 20, { b: (bt || 0) * 100, s: (st || 0) * 100 }) : mx > 5 ? F('tax', 'warn', 20, { b: (bt || 0) * 100, s: (st || 0) * 100 }) : F('tax', 'pass', 20, { b: (bt || 0) * 100, s: (st || 0) * 100 })); }
  const owner = (g.owner_address || '').toLowerCase();
  const renounced = !owner || /^0x0{40}$/.test(owner) || owner === '0x000000000000000000000000000000000000dead';
  out.push(g.owner_address === undefined ? F('renounced', 'na', 0) : renounced ? F('renounced', 'pass', 10) : F('renounced', 'warn', 10));
  add('mintable', b('is_mintable'), 25, false);
  add('blacklist', b('is_blacklisted'), 10, false, true);
  add('hiddenOwner', b('hidden_owner'), 20);
  add('takeBack', b('can_take_back_ownership'), 15);
  add('openSource', b('is_open_source') === null ? null : !b('is_open_source'), 15);
  add('proxy', b('is_proxy'), 6, false, true);
  add('slippageMod', b('slippage_modifiable'), 12, false, true);
  add('tradingCooldown', b('trading_cooldown'), 4, false, true);
  // LP locked
  const lps = g.lp_holders || [];
  if (lps.length) {
    const self = (addr || '').toLowerCase(); // LP held by the token contract itself (e.g. PEPE) or a burn address cannot be withdrawn
    const locked = Math.min(100, lps.reduce((s, h) => s + ((h.is_locked === 1 || /^0x0{40}$|dead$/i.test(h.address) || h.address?.toLowerCase() === self || /burn|null|dead/i.test(h.tag || '')) ? +h.percent : 0), 0) * 100);
    const v3 = (g.dex || []).every(d => /V3|V4/i.test(d.liquidity_type || d.name || ''));
    out.push(locked >= 90 ? F('lpLocked', 'pass', 15, { v: locked }) : locked >= 50 || v3 ? F('lpLocked', 'warn', 15, { v: locked, v3: v3 ? 1 : 0 }) : F('lpLocked', 'fail', 15, { v: locked }));
  } else out.push(F('lpLocked', 'na', 0, { unk: 1 }));
  const hs = (g.holders || []).filter(h => !h.is_contract && !h.is_locked && !/^0x0{40}$|dead$/i.test(h.address));
  if (g.holders) {
    const top10 = hs.slice(0, 10).reduce((s, h) => s + +h.percent, 0) * 100; extra.top10 = top10;
    extra.holders = hs.slice(0, 10).map(h => ({ owner: h.address, pct: +h.percent * 100 }));
    out.push(top10 > 50 ? F('top10', 'fail', 15, { v: top10 }) : top10 > 30 ? F('top10', 'warn', 15, { v: top10 }) : F('top10', 'pass', 15, { v: top10 }));
  } else out.push(F('top10', 'na', 0));
  const cp = num(g.creator_percent); if (cp !== null) out.push(cp * 100 > 5 ? F('creator', 'warn', 8, { v: cp * 100 }) : F('creator', 'pass', 8, { v: cp * 100 }));
  if (b('honeypot_with_same_creator')) out.push(F('serialScammer', 'fail', 20));
  return { out, extra };
}

function honeypotIsFindings(h) {
  const out = [];
  const hp = h.honeypotResult?.isHoneypot;
  if (hp === undefined) out.push(F('hpIs', 'na', 0, { reason: h.summary?.risk || '' }));
  else out.push(hp ? F('hpIs', 'fail', 50, { reason: h.honeypotResult?.honeypotReason || '' }, true) : F('hpIs', 'pass', 50));
  const st = num(h.simulationResult?.sellTax); const bt = num(h.simulationResult?.buyTax);
  if (st !== null) out.push(Math.max(st, bt || 0) > 10 ? F('hpTax', 'fail', 15, { b: bt || 0, s: st }) : Math.max(st, bt || 0) > 5 ? F('hpTax', 'warn', 15, { b: bt || 0, s: st }) : F('hpTax', 'pass', 15, { b: bt || 0, s: st }));
  const sum = h.summary || {};
  if (sum.riskLevel !== undefined) out.push(sum.riskLevel >= 60 ? F('hpRisk', 'fail', 10, { v: sum.risk }) : sum.riskLevel >= 20 ? F('hpRisk', 'warn', 10, { v: sum.risk }) : F('hpRisk', 'pass', 10, { v: sum.risk }));
  return { out, flags: (sum.flags || []).map(f => ({ name: f.flag, desc: f.description, level: f.severity })) };
}

export function score(findings) {
  const considered = findings.filter(f => f.status !== 'na');
  let pts = 0, max = 0;
  considered.forEach(f => { max += f.weight; if (f.status === 'fail') pts += f.weight; if (f.status === 'warn') pts += f.weight / 2; });
  const critical = findings.some(f => f.critical);
  // Additive risk points: fail = full weight, warn = half weight. Any critical fail => Extreme.
  const pct = pts;
  let level = critical ? 'extreme' : pts >= 40 ? 'high' : pts >= 15 ? 'medium' : 'low';
  if (!considered.length) level = 'unknown';
  return { level, points: Math.round(pct), critical };
}

// Fallback Solana contract checks straight from the chain (via /api/rpc) when RugCheck fails/times out:
// mint & freeze authority, Token-2022 transfer fee, top holders (pool vaults excluded via DexScreener pair addresses + AMM authorities).
const AMM_AUTH = new Set(['5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', 'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL', 'WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh']);
async function solRpc(mint, ds) {
  if (typeof window === 'undefined' || !location.protocol.startsWith('http')) throw new Error('no relay');
  const call = async (body) => { const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 8000);
    try { const r = await fetch('/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal }); if (!r.ok) throw new Error('rpc ' + r.status); return r.json(); } finally { clearTimeout(tm); } };
  let [acc, big] = await call([{ jsonrpc: '2.0', id: 0, method: 'getMultipleAccounts', params: [[mint], { encoding: 'jsonParsed' }] }, { jsonrpc: '2.0', id: 1, method: 'getTokenLargestAccounts', params: [mint] }]).then(a => [a.find(x => x.id === 0)?.result, a.find(x => x.id === 1)?.result]);
  if (!big) big = await call([{ jsonrpc: '2.0', id: 1, method: 'getTokenLargestAccounts', params: [mint] }]).then(a => a[0]?.result).catch(() => null); // flaky upstream: one retry
  const info = acc?.value?.[0]?.data?.parsed?.info; if (!info) throw new Error('no mint');
  const out = []; const supply = +info.supply / 10 ** info.decimals;
  out.push(info.mintAuthority ? F('mintAuth', 'fail', 40, {}, true) : F('mintAuth', 'pass', 40));
  out.push(info.freezeAuthority ? F('freezeAuth', 'fail', 40, {}, true) : F('freezeAuth', 'pass', 40));
  const fee = (info.extensions || []).find(e => e.extension === 'transferFeeConfig'); const bps = fee ? +(fee.state?.newerTransferFee?.transferFeeBasisPoints ?? 0) / 100 : 0;
  out.push(bps > 10 ? F('tax', 'fail', 20, { b: bps, s: bps }) : bps > 0 ? F('tax', 'warn', 20, { b: bps, s: bps }) : F('tax', 'pass', 20, { b: 0, s: 0 }));
  const extra = {};
  if (big?.value?.length && supply > 0) {
    const own = await call([{ jsonrpc: '2.0', id: 0, method: 'getMultipleAccounts', params: [big.value.map(a => a.address), { encoding: 'jsonParsed' }] }]).then(a => a[0]?.result).catch(() => null);
    const pools = new Set([...(ds?.pairs || []).map(p => p.pairAddress), ...AMM_AUTH]);
    const hs = big.value.map((a, i) => ({ owner: own?.value?.[i]?.data?.parsed?.info?.owner || a.address, pct: +a.uiAmount / supply * 100 })).filter(h => !pools.has(h.owner) && h.owner !== '1nc1nerator11111111111111111111111111111111');
    const top10 = hs.slice(0, 10).reduce((x, h) => x + h.pct, 0), top1 = hs[0]?.pct || 0; extra.holders = hs.slice(0, 10); extra.top10 = top10;
    out.push(top10 > 50 ? F('top10', 'fail', 15, { v: top10 }) : top10 > 30 ? F('top10', 'warn', 15, { v: top10 }) : F('top10', 'pass', 15, { v: top10 }));
    out.push(top1 > 10 ? F('top1', 'warn', 8, { v: top1 }) : F('top1', 'pass', 8, { v: top1 }));
  } else out.push(F('top10', 'na', 0));
  return { out, extra };
}
// Streaming analysis: onUpdate(partialResult) is called as soon as DexScreener arrives and again when each security source settles.
// Every source has its own short timeout so a slow/failing one (e.g. RugCheck 400) never blocks the result.
export async function analyze(addr, evmChain = 'auto', onUpdate = () => {}) {
  addr = addr.trim();
  const kind = detectChain(addr);
  if (!kind) throw new Error('invalid');
  const sources = {}; const pend = new Set();
  const run = async (name, p) => { pend.add(name); try { const j = await p; sources[name] = 'ok'; return j; } catch (e) { sources[name] = 'fail'; return null; } finally { pend.delete(name); } };
  const dsP = run('DexScreener', dexTokens(addr));
  let chainKey = 'solana', id = null;
  if (kind === 'evm') {
    if (!EVM_CHAINS[evmChain]) { // auto-detect: the chain (eth/bsc/base) of the most liquid sane pair
      const ds0 = await dsP; const ps = sanePairs((ds0?.pairs || []).filter(p => ['ethereum', 'bsc', 'base'].includes(p.chainId)), addr);
      evmChain = ps[0]?.chainId || 'ethereum';
    }
    chainKey = EVM_CHAINS[evmChain].ds; id = EVM_CHAINS[evmChain].id;
  }
  const secs = kind === 'solana' ? { RugCheck: run('RugCheck', rugReport(addr)) }
    : { GoPlus: run('GoPlus', getJSON(`https://api.gopluslabs.io/api/v1/token_security/${id}?contract_addresses=${addr}`, 6000)), 'honeypot.is': run('honeypot.is', getJSON(`https://api.honeypot.is/v2/IsHoneypot?address=${addr}&chainID=${id}`, 6000)) };
  const got = {}; let ds;
  const build = () => {
    const findings = []; let meta = {}, extra = {}, flags = [];
    if (ds) { const r = marketFindings(ds, chainKey, addr); findings.push(...r.out); meta = r.m; } else if (!pend.has('DexScreener')) findings.push(F('srcDex', 'na', 0));
    if (kind === 'solana') {
      const a = got.RugCheck;
      if (a && a.mint) { const r = solanaFindings(a); findings.push(...r.out); extra = r.extra; flags = r.extra.flags || []; meta.name ||= a.tokenMeta?.name; meta.symbol ||= a.tokenMeta?.symbol; meta.totalHolders = a.totalHolders; meta.pump = !!(a.launchpad?.platform === 'pump_fun' || /pump$/.test(addr)); }
      else if (!pend.has('RugCheck')) { sources.RugCheck = 'fail'; findings.push(F(got.rpc ? 'srcRugRpc' : 'srcRug', 'na', 0));
        if (got.rpc) { findings.push(...got.rpc.out); extra = got.rpc.extra; findings.push(F('lpLocked', 'na', 0, { unk: 1 })); } }
    } else {
      const a = got.GoPlus, b = got['honeypot.is'];
      const g = a?.result?.[addr.toLowerCase()];
      if (g && Object.keys(g).length) { const r = goplusFindings(g, addr); findings.push(...r.out); extra = r.extra; meta.name ||= g.token_name; meta.symbol ||= g.token_symbol; meta.totalHolders = num(g.holder_count); }
      else if (!pend.has('GoPlus')) { sources.GoPlus = a ? 'empty' : 'fail'; findings.push(F('srcGoplus', 'na', 0)); }
      if (b && (b.honeypotResult || b.summary)) { const r = honeypotIsFindings(b); findings.push(...r.out); flags = r.flags; }
      else if (!pend.has('honeypot.is')) { sources['honeypot.is'] = b ? 'empty' : 'fail'; findings.push(F('srcHp', 'na', 0)); }
    }
    // Old, deep-liquidity tokens: an unlocked/unknown LP is not a rug signal on its own -> neutral note instead of a FAIL.
    const ageD = meta.created ? (Date.now() - meta.created) / 864e5 : 0;
    findings.forEach((f, i) => { if (f.id === 'lpLocked' && (f.status === 'fail' || f.status === 'warn') && ageD > 365 && (meta.liquidity || 0) > 1e6) findings[i] = F('lpLocked', 'na', 0, { ...f.params, old: 1 }); });
    const v = score(findings);
    const secOk = kind === 'solana' ? (sources.RugCheck === 'ok' || sources['Solana RPC'] === 'ok') : (sources.GoPlus === 'ok' || sources['honeypot.is'] === 'ok');
    if (!secOk && v.level === 'low') v.level = 'unknown'; // never call a token "Low risk" from market data alone
    return { addr, kind, chain: chainKey, meta, extra, flags, findings, sources: { ...sources }, pending: [...pend], partial: pend.size > 0, verdict: v };
  };
  ds = await dsP; onUpdate(build());
  await Promise.all(Object.entries(secs).map(([k, p]) => p.then(async v => {
    got[k] = v;
    if (k === 'RugCheck' && !v?.mint) { onUpdate(build()); got.rpc = await run('Solana RPC', solRpc(addr, ds)); }
    onUpdate(build()); })));
  return build();
}
