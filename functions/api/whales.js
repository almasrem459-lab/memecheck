// GET /api/whales -> recent buys / open positions for Cented, Decu, Cupsey.
// Whale tip/bundle spam makes wallet-level history useless; instead:
// Token-2022 ATAs (pump.fun) -> latest sig per ATA -> buy diffs + live holdings.
// DexScreener enrich. Cache API ~90s. Cap ~10/wallet. Subrequest-budgeted.
// Graceful without HELIUS_KEY. Risk tool — not copy-trading.
const WALLETS = [
  { name: 'Cented', address: 'CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o' },
  { name: 'Decu', address: '4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9' },
  { name: 'Cupsey', address: '2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f' },
];
const WSOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const DENY = new Set([WSOL, USDC, USDT]);
const T22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const TTL = 90, BUY_CAP = 10, PROBE = 8, UA = 'Mozilla/5.0 (MemeCheck/1.0)';
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

async function rpc(key, method, params, ms = 15000) {
  const j = await getJson(`https://mainnet.helius-rpc.com/?api-key=${key}`, ms, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (j.error) throw new Error((j.error.message || 'rpc') + (j.error.code != null ? ' ' + j.error.code : ''));
  return j.result;
}

function parseBuyFromFull(txWrap, wallet) {
  const tx = txWrap?.transaction, meta = txWrap?.meta;
  if (!tx || !meta || meta.err) return null;
  const keys = (tx.message?.accountKeys || []).map(k => (typeof k === 'string' ? k : k.pubkey));
  const feePayer = keys[0];
  const map = new Map();
  const add = (list, which) => {
    for (const b of list || []) {
      if (b.owner !== wallet) continue;
      const mint = b.mint; if (!mint) continue;
      const uiAmt = b.uiTokenAmount?.uiAmount;
      const raw = b.uiTokenAmount?.amount, dec = b.uiTokenAmount?.decimals;
      const ui = uiAmt != null ? +uiAmt : (raw != null && dec != null ? Number(raw) / 10 ** dec : 0);
      const cur = map.get(mint) || { pre: 0, post: 0 };
      cur[which] = ui; map.set(mint, cur);
    }
  };
  add(meta.preTokenBalances, 'pre'); add(meta.postTokenBalances, 'post');
  const gained = [];
  let spentSol = 0, spentUsd = 0, spentMint = null;
  for (const [mint, { pre, post }] of map) {
    const d = post - pre;
    if (d > 1e-9 && !DENY.has(mint)) gained.push({ mint, amt: d });
    if (d < -1e-9 && DENY.has(mint)) {
      const a = Math.abs(d);
      if (mint === WSOL) { spentSol += a; spentMint = WSOL; } else { spentUsd += a; spentMint = mint; }
    }
  }
  const idx = keys.indexOf(wallet);
  if (idx >= 0 && meta.preBalances && meta.postBalances) {
    const d = (meta.postBalances[idx] || 0) - (meta.preBalances[idx] || 0);
    if (d < 0) {
      const fee = feePayer === wallet ? (meta.fee || 0) : 0;
      const solOut = (Math.abs(d) - fee) / 1e9;
      if (solOut > 0.001) { spentSol += solOut; if (!spentMint) spentMint = 'SOL'; }
    }
  }
  if (!gained.length) return null;
  gained.sort((a, b) => b.amt - a.amt);
  const top = gained[0];
  return {
    mint: top.mint, tokenAmt: top.amt || null,
    sizeSol: spentSol > 0.001 ? +spentSol.toFixed(4) : null,
    sizeUsd: spentUsd > 0 ? +spentUsd.toFixed(2) : null,
    spentMint, signature: tx.signatures?.[0] || null, timestamp: txWrap.blockTime || null,
    source: feePayer === wallet ? 'self' : 'ata', description: null,
  };
}

async function walletBuys(w, key, wantDebug) {
  // Token-2022 only (pump.fun) — one RPC call
  let atas = [];
  try {
    const r = await rpc(key, 'getTokenAccountsByOwner', [w.address, { programId: T22 }, { encoding: 'jsonParsed' }], 18000);
    for (const a of r?.value || []) {
      const info = a.account?.data?.parsed?.info;
      const ui = +(info?.tokenAmount?.uiAmount || 0);
      const mint = info?.mint;
      if (!mint || DENY.has(mint) || !(ui > 0)) continue;
      atas.push({ pubkey: a.pubkey, mint, ui });
    }
  } catch (e) {
    return { buys: [], fetched: 0, parsed: 0, mode: 'ata-sigs', error: String(e?.message || e).slice(0, 80),
      debug: wantDebug ? { stage: 'atas', err: String(e?.message || e).slice(0, 80) } : null };
  }
  // Prefer *pump mints; sample from the end of the list too (often newer accounts)
  const pump = atas.filter(a => /pump$/i.test(a.mint));
  const pool = pump.length ? pump : atas;
  const sample = [];
  const n = pool.length;
  if (n) {
    // take some from start (large balances) and some from end (often newer)
    const half = Math.ceil(PROBE / 2);
    sample.push(...pool.slice(0, half));
    sample.push(...pool.slice(Math.max(half, n - half)));
  }
  // dedupe by pubkey
  const seenAta = new Set();
  const unique = sample.filter(a => !seenAta.has(a.pubkey) && seenAta.add(a.pubkey)).slice(0, PROBE);

  const ranked = [];
  for (const ata of unique) {
    try {
      const sigs = await rpc(key, 'getSignaturesForAddress', [ata.pubkey, { limit: 2 }], 8000);
      const ok = (Array.isArray(sigs) ? sigs : []).filter(s => s?.signature && !s.err);
      ranked.push({ ata, sigs: ok, bt: ok[0]?.blockTime || 0 });
    } catch { ranked.push({ ata, sigs: [], bt: 0 }); }
  }
  ranked.sort((a, b) => b.bt - a.bt);

  const sigMap = new Map();
  for (const r of ranked.slice(0, 6)) {
    for (const s of r.sigs) sigMap.set(s.signature, s.blockTime || null);
  }
  const sigList = [...sigMap.entries()].sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 12);

  const buys = [];
  const seen = new Set();
  let fetchedTxs = 0, parsed = 0;
  for (let i = 0; i < sigList.length && buys.length < BUY_CAP; i += 3) {
    const chunk = sigList.slice(i, i + 3);
    const wraps = await Promise.all(chunk.map(([signature, blockTime]) =>
      rpc(key, 'getTransaction', [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }], 10000)
        .then(r => r ? { transaction: r.transaction, meta: r.meta, blockTime: r.blockTime ?? blockTime } : null)
        .catch(() => null)
    ));
    for (const wrap of wraps) {
      if (!wrap) continue;
      fetchedTxs++;
      const b = parseBuyFromFull(wrap, w.address);
      if (!b?.mint) continue;
      parsed++;
      const id = b.signature || (b.mint + ':' + b.timestamp);
      const dedupe = b.mint + ':' + Math.floor((b.timestamp || 0) / 30);
      if (seen.has(id) || seen.has(dedupe)) continue;
      seen.add(id); seen.add(dedupe);
      buys.push({ wallet: w.name, address: w.address, ...b });
    }
  }

  // Always include a few current holdings (open positions) as risk-check targets
  for (const r of ranked.slice(0, BUY_CAP)) {
    const ata = r.ata;
    if (buys.some(b => b.mint === ata.mint)) continue;
    buys.push({
      wallet: w.name, address: w.address, mint: ata.mint, tokenAmt: ata.ui,
      sizeSol: null, sizeUsd: null, spentMint: null,
      signature: r.sigs[0]?.signature || null,
      timestamp: r.bt || null,
      source: 'hold', description: 'Open position',
    });
    if (buys.filter(b => b.wallet === w.name).length >= BUY_CAP) break;
  }

  const mine = buys.filter(b => b.wallet === w.name).slice(0, BUY_CAP);
  const dbg = wantDebug ? { ataCount: atas.length, pump: pump.length, probed: unique.length, fetchedTxs, parsed, newest: ranked[0]?.bt || null } : null;
  return { buys: mine, fetched: fetchedTxs, parsed, mode: 'ata-sigs', debug: dbg };
}

async function enrichDex(buys) {
  const mints = [...new Set(buys.map(b => b.mint).filter(Boolean))];
  if (!mints.length) return;
  const map = new Map();
  for (let i = 0; i < mints.length; i += 30) {
    const batch = mints.slice(i, i + 30);
    try {
      const arr = await getJson(`https://api.dexscreener.com/tokens/v1/solana/${batch.join(',')}`, 8000);
      for (const p of Array.isArray(arr) ? arr : []) {
        const a = p?.baseToken?.address; if (!a || p.chainId !== 'solana') continue;
        const mcap = +(p.marketCap ?? p.fdv) || 0, liq = +p.liquidity?.usd || 0;
        const prev = map.get(a);
        if (!prev || liq > prev.liq) {
          map.set(a, {
            symbol: String(p.baseToken?.symbol || '').slice(0, 20),
            name: String(p.baseToken?.name || '').slice(0, 40),
            mcap: Math.round(mcap), liq: Math.round(liq),
            priceUsd: p.priceUsd ? +p.priceUsd : null,
            image: p.info?.imageUrl || null,
          });
        }
      }
    } catch {}
  }
  for (const b of buys) {
    const m = map.get(b.mint);
    if (m) {
      b.symbol = m.symbol || b.symbol;
      b.name = m.name || b.name;
      b.mcap = m.mcap || null;
      b.liq = m.liq || null;
      b.priceUsd = m.priceUsd;
      b.image = m.image;
      if ((!b.sizeUsd || b.sizeUsd <= 0) && b.tokenAmt && m.priceUsd) b.sizeUsd = +(b.tokenAmt * m.priceUsd).toFixed(2);
    }
    if (!b.symbol) b.symbol = (b.mint || '').slice(0, 4) + '…';
  }
}

async function build(env, wantDebug = false) {
  const key = env && env.HELIUS_KEY;
  if (!key) {
    return {
      ok: true, configured: false, buys: [], wallets: WALLETS.map(w => ({ name: w.name, address: w.address })),
      message: 'HELIUS_KEY not configured — whale feed unavailable.', at: Date.now(),
    };
  }
  const results = [];
  for (const w of WALLETS) {
    try { results.push({ ok: true, ...(await walletBuys(w, key, wantDebug)) }); }
    catch (e) { results.push({ ok: false, buys: [], fetched: 0, parsed: 0, error: String(e?.message || e).slice(0, 120) }); }
  }
  let buys = results.flatMap(r => r.buys);
  const sources = Object.fromEntries(WALLETS.map((w, i) => [w.name, results[i].ok ? 'ok' : ('fail:' + (results[i].error || ''))]));
  const stats = Object.fromEntries(WALLETS.map((w, i) => [w.name, {
    fetched: results[i].fetched || 0, parsed: results[i].parsed || 0, mode: results[i].mode || null,
    ...(wantDebug && results[i].debug ? { debug: results[i].debug } : {}),
    ...(results[i].error ? { error: results[i].error } : {}),
  }]));
  await enrichDex(buys);
  // Prefer rows with a DexScreener market (live / interesting); keep a few others
  const live = buys.filter(b => b.mcap > 0 || b.liq > 0);
  const rest = buys.filter(b => !(b.mcap > 0 || b.liq > 0));
  buys = [...live, ...rest].slice(0, 40);
  buys.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0) || (b.mcap || 0) - (a.mcap || 0));
  return {
    ok: true, configured: true, buys, count: buys.length,
    wallets: WALLETS.map(w => ({ name: w.name, address: w.address })),
    sources, stats, at: Date.now(),
  };
}

export const onRequest = async ({ request: req, env, waitUntil }) => {
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const u = new URL(req.url);
  const bust = u.searchParams.get('fresh') === '1';
  const wantDebug = u.searchParams.get('debug') === '1';
  const cacheKey = new Request('https://memecheck-cache.internal/whales/v10');
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (!bust && !wantDebug) try {
    const hit = cache && await cache.match(cacheKey);
    if (hit) return json(200, await hit.text(), { 'cache-control': 'no-store', 'cdn-cache-control': 'no-store', 'x-cache': 'HIT' });
  } catch {}
  let res, tm;
  try {
    res = await Promise.race([
      build(env, wantDebug),
      new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('timeout')), 28000); }),
    ]);
  } catch (e) {
    res = { ok: false, configured: !!(env && env.HELIUS_KEY), buys: [], error: String(e?.message || e).slice(0, 80), at: Date.now() };
  } finally { clearTimeout(tm); }
  const body = JSON.stringify(res);
  if (cache && res.ok && !wantDebug) {
    const p = cache.put(cacheKey, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${TTL}` } })).catch(() => {});
    waitUntil ? waitUntil(p) : await p;
  }
  return json(200, body, { 'cache-control': 'no-store', 'cdn-cache-control': 'no-store', 'x-cache': (bust || wantDebug) ? 'BYPASS' : 'MISS' });
};
