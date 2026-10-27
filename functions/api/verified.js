import { notifyOwnerPayment } from '../_lib/acct.js';
// GET  /api/verified  → { verified[], sponsored[], banners[], cfg }
// POST /api/verified  → claim (on-chain USDC verify) | approve (Bearer REVENUE_ADMIN_TOKEN)
// kinds: verified | sponsored | banner — Payment NEVER changes risk score — UI only.
const PAY_TO = 'F29KLNySMghCZbpMqhNaR8k3jMUZHd485CHxX7x9Z9u5';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const VERIFY_USDC = 75;
const AD_USDC = 50;
const BANNER_USDC = 150;
const VERIFY_DAYS = 30;
const AD_DAYS = 7;
const BANNER_DAYS = 7;
const KV_KEY = 'revenue:v1';
const CA_SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CA_EVM = /^0x[0-9a-fA-F]{40}$/;
const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;
const ORIGIN_OK = /^https:\/\/([a-z0-9-]+\.)?memecheck\.pages\.dev$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana.leorpc.com/?api_key=FREE',
  'https://solana-mainnet.gateway.tatum.io',
];

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
});
const cfg = () => ({
  payTo: PAY_TO, usdcMint: USDC, verifyPriceUsdc: VERIFY_USDC, adPriceUsdcWeek: AD_USDC,
  bannerPriceUsdcWeek: BANNER_USDC,
  verifyDays: VERIFY_DAYS, adDaysDefault: AD_DAYS, bannerDaysDefault: BANNER_DAYS,
  note: 'Sponsored / Verified / Banner are paid placements only — they do not change the risk score.',
});

function normalizeKind(k) {
  const s = String(k || '').toLowerCase();
  if (s === 'banner' || s === 'sponsored') return s;
  return 'verified';
}
function priceFor(kind) {
  if (kind === 'banner') return BANNER_USDC;
  if (kind === 'sponsored') return AD_USDC;
  return VERIFY_USDC;
}
function daysFor(kind) {
  if (kind === 'banner') return BANNER_DAYS;
  if (kind === 'sponsored') return AD_DAYS;
  return VERIFY_DAYS;
}
function arrFor(store, kind) {
  if (kind === 'banner') return store.banners;
  if (kind === 'sponsored') return store.sponsored;
  return store.verified;
}

function prune(list, now = Date.now()) {
  return (Array.isArray(list) ? list : []).filter((x) => x && x.mint && (!x.until || x.until > now));
}
function emptyStore() { return { verified: [], sponsored: [], banners: [], updatedAt: 0 }; }

async function loadStore(env) {
  const base = emptyStore();
  try {
    if (env.MEMECHECK_CACHE) {
      const raw = await env.MEMECHECK_CACHE.get(KV_KEY, 'json');
      if (raw && typeof raw === 'object') {
        base.verified = prune(raw.verified);
        base.sponsored = prune(raw.sponsored);
        base.banners = prune(raw.banners);
        base.updatedAt = +raw.updatedAt || 0;
      }
    }
  } catch {}
  return base;
}

async function saveStore(env, store) {
  if (!env.MEMECHECK_CACHE) throw new Error('KV not bound');
  store.updatedAt = Date.now();
  store.verified = prune(store.verified);
  store.sponsored = prune(store.sponsored);
  store.banners = prune(store.banners);
  await env.MEMECHECK_CACHE.put(KV_KEY, JSON.stringify(store));
  return store;
}

async function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  let last = null;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'memecheck-revenue/1.0' },
        body,
      });
      const j = await r.json();
      if (j?.result != null) return j.result;
      last = j?.error || r.status;
    } catch (e) { last = String(e && e.message || e).slice(0, 80); }
  }
  throw new Error('rpc failed: ' + (typeof last === 'string' ? last : JSON.stringify(last).slice(0, 120)));
}

/** Sum USDC (6 dec) credited to PAY_TO in a parsed tx. */
function usdcReceived(tx) {
  const meta = tx?.meta; if (!meta) return 0;
  const pre = meta.preTokenBalances || [], post = meta.postTokenBalances || [];
  let total = 0;
  for (const p of post) {
    if (p.mint !== USDC) continue;
    const owner = p.owner || p.accountIndex; // owner preferred
    if (p.owner && p.owner !== PAY_TO) continue;
    // match pre by accountIndex
    const before = pre.find((x) => x.accountIndex === p.accountIndex && x.mint === USDC);
    const a = +(p.uiTokenAmount?.amount || 0);
    const b = +(before?.uiTokenAmount?.amount || 0);
    const delta = a - b;
    if (delta > 0 && p.owner === PAY_TO) total += delta;
  }
  // Also scan instructions for transferChecked to PAY_TO ATA when balances missing owner
  if (total === 0) {
    const msg = tx?.transaction?.message;
    const ixs = [...(msg?.instructions || []), ...(meta.innerInstructions || []).flatMap((x) => x.instructions || [])];
    for (const ix of ixs) {
      const p = ix.parsed;
      if (!p) continue;
      if ((p.type === 'transfer' || p.type === 'transferChecked') && p.info) {
        const mint = p.info.mint || USDC;
        const dest = p.info.destination || p.info.authority;
        // destination is often the ATA not the wallet — balances path is preferred
        void dest; void mint;
      }
    }
  }
  return total; // raw 6-decimal units
}

function memoText(tx) {
  const msg = tx?.transaction?.message;
  const ixs = [...(msg?.instructions || []), ...(tx?.meta?.innerInstructions || []).flatMap((x) => x.instructions || [])];
  const out = [];
  for (const ix of ixs) {
    if (ix.program === 'spl-memo' || ix.programId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') {
      if (typeof ix.parsed === 'string') out.push(ix.parsed);
      else if (ix.parsed?.info?.memo) out.push(ix.parsed.info.memo);
      else if (ix.data) try { out.push(atob(ix.data)); } catch {}
    }
  }
  return out.join(' ');
}

async function verifyPayment(sig, minUsdc) {
  const tx = await rpc('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
  if (!tx) return { ok: false, err: 'tx_not_found' };
  if (tx.meta?.err) return { ok: false, err: 'tx_failed' };
  const raw = usdcReceived(tx);
  const ui = raw / 1e6;
  if (ui + 1e-9 < minUsdc) return { ok: false, err: 'amount_low', received: ui, need: minUsdc };
  return { ok: true, received: ui, memo: memoText(tx), slot: tx.slot };
}

function validMint(m) { return CA_SOL.test(m) || CA_EVM.test(m); }

export async function onRequestGet({ env }) {
  const store = await loadStore(env);
  return json(200, { ...store, cfg: cfg() });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,authorization' } });
}

export async function onRequestPost({ request, env, waitUntil }) {
  const o = request.headers.get('origin') || '';
  if (o && !ORIGIN_OK.test(o)) return json(403, { err: 'origin' });
  const len = +(request.headers.get('content-length') || 0);
  if (len > 8192) return json(413, { err: 'too_long' });
  let b; try { b = await request.json(); } catch { return json(400, { err: 'json' }); }
  if (!b || typeof b !== 'object') return json(400, { err: 'json' });
  const action = String(b.action || 'claim');
  const s = (v) => (typeof v === 'string' ? v.trim() : '');

  if (action === 'approve') {
    const tok = env.REVENUE_ADMIN_TOKEN || '';
    const auth = request.headers.get('authorization') || '';
    const got = (auth.match(/^Bearer\s+(\S+)$/i) || [])[1] || '';
    if (!tok || got.length < 20 || got !== tok) return json(401, { err: 'unauthorized' });
    const mint = s(b.mint), kind = normalizeKind(b.kind);
    if (!validMint(mint)) return json(400, { err: 'bad_mint' });
    const days = Math.min(365, Math.max(1, +b.days || daysFor(kind)));
    const entry = {
      mint, name: s(b.name).slice(0, 64), url: s(b.url).slice(0, 200),
      image: s(b.image || b.imageUrl).slice(0, 400) || null,
      until: Date.now() + days * 864e5, paid: true, tx: s(b.tx).slice(0, 128) || null,
      at: Date.now(), by: 'admin', kind,
      note: 'Paid placement — risk score unchanged',
    };
    const store = await loadStore(env);
    const arr = arrFor(store, kind);
    const i = arr.findIndex((x) => x.mint.toLowerCase() === mint.toLowerCase());
    if (i >= 0) arr[i] = { ...arr[i], ...entry }; else arr.push(entry);
    await saveStore(env, store);
    return json(200, { ok: true, entry, kind, cfg: cfg() });
  }

  // claim: on-chain verify then auto-list
  const mint = s(b.mint), tx = s(b.tx), kind = normalizeKind(b.kind);
  if (!validMint(mint)) return json(400, { err: 'bad_mint' });
  if (!SIG_RE.test(tx)) return json(400, { err: 'bad_tx' });
  if (env.REV) { const u = await env.REV.prepare('SELECT 1 FROM payments WHERE tx = ?').bind(tx).first().catch(() => null); if (u) return json(400, { err: 'tx_already_used' }); } // tx already used for Pro/API/Boost (D1 read)
  const need = priceFor(kind);
  let pay; try { pay = await verifyPayment(tx, need); } catch (e) { return json(502, { err: 'rpc', detail: String(e.message || e).slice(0, 120) }); }
  if (!pay.ok) return json(400, { err: pay.err, received: pay.received, need: pay.need, tip: 'Send ≥' + need + ' USDC to ' + PAY_TO + ' then paste the signature. Jojo can also admin-approve later.' });

  const days = daysFor(kind);
  const entry = {
    mint, name: s(b.name).slice(0, 64), url: s(b.url).slice(0, 200),
    image: s(b.image || b.imageUrl).slice(0, 400) || null,
    until: Date.now() + days * 864e5, paid: true, tx, receivedUsdc: pay.received,
    at: Date.now(), by: 'onchain', memo: (pay.memo || '').slice(0, 200), kind,
    note: 'Paid placement — does not change risk score',
  };
  const payerGuess = ((pay.memo || '').match(/mc:([1-9A-HJ-NP-Za-km-z]{32,44})/) || [])[1] || null;
  try {
    const store = await loadStore(env);
    // idempotent on same tx
    const arr = arrFor(store, kind);
    if (arr.some((x) => x.tx === tx)) return json(200, { ok: true, entry: arr.find((x) => x.tx === tx), kind, dup: true, cfg: cfg() });
    const i = arr.findIndex((x) => x.mint.toLowerCase() === mint.toLowerCase());
    if (i >= 0) arr[i] = { ...arr[i], ...entry }; else arr.push(entry);
    await saveStore(env, store);
    notifyOwnerPayment(env, waitUntil, { product: kind, amountUsdc: pay.received, wallet: payerGuess, tx, ref: mint });
    return json(200, { ok: true, entry, kind, cfg: cfg() });
  } catch (e) {
    // KV write failed — still return verified payment so Jojo can approve from the note
    notifyOwnerPayment(env, waitUntil, { product: kind, amountUsdc: pay.received, wallet: payerGuess, tx, ref: mint });
    return json(200, { ok: true, entry, kind, pendingStore: true, detail: String(e.message || e).slice(0, 80), cfg: cfg() });
  }
}
