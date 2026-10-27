// Accounts / Pro / API keys / Boost — shared server helpers. Storage: D1 (binding REV), never KV writes.
// Login = Solana wallet sign-in (signMessage, ed25519 verified with WebCrypto): free, no email service, no passwords.
// Payments reuse the Get Verified rule (USDC SPL to PAY_TO, verified on-chain via public RPC) plus: tx used once (D1 PK),
// tx < 7 days old, and the tx must be signed by the logged-in wallet OR carry a memo containing it (stops claiming others' txs).
export const PAY_TO = 'F29KLNySMghCZbpMqhNaR8k3jMUZHd485CHxX7x9Z9u5';
export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const PRICES = {
  pro: { usdc: 15, days: 30 },
  boost: { usdc: 60, days: 7 },
  api: {
    free: { usdc: 0, perDay: 300, perMin: 20, live: 5 },
    starter: { usdc: 29, days: 30, perDay: 10000, perMin: 60, live: 30 },
    business: { usdc: 99, days: 30, perDay: 100000, perMin: 300, live: 120 },
  },
  watch: { free: 5, pro: 100 },
  proPerks: { aiMult: 5, deepMax: 120, apiFreePerDay: 2000 },
};
const RPCS = ['https://api.mainnet-beta.solana.com', 'https://solana.leorpc.com/?api_key=FREE', 'https://solana-mainnet.gateway.tatum.io'];
export const CA_SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const CA_EVM = /^0x[0-9a-fA-F]{40}$/;
export const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;
export const CHAINS = ['solana', 'ethereum', 'bsc', 'base', 'arbitrum'];
const ORIGIN_OK = /^https:\/\/([a-z0-9-]+\.)?memecheck\.pages\.dev$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
export const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
export const originOk = (req) => { const o = req.headers.get('origin') || ''; return !o || ORIGIN_OK.test(o); };
export const s = (v, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
export const validCaChain = (ca, chain) => chain === 'solana' ? CA_SOL.test(ca || '') : CHAINS.includes(chain) && CA_EVM.test(ca || '');
const enc = new TextEncoder();
export async function sha(t) { const d = await crypto.subtle.digest('SHA-256', enc.encode(t)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
export const rand = (n = 32) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58dec(str) {
  const bytes = [];
  for (const c of str) { let carry = B58.indexOf(c); if (carry < 0) throw new Error('b58');
    for (let j = 0; j < bytes.length; j++) { carry += bytes[j] * 58; bytes[j] = carry & 255; carry >>= 8; }
    while (carry) { bytes.push(carry & 255); carry >>= 8; } }
  for (const c of str) { if (c === '1') bytes.push(0); else break; }
  return new Uint8Array(bytes.reverse());
}
export function b64dec(t) { const b = atob(t); return Uint8Array.from(b, c => c.charCodeAt(0)); }
export async function edVerify(walletB58, msg, sigBytes) {
  const pub = b58dec(walletB58); if (pub.length !== 32 || sigBytes.length !== 64) return false;
  try { const k = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']); return await crypto.subtle.verify({ name: 'Ed25519' }, k, sigBytes, enc.encode(msg)); }
  catch { try { const k = await crypto.subtle.importKey('raw', pub, { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' }, false, ['verify']); return await crypto.subtle.verify('NODE-ED25519', k, sigBytes, enc.encode(msg)); } catch { return false; } }
}
// ---- sessions (cookie mc_s, HttpOnly, 30 days) ----
const COOKIE = 'mc_s';
export const SESSION_DAYS = 30;
export function cookieTok(req) { const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)mc_s=([0-9a-f]{64})/); return m ? m[1] : null; }
export function setCookie(tok, maxAge) { return `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
/** -> { wallet, proUntil, pro } or null. One D1 read; zero when no cookie (anonymous visitors cost nothing). */
export async function session(req, env) {
  const tok = cookieTok(req); if (!tok || !env.REV) return null;
  try {
    const r = await env.REV.prepare('SELECT s.wallet, u.pro_until FROM sessions s JOIN users u ON u.wallet = s.wallet WHERE s.h = ? AND s.exp > ?').bind(await sha(tok), Date.now()).first();
    if (!r) return null; const proUntil = +r.pro_until || 0; return { wallet: r.wallet, proUntil, pro: proUntil > Date.now() };
  } catch { return null; }
}
/** Pro wallet for perks (AI / deep limits), or null. Cheap: no cookie -> no DB. */
export async function proWallet(req, env) { const u = await session(req, env); return u?.pro ? u.wallet : null; }
// ---- on-chain USDC payment check (same logic as /api/verified) ----
async function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }); let last = null;
  for (const url of RPCS) {
    try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'memecheck-revenue/1.1' }, body });
      const j = await r.json(); if (j?.result != null) return j.result; last = j?.error || r.status; if (j && 'result' in j && j.result === null) return null; }
    catch (e) { last = String(e?.message || e).slice(0, 80); }
  }
  throw new Error('rpc failed: ' + (typeof last === 'string' ? last : JSON.stringify(last).slice(0, 120)));
}
function usdcReceived(tx) {
  const meta = tx?.meta; if (!meta) return 0; const pre = meta.preTokenBalances || [], post = meta.postTokenBalances || []; let total = 0;
  for (const p of post) { if (p.mint !== USDC || p.owner !== PAY_TO) continue;
    const before = pre.find(x => x.accountIndex === p.accountIndex && x.mint === USDC);
    const d = +(p.uiTokenAmount?.amount || 0) - +(before?.uiTokenAmount?.amount || 0); if (d > 0) total += d; }
  return total;
}
function memoText(tx) {
  const msg = tx?.transaction?.message; const ixs = [...(msg?.instructions || []), ...(tx?.meta?.innerInstructions || []).flatMap(x => x.instructions || [])]; const out = [];
  for (const ix of ixs) if (ix.program === 'spl-memo' || ix.programId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') { if (typeof ix.parsed === 'string') out.push(ix.parsed); else if (ix.parsed?.info?.memo) out.push(ix.parsed.info.memo); }
  return out.join(' ');
}
const signers = (tx) => (tx?.transaction?.message?.accountKeys || []).filter(k => k && (k.signer === true)).map(k => k.pubkey || k);
/** Verify + record a payment once. kind: pro | api_starter | api_business | boost. Returns { ok, usdc } or { ok:false, err, ... }. */
export async function claimPayment(env, { tx, wallet, kind, ref = null, minUsdc }) {
  if (!SIG_RE.test(tx || '')) return { ok: false, err: 'bad_tx' };
  const used = await env.REV.prepare('SELECT kind FROM payments WHERE tx = ?').bind(tx).first().catch(() => null);
  if (used) return { ok: false, err: 'tx_already_used' };
  try { const st = env.MEMECHECK_CACHE && await env.MEMECHECK_CACHE.get('revenue:v1', 'json'); // KV READ only: a Get Verified/ad tx can't be reused
    if (st && ['verified', 'sponsored', 'banners'].some(k => (st[k] || []).some(x => x.tx === tx))) return { ok: false, err: 'tx_already_used' }; } catch {}
  let t; try { t = await rpc('getTransaction', [tx, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]); }
  catch (e) { return { ok: false, err: 'rpc', detail: String(e?.message || e).slice(0, 100) }; }
  if (!t) return { ok: false, err: 'tx_not_found' };
  if (t.meta?.err) return { ok: false, err: 'tx_failed' };
  if (t.blockTime && Date.now() / 1000 - t.blockTime > 7 * 86400) return { ok: false, err: 'tx_too_old' };
  const usdc = usdcReceived(t) / 1e6;
  if (usdc + 1e-9 < minUsdc) return { ok: false, err: 'amount_low', received: usdc, need: minUsdc };
  if (!signers(t).includes(wallet) && !memoText(t).includes(wallet)) return { ok: false, err: 'not_your_tx', tip: 'Pay from the signed-in wallet, or add memo mc:' + wallet };
  try { await env.REV.prepare('INSERT INTO payments (tx, wallet, kind, ref, usdc, at) VALUES (?,?,?,?,?,?)').bind(tx, wallet, kind, ref, usdc, Date.now()).run(); }
  catch { return { ok: false, err: 'tx_already_used' }; }
  return { ok: true, usdc };
}
export const payLink = (usdc, wallet, label) => `solana:${PAY_TO}?amount=${usdc}&spl-token=${USDC}&label=MemeCheckShield&message=${encodeURIComponent(label)}&memo=${encodeURIComponent('mc:' + wallet)}`;
export const publicCfg = () => ({ payTo: PAY_TO, usdcMint: USDC, prices: PRICES, note: 'Payments never change any risk score.' });

/** Fire-and-forget payment alert to memecheck-alert Worker (Telegram). Never throws. No secrets in payload. */
export function notifyOwnerPayment(env, waitUntil, info) {
  const secret = env && env.PAYMENT_NOTIFY_SECRET;
  if (!secret || !info) return;
  const base = String(env.ALERT_NOTIFY_URL || 'https://memecheck-alert.memecheck.workers.dev').replace(/\/$/, '');
  const body = {
    product: String(info.product || info.kind || '').slice(0, 40),
    amountUsdc: info.amountUsdc != null ? +info.amountUsdc : undefined,
    wallet: info.wallet ? String(info.wallet).slice(0, 64) : undefined,
    tx: info.tx ? String(info.tx).slice(0, 128) : undefined,
    ref: info.ref != null ? String(info.ref).slice(0, 80) : undefined,
    at: info.at || Date.now(),
  };
  const p = fetch(base + '/notify-payment', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-payment-notify': secret, 'user-agent': 'memecheck-pages/pay-alert' },
    body: JSON.stringify(body),
  }).then(r => r.text().catch(() => '')).catch(() => {});
  if (typeof waitUntil === 'function') waitUntil(p);
  return p;
}


// ---- Cache-API counters (free, per colo, best-effort; NO KV writes) ----
const cmem = new Map();
export async function bump(name, winSec, waitUntil) {
  const slot = Math.floor(Date.now() / 1000 / winSec), key = new Request(`https://memecheck-ctr.internal/${name}/${slot}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null; let n = 0;
  try { const r = cache && await cache.match(key); if (r) n = +(await r.text()) || 0; } catch {}
  const mk = name + slot; n = Math.max(n, cmem.get(mk) || 0) + 1; cmem.set(mk, n); if (cmem.size > 3000) cmem.delete(cmem.keys().next().value);
  if (cache) { const p = cache.put(key, new Response(String(n), { headers: { 'cache-control': `public, max-age=${winSec}` } })).catch(() => {}); waitUntil ? waitUntil(p) : await p; }
  return { n, reset: (slot + 1) * winSec };
}
export function newApiKey() { const r = rand(20); return 'mck_' + r; }
export const keyPrefix = (k) => k.slice(0, 12);
export function tierOf(row, now = Date.now()) {
  const paid = row && row.tier !== 'free' && +row.until > now, t = paid ? row.tier : 'free';
  const L = { ...PRICES.api[t] }; if (t === 'free' && +row?.pro_until > now) L.perDay = PRICES.proPerks.apiFreePerDay;
  return { tier: t, ...L, until: paid ? +row.until : null };
}
