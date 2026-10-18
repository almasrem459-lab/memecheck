// GET /api/liquidity-flows?mint=<base58> -> animated LP flow graph + wash-trade signals (Solana).
// Resolves the live pool (DexScreener), reads recent swap txs via Helius (or public RPC fallback),
// builds wallet↔LP edges, and flags wash-like patterns (round-trips, near-simultaneous flip, creator links).
// Read-only; Cache API 5–15 min on success. Soft-degrade (never raw 429). Staggers with /api/snipers via Cache API mark.
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const WSOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const STABLE = new Set([WSOL, USDC, USDT]);
const TTL = 600, TTL_SOFT = 90, SIG_N = 40, TX_N = 30, BATCH = 4, UA = 'Mozilla/5.0 (MemeCheck/1.0)';
const ROUND_TRIP_S = 120;
const SIZE_SIM = 0.25;
const HELIUS_MARK = 'https://memecheck-cache.internal/helius-recent/v1';
const HELIUS_COOLDOWN_S = 25;
const PUBLIC_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana.leorpc.com/?api_key=FREE',
];
const json = (status, body, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra },
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isRate = (e) => /429|403|402|rate|limit|too many|busy|-32429|-32005/i.test(String(e?.message || e || ''));
const softMsg = (reason) => ({
  rate_limited: 'RPC is busy right now — try again in a minute. / الشبكة مشغولة، حاول بعد دقيقة.',
  no_sigs: 'Could not load recent pool transactions. / تعذر تحميل معاملات المجمع الأخيرة.',
  no_flows: 'Recent pool txs found, but no clear swap flows could be parsed yet. / وُجدت معاملات لكن لم تُستخرج تدفقات مبادلة واضحة بعد.',
  no_pool: 'No Solana pool found for this mint. / لا يوجد مجمع سولانا لهذه العملة.',
  timeout: 'Timed out loading flows. Try again. / انتهت مهلة التحميل.',
}[reason] || 'Liquidity flow data unavailable right now. / بيانات التدفق غير متاحة حاليًا.');
const isHelius = (hostOrUrl) => /helius/i.test(String(hostOrUrl || ''));
function rpcOrder(key, preferPublic) {
  const helius = key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : null;
  if (!helius) return [...PUBLIC_RPCS];
  return preferPublic ? [...PUBLIC_RPCS, helius] : [helius, ...PUBLIC_RPCS];
}
async function heliusRecentlyUsed(cache) {
  if (!cache) return false;
  try { return !!(await cache.match(new Request(HELIUS_MARK))); } catch { return false; }
}
async function markHeliusUsed(cache, waitUntil) {
  if (!cache) return;
  try {
    const p = cache.put(new Request(HELIUS_MARK), new Response(String(Date.now()), {
      headers: { 'content-type': 'text/plain', 'cache-control': `public, max-age=${HELIUS_COOLDOWN_S}` },
    })).catch(() => {});
    waitUntil ? waitUntil(p) : await p;
  } catch {}
}

async function getJson(url, ms = 12000, init = {}) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': UA, ...(init.headers || {}) } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(tm); }
}

async function rpcOnce(url, method, params, ms = 15000) {
  const j = await getJson(url, ms, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (j.error) throw new Error((j.error.message || 'rpc') + (j.error.code != null ? ' ' + j.error.code : ''));
  return j.result;
}

async function rpc(url, method, params, ms = 15000, retries = 1) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try { return await rpcOnce(url, method, params, ms); }
    catch (e) {
      last = e;
      if (!isRate(e) || i === retries) throw e;
      await sleep(400 * (i + 1) * (i + 1));
    }
  }
  throw last;
}

async function rpcBatch(url, calls, ms = 20000, retries = 1) {
  const body = calls.map((c, i) => ({ jsonrpc: '2.0', id: i + 1, method: c[0], params: c[1] }));
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'user-agent': UA }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const arr = await r.json();
      if (!Array.isArray(arr)) throw new Error('bad batch');
      const byId = Object.fromEntries(arr.map(x => [x.id, x]));
      const errs = calls.map((_, i) => byId[i + 1]?.error).filter(Boolean);
      if (errs.length === calls.length && errs.some(e => isRate({ message: String(e.message || e.code || '') }))) {
        throw new Error('HTTP 429');
      }
      return calls.map((_, i) => {
        const x = byId[i + 1];
        if (!x || x.error) return null;
        return x.result;
      });
    } catch (e) {
      last = e;
      if (!isRate(e) || attempt === retries) throw e;
      await sleep(500 * (attempt + 1) * (attempt + 1));
    } finally { clearTimeout(tm); }
  }
  throw last;
}

function short(a) { return a && a.length > 10 ? a.slice(0, 4) + '…' + a.slice(-4) : a; }

async function resolvePool(mint) {
  let best = null;
  try {
    const d = await getJson('https://api.dexscreener.com/latest/dex/tokens/' + mint, 8000);
    const pairs = (d.pairs || []).filter(p => p.chainId === 'solana' && p.pairAddress);
    if (pairs.length) {
      const scored = pairs.map(p => {
        const liq = +p.liquidity?.usd || 0;
        const vol = +p.volume?.h24 || 0;
        const isCurve = /pumpfun|pump\.fun|moonshot|letsbonk/i.test(p.dexId || '');
        const score = liq * 10 + vol + (isCurve && liq < 500 ? -1e9 : 0);
        return { p, score };
      }).sort((a, b) => b.score - a.score);
      best = scored[0].p;
    }
  } catch {}
  if (best) {
    const base = best.baseToken?.address === mint ? best.baseToken : best.quoteToken;
    const quote = best.baseToken?.address === mint ? best.quoteToken : best.baseToken;
    return {
      pair: best.pairAddress,
      dexId: best.dexId || null,
      url: best.url || null,
      liqUsd: +best.liquidity?.usd || 0,
      vol24: +best.volume?.h24 || 0,
      buys24: best.txns?.h24?.buys ?? null,
      sells24: best.txns?.h24?.sells ?? null,
      symbol: base?.symbol || null,
      name: base?.name || null,
      quote: quote?.symbol || 'SOL',
      priceUsd: +best.priceUsd || null,
      via: 'dexscreener',
    };
  }
  if (/pump$/i.test(mint)) {
    try {
      const c = await getJson('https://frontend-api-v3.pump.fun/coins-v2/' + mint, 8000);
      if (c) {
        const pair = c.pump_swap_pool || c.bonding_curve || null;
        if (pair) {
          return {
            pair,
            dexId: c.pump_swap_pool ? 'pumpswap' : 'pumpfun',
            url: 'https://pump.fun/coin/' + mint,
            liqUsd: null, vol24: null, buys24: null, sells24: null,
            symbol: c.symbol || null, name: c.name || null, quote: 'SOL',
            priceUsd: c.usd_market_cap && c.total_supply ? (+c.usd_market_cap / (+c.total_supply / 1e6)) : null,
            via: 'pump.fun', creator: c.creator || null, created: +c.created_timestamp || null,
          };
        }
      }
    } catch {}
  }
  try {
    const rc = await getJson('https://api.rugcheck.xyz/v1/tokens/' + mint + '/report', 8000);
    const mk = (rc && rc.markets) || [];
    // Prefer pump-like / raydium markets over obscure DAMM ids when possible
    const prefer = mk.find(x => /pump|raydium|pumpswap/i.test(String(x.marketType || x.mint || ''))) || mk.find(x => x.pubkey) || mk[0];
    if (prefer && prefer.pubkey) {
      return {
        pair: prefer.pubkey,
        dexId: prefer.marketType || prefer.mint || 'pool',
        url: null, liqUsd: null, vol24: null, buys24: null, sells24: null,
        symbol: rc.tokenMeta?.symbol || null, name: rc.tokenMeta?.name || null,
        quote: 'SOL', priceUsd: null, via: 'rugcheck',
      };
    }
  } catch {}
  return null;
}

async function resolveCreator(mint) {
  if (!/pump$/i.test(mint)) return null;
  try {
    const c = await getJson('https://frontend-api-v3.pump.fun/coins-v2/' + mint, 7000);
    return c?.creator || null;
  } catch { return null; }
}

/** Parse a swap from token-balance deltas (pump.fun / Raydium / Meteora / PumpSwap). */
function parseSwap(txWrap, mint, pair) {
  const tx = txWrap?.transaction, meta = txWrap?.meta;
  if (!tx || !meta || meta.err) return null;
  const keys = [
    ...(tx.message?.accountKeys || []).map(k => (typeof k === 'string' ? k : k.pubkey)),
    ...(meta.loadedAddresses?.writable || []),
    ...(meta.loadedAddresses?.readonly || []),
  ];
  const feePayer = keys[0];
  if (!feePayer || feePayer === pair) return null;
  const nSig = tx.message?.header?.numRequiredSignatures || 1;
  const signers = new Set(keys.slice(0, nSig));

  const tok = new Map(); // owner -> { mintDelta, solDelta }
  const bump = (owner, field, d) => {
    if (!owner || owner === pair) return;
    const cur = tok.get(owner) || { mintDelta: 0, solDelta: 0 };
    cur[field] += d;
    tok.set(owner, cur);
  };
  const addTok = (list, sign) => {
    for (const b of list || []) {
      const owner = b.owner, m = b.mint;
      if (!owner || !m) continue;
      const ui = b.uiTokenAmount?.uiAmount;
      const raw = b.uiTokenAmount?.amount, dec = b.uiTokenAmount?.decimals;
      const amt = ui != null ? +ui : (raw != null && dec != null ? Number(raw) / 10 ** dec : 0);
      if (!(amt >= 0)) continue;
      if (m === mint) bump(owner, 'mintDelta', sign * amt);
      else if (STABLE.has(m)) bump(owner, 'solDelta', sign * amt);
    }
  };
  addTok(meta.preTokenBalances, -1);
  addTok(meta.postTokenBalances, +1);

  // Native SOL delta for fee payer (pump.fun bonding curve often moves native SOL, not WSOL)
  const idx = keys.indexOf(feePayer);
  if (idx >= 0 && meta.preBalances && meta.postBalances) {
    const d = ((meta.postBalances[idx] || 0) - (meta.preBalances[idx] || 0)) / 1e9;
    const fee = (meta.fee || 0) / 1e9;
    const adj = d + fee;
    if (Math.abs(adj) > 0.00005) {
      const cur = tok.get(feePayer) || { mintDelta: 0, solDelta: 0 };
      cur.solDelta += adj;
      tok.set(feePayer, cur);
    }
  }

  // Prefer fee payer / signers with mint movement — avoids picking Raydium/Meteora vault owners
  let trader = null;
  const fp = tok.get(feePayer);
  if (fp && Math.abs(fp.mintDelta) > 1e-9) {
    trader = feePayer;
  } else {
    let best = 0;
    for (const [owner, v] of tok) {
      if (!signers.has(owner)) continue;
      const a = Math.abs(v.mintDelta);
      if (a > best) { best = a; trader = owner; }
    }
    if (!trader) {
      best = 0;
      for (const [owner, v] of tok) {
        const a = Math.abs(v.mintDelta);
        if (a > best) { best = a; trader = owner; }
      }
    }
  }
  if (!trader || Math.abs((tok.get(trader) || {}).mintDelta || 0) < 1e-9) {
    const v = tok.get(feePayer);
    if (!v || Math.abs(v.solDelta) < 0.0001) return null;
    // Quote-only movement on fee payer still counts if someone else got the mint (router)
    // Find counterparty with mint gain/loss
    let alt = null, altBest = 0;
    for (const [owner, x] of tok) {
      if (owner === feePayer || owner === pair) continue;
      const a = Math.abs(x.mintDelta);
      if (a > altBest) { altBest = a; alt = owner; }
    }
    if (alt && altBest > 1e-6) trader = alt;
    else trader = feePayer;
  }

  const v = tok.get(trader) || { mintDelta: 0, solDelta: 0 };
  // If trader is vault-like (not a signer) and fee payer has opposite solDelta, still use mint side from trader but wallet=feePayer when fee payer signed
  let wallet = trader;
  if (!signers.has(trader) && signers.has(feePayer)) {
    const fpm = (tok.get(feePayer) || {}).mintDelta || 0;
    if (Math.abs(fpm) > 1e-9) wallet = feePayer;
    else if (Math.abs(v.mintDelta) > 1e-9) {
      // Vault moved mint; attribute to fee payer (common AMM pattern when user ATA not in balances under same owner key)
      wallet = feePayer;
    }
  }
  const wv = tok.get(wallet) || v;
  const mintD = Math.abs(wv.mintDelta) > 1e-9 ? wv.mintDelta : v.mintDelta;
  const solD = Math.abs(wv.solDelta) > 1e-12 ? wv.solDelta : v.solDelta;
  const side = mintD > 1e-9 ? 'buy' : mintD < -1e-9 ? 'sell' : (solD < 0 ? 'buy' : 'sell');
  const solAmt = Math.abs(solD) || null;
  const tokenAmt = Math.abs(mintD) || null;
  if (!solAmt && !tokenAmt) return null;
  // Drop dust-only noise
  if ((tokenAmt == null || tokenAmt < 1e-4) && (solAmt == null || solAmt < 0.0001)) return null;
  return {
    wallet,
    side,
    sol: solAmt ? +solAmt.toFixed(6) : null,
    token: tokenAmt,
    signature: tx.signatures?.[0] || null,
    ts: txWrap.blockTime || null,
  };
}

function detectWash(flows, creator) {
  const byWallet = new Map();
  for (const f of flows) {
    if (!byWallet.has(f.wallet)) byWallet.set(f.wallet, []);
    byWallet.get(f.wallet).push(f);
  }
  const reasons = new Map();
  const add = (w, r) => { if (!reasons.has(w)) reasons.set(w, new Set()); reasons.get(w).add(r); };

  for (const [w, list] of byWallet) {
    const buys = list.filter(x => x.side === 'buy').sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const sells = list.filter(x => x.side === 'sell').sort((a, b) => (a.ts || 0) - (b.ts || 0));
    for (const b of buys) {
      for (const s of sells) {
        const dt = Math.abs((b.ts || 0) - (s.ts || 0));
        if (dt > ROUND_TRIP_S) continue;
        const sb = b.sol || 0, ss = s.sol || 0;
        const similar = sb > 0 && ss > 0 ? Math.abs(sb - ss) / Math.max(sb, ss) <= SIZE_SIM : true;
        if (similar) add(w, dt <= 30 ? 'flip_<30s' : 'round_trip');
      }
    }
    if (creator && w === creator) add(w, 'creator');
  }

  const sorted = [...flows].filter(f => f.ts && f.sol).sort((a, b) => a.ts - b.ts);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].ts - sorted[i].ts <= 20; j++) {
      const a = sorted[i], b = sorted[j];
      if (a.wallet === b.wallet) continue;
      if (a.side === b.side) continue;
      const sim = Math.abs(a.sol - b.sol) / Math.max(a.sol, b.sol) <= SIZE_SIM;
      if (sim) { add(a.wallet, 'pair_flip'); add(b.wallet, 'pair_flip'); }
    }
  }

  for (const [w, list] of byWallet) {
    const ts = list.map(x => x.ts).filter(Boolean).sort((a, b) => a - b);
    for (let i = 0; i < ts.length; i++) {
      let n = 1;
      for (let j = i + 1; j < ts.length && ts[j] - ts[i] <= 60; j++) n++;
      if (n >= 3) { add(w, 'burst'); break; }
    }
  }
  return reasons;
}

// Organic Volume indicator: how concentrated recent swap volume (SOL) is among the top wallets of this same sample.
// No extra API calls. Returns null when the sample is too small to judge (the UI then shows nothing).
const ORG_MIN_TRADES = 15;
function organicVolume(flows) {
  const tr = flows.filter(f => f.wallet && f.sol > 0);
  if (tr.length < ORG_MIN_TRADES) return null;
  const by = new Map(); let total = 0;
  for (const f of tr) { by.set(f.wallet, (by.get(f.wallet) || 0) + f.sol); total += f.sol; }
  if (!(total > 0)) return null;
  const vols = [...by.values()].sort((a, b) => b - a), top = Math.min(5, vols.length);
  const share = vols.slice(0, top).reduce((a, b) => a + b, 0) / total;
  const wallets = vols.length;
  let level = share > 0.6 ? 'wash' : share >= 0.35 ? 'suspicious' : 'organic';
  if (wallets <= 5) level = 'wash';                                   // a handful of wallets is all the volume
  else if (wallets < 10 && level === 'organic') level = 'suspicious'; // too few distinct traders to call it organic
  return { level, topShare: Math.round(share * 100), top, wallets, trades: tr.length, sol: +total.toFixed(3) };
}

function reasonLabel(code) {
  return ({
    flip_30s: 'Buy+sell within 30s (same wallet)',
    'flip_<30s': 'Buy+sell within 30s (same wallet)',
    round_trip: 'Round-trip trade within 2 min',
    pair_flip: 'Opposite trade vs another wallet in <20s (similar size)',
    creator: 'Token creator wallet',
    burst: '3+ trades in 60 seconds',
  })[code] || code;
}

function buildGraph(flows, reasons, pool, creator) {
  const edgeMap = new Map();
  const walletStats = new Map();
  for (const f of flows) {
    const k = f.wallet + '|' + f.side;
    const e = edgeMap.get(k) || { wallet: f.wallet, side: f.side, sol: 0, n: 0, lastTs: 0, sigs: [] };
    e.sol += f.sol || 0;
    e.n += 1;
    e.lastTs = Math.max(e.lastTs, f.ts || 0);
    if (f.signature && e.sigs.length < 3) e.sigs.push(f.signature);
    edgeMap.set(k, e);
    const ws = walletStats.get(f.wallet) || { buys: 0, sells: 0, solIn: 0, solOut: 0 };
    if (f.side === 'buy') { ws.buys++; ws.solIn += f.sol || 0; }
    else { ws.sells++; ws.solOut += f.sol || 0; }
    walletStats.set(f.wallet, ws);
  }

  const nodes = [{ id: 'LP', kind: 'lp', label: pool.dexId || 'LP', short: pool.dexId || 'LP' }];
  const wallets = [...walletStats.keys()];
  const ranked = wallets.map(w => {
    const s = walletStats.get(w);
    const vol = (s.solIn || 0) + (s.solOut || 0);
    const sus = reasons.has(w);
    return { w, vol, sus, s };
  }).sort((a, b) => (b.sus - a.sus) || b.vol - a.vol).slice(0, 18);

  for (const { w, s, sus } of ranked) {
    const rs = [...(reasons.get(w) || [])];
    nodes.push({
      id: w, kind: 'wallet', label: short(w), short: short(w),
      sus: !!(sus || (creator && w === creator)),
      reasons: rs.map(reasonLabel), reasonCodes: rs,
      buys: s.buys, sells: s.sells,
      solIn: +s.solIn.toFixed(4), solOut: +s.solOut.toFixed(4),
      isCreator: !!(creator && w === creator),
    });
  }
  const keep = new Set(ranked.map(x => x.w));

  const edges = [];
  for (const e of edgeMap.values()) {
    if (!keep.has(e.wallet)) continue;
    const sus = reasons.has(e.wallet) || (creator && e.wallet === creator);
    edges.push({
      id: e.wallet + ':' + e.side,
      from: e.side === 'buy' ? e.wallet : 'LP',
      to: e.side === 'buy' ? 'LP' : e.wallet,
      side: e.side, sol: +e.sol.toFixed(4), n: e.n, sus: !!sus,
      reasons: [...(reasons.get(e.wallet) || [])].map(reasonLabel),
      lastTs: e.lastTs || null, sigs: e.sigs,
    });
  }

  const susCount = nodes.filter(n => n.kind === 'wallet' && n.sus).length;
  const organicCount = nodes.filter(n => n.kind === 'wallet' && !n.sus).length;
  const susSol = edges.filter(e => e.sus).reduce((s, e) => s + e.sol, 0);
  const orgSol = edges.filter(e => !e.sus).reduce((s, e) => s + e.sol, 0);

  return {
    nodes, edges,
    summary: {
      wallets: ranked.length, suspicious: susCount, organic: organicCount,
      susSol: +susSol.toFixed(4), organicSol: +orgSol.toFixed(4),
      flows: flows.length,
      windowSec: flows.length ? Math.max(...flows.map(f => f.ts || 0)) - Math.min(...flows.map(f => f.ts || 0).filter(Boolean)) : 0,
    },
  };
}

async function loadSigs(ups, address) {
  let lastErr = null;
  for (const up of ups) {
    try {
      const sigs = await rpc(up, 'getSignaturesForAddress', [address, { limit: SIG_N }], 12000);
      if (Array.isArray(sigs) && sigs.length) return { sigs, rpcUsed: new URL(up).host };
    } catch (e) {
      lastErr = e;
      // Prefer next upstream sooner (esp. public) instead of burning Helius retries
      if (isRate(e)) await sleep(120);
    }
  }
  return { sigs: [], err: lastErr };
}

async function loadTxs(ups, want) {
  let lastErr = null;
  for (const up of ups) {
    try {
      const parts = [];
      for (let i = 0; i < want.length; i += BATCH) {
        if (i) await sleep(100);
        const ch = want.slice(i, i + BATCH);
        const calls = ch.map(sig => ['getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }]]);
        const res = await rpcBatch(up, calls, 22000);
        parts.push(...res);
      }
      const ok = parts.filter(Boolean).length;
      if (ok > 0) return { txs: parts, rpcUsed: new URL(up).host };
      // All null — try next upstream (Helius may 200 with empty/errored entries when limited)
      lastErr = new Error('empty txs');
    } catch (e) {
      lastErr = e;
      if (isRate(e)) await sleep(150);
    }
  }
  return { txs: [], err: lastErr };
}

async function build(env, mint, preferPublic = false) {
  const key = env && env.HELIUS_KEY;
  const ups = rpcOrder(key, preferPublic);

  let pool = await resolvePool(mint).catch(() => null);
  let creator = pool?.creator || await resolveCreator(mint).catch(() => null);
  if (!pool?.pair) {
    pool = {
      pair: mint, dexId: 'mint', url: null, liqUsd: null, vol24: null, buys24: null, sells24: null,
      symbol: null, name: null, quote: 'SOL', priceUsd: null, via: 'mint',
    };
  }

  // Try pool address first; if sparse, also try mint itself (pump launch txs)
  let { sigs, err: sigErr, rpcUsed } = await loadSigs(ups, pool.pair);
  if ((!sigs || sigs.length < 3) && pool.pair !== mint) {
    const alt = await loadSigs(ups, mint);
    if ((alt.sigs || []).length > (sigs || []).length) {
      sigs = alt.sigs; rpcUsed = alt.rpcUsed; sigErr = alt.err;
    }
  }
  if (!Array.isArray(sigs) || !sigs.length) {
    const reason = isRate(sigErr) ? 'rate_limited' : 'no_sigs';
    return {
      ok: true, configured: !!key, mint, pool, creator, empty: true, reason, soft: reason === 'rate_limited',
      message: softMsg(reason), at: Date.now(),
    };
  }

  const want = sigs.filter(s => s && !s.err).slice(0, TX_N).map(s => s.signature);
  let { txs, err: txErr, rpcUsed: txRpc } = await loadTxs(ups, want);
  if (txRpc) rpcUsed = txRpc;

  const flows = [];
  let parsedTx = 0;
  for (const tx of txs) {
    if (!tx) continue;
    parsedTx++;
    try {
      const f = parseSwap(tx, mint, pool.pair);
      if (f) flows.push(f);
    } catch {}
  }

  if (!flows.length) {
    // Distinguish: couldn't fetch txs vs fetched but couldn't parse swaps
    const reason = parsedTx === 0
      ? (isRate(txErr) ? 'rate_limited' : 'no_sigs')
      : 'no_flows';
    return {
      ok: true, configured: !!key, mint, pool, creator, empty: true, reason,
      soft: reason === 'rate_limited',
      message: softMsg(reason),
      src: rpcUsed, parsed: parsedTx, sampled: want.length, at: Date.now(),
    };
  }

  const reasons = detectWash(flows, creator);
  const graph = buildGraph(flows, reasons, pool, creator);

  return {
    ok: true, configured: !!key, mint, pool, creator, empty: false,
    ...graph, organic: organicVolume(flows), src: rpcUsed, parsed: flows.length, sampled: want.length, at: Date.now(),
    legend: {
      green: 'Organic / real trader flow',
      red: 'Suspicious / wash-like (round-trip, flip, creator, burst)',
    },
  };
}

export const onRequest = async ({ request: req, env, waitUntil }) => {
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const u = new URL(req.url);
  const mint = u.searchParams.get('mint') || u.searchParams.get('ca') || '';
  if (!MINT_RE.test(mint)) return json(400, { error: 'bad mint' });
  const bust = u.searchParams.get('fresh') === '1';
  const cacheKey = new Request('https://memecheck-cache.internal/liq-flows/v5/' + mint);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (!bust) try {
    const hit = cache && await cache.match(cacheKey);
    if (hit) return json(200, await hit.text(), { 'cache-control': `public, max-age=${TTL}`, 'x-cache': 'HIT' });
  } catch {}

  // If snipers (or a prior flows miss) just burned Helius, prefer public RPC first
  const preferPublic = await heliusRecentlyUsed(cache);
  // Claim Helius window up-front so a concurrent /api/snipers prefers public/cache
  if (!preferPublic && env && env.HELIUS_KEY) await markHeliusUsed(cache, waitUntil);

  let res, tm;
  try {
    res = await Promise.race([
      build(env, mint, preferPublic),
      new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('timeout')), 26000); }),
    ]);
  } catch (e) {
    const reason = /timeout/i.test(String(e?.message || e)) ? 'timeout' : (isRate(e) ? 'rate_limited' : 'no_sigs');
    res = {
      ok: true, configured: !!(env && env.HELIUS_KEY), mint, empty: true,
      reason, soft: true, message: softMsg(reason), at: Date.now(),
    };
  } finally { clearTimeout(tm); }

  if (isHelius(res.src)) await markHeliusUsed(cache, waitUntil);

  const body = JSON.stringify(res);
  const ttl = (res.soft || res.reason === 'rate_limited') ? TTL_SOFT : TTL;
  // Cache successes (5–15m) and brief soft/rate-limit to stop stampedes; never cache raw timeouts
  const cacheable = res.ok && res.reason !== 'timeout' && (!res.soft || res.reason === 'rate_limited' || !res.empty);
  if (cache && cacheable) {
    const p = cache.put(cacheKey, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` } })).catch(() => {});
    waitUntil ? waitUntil(p) : await p;
  }
  return json(200, body, { 'cache-control': `public, max-age=${ttl}`, 'x-cache': bust ? 'BYPASS' : 'MISS' });
};
