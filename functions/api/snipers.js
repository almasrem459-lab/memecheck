// GET /api/snipers?mint=<base58> -> Live Sniper Detection for Solana meme coins.
// Looks at the first ~40 buyers in the opening slots/seconds after launch (bonding curve or pool),
// labels likely sniper bots, and reports % of supply they still hold.
// Heuristics (demo v1, not proof): same-slot as create, multi-buy in first seconds, tip/priority patterns,
// still holding a large early bag. Read-only; Cache API ~5 min (longer on soft-degrade).
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TTL = 300, TTL_SOFT = 90, EARLY_TX = 40, EARLY_SLOTS = 3, SIG_PAGE = 100, SIG_PAGES_MAX = 6;
const BATCH = 5, UA = 'Mozilla/5.0 (MemeCheck/1.0)';
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
  sigs: 'Could not load launch signatures right now. / تعذر تحميل توقيعات الإطلاق الآن.',
  none: 'No transactions found for this mint/curve yet. / لا توجد معاملات بعد.',
  no_buyers: 'Launch txs found, but no clear early buyers could be parsed. / وُجدت معاملات إطلاق لكن لم يُستخرج مشتركون أوائل.',
  timeout: 'Sniper scan timed out. Try again. / انتهت مهلة الفحص.',
}[reason] || 'Sniper scan unavailable right now. / فحص القناصة غير متاح حاليًا.');

async function getJson(url, ms = 10000, init = {}) {
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
  if (j.error) {
    const code = j.error.code != null ? ' ' + j.error.code : '';
    throw new Error((j.error.message || 'rpc') + code);
  }
  return j.result;
}

async function rpc(url, method, params, ms = 15000, retries = 2) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      return await rpcOnce(url, method, params, ms);
    } catch (e) {
      last = e;
      if (!isRate(e) || i === retries) throw e;
      await sleep(400 * (i + 1) * (i + 1));
    }
  }
  throw last;
}

async function rpcBatch(url, calls, ms = 22000, retries = 2) {
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
      // If every entry is a rate-limit style error, treat as rate limited
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

async function loadCoin(mint) {
  if (!/pump$/i.test(mint)) return null;
  try {
    return await getJson('https://frontend-api-v3.pump.fun/coins-v2/' + mint, 8000);
  } catch { return null; }
}

function parseEarlyBuyers(txs, mint, creator, curve, launchSlot) {
  const buyers = new Map();
  let createSlot = launchSlot;
  for (const wrap of txs) {
    const t = wrap?.tx; if (!t || t.meta?.err) continue;
    const slot = wrap.slot;
    if (createSlot == null) createSlot = slot;
    const msg = t.transaction.message;
    const keys = [...(msg.accountKeys || []).map(k => typeof k === 'string' ? k : k.pubkey),
      ...(t.meta.loadedAddresses?.writable || []), ...(t.meta.loadedAddresses?.readonly || [])];
    const nSig = msg.header?.numRequiredSignatures || 1;
    const signers = new Set(keys.slice(0, nSig));
    const feePayer = keys[0];
    const tip = (t.meta?.fee || 0);
    const pre = new Map(), post = new Map();
    for (const b of t.meta.preTokenBalances || []) if (b.mint === mint) pre.set(b.accountIndex, b);
    for (const b of t.meta.postTokenBalances || []) if (b.mint === mint) post.set(b.accountIndex, b);
    for (const [idx, b] of post) {
      const before = BigInt(pre.get(idx)?.uiTokenAmount?.amount || '0');
      const after = BigInt(b.uiTokenAmount?.amount || '0');
      const d = after - before;
      if (d <= 0n || !b.owner) continue;
      if (creator && b.owner === creator) continue;
      if (curve && b.owner === curve) continue;
      if (!signers.has(b.owner) && b.owner !== feePayer) continue;
      const o = buyers.get(b.owner) || { owner: b.owner, amt: 0n, slots: new Set(), n: 0, tipLamports: 0, accts: new Set(), firstSlot: slot };
      o.amt += d;
      o.slots.add(slot);
      o.n += 1;
      o.tipLamports += tip;
      if (keys[idx]) o.accts.add(keys[idx]);
      if (slot < o.firstSlot) o.firstSlot = slot;
      buyers.set(b.owner, o);
    }
  }
  return { buyers, createSlot };
}

function labelSniper(o, createSlot) {
  const reasons = [];
  const slotDelta = createSlot != null ? o.firstSlot - createSlot : 999;
  if (slotDelta <= 0) reasons.push('same_slot');
  else if (slotDelta <= 1) reasons.push('next_slot');
  else if (slotDelta <= EARLY_SLOTS) reasons.push('early_slot');
  if (o.n >= 3) reasons.push('multi_buy');
  if (o.tipLamports >= 1_000_000) reasons.push('high_fee');
  const pro = reasons.includes('same_slot') || reasons.includes('next_slot') || (reasons.includes('early_slot') && reasons.includes('multi_buy'));
  return { reasons, pro, slotDelta };
}

function riskLevel(sniperPct, proCount, buyerCount) {
  if (sniperPct == null) return { level: 'unknown', label: 'Unknown' };
  if (sniperPct >= 25 || proCount >= 12) return { level: 'high', label: 'High sniper risk' };
  if (sniperPct >= 12 || proCount >= 6) return { level: 'medium', label: 'Elevated sniper activity' };
  if (sniperPct >= 5 || proCount >= 3) return { level: 'low', label: 'Some early snipers' };
  if (buyerCount < 5) return { level: 'unknown', label: 'Too few early buyers to judge' };
  return { level: 'clear', label: 'Low sniper footprint' };
}

/** Walk toward genesis with small pages; cap RPC spend. Prefer full short history. */
async function loadLaunchSigs(ups, target) {
  let lastErr = null;
  for (const up of ups) {
    try {
      const page0 = await rpc(up, 'getSignaturesForAddress', [target, { limit: SIG_PAGE }], 12000);
      if (!Array.isArray(page0) || !page0.length) {
        lastErr = new Error('no signatures');
        continue;
      }
      let collected;
      if (page0.length < SIG_PAGE) {
        collected = [...page0].reverse();
      } else {
        collected = [...page0];
        let before = page0[page0.length - 1].signature;
        for (let p = 0; p < SIG_PAGES_MAX - 1; p++) {
          await sleep(80);
          const page = await rpc(up, 'getSignaturesForAddress', [target, { limit: SIG_PAGE, before }], 12000);
          if (!Array.isArray(page) || !page.length) break;
          collected.push(...page);
          if (page.length < SIG_PAGE) break;
          before = page[page.length - 1].signature;
        }
        // End of collected is oldest when paging with `before`
        collected = collected.reverse();
      }
      const sigs = collected.filter(s => s && !s.err);
      if (sigs.length) return { sigs, rpcUsed: new URL(up).host };
      lastErr = new Error('no signatures');
    } catch (e) {
      lastErr = e;
      if (isRate(e)) await sleep(600);
    }
  }
  const reason = isRate(lastErr) ? 'rate_limited' : 'sigs';
  return { sigs: [], reason, err: lastErr };
}

async function fetchTxs(ups, use) {
  let lastErr = null;
  for (const up of ups) {
    try {
      const wraps = [];
      for (let i = 0; i < use.length; i += BATCH) {
        if (i) await sleep(120);
        const ch = use.slice(i, i + BATCH);
        const calls = ch.map(s => ['getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }]]);
        const res = await rpcBatch(up, calls, 22000);
        res.forEach((tx, j) => wraps.push({ tx, slot: ch[j].slot, blockTime: ch[j].blockTime, signature: ch[j].signature }));
      }
      const ok = wraps.filter(w => w.tx).length;
      if (ok > 0) return { wraps, rpcUsed: new URL(up).host };
      lastErr = new Error('empty txs');
    } catch (e) {
      lastErr = e;
      if (isRate(e)) await sleep(600);
    }
  }
  return { wraps: [], err: lastErr };
}

async function build(env, mint) {
  const key = env && env.HELIUS_KEY;
  if (!key) {
    return {
      ok: true, configured: false, mint, empty: true,
      message: softMsg('sigs'), reason: 'no_key', at: Date.now(),
    };
  }
  const helius = `https://mainnet.helius-rpc.com/?api-key=${key}`;
  const ups = [helius, ...PUBLIC_RPCS];
  const coin = await loadCoin(mint);
  const creator = coin?.creator || null;
  const curve = coin?.bonding_curve || null;
  const createdMs = coin?.created_timestamp ? +coin.created_timestamp : null;
  const target = curve || mint;

  const { sigs, reason: sigReason, err: sigErr, rpcUsed: sigRpc } = await loadLaunchSigs(ups, target);
  if (!sigs.length) {
    const reason = sigReason || (isRate(sigErr) ? 'rate_limited' : 'sigs');
    return {
      ok: true, configured: true, mint, empty: true, reason, soft: reason === 'rate_limited',
      message: softMsg(reason), src: sigRpc || null, at: Date.now(),
    };
  }

  const launchSlot = sigs[0].slot;
  const earlySigs = sigs.filter(s => s.slot <= launchSlot + EARLY_SLOTS).slice(0, EARLY_TX);
  const use = earlySigs.length >= 8 ? earlySigs : sigs.slice(0, EARLY_TX);

  const { wraps, err: txErr, rpcUsed } = await fetchTxs(ups, use);
  if (!wraps.some(w => w.tx)) {
    const reason = isRate(txErr) ? 'rate_limited' : 'sigs';
    return {
      ok: true, configured: true, mint, empty: true, reason, soft: true,
      message: softMsg(reason), src: rpcUsed || null, at: Date.now(),
    };
  }

  const { buyers, createSlot } = parseEarlyBuyers(wraps, mint, creator, curve, launchSlot);
  if (!buyers.size) {
    return {
      ok: true, configured: true, mint, empty: true, reason: 'no_buyers',
      message: softMsg('no_buyers'),
      launchSlot, sampled: use.length, src: rpcUsed, at: Date.now(),
    };
  }

  let supply = null, decimals = 6;
  try {
    const up = key ? helius : ups[0];
    const sup = await rpc(up, 'getTokenSupply', [mint], 8000, 1);
    supply = BigInt(sup.value.amount);
    decimals = +sup.value.decimals || 6;
  } catch {}

  const list = [...buyers.values()].sort((a, b) => (b.amt > a.amt ? 1 : -1));
  let heldMap = new Map();
  try {
    const accts = [...new Set(list.flatMap(o => [...o.accts]))].slice(0, 40);
    if (accts.length) {
      const up = key ? helius : ups[0];
      for (let i = 0; i < accts.length; i += 20) {
        if (i) await sleep(100);
        const slice = accts.slice(i, i + 20);
        const res = await rpc(up, 'getMultipleAccounts', [slice, { encoding: 'jsonParsed' }], 12000, 1);
        (res?.value || []).forEach((a) => {
          const info = a?.data?.parsed?.info;
          if (!info || info.mint !== mint) return;
          const owner = info.owner;
          const amt = BigInt(info.tokenAmount?.amount || '0');
          heldMap.set(owner, (heldMap.get(owner) || 0n) + amt);
        });
      }
    }
  } catch {}

  const pct = (x) => (supply && x != null) ? Number(x * 1000000n / supply) / 1e4 : null;

  const snipers = [];
  let sniperBought = 0n, sniperHeld = 0n, proCount = 0;
  for (const o of list) {
    const { reasons, pro, slotDelta } = labelSniper(o, createSlot);
    const held = heldMap.has(o.owner) ? heldMap.get(o.owner) : null;
    const isSniper = pro || reasons.includes('early_slot') || reasons.includes('multi_buy');
    if (isSniper) {
      sniperBought += o.amt;
      if (held != null) sniperHeld += held;
      if (pro) proCount++;
    }
    snipers.push({
      owner: o.owner, short: short(o.owner),
      boughtPct: pct(o.amt), heldPct: held != null ? pct(held) : null,
      buys: o.n, slotDelta, pro, sniper: isSniper, reasons,
    });
  }

  const sniperList = snipers.filter(s => s.sniper);
  const boughtPct = pct(sniperBought);
  const heldPct = pct(sniperHeld);
  const sniperPct = (heldPct != null && heldPct > 0.05) ? heldPct : (boughtPct ?? heldPct);
  const risk = riskLevel(sniperPct, proCount, list.length);
  const windowSec = (() => {
    const times = wraps.map(w => w.blockTime).filter(Boolean);
    if (times.length < 2) return null;
    return Math.max(...times) - Math.min(...times);
  })();

  return {
    ok: true, configured: true, mint, empty: false, pump: !!coin,
    creator, curve, created: createdMs, launchSlot: createSlot,
    sampledTx: use.length, earlyBuyers: list.length,
    snipers: sniperList.length, proSnipers: proCount,
    sniperPct: sniperPct != null ? +sniperPct.toFixed(2) : null,
    sniperHeldPct: heldPct != null ? +heldPct.toFixed(2) : null,
    sniperBoughtPct: boughtPct != null ? +boughtPct.toFixed(2) : null,
    risk, windowSec, src: rpcUsed || sigRpc || null,
    warning: risk.level === 'high' || risk.level === 'medium'
      ? 'Even if the contract looks clean, heavy sniper holdings can leave the chart "dead by programming" — bots may dump into retail.'
      : null,
    top: sniperList.slice(0, 15).map(s => ({
      owner: s.owner, short: s.short, boughtPct: s.boughtPct, heldPct: s.heldPct,
      buys: s.buys, slotDelta: s.slotDelta, pro: s.pro, reasons: s.reasons,
    })),
    buyers: snipers.slice(0, 40).map(s => ({
      owner: s.owner, short: s.short, boughtPct: s.boughtPct, heldPct: s.heldPct,
      sniper: s.sniper, pro: s.pro, slotDelta: s.slotDelta, reasons: s.reasons,
    })),
    legend: {
      red: 'Likely sniper / pro bot (same/next slot, multi-buy, high fee)',
      green: 'Ordinary early buyer in the sample',
    },
    note: 'Demo v1: first buyers in the opening slots after launch. Labels are heuristics, not proof of bot identity.',
    at: Date.now(),
  };
}

export const onRequest = async ({ request: req, env, waitUntil }) => {
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const u = new URL(req.url);
  const mint = u.searchParams.get('mint') || u.searchParams.get('ca') || '';
  if (!MINT_RE.test(mint)) return json(400, { error: 'bad mint' });
  const bust = u.searchParams.get('fresh') === '1';
  const cacheKey = new Request('https://memecheck-cache.internal/snipers/v3/' + mint);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (!bust) try {
    const hit = cache && await cache.match(cacheKey);
    if (hit) return json(200, await hit.text(), { 'cache-control': `public, max-age=${TTL}`, 'x-cache': 'HIT' });
  } catch {}

  let res, tm;
  try {
    res = await Promise.race([
      build(env, mint),
      new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('timeout')), 26000); }),
    ]);
  } catch (e) {
    const reason = /timeout/i.test(String(e?.message || e)) ? 'timeout' : (isRate(e) ? 'rate_limited' : 'sigs');
    res = {
      ok: true, configured: !!(env && env.HELIUS_KEY), mint, empty: true,
      reason, soft: true, message: softMsg(reason), at: Date.now(),
    };
  } finally { clearTimeout(tm); }

  const body = JSON.stringify(res);
  const ttl = (res.soft || res.reason === 'rate_limited') ? TTL_SOFT : TTL;
  // Cache real results always; cache rate-limit soft-degrades briefly to stop Retry stampedes.
  // Do NOT cache timeouts — a concurrent slow scan must not poison a good colo entry.
  const cacheable = res.ok && res.reason !== 'timeout' && ( !res.soft || res.reason === 'rate_limited' || res.reason === 'no_buyers' || res.reason === 'none' || !res.empty );
  if (cache && cacheable) {
    const p = cache.put(cacheKey, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` } })).catch(() => {});
    waitUntil ? waitUntil(p) : await p;
  }
  return json(200, body, { 'cache-control': `public, max-age=${ttl}`, 'x-cache': bust ? 'BYPASS' : 'MISS' });
};
