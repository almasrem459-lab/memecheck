// Developer + bundle/sniper analysis for pump.fun (Solana) tokens. Lazy, read-only, never guesses:
// anything that cannot be determined is returned as null and shown as "unavailable".
// Sources: pump.fun frontend API (via /api/proxy) and the public Solana RPC (via /api/rpc; it rejects browser origins).
// cfg: server-side callers (cache warmer Worker) can point rpc at a keyed endpoint and use bigger batches.
export const cfg = { rpc: 'https://api.mainnet-beta.solana.com', batch: 5, rate: 175 };
const PUMP = 'https://frontend-api-v3.pump.fun';
const inBrowser = typeof window !== 'undefined' && typeof location !== 'undefined' && location.protocol.startsWith('http');
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timeout')), ms))]);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function pump(path) {
  const u = PUMP + path;
  const r = await fetch(inBrowser ? '/api/proxy?url=' + encodeURIComponent(u) : u, { headers: { accept: 'application/json', ...(inBrowser ? {} : { 'user-agent': 'Mozilla/5.0' }) } });
  if (r.status === 404) return null; if (!r.ok) throw new Error('pump.fun HTTP ' + r.status); return r.json();
}
// JSON-RPC; accepts a batch (array of [method, params]). Retries rate-limited/failed calls (whole batch or single items) with backoff.
// Permanent per-item errors (e.g. skipped slot) come back as null.
const TRANSIENT = new Set([429, -16500, -32429, -32005, -32603, -32000, -32052, -32029, -32014]);
// Global throttle: Helius free = 10 req/s and every batch item counts, so keep all callers (dev, bundle, exit, bubble map) under ~8 calls/s.
let nextAt = 0;
async function slot(n) { const now = Date.now(); const at = Math.max(now, nextAt); nextAt = at + n * cfg.rate; if (at > now) await sleep(at - now); }
async function rpc(calls) {
  const out = new Array(calls.length).fill(null); let todo = calls.map((c, i) => i);
  for (let a = 0; a < 6 && todo.length; a++) {
    if (a) await sleep(400 * 2 ** (a - 1) + Math.random() * 300);
    await slot(todo.length);
    const body = todo.map(i => ({ jsonrpc: '2.0', id: i, method: calls[i][0], params: calls[i][1] }));
    let arr;
    try {
      const r = await fetch(inBrowser ? '/api/rpc' : cfg.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (r.status === 429 || r.status >= 500) continue;
      if (!r.ok) throw new Error('RPC HTTP ' + r.status);
      const d = await r.json(); arr = Array.isArray(d) ? d : [d];
    } catch (e) { if (/RPC HTTP/.test(e.message)) throw e; continue; }
    const retry = [];
    for (const i of todo) {
      const x = arr.find(y => y && y.id === i);
      if (x && 'result' in x && !x.error) out[i] = x.result;
      else if (!x || TRANSIENT.has(x.error?.code)) retry.push(i);
    }
    todo = retry;
  }
  if (todo.length === calls.length) throw new Error('RPC rate limited');
  return out;
}
const one = async (m, p) => (await rpc([[m, p]]))[0];
// getTransaction results are immutable: share them between the bundle check and the exit trace (same launch txs).
const txCache = new Map();
async function getTxs(sigs, encoding = 'json') {
  const miss = [...new Set(sigs.filter(s => !txCache.has(encoding + s)))];
  for (let i = 0, B = cfg.batch; i < miss.length; i += B) {
    const res = await rpc(miss.slice(i, i + B).map(s => ['getTransaction', [s, { maxSupportedTransactionVersion: 1, encoding, commitment: 'confirmed' }]]));
    res.forEach((t, k) => { if (t) txCache.set(encoding + miss[i + k], t); });
  }
  return sigs.map(s => txCache.get(encoding + s) || null);
}

export async function devCheck(mint) {
  const coin = await pump('/coins-v2/' + mint).catch(() => null);
  if (!coin?.creator || coin.program !== 'pump') return genericDev(mint);
  const creator = coin.creator, now = Date.now(); if (coin.created_timestamp) created.set(mint, coin.created_timestamp);
  let list = [], total = null;
  try {
    for (let off = 0; off < 200; off += 50) {
      const d = await pump(`/coins-v2/user-created-coins/${creator}?offset=${off}&limit=50&includeNsfw=true`);
      const cs = d?.coins || []; total = d?.count ?? total; list.push(...cs); if (cs.length < 50) break;
    }
  } catch { list = null; }
  let stats = null;
  if (list) {
    const others = list.filter(c => c.mint !== mint);
    const grad = others.filter(c => c.complete).length;
    const dead = others.filter(c => !c.complete && now - c.created_timestamp > 6 * 36e5 && (c.usd_market_cap ?? 0) < 10000).length;
    stats = { total: Math.max(total ?? list.length, list.length), others: (total ?? list.length) - (list.some(c => c.mint === mint) ? 1 : 0), seen: others.length, grad, dead, young: others.length - grad - dead, capped: list.length >= 200 };
  }
  // Current dev holding (all token accounts the creator owns for this mint).
  let held = null, supply = null, decimals = 6;
  try {
    const [acc, sup] = await rpc([['getTokenAccountsByOwner', [creator, { mint }, { encoding: 'jsonParsed' }]], ['getTokenSupply', [mint]]]);
    if (acc && sup) {
      held = acc.value.reduce((s, a) => s + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
      supply = BigInt(sup.value.amount); decimals = sup.value.decimals;
    }
  } catch {}
  return { pump: true, creator, coin: { curve: coin.bonding_curve, complete: !!coin.complete, created: coin.created_timestamp, name: coin.name },
    stats, heldPct: held != null && supply ? Number(held * 1000000n / supply) / 1e4 : null, held, supply, decimals };
}

// Earliest trades. Paging getSignaturesForAddress back from "now" cannot reach the launch of a busy token, so we jump:
// estimate the slot ~20 s after creation (pump.fun created_timestamp + getBlockTime), take a signature from that block,
// and page the mint's history *before* it. That yields the launch window in 1-2 calls for any token age.
const walks = new Map(), created = new Map();
async function slotAt(t) {
  const cur = await one('getSlot', [{ commitment: 'finalized' }]); let ct = await one('getBlockTime', [cur]);
  let x = Math.round(cur - (ct - t) / 0.4), rate = 0.4;
  for (let i = 0; i < 8; i++) {
    let b = null, k = 0; for (; k < 6 && b == null; k++) b = await one('getBlockTime', [x + k]).catch(() => null);
    if (b == null) break; x += k - 1; const dt = b - t;
    if (Math.abs(dt) <= 4) return x;
    if (b !== ct) rate = Math.min(0.6, Math.max(0.3, Math.abs((ct - b) / (cur - x)) || 0.4));
    x -= Math.round(dt / rate);
  }
  return x;
}
async function walkSigs(mint, maxPages = 4) {
  if (walks.has(mint)) return walks.get(mint);
  let before, sigs = [], reached = false;
  const page0 = await one('getSignaturesForAddress', [mint, { limit: 1000 }]);
  if (!page0) throw new Error('no signatures');
  if (page0.length < 1000) { const w = page0.reverse(); walks.set(mint, w); return w; }
  const T = created.get(mint);
  if (T) {
    try {
      const x = await slotAt(T / 1000 + 60);
      let blk = null; for (let k = 0; k < 6 && !blk; k++) blk = await one('getBlock', [x + k, { transactionDetails: 'signatures', rewards: false, maxSupportedTransactionVersion: 1, commitment: 'finalized' }]).catch(() => null);
      before = blk?.signatures?.at(-1);
      for (let p = 0; before && p < 3; p++) {
        const page = await one('getSignaturesForAddress', [mint, { limit: 1000, before }]);
        if (!page) break; sigs.push(...page);
        if (page.length < 1000) { reached = page.length > 0 || sigs.length > 0; break; } before = page[page.length - 1].signature;
      }
      if (reached && sigs.length) { const w = sigs.reverse(); walks.set(mint, w); return w; }
    } catch {}
  }
  sigs = [...page0]; before = page0[page0.length - 1].signature;
  for (let p = 1; p < maxPages; p++) {
    const page = await one('getSignaturesForAddress', [mint, { limit: 1000, before }]);
    if (!page) throw new Error('no signatures'); sigs.push(...page);
    if (page.length < 1000) { reached = true; break; } before = page[page.length - 1].signature;
  }
  const w = reached ? sigs.reverse() : null; walks.set(mint, w); return w;
}
export async function bundleCheck(mint, creator, curve, { maxPages = 4, slotsAfter = 2, maxTx = 40 } = {}) {
  const sigs = await walkSigs(mint, maxPages);
  if (!sigs) return { available: false, reason: 'tooMany' };
  if (!sigs.length) return { available: false, reason: 'none' };
  const S = sigs[0].slot; const early = sigs.filter(s => s.slot <= S + slotsAfter && !s.err).slice(0, maxTx);
  const txs = (await getTxs(early.map(s => s.signature))).map((t, k) => ({ t, slot: early[k].slot }));
  if (txs.filter(x => !x.t).length > txs.length * 0.2) return { available: false, reason: 'rpc' };
  for (let i = txs.length - 1; i >= 0; i--) if (!txs[i].t) txs.splice(i, 1);
  const buyers = new Map(); let devBuy = 0n, total = 0n;
  for (const { t, slot } of txs) {
    const keys = [...t.transaction.message.accountKeys, ...(t.meta.loadedAddresses?.writable || []), ...(t.meta.loadedAddresses?.readonly || [])];
    const signers = new Set(t.transaction.message.accountKeys.slice(0, t.transaction.message.header.numRequiredSignatures));
    const pre = new Map(), post = new Map();
    for (const b of t.meta.preTokenBalances || []) if (b.mint === mint) pre.set(b.accountIndex, b);
    for (const b of t.meta.postTokenBalances || []) if (b.mint === mint) post.set(b.accountIndex, b);
    for (const [idx, b] of post) {
      const d = BigInt(b.uiTokenAmount.amount) - BigInt(pre.get(idx)?.uiTokenAmount.amount || '0');
      if (d <= 0n || !b.owner) continue;
      if (b.owner === creator) { devBuy += d; continue; }
      if (b.owner === curve) continue;
      // count only wallets that signed (paid for) the tx; pools/vaults/PDAs receiving tokens are not buyers
      if (!signers.has(b.owner)) continue;
      // skip the bonding curve itself (its balance only rises on sells/creation)
      const o = buyers.get(b.owner) || { owner: b.owner, amt: 0n, accts: new Set(), slot, signer: keys[0] };
      o.amt += d; o.accts.add(keys[idx]); buyers.set(b.owner, o);
    }
  }
  const sup = BigInt((await one('getTokenSupply', [mint])).value.amount);
  for (const o of buyers.values()) total += o.amt;
  const list = [...buyers.values()].sort((a, b) => (b.amt > a.amt ? 1 : -1));
  // How much the early buyers still hold, from the same token accounts.
  let stillHeld = null;
  try {
    const accts = [...new Set(list.flatMap(o => [...o.accts]))].slice(0, 100);
    if (accts.length) {
      const res = await one('getMultipleAccounts', [accts, { encoding: 'jsonParsed' }]);
      stillHeld = res.value.reduce((s, a) => s + (a?.data?.parsed?.info?.mint === mint ? BigInt(a.data.parsed.info.tokenAmount.amount) : 0n), 0n);
    } else stillHeld = 0n;
  } catch {}
  const pct = (x) => x == null ? null : Number(x * 1000000n / sup) / 1e4;
  return { available: true, slot: S, txCount: txs.length, buyers: list.length, boughtPct: pct(total), heldPct: pct(stillHeld), devBuyPct: pct(devBuy), devBuy,
    sameSlot: list.filter(o => o.slot === S).length, top: list.slice(0, 5).map(o => ({ owner: o.owner, pct: pct(o.amt), slot: o.slot - S })) };
}

// ---------- Exit trace: who funded the first ~50 buyers, cluster them, and how much each cluster sold ----------
const parsedIx = (t) => [...(t.transaction.message.instructions || []), ...((t.meta.innerInstructions || []).flatMap(x => x.instructions))];
async function batched(calls, size = cfg.batch, gap = 0) {
  const out = [];
  for (let i = 0; i < calls.length; i += size) { out.push(...await rpc(calls.slice(i, i + size))); if (i + size < calls.length) await sleep(gap); }
  return out;
}
// Earliest incoming SOL transfer (system transfer / createAccount) to `wallet`, one page of history (busier wallets = unknown).
const fundCache = new Map();
async function fundersOf(wallets) {
  const res = {}; for (const w of wallets) if (fundCache.has(w)) res[w] = fundCache.get(w);
  wallets = wallets.filter(w => !fundCache.has(w)); let pending = wallets.map(w => ({ w, before: null, pages: 0 }));
  const oldest = {};
  while (pending.length) {
    const pages = await batched(pending.map(p => ['getSignaturesForAddress', [p.w, { limit: 1000, ...(p.before ? { before: p.before } : {}) }]]));
    const next = [];
    pending.forEach((p, i) => {
      const pg = pages[i]; if (!pg) { res[p.w] = null; return; }
      if (pg.length) oldest[p.w] = pg[pg.length - 1].signature;
      if (pg.length < 1000) return; if (p.pages + 1 >= 1) { delete oldest[p.w]; res[p.w] = null; return; }
      next.push({ w: p.w, before: pg[pg.length - 1].signature, pages: p.pages + 1 });
    });
    pending = next;
  }
  const ws = Object.keys(oldest);
  const txs = await getTxs(ws.map(w => oldest[w]), 'jsonParsed');
  ws.forEach((w, i) => {
    const t = txs[i]; if (!t) { res[w] = null; return; }
    const ix = parsedIx(t).find(x => x.program === 'system' && x.parsed && ['transfer', 'createAccount', 'createAccountWithSeed', 'transferWithSeed'].includes(x.parsed.type) &&
      (x.parsed.info.destination === w || x.parsed.info.newAccount === w));
    res[w] = ix ? (ix.parsed.info.source || ix.parsed.info.fundingAccount || null) : null;
  });
  for (const w of wallets) fundCache.set(w, res[w] ?? null);
  return res;
}
// A funder with 1000+ txs inside 6 hours is treated as an exchange/bot hot wallet and not used to link wallets.
const busyCache = new Map();
async function busyWallets(addrs) {
  const busy = new Set(addrs.filter(a => busyCache.get(a))); addrs = addrs.filter(a => !busyCache.has(a)); if (!addrs.length) return busy;
  const pages = await batched(addrs.map(a => ['getSignaturesForAddress', [a, { limit: 1000 }]]));
  addrs.forEach((a, i) => { const p = pages[i]; const b = !!(p && p.length >= 1000 && (p[0].blockTime - p[p.length - 1].blockTime) < 6 * 3600); if (p) busyCache.set(a, b); if (b) busy.add(a); });
  return busy;
}
export async function exitTrace(mint, creator, curve, { maxBuyers = 40, maxTx = 80 } = {}) {
  const sigs = await walkSigs(mint);
  if (!sigs) return { available: false, reason: 'tooMany' };
  const early = sigs.filter(s => !s.err).slice(0, maxTx);
  const txs = await getTxs(early.map(s => s.signature));
  if (txs.filter(t => !t).length > txs.length * 0.2) return { available: false, reason: 'rpc' };
  for (let i = txs.length - 1; i >= 0; i--) if (!txs[i]) txs.splice(i, 1);
  const buyers = new Map();
  for (const t of txs) {
    const keys = [...t.transaction.message.accountKeys, ...(t.meta.loadedAddresses?.writable || []), ...(t.meta.loadedAddresses?.readonly || [])];
    const signers = new Set(t.transaction.message.accountKeys.slice(0, t.transaction.message.header.numRequiredSignatures));
    const pre = new Map((t.meta.preTokenBalances || []).filter(b => b.mint === mint).map(b => [b.accountIndex, b]));
    for (const b of t.meta.postTokenBalances || []) {
      if (b.mint !== mint || !b.owner || b.owner === curve || !signers.has(b.owner)) continue;
      const d = BigInt(b.uiTokenAmount.amount) - BigInt(pre.get(b.accountIndex)?.uiTokenAmount.amount || '0'); if (d <= 0n) continue;
      if (!buyers.has(b.owner) && buyers.size >= maxBuyers) continue;
      const o = buyers.get(b.owner) || { owner: b.owner, amt: 0n, accts: new Set(), payer: keys[0] !== b.owner ? keys[0] : null }; o.amt += d; o.accts.add(keys[b.accountIndex]); buyers.set(b.owner, o);
    }
  }
  const sup = BigInt((await one('getTokenSupply', [mint])).value.amount);
  // current balances of the same token accounts
  const accts = [...new Set([...buyers.values()].flatMap(o => [...o.accts]))]; const bal = {};
  for (let i = 0; i < accts.length; i += 100) {
    const r = await one('getMultipleAccounts', [accts.slice(i, i + 100), { encoding: 'jsonParsed' }]); if (!r) return { available: false, reason: 'rpc' };
    r.value.forEach((a, k) => { bal[accts[i + k]] = a?.data?.parsed?.info?.mint === mint ? BigInt(a.data.parsed.info.tokenAmount.amount) : 0n; });
  }
  for (const o of buyers.values()) o.held = [...o.accts].reduce((s, a) => s + (bal[a] ?? 0n), 0n);
  const wallets = [...new Set([...buyers.keys(), creator])];
  const fund = await fundersOf(wallets);
  // A buy whose fees were paid by another wallet links the two as strongly as SOL funding does.
  const via = {}; for (const w of wallets) { const py = buyers.get(w)?.payer; if (py && !fund[w]) { fund[w] = py; via[w] = 'payer'; } }
  const counts = {}; Object.values(fund).forEach(f => { if (f) counts[f] = (counts[f] || 0) + 1; });
  const shared = Object.keys(counts).filter(f => counts[f] >= 2 && f !== creator && !buyers.has(f));
  const busy = await busyWallets([...new Set([...shared, ...Object.keys(via).map(w => fund[w])])].slice(0, 20));
  // union-find over wallets + funders
  const par = {}; const find = (x) => (par[x] ??= x) === x ? x : (par[x] = find(par[x])); const uni = (a, b) => { par[find(a)] = find(b); };
  for (const w of wallets) { find(w); const f = fund[w]; if (f && !busy.has(f)) uni(w, f); }
  const groups = {};
  for (const w of wallets) { const r = find(w); (groups[r] ??= []).push(w); }
  const pct = (x) => Number(x * 1000000n / sup) / 1e4;
  const clusters = Object.values(groups).map(ws => {
    const bs = ws.map(w => buyers.get(w)).filter(Boolean); const bought = bs.reduce((s, o) => s + o.amt, 0n), held = bs.reduce((s, o) => s + o.held, 0n);
    const funders = [...new Set(ws.map(w => fund[w]).filter(f => f && !busy.has(f)))];
    return { members: ws, wallets: ws.length, buyers: bs.length, dev: ws.includes(creator), funder: funders[0] || null, boughtPct: pct(bought), heldPct: pct(held), soldPct: bought ? Number((bought - (held < bought ? held : bought)) * 1000n / bought) / 10 : null };
  }).filter(c => c.buyers > 0 && (c.wallets >= 2 && (c.buyers >= 2 || c.dev))).sort((a, b) => b.boughtPct - a.boughtPct);
  const totalBought = [...buyers.values()].reduce((s, o) => s + o.amt, 0n);
  const result = { available: true, buyers: buyers.size, txs: txs.length, fundersKnown: wallets.filter(w => fund[w]).length, wallets: wallets.length, busy: busy.size,
    totalBoughtPct: pct(totalBought), clusters, linkedBuyers: clusters.reduce((s, c) => s + c.buyers, 0), linkedBoughtPct: clusters.reduce((s, c) => s + c.boughtPct, 0), linkedHeldPct: clusters.reduce((s, c) => s + c.heldPct, 0) };
  exitCache.set(mint, result); return result;
}
export const exitCache = new Map();
// Holder links for the bubble map: shared funder (earliest incoming SOL), funder is another holder, or same exit-trace cluster.
export async function holderLinks(mint, owners) {
  const fund = await fundersOf(owners);
  const cnt = {}; Object.values(fund).forEach(f => { if (f) cnt[f] = (cnt[f] || 0) + 1; });
  const cand = Object.keys(cnt).filter(f => cnt[f] >= 2 || owners.includes(f));
  const busy = await busyWallets(cand.slice(0, 20));
  const par = {}; const find = (x) => (par[x] ??= x) === x ? x : (par[x] = find(par[x])); const uni = (a, b) => { par[find(a)] = find(b); };
  const edges = []; const set = new Set(owners);
  for (const w of owners) { find(w); const f = fund[w]; if (f && !busy.has(f) && cand.includes(f)) { uni(w, f); edges.push([w, f, set.has(f) ? 'direct' : 'funder']); } }
  const ex = exitCache.get(mint);
  if (ex?.clusters) for (const c of ex.clusters) { const m = c.members.filter(x => set.has(x)); for (let i = 1; i < m.length; i++) { uni(m[0], m[i]); edges.push([m[0], m[i], 'exit']); } }
  const group = {}; for (const w of owners) group[w] = find(w);
  return { group, fund, edges, known: owners.filter(w => fund[w]).length, busy: busy.size };
}
// Non-pump.fun Solana tokens (Raydium/Meteora/Moonshot/bonk.fun/...): creator = fee payer of the earliest mint transaction,
// when the launch is reachable within a few signature pages. No launchpad stats. Returns { pump:false } when it cannot tell.
async function genericDev(mint) {
  let sigs; try { sigs = await walkSigs(mint, 3); } catch { return { pump: false }; }
  if (!sigs?.length) return { pump: false };
  const [t] = await getTxs([sigs[0].signature]); const creator = t?.transaction?.message?.accountKeys?.[0];
  if (!creator) return { pump: false };
  const createdTs = (t.blockTime || sigs[0].blockTime) * 1000 || null; if (createdTs) created.set(mint, createdTs);
  let held = null, supply = null, decimals = 6;
  try { const [acc, sup] = await rpc([['getTokenAccountsByOwner', [creator, { mint }, { encoding: 'jsonParsed' }]], ['getTokenSupply', [mint]]]);
    if (acc && sup) { held = acc.value.reduce((s, a) => s + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n); supply = BigInt(sup.value.amount); decimals = sup.value.decimals; } } catch {}
  return { pump: true, generic: true, creator, coin: { curve: null, complete: true, created: createdTs, name: null }, stats: null,
    heldPct: held != null && supply ? Number(held * 1000000n / supply) / 1e4 : null, held, supply, decimals };
}
// Restore the launch time when devCheck came from a cache (lets walkSigs jump straight to the launch window).
export const setCreated = (mint, ts) => { if (ts) created.set(mint, ts); };
export { withTimeout, rpc };
