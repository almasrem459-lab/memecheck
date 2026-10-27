// /api/pro — Pro subscription paid in USDC (Solana). Basic scans stay free and unchanged.
// GET  -> { cfg, me }    POST { action:'pay', tx } (signed in) -> extends pro_until by 30 days per 15 USDC (max 12 periods per tx)
import { json, originOk, session, claimPayment, PRICES, publicCfg, payLink, notifyOwnerPayment } from '../_lib/acct.js';
export async function onRequestGet({ request, env }) {
  const u = await session(request, env);
  return json(200, { cfg: publicCfg(), me: u ? { wallet: u.wallet, pro: u.pro, proUntil: u.proUntil, payLink: payLink(PRICES.pro.usdc, u.wallet, 'MemeCheckShield Pro 30 days'), boostLink: payLink(PRICES.boost.usdc, u.wallet, 'MemeCheckShield Boost 7 days') } : null });
}
export async function onRequestPost({ request, env, waitUntil }) {
  if (!originOk(request)) return json(403, { err: 'origin' });
  if (!env.REV) return json(503, { err: 'db_not_bound' });
  const u = await session(request, env); if (!u) return json(401, { err: 'login_required' });
  let b; try { b = await request.json(); } catch { return json(400, { err: 'json' }); }
  if (b?.action !== 'pay') return json(400, { err: 'action' });
  const tx = String(b.tx || '').trim();
  const p = await claimPayment(env, { tx, wallet: u.wallet, kind: 'pro', minUsdc: PRICES.pro.usdc });
  if (!p.ok) return json(400, { ...p, need: PRICES.pro.usdc });
  const periods = Math.min(12, Math.max(1, Math.floor((p.usdc + 1e-9) / PRICES.pro.usdc)));
  const base = Math.max(Date.now(), u.proUntil || 0), until = base + periods * PRICES.pro.days * 864e5;
  await env.REV.prepare('UPDATE users SET pro_until = ? WHERE wallet = ?').bind(until, u.wallet).run();
  notifyOwnerPayment(env, waitUntil, { product: 'pro', amountUsdc: p.usdc, wallet: u.wallet, tx });
  return json(200, { ok: true, pro: true, proUntil: until, periods, paid: p.usdc });
}
