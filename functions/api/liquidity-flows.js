// GET /api/liquidity-flows?mint=<base58> -> animated LP flow graph + wash-trade signals (Solana).
// Resolves the live pool (DexScreener), reads recent swap txs via Helius (or public RPC fallback),
// builds wallet↔LP edges, and flags wash-like patterns (round-trips, near-simultaneous flip, creator links).
// Read-only; Cache API ~60s. Graceful empty state when HELIUS_KEY missing or data sparse.
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const WSOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const STABLE = new Set([WSOL, USDC, USDT]);
const TTL = 60, SIG_N = 40, TX_N = 24, UA = 'Mozilla/5.0 (MemeCheck/1.0)';
const ROUND_TRIP_S = 120; // buy+sell within this window = wash-like
const SIZE_SIM = 0.25; // |a-b|/max(a,b) <= this → similar size
const json = (status, body, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra },
});

async function getJson(url, ms = 12000, init = {}) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': UA, ...(init.headers || {}) } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(tm); }
}

async function rpc(url, method, params, ms = 15000) {
  const j = await getJson(url, ms, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (j.error) throw new Error((j.error.message || 'rpc') + (j.error.code != null ? ' ' + j.error.code : ''));
  return j.result;
}

async function rpcBatch(url, calls, ms = 20000) {
  const body = calls.map((c, i) => ({ jsonrpc: '2.0', id: i + 1, method: c[0], params: c[1] }));
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'user-agent': UA }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const arr = await r.json();
    if (!Array.isArray(arr)) throw new Error('bad batch');
    const byId = Object.fromEntries(arr.map(x => [x.id, x]));
    return calls.map((_, i) => {
      const x = byId[i + 1];
      if (!x) return null;
      if (x.error) return null;
      return x.result;
    });
  } finally { clearTimeout(tm); }
}

function short(a) { return a && a.length > 10 ? a.slice(0, 4) + '…' + a.slice(-4) : a; }

async function resolvePool(mint) {
  // DexScreener is often blocked from CF egress — try it, then pump.fun, then RugCheck markets.
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
  // pump.fun: prefer graduated PumpSwap pool, else bonding curve
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
            liqUsd: null,
            vol24: null,
            buys24: null,
            sells24: null,
            symbol: c.symbol || null,
            name: c.name || null,
            quote: 'SOL',
            priceUsd: c.usd_market_cap && c.total_supply ? (+c.usd_market_cap / (+c.total_supply / 1e6)) : null,
            via: 'pump.fun',
            creator: c.creator || null,
            created: +c.created_timestamp || null,
          };
        }
      }
    } catch {}
  }
  try {
    const rc = await getJson('https://api.rugcheck.xyz/v1/tokens/' + mint + '/report', 8000);
    const mk = (rc && rc.markets) || [];
    const m = mk.find(x => x.pubkey) || mk[0];
    if (m && m.pubkey) {
      return {
        pair: m.pubkey,
        dexId: m.marketType || m.mint || 'pool',
        url: null,
        liqUsd: null, vol24: null, buys24: null, sells24: null,
        symbol: rc.tokenMeta?.symbol || null,
        name: rc.tokenMeta?.name || null,
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

function parseSwap(txWrap, mint, pair) {
  const tx = txWrap?.transaction, meta = txWrap?.meta;
  if (!tx || !meta || meta.err) return null;
  const keys = (tx.message?.accountKeys || []).map(k => (typeof k === 'string' ? k : k.pubkey));
  const feePayer = keys[0];
  if (!feePayer || feePayer === pair) return null;

  // Aggregate token deltas per owner for this mint + stables/WSOL
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
      else if (STABLE.has(m)) bump(owner, 'solDelta', sign * amt); // treat USDC/USDT/WSOL as "quote" size
    }
  };
  addTok(meta.preTokenBalances, -1);
  addTok(meta.postTokenBalances, +1);

  // Native SOL delta for fee payer (rough size when WSOL not in token balances)
  const idx = keys.indexOf(feePayer);
  if (idx >= 0 && meta.preBalances && meta.postBalances) {
    const d = ((meta.postBalances[idx] || 0) - (meta.preBalances[idx] || 0)) / 1e9;
    const fee = (meta.fee || 0) / 1e9;
    // exclude fee from SOL change estimate
    const adj = d + (feePayer === keys[0] ? fee : 0);
    if (Math.abs(adj) > 0.0005) {
      const cur = tok.get(feePayer) || { mintDelta: 0, solDelta: 0 };
      cur.solDelta += adj;
      tok.set(feePayer, cur);
    }
  }

  // Trader = fee payer if they moved the mint; else largest |mintDelta| non-pair wallet
  let trader = null, best = 0;
  for (const [owner, v] of tok) {
    const a = Math.abs(v.mintDelta);
    if (a > best) { best = a; trader = owner; }
  }
  if (!trader || best < 1e-6) {
    // fallback: fee payer swapped quote only
    const v = tok.get(feePayer);
    if (!v || Math.abs(v.solDelta) < 0.001) return null;
    trader = feePayer;
  }
  const v = tok.get(trader) || { mintDelta: 0, solDelta: 0 };
  const side = v.mintDelta > 1e-9 ? 'buy' : v.mintDelta < -1e-9 ? 'sell' : (v.solDelta < 0 ? 'buy' : 'sell');
  const solAmt = Math.abs(v.solDelta) || null;
  const tokenAmt = Math.abs(v.mintDelta) || null;
  if (!solAmt && !tokenAmt) return null;
  return {
    wallet: trader,
    side,
    sol: solAmt ? +solAmt.toFixed(4) : null,
    token: tokenAmt,
    signature: tx.signatures?.[0] || null,
    ts: txWrap.blockTime || null,
  };
}

function detectWash(flows, creator) {
  // Annotate each flow with sus flags; return reasons map wallet -> reasons[]
  const byWallet = new Map();
  for (const f of flows) {
    if (!byWallet.has(f.wallet)) byWallet.set(f.wallet, []);
    byWallet.get(f.wallet).push(f);
  }
  const reasons = new Map(); // wallet -> Set(reason)
  const add = (w, r) => { if (!reasons.has(w)) reasons.set(w, new Set()); reasons.get(w).add(r); };

  for (const [w, list] of byWallet) {
    const buys = list.filter(x => x.side === 'buy').sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const sells = list.filter(x => x.side === 'sell').sort((a, b) => (a.ts || 0) - (b.ts || 0));
    // Round-trip: same wallet buy then sell (or sell then buy) within ROUND_TRIP_S with similar size
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

  // Cross-wallet ping-pong: two wallets with opposite sides within 20s, similar SOL size
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

  // Burst: wallet does >= 3 trades in 60s
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
  // Aggregate edges wallet→LP (buy) and LP→wallet (sell)
  const edgeMap = new Map(); // key wallet|side
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
  // Cap nodes for readable mobile UI
  const ranked = wallets.map(w => {
    const s = walletStats.get(w);
    const vol = (s.solIn || 0) + (s.solOut || 0);
    const sus = reasons.has(w);
    return { w, vol, sus, s };
  }).sort((a, b) => (b.sus - a.sus) || b.vol - a.vol).slice(0, 18);

  for (const { w, s, sus } of ranked) {
    const rs = [...(reasons.get(w) || [])];
    nodes.push({
      id: w,
      kind: 'wallet',
      label: short(w),
      short: short(w),
      sus: !!sus || (creator && w === creator),
      reasons: rs.map(reasonLabel),
      reasonCodes: rs,
      buys: s.buys,
      sells: s.sells,
      solIn: +s.solIn.toFixed(4),
      solOut: +s.solOut.toFixed(4),
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
      side: e.side,
      sol: +e.sol.toFixed(4),
      n: e.n,
      sus: !!sus,
      reasons: [...(reasons.get(e.wallet) || [])].map(reasonLabel),
      lastTs: e.lastTs || null,
      sigs: e.sigs,
    });
  }

  const susCount = nodes.filter(n => n.kind === 'wallet' && n.sus).length;
  const organicCount = nodes.filter(n => n.kind === 'wallet' && !n.sus).length;
  const susSol = edges.filter(e => e.sus).reduce((s, e) => s + e.sol, 0);
  const orgSol = edges.filter(e => !e.sus).reduce((s, e) => s + e.sol, 0);

  return {
    nodes, edges,
    summary: {
      wallets: ranked.length,
      suspicious: susCount,
      organic: organicCount,
      susSol: +susSol.toFixed(4),
      organicSol: +orgSol.toFixed(4),
      flows: flows.length,
      windowSec: flows.length ? Math.max(...flows.map(f => f.ts || 0)) - Math.min(...flows.map(f => f.ts || 0).filter(Boolean)) : 0,
    },
  };
}

async function build(env, mint) {
  const key = env && env.HELIUS_KEY;
  const ups = key
    ? [`https://mainnet.helius-rpc.com/?api-key=${key}`, 'https://api.mainnet-beta.solana.com']
    : ['https://api.mainnet-beta.solana.com'];

  const [pool, creator] = await Promise.all([
    resolvePool(mint).catch(() => null),
    resolveCreator(mint).catch(() => null),
  ]);
  if (!pool?.pair) {
    return { ok: true, configured: !!key, mint, empty: true, reason: 'no_pool', message: 'No Solana pool found on DexScreener for this mint.', at: Date.now() };
  }

  let sigs = [];
  let rpcUsed = null;
  let lastErr = null;
  for (const up of ups) {
    try {
      sigs = await rpc(up, 'getSignaturesForAddress', [pool.pair, { limit: SIG_N }], 12000);
      rpcUsed = new URL(up).host;
      break;
    } catch (e) { lastErr = e; }
  }
  if (!Array.isArray(sigs) || !sigs.length) {
    return {
      ok: true, configured: !!key, mint, pool, creator, empty: true, reason: 'no_sigs',
      message: 'Could not load recent pool transactions.' + (lastErr ? ' (' + String(lastErr.message || lastErr).slice(0, 60) + ')' : ''),
      at: Date.now(),
    };
  }

  const want = sigs.slice(0, TX_N).map(s => s.signature);
  let txs = [];
  for (const up of ups) {
    try {
      // Batch in chunks of 8 to stay under upstream limits
      const chunks = [];
      for (let i = 0; i < want.length; i += 8) chunks.push(want.slice(i, i + 8));
      const parts = [];
      for (const ch of chunks) {
        const calls = ch.map(sig => ['getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }]]);
        const res = await rpcBatch(up, calls, 22000);
        parts.push(...res);
      }
      txs = parts;
      rpcUsed = new URL(up).host;
      break;
    } catch (e) { lastErr = e; }
  }

  const flows = [];
  for (const tx of txs) {
    if (!tx) continue;
    try {
      const f = parseSwap(tx, mint, pool.pair);
      if (f) flows.push(f);
    } catch {}
  }

  if (!flows.length) {
    return {
      ok: true, configured: !!key, mint, pool, creator, empty: true, reason: 'no_flows',
      message: 'Recent pool txs found, but no clear swap flows could be parsed yet.',
      src: rpcUsed, parsed: txs.filter(Boolean).length, at: Date.now(),
    };
  }

  const reasons = detectWash(flows, creator);
  const graph = buildGraph(flows, reasons, pool, creator);

  return {
    ok: true,
    configured: !!key,
    mint,
    pool,
    creator,
    empty: false,
    ...graph,
    src: rpcUsed,
    parsed: flows.length,
    sampled: want.length,
    at: Date.now(),
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
  const cacheKey = new Request('https://memecheck-cache.internal/liq-flows/v1/' + mint);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (!bust) try {
    const hit = cache && await cache.match(cacheKey);
    if (hit) return json(200, await hit.text(), { 'cache-control': `public, max-age=${TTL}`, 'x-cache': 'HIT' });
  } catch {}

  let res, tm;
  try {
    res = await Promise.race([
      build(env, mint),
      new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('timeout')), 28000); }),
    ]);
  } catch (e) {
    res = { ok: false, configured: !!(env && env.HELIUS_KEY), mint, empty: true, error: String(e?.message || e).slice(0, 100), at: Date.now() };
  } finally { clearTimeout(tm); }

  const body = JSON.stringify(res);
  if (cache && res.ok && !res.error) {
    const p = cache.put(cacheKey, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${TTL}` } })).catch(() => {});
    waitUntil ? waitUntil(p) : await p;
  }
  return json(200, body, { 'cache-control': `public, max-age=${TTL}`, 'x-cache': bust ? 'BYPASS' : 'MISS' });
};
