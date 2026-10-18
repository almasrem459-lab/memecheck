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
export const CURVE_DEX = /^(pumpfun|pump\.fun|moonshot|launchlab|letsbonk|bonkfun|boop|believe|heaven|jupstudio|daosfun|fourmeme|four\.meme)$/i;
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
    txns: p.txns || null, volw: p.volume || null, // per-window buys/sells counts + volume (Buy / Sell pressure card)
    ch: { m5: num(p.priceChange?.m5), h1: num(p.priceChange?.h1), h6: num(p.priceChange?.h6), h24: num(p.priceChange?.h24) },
    created: p.pairCreatedAt, dex: p.dexId, url: p.url, image: p.info?.imageUrl, pairs: good.length, pairAddr: p.pairAddress,
  });
  if (chainKey === 'bsc' && isCurve(p)) out.push(F('liquidity', 'warn', 15, { v: liq, curve: 1 })); // Four.meme bonding curve: no DEX pool yet (Solana curves keep their existing rule)
  else out.push(liq < 5000 ? F('liquidity', 'fail', 20, { v: liq }) : liq < 20000 ? F('liquidity', 'warn', 15, { v: liq }) : F('liquidity', 'pass', 15, { v: liq }));
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

// ---- EVM (BNB Chain / Ethereum / Base) contract + holder checks: the ONE place that scores EVM security data ----
// Inputs: g = GoPlus token_security record, h = Honeypot.is IsHoneypot answer, four = Four.meme token info (BSC),
// launch = Four.meme detection (see fourMemeInfo). Liquidity, pair age, drop, pressure and volume come from the shared
// marketFindings (same rules on every chain). Weights are risk points: FAIL = full weight, WARN = half (see score()).
//   honeypot          FAIL 50 critical  GoPlus is_honeypot / cannot_sell_all, or Honeypot.is simulation says honeypot
//   cannotBuy         FAIL 20           GoPlus cannot_buy
//   tax               FAIL 25 critical > 50%; FAIL 20 > 10%; WARN (20) > 5%   max of GoPlus and simulated buy/sell tax
//   slippageMod       WARN (12)         owner can change taxes (slippage_modifiable / personal_slippage_modifiable)
//   mintable          FAIL 25           owner can mint
//   hiddenOwner       FAIL 20
//   takeBack          FAIL 15           ownership can be reclaimed
//   openSource        FAIL 15           source not verified (GoPlus or Honeypot.is contractCode)
//   proxy             WARN (6)          upgradeable proxy
//   blacklist         WARN (10)
//   pausable          WARN (10)         transfers can be paused
//   tradingCooldown   WARN (4)
//   renounced         WARN (10)         owner still active (Four.meme launch contract on the curve = pass)
//   serialScammer     FAIL 20           same creator deployed honeypots before
//   lpLocked          >= 90% PASS; 50-90% or V3/V4-only WARN; < 50% FAIL (15); bonding curve = N/A
//   top10             > 50% FAIL 15; > 30% WARN   (contracts, lockers, burn addresses excluded)
//   creator           creator/owner wallet holds > 20% FAIL 8; > 5% WARN (8)
//   hpRisk            Honeypot.is risk rating >= 60 FAIL 10; >= 20 WARN (10)
const FOUR_MANAGERS = new Set(['0x5c952063c7fc8610ffdb798152d69f0b9550762b', '0xec4549cadce5da21df6e6422d448034b5233bfbc']); // Four.meme TokenManager2 / V1
const DEAD = /^0x0{40}$|^0x0{36}dead$/i;
export function fourMemeInfo({ chain, addr, ds, g, four }) {
  if (chain !== 'bsc') return null;
  const pairs = (ds?.pairs || []).filter(p => p.chainId === 'bsc' && (p.baseToken?.address || '').toLowerCase() === String(addr).toLowerCase());
  const dsCurve = pairs.find(p => /^four/i.test(p.dexId || ''));
  const gp = g?.launchpad_token?.is_launchpad_token === '1' && /four/i.test(g.launchpad_token.launchpad_name || '');
  const api = four && four.status ? four : null;
  const suffix = /(4444|ffff)$/i.test(addr);
  if (!api && !gp && !dsCurve) return null; // address suffix alone is only a hint, never enough
  const pools = pairs.filter(p => !/^four/i.test(p.dexId || '') && liqOf(p) > 0);
  const curve = api ? api.status !== 'TRADE' : dsCurve ? !pools.some(p => liqOf(p) >= 1000) : false;
  const progress = api && api.progress != null && isFinite(api.progress) ? Math.max(0, Math.min(100, api.progress * 100)) : null;
  return { four: 1, curve, progress: curve ? progress : 100, src: api ? 'four.meme' : gp ? 'GoPlus' : 'DexScreener', suffix, dex: api?.dexType || null };
}
function evmFindings({ g, h, addr, launch, meta }) {
  const out = []; const extra = {}; const flags = [];
  const b = (k) => !g ? null : g[k] === '1' ? true : g[k] === '0' ? false : null;
  const add = (id, v, w, { crit = false, warnOnly = false, p = {} } = {}) => out.push(v === null ? F(id, 'na', 0) : v ? F(id, warnOnly ? 'warn' : 'fail', w, p, crit) : F(id, 'pass', w, p));
  const curve = !!launch?.curve;
  // honeypot: either source saying "honeypot" wins; pass needs at least one source saying "sellable"
  const gpHp = b('is_honeypot') === true || b('cannot_sell_all') === true ? true : b('is_honeypot') === false ? false : null;
  const hsHp = h?.honeypotResult?.isHoneypot; const hsKnown = typeof hsHp === 'boolean';
  const reason = h?.honeypotResult?.honeypotReason || '';
  if (gpHp || hsHp === true) out.push(F('honeypot', 'fail', 50, { src: [gpHp ? 'GoPlus' : '', hsHp === true ? 'Honeypot.is' : ''].filter(Boolean).join(' + '), reason }, true));
  else if (gpHp === false || hsKnown) out.push(F('honeypot', 'pass', 50, { src: [gpHp === false ? 'GoPlus' : '', hsKnown ? 'Honeypot.is' : ''].filter(Boolean).join(' + ') }));
  else out.push(F('honeypot', 'na', 0, { curve: curve ? 1 : 0 }));
  if (b('cannot_buy')) out.push(F('cannotBuy', 'fail', 20));
  // tax: worst of GoPlus (fraction) and Honeypot.is simulation (percent)
  const gb = num(g?.buy_tax), gs = num(g?.sell_tax), sb = num(h?.simulationResult?.buyTax), ss = num(h?.simulationResult?.sellTax);
  if (gb === null && gs === null && sb === null && ss === null) out.push(F('tax', 'na', 0, curve ? { curve: 1 } : {}));
  else {
    const bt = Math.max(gb === null ? 0 : gb * 100, sb || 0), st = Math.max(gs === null ? 0 : gs * 100, ss || 0), mx = Math.max(bt, st), p = { b: bt, s: st };
    out.push(mx > 50 ? F('tax', 'fail', 25, p, true) : mx > 10 ? F('tax', 'fail', 20, p) : mx > 5 ? F('tax', 'warn', 20, p) : F('tax', 'pass', 20, p));
  }

  add('mintable', b('is_mintable'), 25);
  add('hiddenOwner', b('hidden_owner'), 20);
  add('takeBack', b('can_take_back_ownership'), 15);
  const os = b('is_open_source') ?? (typeof h?.contractCode?.openSource === 'boolean' ? h.contractCode.openSource : null);
  add('openSource', os === null ? null : !os, 15);
  add('proxy', b('is_proxy') ?? (typeof h?.contractCode?.isProxy === 'boolean' ? h.contractCode.isProxy : null), 6, { warnOnly: true });
  // ownership. Blacklist / pause / cooldown / tax switches are owner-only: once ownership is renounced (and there is no
  // hidden owner and no way to take it back) nobody can flip them, so they PASS with a note instead of a WARN.
  const owner = (g?.owner_address || '').toLowerCase(), fourOwner = FOUR_MANAGERS.has(owner) || (curve && !!owner);
  const renounced = g?.owner_address !== undefined && (!owner || DEAD.test(owner));
  const dormant = renounced && b('hidden_owner') === false && b('can_take_back_ownership') !== true;
  const ownerOnly = (id, v, w) => v === true && dormant ? out.push(F(id, 'pass', w, { ren: 1 })) : add(id, v, w, { warnOnly: true });
  ownerOnly('blacklist', b('is_blacklisted'), 10);
  ownerOnly('pausable', b('transfer_pausable'), 10);
  ownerOnly('tradingCooldown', b('trading_cooldown'), 4);
  ownerOnly('slippageMod', b('slippage_modifiable') === null && b('personal_slippage_modifiable') === null ? null : !!(b('slippage_modifiable') || b('personal_slippage_modifiable')), 12);
  if (!g || g.owner_address === undefined) out.push(F('renounced', 'na', 0));
  else out.push(renounced ? F('renounced', 'pass', 10) : fourOwner ? F('renounced', 'pass', 10, { fm: 1 }) : F('renounced', 'warn', 10));
  if (b('honeypot_with_same_creator')) out.push(F('serialScammer', 'fail', 20));
  // LP locked / burned (LP held by a burn address, a locker, or the token contract itself cannot be pulled)
  const lps = g?.lp_holders || [];
  if (curve) out.push(F('lpLocked', 'na', 0, { curve: 1 }));
  else if (lps.length) {
    const self = String(addr || '').toLowerCase();
    const locked = Math.min(100, lps.reduce((s, x) => s + ((x.is_locked === 1 || DEAD.test(x.address || '') || x.address?.toLowerCase() === self || /burn|null|dead|lock/i.test(x.tag || '')) ? +x.percent : 0), 0) * 100);
    const v3 = (g.dex || []).length > 0 && (g.dex || []).every(d => /V3|V4/i.test(d.liquidity_type || d.name || ''));
    out.push(locked >= 90 ? F('lpLocked', 'pass', 15, { v: locked }) : locked >= 50 || v3 ? F('lpLocked', 'warn', 15, { v: locked, v3: v3 ? 1 : 0 }) : F('lpLocked', 'fail', 15, { v: locked }));
  } else out.push(F('lpLocked', 'na', 0, { unk: 1 }));
  // holders: contracts (pools, lockers, the curve), locked and burn addresses excluded
  const contracts = new Set((g?.holders || []).filter(x => x.is_contract === 1 || x.is_locked === 1).map(x => (x.address || '').toLowerCase()));
  const hs = (g?.holders || []).filter(x => !x.is_contract && !x.is_locked && !DEAD.test(x.address || '') && !FOUR_MANAGERS.has((x.address || '').toLowerCase()));
  if (g?.holders?.length) {
    const top10 = Math.min(100, hs.slice(0, 10).reduce((s, x) => s + +x.percent, 0) * 100); extra.top10 = top10; // bridged tokens can report > 100% of the local supply
    extra.holders = hs.slice(0, 10).map(x => ({ owner: x.address, pct: +x.percent * 100 }));
    out.push(top10 > 50 ? F('top10', 'fail', 15, { v: top10 }) : top10 > 30 ? F('top10', 'warn', 15, { v: top10 }) : F('top10', 'pass', 15, { v: top10 }));
  } else out.push(F('top10', 'na', 0, curve ? { curve: 1 } : {}));
  // creator / owner wallet holding (owner counted only when it is a real wallet: not renounced, not a contract, not the curve)
  const cp = num(g?.creator_percent), op = !renounced && !fourOwner && !contracts.has(owner) ? num(g?.owner_percent) : null;
  if (cp !== null || op !== null) {
    const who = (op || 0) > (cp || 0) ? 'owner' : 'creator', v = Math.max(cp || 0, op || 0) * 100;
    out.push(v > 20 ? F('creator', 'fail', 8, { v, who }) : v > 5 ? F('creator', 'warn', 8, { v, who }) : F('creator', 'pass', 8, { v, who }));
  }
  const sum = h?.summary || {};
  if (sum.riskLevel !== undefined && sum.riskLevel !== null) out.push(sum.riskLevel >= 60 ? F('hpRisk', 'fail', 10, { v: sum.risk }) : sum.riskLevel >= 20 ? F('hpRisk', 'warn', 10, { v: sum.risk }) : F('hpRisk', 'pass', 10, { v: sum.risk }));
  (sum.flags || []).forEach(x => flags.push({ name: x.flag, desc: x.description, level: x.severity }));
  return { out, extra, flags };
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
// EVM security in one round trip. Browser: same-origin /api/evm-security (5-min edge cache, avoids GoPlus/Honeypot.is
// rate limits). Server (/api/deep, warmer) or relay down: the same upstream calls directly (evmsec.js).
// GoPlus rate-limits shared Cloudflare egress IPs (code 4029), so any part the relay could not get is re-fetched
// straight from the browser (the visitor's own IP), as before the relay existed.
export async function evmSecurity(addr, chain) {
  let j = null;
  if (typeof window !== 'undefined' && location.protocol.startsWith('http')) {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 12000);
    try { const r = await fetch(`/api/evm-security?chain=${chain}&ca=${addr.toLowerCase()}`, { signal: ctl.signal }); if (r.ok) { const x = await r.json(); if (x?.goplus && x.honeypot) j = x; } } catch {} finally { clearTimeout(tm); }
  }
  const { getEvmSecurity } = await import('./evmsec.js?v=1792460000');
  if (!j) return getEvmSecurity(addr, chain);
  const only = ['goplus', 'honeypot', ...(chain === 'bsc' ? ['four'] : [])].filter(k => !j[k] || j[k].s === 'fail');
  if (only.length) { const d = await getEvmSecurity(addr, chain, { only }).catch(() => null); only.forEach(k => { if (d?.[k] && d[k].s !== 'fail') j[k] = { ...d[k], via: 'browser' }; }); }
  return j;
}
export const EVM_AUTO = ['bsc', 'ethereum']; // auto-detect between these; Base only when the token trades nowhere else
// chains (of EVM_CHAINS) where the token has its own priced pairs, most liquid first: [{ chain, liq }]
export function evmChainsOf(ds, addr) {
  return Object.keys(EVM_CHAINS).map(c => { const ps = sanePairs((ds?.pairs || []).filter(p => p.chainId === c), addr).filter(p => (p.baseToken?.address || '').toLowerCase() === addr.toLowerCase());
    return { chain: c, liq: ps.reduce((s, p) => s + liqOf(p), 0), n: ps.length }; }).filter(x => x.n).sort((a, b) => b.liq - a.liq);
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
  let chainKey = 'solana', chains = null;
  if (kind === 'evm') {
    const ds0 = await dsP; chains = evmChainsOf(ds0, addr);
    if (!EVM_CHAINS[evmChain]) { // auto-detect: BNB Chain or Ethereum, whichever has the most liquid own pairs (Base as a last resort)
      const pick = chains.find(x => EVM_AUTO.includes(x.chain)) || chains[0];
      evmChain = pick?.chain || (/(4444|ffff)$/i.test(addr) ? 'bsc' : 'ethereum');
    }
    chainKey = EVM_CHAINS[evmChain].ds;
  }
  let evmP = null;
  if (kind === 'evm') evmP = evmSecurity(addr, chainKey).catch(() => null);
  const part = (k) => evmP.then(j => { const x = j?.[k]; if (!x || x.s === 'fail') throw new Error('fail'); return x.s === 'ok' ? x.d : { __empty: 1, ...(x.d || {}) }; });
  const secs = kind === 'solana' ? { RugCheck: run('RugCheck', rugReport(addr)) }
    : { GoPlus: run('GoPlus', part('goplus')), 'honeypot.is': run('honeypot.is', part('honeypot')), ...(chainKey === 'bsc' ? { four: evmP.then(j => j?.four?.s === 'ok' ? j.four.d : null) } : {}) };
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
      const g = a && !a.__empty && Object.keys(a).length ? a : null, h = b && !b.__empty && (b.honeypotResult || b.summary) ? b : null;
      if (got.four) sources['Four.meme'] = 'ok';
      const launch = fourMemeInfo({ chain: chainKey, addr, ds, g, four: got.four });
      if (launch) meta.launch = launch;
      if (g || h || ('GoPlus' in got && 'honeypot.is' in got)) {
        const r = evmFindings({ g, h, addr, launch, meta }); findings.push(...r.out.filter(f => g || h || f.status !== 'na')); extra = r.extra; flags = r.flags;
      }
      // source status from what actually arrived ('GoPlus' in got = settled), so a re-render can never leave a stale 'fail'
      if (g) { sources.GoPlus = 'ok'; meta.name ||= g.token_name; meta.symbol ||= g.token_symbol; meta.totalHolders = num(g.holder_count) || meta.totalHolders; }
      else if ('GoPlus' in got) { sources.GoPlus = a ? 'empty' : 'fail'; findings.push(F('srcGoplus', 'na', 0)); }
      if (h) sources['honeypot.is'] = 'ok';
      else if ('honeypot.is' in got) { sources['honeypot.is'] = b ? 'empty' : 'fail'; findings.push(F('srcHp', 'na', 0, { curve: launch?.curve ? 1 : 0 })); }
      if (h?.token) { meta.name ||= h.token.name; meta.symbol ||= h.token.symbol; meta.totalHolders ??= num(h.token.totalHolders); }
    }
    // Old, deep-liquidity tokens: an unlocked/unknown LP is not a rug signal on its own -> neutral note instead of a FAIL.
    const ageD = meta.created ? (Date.now() - meta.created) / 864e5 : 0;
    findings.forEach((f, i) => { if (f.id === 'lpLocked' && (f.status === 'fail' || f.status === 'warn') && ageD > 365 && (meta.liquidity || 0) > 1e6) findings[i] = F('lpLocked', 'na', 0, { ...f.params, old: 1 }); });
    const v = score(findings);
    const secOk = kind === 'solana' ? (sources.RugCheck === 'ok' || sources['Solana RPC'] === 'ok') : (sources.GoPlus === 'ok' || sources['honeypot.is'] === 'ok');
    if (!secOk && v.level === 'low') v.level = 'unknown'; // never call a token "Low risk" from market data alone
    return { addr, kind, chain: chainKey, ...(chains ? { chains: chains.map(x => x.chain) } : {}), meta, extra, flags, findings, sources: { ...sources }, pending: [...new Set([...pend, ...Object.keys(secs).filter(k => k !== 'four' && !(k in got))])], partial: pend.size > 0 || Object.keys(secs).some(k => !(k in got)), verdict: v };
  };
  ds = await dsP; onUpdate(build());
  await Promise.all(Object.entries(secs).map(([k, p]) => p.then(async v => {
    got[k] = v;
    if (k === 'RugCheck' && !v?.mint) { onUpdate(build()); got.rpc = await run('Solana RPC', solRpc(addr, ds)); }
    onUpdate(build()); })));
  return build();
}
