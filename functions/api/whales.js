// GET /api/whales -> recent buys by tracked whale wallets (Cented, Decu, Cupsey).
// Helius Enhanced Transactions SWAP per wallet (limit 15), parse buys (received non-SOL mint, spent SOL/USDC/WSOL),
// enrich via DexScreener batch, Cache API ~90s. Cap ~10 buys/wallet. Graceful without HELIUS_KEY.
// Risk / research tool only — not copy-trading. Read-only; never writes KV.
const WALLETS = [
  { name: 'Cented', address: 'CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o' },
  { name: 'Decu', address: '4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9' },
  { name: 'Cupsey', address: '2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f' },
];
const DENY = new Set([
  'So11111111111111111111111111111111111111112', // WSOL / wrapped SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  '11111111111111111111111111111111', // native SOL placeholder if seen
]);
const SPEND = new Set([
  'So11111111111111111111111111111111111111112',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
]);
const TTL = 90, TX_LIMIT = 15, BUY_CAP = 10, UA = 'Mozilla/5.0 (MemeCheck/1.0)';
const json = (status, body, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra },
});

async function get(url, ms = 10000) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': UA } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(tm); }
}

function amtOf(t) {
  if (t == null) return 0;
  if (typeof t.tokenAmount === 'number') return t.tokenAmount;
  if (typeof t.tokenAmount === 'object' && t.tokenAmount) return +t.tokenAmount.uiAmount || +t.tokenAmount.amount || 0;
  return +t.amount || 0;
}

/** Parse one enhanced SWAP tx into a buy for `wallet`, or null. */
function parseBuy(tx, wallet) {
  if (!tx || tx.type !== 'SWAP') return null;
  const transfers = Array.isArray(tx.tokenTransfers) ? tx.tokenTransfers : [];
  const native = Array.isArray(tx.nativeTransfers) ? tx.nativeTransfers : [];
  const swap = tx.events && tx.events.swap;

  // Tokens received by wallet that are not SOL/stable
  const received = new Map(); // mint -> amount
  for (const t of transfers) {
    if (t.toUserAccount !== wallet) continue;
    const mint = t.mint; if (!mint || DENY.has(mint)) continue;
    received.set(mint, (received.get(mint) || 0) + amtOf(t));
  }
  if (swap && Array.isArray(swap.tokenOutputs)) {
    for (const t of swap.tokenOutputs) {
      const acct = t.userAccount || t.toUserAccount;
      if (acct && acct !== wallet) continue;
      const mint = t.mint; if (!mint || DENY.has(mint)) continue;
      if (!received.has(mint)) received.set(mint, amtOf(t) || 0);
    }
  }
  if (!received.size) return null;

  // Spent SOL / USDC / WSOL / USDT
  let spentSol = 0, spentUsd = 0, spentMint = null;
  for (const t of transfers) {
    if (t.fromUserAccount !== wallet) continue;
    const mint = t.mint; if (!mint || !SPEND.has(mint)) continue;
    const a = amtOf(t);
    if (mint === 'So11111111111111111111111111111111111111112') { spentSol += a; spentMint = mint; }
    else { spentUsd += a; spentMint = mint; }
  }
  for (const n of native) {
    if (n.fromUserAccount === wallet && +n.amount > 0) {
      spentSol += (+n.amount) / 1e9;
      if (!spentMint) spentMint = 'SOL';
    }
  }
  if (swap) {
    if (swap.nativeInput && (!swap.nativeInput.account || swap.nativeInput.account === wallet)) {
      spentSol += (+swap.nativeInput.amount || 0) / 1e9;
      if (!spentMint) spentMint = 'SOL';
    }
    if (Array.isArray(swap.tokenInputs)) {
      for (const t of swap.tokenInputs) {
        const acct = t.userAccount || t.fromUserAccount;
        if (acct && acct !== wallet) continue;
        const mint = t.mint; if (!mint || !SPEND.has(mint)) continue;
        const a = amtOf(t);
        if (mint === 'So11111111111111111111111111111111111111112') { spentSol += a; spentMint = mint; }
        else { spentUsd += a; spentMint = mint; }
      }
    }
  }
  // Require some spend signal (or description says swapped X for Y) — still accept receive-only if feePayer is wallet
  const isBuyer = tx.feePayer === wallet || spentSol > 0 || spentUsd > 0;
  if (!isBuyer) return null;

  // Primary buy mint = largest received non-deny amount (or first)
  let mint = null, tokenAmt = 0;
  for (const [m, a] of received) { if (a >= tokenAmt) { mint = m; tokenAmt = a; } }
  if (!mint) return null;

  let sizeSol = spentSol > 0 ? spentSol : null;
  let sizeUsd = spentUsd > 0 ? spentUsd : null;
  return {
    mint,
    tokenAmt: tokenAmt || null,
    sizeSol,
    sizeUsd,
    spentMint,
    signature: tx.signature || null,
    timestamp: tx.timestamp || null,
    source: tx.source || null,
    description: typeof tx.description === 'string' ? tx.description.slice(0, 160) : null,
  };
}

async function walletBuys(w, key) {
  const url = `https://api.helius.xyz/v0/addresses/${w.address}/transactions?api-key=${key}&type=SWAP&limit=${TX_LIMIT}`;
  const txs = await get(url, 12000);
  if (!Array.isArray(txs)) throw new Error('bad helius');
  const buys = [];
  const seen = new Set();
  for (const tx of txs) {
    const b = parseBuy(tx, w.address);
    if (!b || !b.mint || seen.has(b.signature || b.mint + b.timestamp)) continue;
    seen.add(b.signature || b.mint + b.timestamp);
    buys.push({
      wallet: w.name,
      address: w.address,
      ...b,
    });
    if (buys.length >= BUY_CAP) break;
  }
  return buys;
}

async function enrichDex(buys) {
  const mints = [...new Set(buys.map(b => b.mint).filter(Boolean))];
  if (!mints.length) return;
  const map = new Map();
  for (let i = 0; i < mints.length; i += 30) {
    const batch = mints.slice(i, i + 30);
    try {
      const arr = await get(`https://api.dexscreener.com/tokens/v1/solana/${batch.join(',')}`, 8000);
      for (const p of Array.isArray(arr) ? arr : []) {
        const a = p?.baseToken?.address; if (!a || p.chainId !== 'solana') continue;
        const mcap = +(p.marketCap ?? p.fdv) || 0;
        const liq = +p.liquidity?.usd || 0;
        const prev = map.get(a);
        if (!prev || liq > prev.liq) {
          map.set(a, {
            symbol: String(p.baseToken?.symbol || '').slice(0, 20),
            name: String(p.baseToken?.name || '').slice(0, 40),
            mcap: Math.round(mcap),
            liq: Math.round(liq),
            priceUsd: p.priceUsd ? +p.priceUsd : null,
            image: p.info?.imageUrl || null,
          });
        }
      }
    } catch { /* leave unenriched */ }
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
      if ((!b.sizeUsd || b.sizeUsd <= 0) && b.sizeSol && m.priceUsd == null) {
        // leave sizeSol; UI can show SOL
      }
    }
    if (!b.symbol) b.symbol = (b.mint || '').slice(0, 4) + '…';
  }
}

async function build(env) {
  const key = env && env.HELIUS_KEY;
  if (!key) {
    return {
      ok: true, configured: false, buys: [], wallets: WALLETS.map(w => ({ name: w.name, address: w.address })),
      message: 'HELIUS_KEY not configured — whale feed unavailable.', at: Date.now(),
    };
  }
  const results = await Promise.all(WALLETS.map(w =>
    walletBuys(w, key).then(buys => ({ ok: true, buys })).catch(e => ({ ok: false, buys: [], error: String(e?.message || e).slice(0, 80) }))
  ));
  const buys = results.flatMap(r => r.buys);
  const sources = Object.fromEntries(WALLETS.map((w, i) => [w.name, results[i].ok ? 'ok' : ('fail:' + (results[i].error || ''))]));
  await enrichDex(buys);
  buys.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return {
    ok: true, configured: true, buys, count: buys.length,
    wallets: WALLETS.map(w => ({ name: w.name, address: w.address })),
    sources, at: Date.now(),
  };
}

export const onRequest = async ({ request: req, env, waitUntil }) => {
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const cacheKey = new Request('https://memecheck-cache.internal/whales/v1');
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  try {
    const hit = cache && await cache.match(cacheKey);
    if (hit) return json(200, await hit.text(), { 'cache-control': `public, max-age=${TTL}`, 'x-cache': 'HIT' });
  } catch {}
  let res, tm;
  try {
    res = await Promise.race([
      build(env),
      new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('timeout')), 22000); }),
    ]);
  } catch (e) {
    res = { ok: false, configured: !!(env && env.HELIUS_KEY), buys: [], error: String(e?.message || e).slice(0, 80), at: Date.now() };
  } finally { clearTimeout(tm); }
  const body = JSON.stringify(res);
  if (cache && res.ok) {
    const p = cache.put(cacheKey, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${TTL}` } })).catch(() => {});
    waitUntil ? waitUntil(p) : await p;
  }
  return json(200, body, { 'cache-control': `public, max-age=${TTL}`, 'x-cache': 'MISS' });
};
