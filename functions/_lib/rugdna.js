// RugDNA core (MIT): an open identity graph that links Solana meme-coin launcher wallets through their FIRST FUNDER
// (the source of the first meaningful incoming SOL transfer). Shared by the Pages Functions (/api/rugdna/*, /api/dev ingest)
// and the memecheck-warmer cron. Storage: D1 `memecheck-rugdna` (binding RUGDNA). Data: CC-BY 4.0.
//
// Method (v1, deliberately conservative):
//   launch   = a token mint + its creator wallet (Jupiter token index `dev`, pump.fun/RugCheck as fallback).
//   funder   = source of the oldest incoming SOL transfer >= 0.005 SOL to the creator wallet (looked at the oldest 5 txs).
//   cluster  = >= 2 creator wallets with the same funder. Known exchange wallets, high-velocity service wallets
//              (>= 100 txs inside 6 h) and funders that fan out to >= 100 wallets are NOT clustered (kind != 'ok').
//   dead     = same rule as the site's Developer history (devhist-core.js): >= 6 h old and no market / market cap < $10K.
//   rugged   = dead subset: reached >= $50K and is now < 10% of that (or gone).
//   warning  = only when OTHER wallets of the cluster have >= 3 dead launches AND >= 70% of their judged launches are dead.
//              The creator's own earlier coins are left to Developer history so nothing is double counted.
import { classify, bestPairs, LIVE_MCAP, PUMPED_ATH } from '../../devhist-core.js';

export const ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const T = {
  MIN_WALLETS: 2, WARN_DEAD: 3, FAIL_DEAD: 5, WARN_RATIO: 0.7, FAIL_RATIO: 0.8,
  MIN_FUND_LAMPORTS: 5_000_000, VEL_N: 100, VEL_SECS: 6 * 3600, HUB_WALLETS: 100, JUDGE_H: 6,
};
const DAY = 864e5;
const ZERO = '11111111111111111111111111111111';
// Known exchange / custodian hot wallets (best effort; the velocity + hub rules are the real safety net).
export const STATIC_FUNDERS = {
  '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9': 'Binance', '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM': 'Binance', '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S': 'Binance',
  'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS': 'Coinbase', '2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm': 'Coinbase', 'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE': 'Coinbase',
  '5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD': 'OKX', 'is6MTRHEgyFLNTfYcuV4QBWLjrZBfmhVNYR6ccgr8KV': 'OKX', 'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2': 'Bybit',
  'BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6': 'KuCoin', 'FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5': 'Kraken', 'u6PJ8DtQuPFnfmwHbGFULQ4u4EgjDiyYKjVEsynXq2w': 'Gate.io',
  'ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ': 'MEXC', 'A77HErqtfN1hLLpvZ9pCtu66FEtM8BveoaKbbMoZ4RiR': 'Bitget', '88xTWZMeKfiTgbfEmPLdsUCQcZinwUfk25EBQZ21XMAZ': 'HTX',
  '6FEVkH17P9y8Q9aCkDdPcMDjvj7SVxrTETaYEm8f51Jy': 'Crypto.com',
  '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV': 'pump.fun fee account', '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg': 'pump.fun migration',
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'pump.fun program', [ZERO]: 'System program',
};
const UA = 'Mozilla/5.0 (MemeCheck-RugDNA/1.0; +https://memecheck.pages.dev/rugdna)';

// ---------------------------------------------------------------- http / rpc
async function getJson(url, ms = 7000) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': UA } }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); }
  finally { clearTimeout(tm); }
}
const PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';
export const rpcUrl = (env) => env?.RPC_URL || (env?.HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_KEY}` : PUBLIC_RPC);
// JSON-RPC batch (one subrequest). Returns an array aligned with calls; a failed call is null.
// If the keyed endpoint answers nothing at all, one retry goes to the public Solana RPC.
const FALLBACKS = ['https://solana-rpc.publicnode.com', PUBLIC_RPC];
export async function rpcBatch(url, calls, ms = 12000) {
  const out = await rpcBatchOnce(url, calls, ms);
  if (FALLBACKS.includes(url)) return out;
  await new Promise(r => setTimeout(r, Math.min(1500, calls.length * 110))); // keyed free tier ~10 req/s: a batch of N counts as N requests
  // keyed endpoint failed for some calls: retry just those (max 8) on free public endpoints
  for (const fb of FALLBACKS) {
    const idx = out.map((x, i) => x === null ? i : -1).filter(i => i >= 0).slice(0, 8); if (!idx.length) break;
    const r = await rpcBatchOnce(fb, idx.map(i => calls[i]), ms); idx.forEach((i, k) => { if (r[k] !== null && r[k] !== undefined) out[i] = r[k]; });
  }
  return out;
}
const note = (m, url) => { if (DIAG.err.length < 160) DIAG.err += (url === PUBLIC_RPC ? 'p:' : 'h:') + String(m).replace(/api-key=[\w-]+/g, '').slice(0, 50) + ';'; };
async function rpcBatchOnce(url, calls, ms) {
  const out = new Array(calls.length).fill(null); if (!calls.length) return out;
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(calls.map((c, i) => ({ jsonrpc: '2.0', id: i, method: c[0], params: c[1] }))) });
    if (!r.ok) { note('http' + r.status, url); return out; } const j = await r.json();
    for (const x of Array.isArray(j) ? j : [j]) { if (x && x.id != null && x.result !== undefined) out[x.id] = x.result; else if (x && x.error) note(String(x.error.message || x.error.code), url); }
  } catch (e) { note('exc:' + String(e?.name || e), url); } finally { clearTimeout(tm); }
  return out;
}
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

// ---------------------------------------------------------------- funder resolution
// First incoming SOL transfer to `w` inside a jsonParsed transaction (top-level + inner system instructions).
export function incomingSol(tx, w) {
  if (!tx || tx.meta?.err) return null;
  const ins = [...(tx.transaction?.message?.instructions || []), ...(tx.meta?.innerInstructions || []).flatMap(x => x.instructions || [])];
  let best = null;
  for (const i of ins) {
    if (i.program !== 'system' || !i.parsed) continue;
    const p = i.parsed, f = p.info || {}; let src, dst;
    if (p.type === 'transfer' || p.type === 'transferWithSeed') { src = f.source; dst = f.destination; }
    else if (p.type === 'createAccount' || p.type === 'createAccountWithSeed') { src = f.source; dst = f.newAccount; }
    else continue;
    const lam = +f.lamports || 0;
    if (dst === w && src && src !== w && lam >= T.MIN_FUND_LAMPORTS && (!best || lam > best.lamports)) best = { from: src, lamports: lam, at: tx.blockTime ? tx.blockTime * 1000 : null };
  }
  return best;
}
// wallets -> Map(wallet -> { funder, lamports, at } | { fail: 'busy'|'no_funder'|'empty'|'rpc' })
export const DIAG = { sigNull: 0, txNull: 0, txNoInc: 0, txOk: 0, clsNull: 0, clsOk: 0, err: '' };
const MAX_PAGES = 2; // up to 2000 signatures per wallet; busier wallets are skipped ('busy')
export async function resolveFunders(wallets, env) {
  const url = rpcUrl(env), res = new Map(), B = 8;
  for (const grp of chunk(wallets, B)) {
    const sigs = await rpcBatch(url, grp.map(w => ['getSignaturesForAddress', [w, { limit: 1000 }]]));
    const first = new Map(); let more = [];
    grp.forEach((w, i) => {
      const s = sigs[i]; if (!Array.isArray(s)) { DIAG.sigNull++; res.set(w, { fail: 'rpc' }); return; }
      if (!s.length) { res.set(w, { fail: 'empty' }); return; }
      if (s.length >= 1000) { more.push([w, s[s.length - 1].signature]); return; }
      first.set(w, s);
    });
    // Busy wallets: keep paging back (1000 signatures per page, batched across wallets) up to MAX_PAGES; still more => too busy to trace cheaply
    for (let pgn = 1; more.length && pgn < MAX_PAGES; pgn++) {
      const pg = []; for (const g of chunk(more, 6)) pg.push(...await rpcBatch(url, g.map(([w, b]) => ['getSignaturesForAddress', [w, { limit: 1000, before: b }]]), 20000)); const nxt = [];
      more.forEach(([w], i) => { const s = pg[i]; if (!Array.isArray(s) || !s.length) res.set(w, { fail: 'busy' }); else if (s.length >= 1000) nxt.push([w, s[s.length - 1].signature]); else first.set(w, s); });
      more = nxt;
    }
    for (const [w] of more) res.set(w, { fail: 'busy' });
    // oldest-first successful signatures (up to 5 per wallet; round 1 asks only the oldest)
    const old = new Map(); for (const [w, s] of first) old.set(w, s.filter(x => !x.err).slice(-5).reverse().map(x => x.signature));
    const todo = new Map([...old].filter(([, v]) => v.length));
    for (const w of first.keys()) if (!todo.has(w)) res.set(w, { fail: 'no_funder' });
    for (let round = 0; round < 2 && todo.size; round++) {
      const jobs = []; for (const [w, v] of todo) for (const sg of (round === 0 ? v.slice(0, 1) : v.slice(1))) jobs.push([w, sg]);
      if (!jobs.length) break;
      const txs = []; for (const g of chunk(jobs, B)) txs.push(...await rpcBatch(url, g.map(([, sg]) => ['getTransaction', [sg, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]])));
      jobs.forEach(([w], i) => { if (res.has(w) && res.get(w).funder) return; if (txs[i] == null) { DIAG.txNull++; if (round === 1 || todo.get(w).length < 2) { res.set(w, { fail: 'rpc' }); todo.delete(w); } return; } const inc = incomingSol(txs[i], w); if (!inc) DIAG.txNoInc++; if (inc) { DIAG.txOk++; res.set(w, { funder: inc.from, lamports: inc.lamports, at: inc.at }); todo.delete(w); } });
    }
    for (const w of todo.keys()) if (!res.has(w)) res.set(w, { fail: 'no_funder' });
  }
  return res;
}
// A launcher wallet is a plain system-owned account. Mints, token accounts and programs are not (guards /wallet/:addr against mint addresses).
export async function isPlainWallet(addr, env) {
  const [r] = await rpcBatch(rpcUrl(env), [['getAccountInfo', [addr, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }]]], 8000);
  if (r === null) return null; // rpc failure: unknown
  return !!r.value && r.value.owner === ZERO;
}
// Classify funders we have not seen: static exchange labels, then high-velocity services (>= 100 txs in 6 h).
export async function classifyFunders(db, addrs, env, now = Date.now()) {
  const uniq = [...new Set(addrs.filter(Boolean))], kinds = new Map(), need = [];
  if (!uniq.length) return kinds;
  const have = await db.prepare(`SELECT addr, kind, label, checked_at FROM funders WHERE addr IN (${uniq.map(() => '?').join(',')})`).bind(...uniq).all();
  const seen = new Map((have.results || []).map(r => [r.addr, r]));
  for (const a of uniq) {
    if (STATIC_FUNDERS[a]) { kinds.set(a, { kind: /pump\.fun|System/.test(STATIC_FUNDERS[a]) ? 'service' : 'cex', label: STATIC_FUNDERS[a] }); continue; }
    const r = seen.get(a); if (r && now - r.checked_at < 7 * DAY) kinds.set(a, { kind: r.kind, label: r.label }); else need.push(a);
  }
  if (need.length) {
    const url = rpcUrl(env), out = []; for (const g of chunk(need, 8)) out.push(...await rpcBatch(url, g.map(a => ['getSignaturesForAddress', [a, { limit: T.VEL_N }]])));
    need.forEach((a, i) => {
      const s = out[i]; if (!Array.isArray(s)) { DIAG.clsNull++; return; } DIAG.clsOk++; // unknown: not stored, retried later
      const busy = s.length >= T.VEL_N && s[0].blockTime && s[s.length - 1].blockTime && (s[0].blockTime - s[s.length - 1].blockTime) < T.VEL_SECS;
      kinds.set(a, busy ? { kind: 'service', label: 'high-velocity wallet' } : { kind: 'ok', label: null });
    });
  }
  const ins = []; for (const [a, k] of kinds) if (!seen.get(a) || seen.get(a).kind !== k.kind) ins.push(db.prepare('INSERT INTO funders (addr, kind, label, checked_at) VALUES (?,?,?,?) ON CONFLICT(addr) DO UPDATE SET kind=excluded.kind, label=excluded.label, checked_at=excluded.checked_at').bind(a, k.kind, k.label, now));
  if (ins.length) await db.batch(ins);
  return kinds;
}

// ---------------------------------------------------------------- data sources
// Jupiter token index (free lite API): creator ("dev"), launchpad, market data. Newest launches + batch lookup by mint.
const JUP = 'https://lite-api.jup.ag/tokens/v2';
export const jupRow = (x) => x && x.id && x.dev && ADDR_RE.test(x.dev) ? { mint: x.id, creator: x.dev, symbol: String(x.symbol || '').slice(0, 20), name: String(x.name || '').slice(0, 40), created_at: Date.parse(x.firstPool?.createdAt || x.createdAt || '') || null, launchpad: x.launchpad || null, devMints: +x.audit?.devMints || null, mc: +(x.mcap ?? x.fdv) || 0, liq: +x.liquidity || 0 } : null;
export async function jupRecent() { const a = await getJson(`${JUP}/recent`); return (Array.isArray(a) ? a : []).map(jupRow).filter(Boolean); }
export async function jupByMints(mints) { const out = new Map(); for (const g of chunk(mints, 50)) { try { const a = await getJson(`${JUP}/search?query=${g.join(',')}`); for (const x of Array.isArray(a) ? a : []) { const r = jupRow(x); if (r) out.set(r.mint, r); } } catch {} } return out; }
// Creator of any mint: Jupiter first, then RugCheck (pump.fun frontend API is Cloudflare-challenged from edges).
export async function creatorOfMint(mint) {
  const j = await jupByMints([mint]); if (j.get(mint)) return { ...j.get(mint), via: 'jupiter' };
  try { const rc = await getJson(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, 6000); if (rc?.creator && ADDR_RE.test(rc.creator)) return { mint, creator: rc.creator, symbol: String(rc.tokenMeta?.symbol || '').slice(0, 20), name: String(rc.tokenMeta?.name || '').slice(0, 40), created_at: null, launchpad: null, via: 'rugcheck' }; } catch {}
  return null;
}
export async function dexBatch(mints) { // -> Map(mint -> {mcap, liq, vol24, dex}) with .okMints = mints whose batch call succeeded; null when every call failed
  const map = new Map(), ok = new Set(); let calls = 0, good = 0;
  for (const g of chunk(mints, 30)) { calls++; try { bestPairs(await getJson(`https://api.dexscreener.com/tokens/v1/solana/${g.join(',')}`), map); good++; g.forEach(x => ok.add(x)); } catch {} }
  if (!calls || !good) return null; map.okMints = ok; return map;
}

// ---------------------------------------------------------------- storage
const q = (db, sql, ...b) => db.prepare(sql).bind(...b);
export async function bump(db, k, n = 1) { await q(db, "INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + ?").bind(k, String(n), n).run(); }
export async function metaGet(db, keys) { const r = await db.prepare(`SELECT k, v FROM meta WHERE k IN (${keys.map(() => '?').join(',')})`).bind(...keys).all(); return Object.fromEntries((r.results || []).map(x => [x.k, x.v])); }
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
// Approximate D1 row-write budget (free plan 100k rows/day): counted per UTC day, ingestion pauses at LIMIT.
export const WRITE_LIMIT = 80000;
export async function writesToday(db) { const m = await metaGet(db, ['w:' + day()]); return +m['w:' + day()] || 0; }
export async function countWrites(db, n) { await bump(db, 'w:' + day(), n); }

// rows: [{ mint, creator, created_at, symbol, name, launchpad, mc, liq, status?, rugged?, grad? }]
export async function ingestLaunches(db, rows, src, pri = 1, now = Date.now()) {
  if (!rows.length) return { launches: 0, wallets: 0 };
  const stmts = [], kind = [], seenW = new Set();
  for (const r of rows) {
    const status = r.status || 'new';
    if (!seenW.has(r.creator)) { seenW.add(r.creator);
      stmts.push(q(db, 'INSERT OR IGNORE INTO wallets (addr, state, pri, first_seen) VALUES (?, ?, ?, ?)', r.creator, 'pending', pri, now)); kind.push('w');
      if (pri >= 2) { stmts.push(q(db, "UPDATE wallets SET pri = ? WHERE addr = ? AND pri < ?", pri, r.creator, pri)); kind.push('u'); } }
    stmts.push(q(db, 'INSERT INTO launches (mint, creator, created_at, first_seen, symbol, name, src, launchpad, status, rugged, grad, dead_at, peak_mc, last_mc, peak_liq, last_checked) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(mint) DO NOTHING',
      r.mint, r.creator, r.created_at || null, now, r.symbol || '', r.name || '', src, r.launchpad || null, status, r.rugged ? 1 : 0, r.grad ? 1 : 0, status === 'dead' ? now : null, r.peak || r.mc || 0, r.mc || null, r.liq || 0, status === 'new' ? null : now)); kind.push(status === 'dead' ? 'ld' : 'l');
  }
  let l = 0, w = 0, d = 0, k = 0;
  for (const g of chunk(stmts, 60)) { const rs = await db.batch(g); rs.forEach((x) => { const c = x.meta?.changes || 0, t = kind[k++]; if (t === 'w') w += c; else if (t === 'ld') { l += c; d += c; } else if (t === 'l') l += c; }); }
  await countWrites(db, stmts.length * 3);
  if (l) await bump(db, 'launches', l);
  if (w) await bump(db, 'wallets', w);
  if (d) await bump(db, 'dead', d);
  return { launches: l, wallets: w };
}
// Mark a wallet's funder and make sure the funder is classified. Returns funders to recompute.
export async function applyResolution(db, res, env, now = Date.now()) {
  const funders = [...res.values()].map(x => x.funder).filter(Boolean);
  const kinds = await classifyFunders(db, funders, env, now), stm = [], touched = new Set(); let nres = 0;
  for (const [w, x] of res) {
    if (x.funder && !kinds.has(x.funder)) stm.push(q(db, "UPDATE wallets SET tries=tries+1, why='classify' WHERE addr=?", w));
    else if (x.funder) { stm.push(q(db, "UPDATE wallets SET funder=?, funded_at=?, funded_lamports=?, state='resolved', why=NULL, resolved_at=?, tries=tries+1 WHERE addr=?", x.funder, x.at || null, x.lamports || null, now, w)); touched.add(x.funder); nres++; }
    else if (x.fail === 'busy') stm.push(q(db, "UPDATE wallets SET state='failed', why='busy', tries=tries+1, resolved_at=? WHERE addr=?", now, w));
    else stm.push(q(db, "UPDATE wallets SET tries=tries+1, why=?, state=CASE WHEN tries+1 >= 3 THEN 'failed' ELSE state END WHERE addr=?", x.fail || 'rpc', w));
  }
  for (const g of chunk(stm, 60)) await db.batch(g);
  await countWrites(db, stm.length * 3);
  if (nres) await bump(db, 'resolved', nres);
  return { funders: [...touched], kinds };
}
export async function pendingWallets(db, n) { const r = await db.prepare("SELECT addr FROM wallets WHERE state='pending' AND tries < 3 ORDER BY pri DESC, first_seen DESC LIMIT ?").bind(n).all(); return (r.results || []).map(x => x.addr); }

// Recompute the aggregate row of a funder cluster. Only funders of kind 'ok' with >= 2 wallets are kept.
export async function recomputeCluster(db, funder, now = Date.now()) {
  const f = await db.prepare('SELECT kind FROM funders WHERE addr = ?').bind(funder).first();
  const w = await db.prepare('SELECT COUNT(*) AS n FROM wallets WHERE funder = ?').bind(funder).first();
  if (!f || f.kind !== 'ok' || (w?.n || 0) < T.MIN_WALLETS) { await db.prepare('DELETE FROM clusters WHERE funder = ?').bind(funder).run(); return null; }
  if (w.n >= T.HUB_WALLETS) { await db.batch([q(db, "UPDATE funders SET kind='hub', label='fans out to >= 100 launcher wallets' WHERE addr = ?", funder), q(db, 'DELETE FROM clusters WHERE funder = ?', funder)]); return null; }
  const a = await db.prepare("SELECT COUNT(*) AS launches, COALESCE(SUM(l.status='dead'),0) AS dead, COALESCE(SUM(l.rugged),0) AS rugged, COALESCE(SUM(l.grad),0) AS grad, MIN(l.created_at) AS first_seen, MAX(l.created_at) AS last_seen FROM launches l JOIN wallets w ON w.addr = l.creator WHERE w.funder = ?").bind(funder).first();
  await db.prepare('INSERT INTO clusters (funder, wallets, launches, dead, rugged, grad, first_seen, last_seen, updated) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(funder) DO UPDATE SET wallets=excluded.wallets, launches=excluded.launches, dead=excluded.dead, rugged=excluded.rugged, grad=excluded.grad, first_seen=excluded.first_seen, last_seen=excluded.last_seen, updated=excluded.updated')
    .bind(funder, w.n, a.launches, a.dead, a.rugged, a.grad, a.first_seen, a.last_seen, now).run();
  return { funder, wallets: w.n, ...a };
}

// ---------------------------------------------------------------- verdict (what a scan shows)
export function levelOf(wallets, deadOther, judgedOther) {
  const ratio = judgedOther ? deadOther / judgedOther : 0;
  if (wallets >= T.MIN_WALLETS && deadOther >= T.FAIL_DEAD && ratio >= T.FAIL_RATIO) return 'fail';
  if (wallets >= T.MIN_WALLETS && deadOther >= T.WARN_DEAD && ratio >= T.WARN_RATIO) return 'warn';
  return wallets >= T.MIN_WALLETS ? 'info' : 'none';
}
// -> { status: 'unknown'|'unresolved'|'service'|'solo'|'linked', ... }
export async function walletVerdict(db, wallet, mint = null) {
  const w = await db.prepare('SELECT addr, funder, state, why, funded_at FROM wallets WHERE addr = ?').bind(wallet).first();
  if (!w) return { status: 'unknown', wallet };
  if (!w.funder) return { status: 'unresolved', wallet, state: w.state, why: w.why || null };
  const f = await db.prepare('SELECT kind, label FROM funders WHERE addr = ?').bind(w.funder).first();
  if (!f) return { status: 'unresolved', wallet, state: 'classify', why: 'funder_unclassified' };
  if (f.kind !== 'ok') return { status: 'service', wallet, funder: w.funder, funderKind: f.kind, funderLabel: f.label };
  const wl = await db.prepare('SELECT addr FROM wallets WHERE funder = ? ORDER BY first_seen LIMIT 25').bind(w.funder).all();
  const wn = await db.prepare('SELECT COUNT(*) AS n FROM wallets WHERE funder = ?').bind(w.funder).first();
  if ((wn?.n || 0) < T.MIN_WALLETS) return { status: 'solo', wallet, funder: w.funder, wallets: wn?.n || 1 };
  const ls = await db.prepare('SELECT l.mint, l.creator, l.symbol, l.status, l.rugged, l.grad, l.created_at, l.peak_mc FROM launches l JOIN wallets w ON w.addr = l.creator WHERE w.funder = ? AND l.mint != ? ORDER BY l.created_at DESC LIMIT 500').bind(w.funder, mint || '').all();
  const rows = ls.results || [], other = rows.filter(r => r.creator !== wallet), own = rows.filter(r => r.creator === wallet);
  const dead = other.filter(r => r.status === 'dead'), judged = other.filter(r => r.status !== 'new');
  const level = levelOf(wn.n, dead.length, judged.length);
  const sample = [...dead, ...other.filter(r => r.status !== 'dead')].slice(0, 6).map(r => ({ mint: r.mint, symbol: r.symbol, status: r.status, rugged: !!r.rugged, wallet: r.creator, created_at: r.created_at }));
  return { status: 'linked', wallet, funder: w.funder, level, wallets: wn.n, wallet_list: (wl.results || []).map(x => x.addr),
    linkedLaunches: other.length, linkedDead: dead.length, linkedJudged: judged.length, linkedRugged: other.filter(r => r.rugged).length, linkedGraduated: other.filter(r => r.grad).length, ownLaunches: own.length, ownDead: own.filter(r => r.status === 'dead').length, sample };
}
export function messages(v) {
  if (v.status !== 'linked') return null;
  const n = v.linkedLaunches, m = v.linkedDead;
  return { en: `This developer is linked (shared funding wallet) to ${n} other launch${n === 1 ? '' : 'es'}, ${m} dead.`, ar: `هذا المطوّر مرتبط (بمحفظة تمويل مشتركة) بـ ${n} إطلاقًا آخر، ${m} منها ميت.` };
}
// Record the "flagged before rug" ledger entry (idempotent). liq = current liquidity of the flagged token.
export async function flagLaunch(db, v, mint, created_at, liq, src, now = Date.now()) {
  if (v?.status !== 'linked' || (v.level !== 'warn' && v.level !== 'fail')) return false;
  const age = created_at ? Math.max(0, Math.round((now - created_at) / 6e4)) : null;
  const r = await db.prepare('INSERT INTO flags (mint, funder, creator, flagged_at, token_age_min, level, wallets_n, dead_n, launches_n, liq_usd, src, peak_liq) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(mint) DO NOTHING')
    .bind(mint, v.funder, v.wallet, now, age, v.level, v.wallets, v.linkedDead, v.linkedLaunches, liq || 0, src, liq || 0).run();
  return !!r.meta?.changes;
}

// ---------------------------------------------------------------- market re-checks (dead / live outcomes)
export async function recheck(db, { maxNew = 60, maxLive = 30, now = Date.now() } = {}) {
  const cutoff = now - T.JUDGE_H * 36e5;
  const dueNew = (await db.prepare("SELECT mint, creator, created_at, peak_mc, peak_liq FROM launches WHERE status='new' AND created_at IS NOT NULL AND created_at < ? ORDER BY created_at LIMIT ?").bind(cutoff, maxNew).all()).results || [];
  const dueLive = (await db.prepare("SELECT mint, creator, created_at, peak_mc, peak_liq FROM launches WHERE status='live' AND last_checked < ? AND created_at > ? ORDER BY last_checked LIMIT ?").bind(now - DAY, now - 14 * DAY, maxLive).all()).results || [];
  const due = [...dueNew, ...dueLive]; if (!due.length) return { checked: 0, dead: 0, live: 0, funders: [] };
  const map = await dexBatch(due.map(x => x.mint)); if (!map) return { checked: 0, dead: 0, live: 0, funders: [], err: 'dexscreener' };
  const stm = [], creators = new Set(); let dead = 0, live = 0; const flagOut = [];
  for (const x of due) {
    if (!map.okMints.has(x.mint)) continue; // never judge a coin whose market lookup failed
    const m = map.get(x.mint), peak = Math.max(x.peak_mc || 0, m?.mcap || 0), pl = Math.max(x.peak_liq || 0, m?.liq || 0);
    const st = classify({ created: x.created_at, ath: peak }, m, now), grad = m && m.dex && String(m.dex).toLowerCase() !== 'pumpfun' ? 1 : 0;
    if (st === 'dead' || st === 'rugged') { dead++; creators.add(x.creator); flagOut.push([x.mint, 'dead', pl]);
      stm.push(q(db, "UPDATE launches SET status='dead', rugged=?, dead_at=?, last_mc=?, peak_mc=?, peak_liq=?, grad=MAX(grad,?), last_checked=? WHERE mint=? AND status != 'dead'", st === 'rugged' ? 1 : 0, now, m?.mcap || 0, peak, pl, grad, now, x.mint)); }
    else if (st === 'live') { live++; flagOut.push([x.mint, 'live', pl]);
      stm.push(q(db, "UPDATE launches SET status='live', last_mc=?, peak_mc=?, peak_liq=?, grad=MAX(grad,?), last_checked=? WHERE mint=? AND status != 'dead'", m?.mcap || 0, peak, pl, grad, now, x.mint)); }
  }
  for (const g of chunk(stm, 60)) await db.batch(g);
  // flag ledger outcomes: dead is final; "live" counts as survived only once it is >= 24 h old
  const out = []; for (const [mint, o, pl] of flagOut) {
    if (o === 'dead') out.push(q(db, "UPDATE flags SET outcome='dead', outcome_at=?, peak_liq=MAX(COALESCE(peak_liq,0), ?) WHERE mint=? AND outcome != 'dead'", now, pl, mint));
    else out.push(q(db, "UPDATE flags SET outcome='live', outcome_at=?, peak_liq=MAX(COALESCE(peak_liq,0), ?) WHERE mint=? AND outcome='pending' AND flagged_at < ?", now, pl, mint, now - DAY));
  }
  for (const g of chunk(out, 60)) await db.batch(g);
  await countWrites(db, (stm.length + out.length) * 3);
  if (dead) await bump(db, 'dead', dead);
  const funders = new Set(); if (creators.size) { const cs = [...creators]; for (const g of chunk(cs, 50)) (await db.prepare(`SELECT DISTINCT funder FROM wallets WHERE addr IN (${g.map(() => '?').join(',')}) AND funder IS NOT NULL`).bind(...g).all()).results?.forEach(r => funders.add(r.funder)); }
  return { checked: due.length, dead, live, funders: [...funders] };
}

// ---------------------------------------------------------------- stats
export async function stats(db) {
  const m = await metaGet(db, ['launches', 'wallets', 'dead', 'resolved']);
  const c = await db.prepare('SELECT COUNT(*) AS clusters, COALESCE(SUM(wallets),0) AS wallets, COALESCE(SUM(launches),0) AS launches, COALESCE(SUM(dead),0) AS dead, COALESCE(SUM(rugged),0) AS rugged, COALESCE(SUM(grad),0) AS grad, COALESCE(MAX(launches),0) AS biggest FROM clusters').first();
  const sr = await db.prepare("SELECT COUNT(*) AS n FROM clusters WHERE dead >= 3").first();
  const f = await db.prepare("SELECT COUNT(*) AS flagged, COALESCE(SUM(outcome='dead'),0) AS dead, COALESCE(SUM(outcome='live'),0) AS survived, COALESCE(SUM(outcome='pending'),0) AS pending, COALESCE(SUM(CASE WHEN outcome='dead' THEN peak_liq END),0) AS exposure, COALESCE(SUM(shown),0) AS shown, COALESCE(SUM(token_age_min <= 60),0) AS within1h, COALESCE(SUM(src='cron'),0) AS by_cron FROM flags").first();
  return {
    ok: true, version: 'v1', generated: new Date().toISOString(),
    clusters: c.clusters, serial_clusters: sr?.n || 0, linked_wallets: c.wallets, launches_in_clusters: c.launches, dead_in_clusters: c.dead, rugged_in_clusters: c.rugged, graduated_in_clusters: c.grad,
    launches_indexed: +m.launches || 0, wallets_indexed: +m.wallets || 0, wallets_resolved: +m.resolved || 0, dead_launches: +m.dead || 0,
    flagged: f.flagged, flagged_dead: f.dead, flagged_survived: f.survived, flagged_pending: f.pending, flagged_within_1h_of_launch: f.within1h, warnings_served: f.shown,
    capital_exposed_usd_est: Math.round(f.exposure || 0),
    methodology: 'https://memecheck.pages.dev/rugdna#method',
  };
}
export async function topClusters(db, limit = 25, order = 'dead') {
  const col = order === 'launches' ? 'launches' : order === 'wallets' ? 'wallets' : order === 'recent' ? 'last_seen' : 'dead';
  const r = await db.prepare(`SELECT funder, wallets, launches, dead, rugged, grad, first_seen, last_seen FROM clusters ORDER BY ${col} DESC, launches DESC LIMIT ?`).bind(Math.min(100, Math.max(1, limit))).all();
  return r.results || [];
}
export async function clusterDetail(db, funder) {
  const c = await db.prepare('SELECT * FROM clusters WHERE funder = ?').bind(funder).first();
  const f = await db.prepare('SELECT kind, label FROM funders WHERE addr = ?').bind(funder).first();
  const w = await db.prepare('SELECT addr, funded_at FROM wallets WHERE funder = ? ORDER BY first_seen LIMIT 50').bind(funder).all();
  const l = await db.prepare('SELECT l.mint, l.creator, l.symbol, l.status, l.rugged, l.grad, l.created_at FROM launches l JOIN wallets w ON w.addr=l.creator WHERE w.funder = ? ORDER BY l.created_at DESC LIMIT 60').bind(funder).all();
  return { funder, funderKind: f?.kind || null, funderLabel: f?.label || null, cluster: c || null, wallets: (w.results || []).map(x => x.addr), launches: l.results || [] };
}
// Daily snapshot (growth charts). Exact recount once per UTC day also repairs the incremental meta counters.
export async function snapshotDaily(db, now = Date.now(), force = false) {
  const d = day(now), have = await db.prepare('SELECT day FROM stats_daily WHERE day = ?').bind(d).first();
  if (have && !force) return false;
  const l = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(status=\'dead\'),0) AS dead FROM launches').first();
  const w = await db.prepare('SELECT COUNT(*) AS n FROM wallets').first();
  const rs = await db.prepare("SELECT COUNT(*) AS n FROM wallets WHERE state='resolved'").first();
  await db.batch([q(db, "INSERT INTO meta (k,v) VALUES ('resolved',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", String(rs.n)), q(db, "INSERT INTO meta (k,v) VALUES ('launches',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", String(l.n)), q(db, "INSERT INTO meta (k,v) VALUES ('wallets',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", String(w.n)), q(db, "INSERT INTO meta (k,v) VALUES ('dead',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", String(l.dead))]);
  const s = await stats(db); delete s.methodology; delete s.generated; s.day = d;
  await db.prepare('INSERT INTO stats_daily (day, data) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET data = excluded.data').bind(d, JSON.stringify(s)).run();
  return s;
}
export async function history(db, n = 90) { const r = await db.prepare('SELECT day, data FROM stats_daily ORDER BY day DESC LIMIT ?').bind(n).all(); return (r.results || []).map(x => { try { return JSON.parse(x.data); } catch { return null; } }).filter(Boolean).reverse(); }

// ---------------------------------------------------------------- scan lookup (used by /api/rugdna/mint and the scan card)
// Resolves creator -> wallet verdict, resolving the funder on demand (<= 1 wallet, a few RPC calls). Never throws.
export async function lookupMint(db, mint, env, { resolve = true, now = Date.now() } = {}) {
  let l = await db.prepare('SELECT mint, creator, created_at, symbol, launchpad, status, last_mc, peak_liq FROM launches WHERE mint = ?').bind(mint).first();
  let via = l ? 'index' : null;
  if (!l) {
    const c = await creatorOfMint(mint); if (!c) return { ok: true, mint, status: 'no_creator' };
    via = c.via; await ingestLaunches(db, [{ ...c, mc: c.mc, liq: c.liq }], 'scan', 2, now);
    l = { mint, creator: c.creator, created_at: c.created_at, symbol: c.symbol, status: 'new', peak_liq: c.liq || 0 };
  } else await db.prepare('UPDATE wallets SET pri = MAX(pri, 2) WHERE addr = ?').bind(l.creator).run();
  let v = await walletVerdict(db, l.creator, mint);
  if (resolve && (v.status === 'unknown' || (v.status === 'unresolved' && v.state === 'pending'))) {
    const res = await resolveFunders([l.creator], env);
    const r = await applyResolution(db, res, env, now);
    for (const f of r.funders) await recomputeCluster(db, f, now);
    v = await walletVerdict(db, l.creator, mint);
  }
  let flagged = false;
  if (v.status === 'linked' && (v.level === 'warn' || v.level === 'fail')) {
    flagged = await flagLaunch(db, v, mint, l.created_at, l.peak_liq, 'scan', now);
    await db.prepare('UPDATE flags SET shown = shown + 1 WHERE mint = ?').bind(mint).run().catch(() => {});
  }
  return { ok: true, mint, creator: l.creator, creatorSource: via, symbol: l.symbol || null, launchedAt: l.created_at || null, ...v, message: messages(v), newlyFlagged: flagged };
}

// Seed from Developer history (/api/dev): the creator's earlier coins with the statuses the site already computed.
// coins: [{ mint, symbol, name, created, ath, grad }] newest first; map = DexScreener bestPairs() Map (skipped when partial/failed).
export async function ingestDevHistory(db, creator, coins, map, now = Date.now(), cap = 40) {
  if (!db || !ADDR_RE.test(creator || '') || (await writesToday(db)) > 60000) return null;
  const rows = coins.slice(0, cap).map(c => {
    const m = map && !map.partial ? map.get(c.mint) : undefined, peak = Math.max(c.ath || 0, m?.mcap || 0);
    const st = map && !map.partial ? classify({ created: c.created, ath: c.ath || 0 }, m, now) : 'new';
    return { mint: c.mint, creator, created_at: c.created || null, symbol: c.symbol, name: c.name, launchpad: 'pump.fun', mc: m?.mcap || 0, liq: m?.liq || 0, peak,
      status: st === 'dead' || st === 'rugged' ? 'dead' : st === 'live' ? 'live' : 'new', rugged: st === 'rugged', grad: !!c.grad || !!(m && m.dex && String(m.dex).toLowerCase() !== 'pumpfun') };
  });
  const r = await ingestLaunches(db, rows, 'dev', 2, now);
  const w = await db.prepare('SELECT funder FROM wallets WHERE addr = ?').bind(creator).first(); if (w?.funder) await recomputeCluster(db, w.funder, now);
  return r;
}
