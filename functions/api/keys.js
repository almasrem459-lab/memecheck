// /api/keys — B2B API key management (signed in with wallet). Keys are shown ONCE; only a SHA-256 hash is stored (D1).
// GET -> { keys:[{prefix,tier,until,created,revoked,used,limits}] }
// POST {action:'create'} -> { key }   {action:'revoke', prefix}   {action:'upgrade', prefix, tier:'starter'|'business', tx}
import { json, originOk, session, claimPayment, PRICES, sha, newApiKey, keyPrefix, tierOf, payLink, notifyOwnerPayment } from '../_lib/acct.js';
const MAX_KEYS = 3;
export async function onRequestGet({ request, env }) {
  const u = await session(request, env); if (!u) return json(401, { err: 'login_required' });
  const r = await env.REV.prepare('SELECT prefix, tier, until, created, revoked, used FROM api_keys WHERE wallet = ? ORDER BY created DESC LIMIT 20').bind(u.wallet).all();
  const keys = (r.results || []).map(k => ({ ...k, limits: tierOf({ ...k, pro_until: u.proUntil }) }));
  return json(200, { keys, prices: PRICES.api, pay: { starter: payLink(PRICES.api.starter.usdc, u.wallet, 'MemeCheckShield API Starter 30 days'), business: payLink(PRICES.api.business.usdc, u.wallet, 'MemeCheckShield API Business 30 days') } });
}
export async function onRequestPost({ request, env, waitUntil }) {
  if (!originOk(request)) return json(403, { err: 'origin' });
  const u = await session(request, env); if (!u) return json(401, { err: 'login_required' });
  let b; try { b = await request.json(); } catch { return json(400, { err: 'json' }); }
  const now = Date.now();
  if (b?.action === 'create') {
    const n = (await env.REV.prepare('SELECT COUNT(*) AS n FROM api_keys WHERE wallet = ? AND revoked = 0').bind(u.wallet).first())?.n || 0;
    if (n >= MAX_KEYS) return json(409, { err: 'max_keys', max: MAX_KEYS });
    const key = newApiKey();
    await env.REV.prepare("INSERT INTO api_keys (h, prefix, wallet, tier, until, created, revoked, used) VALUES (?,?,?,'free',0,?,0,0)").bind(await sha(key), keyPrefix(key), u.wallet, now).run();
    return json(200, { ok: true, key, prefix: keyPrefix(key), note: 'Shown once. Store it safely.' });
  }
  const prefix = String(b?.prefix || '').slice(0, 12);
  const row = await env.REV.prepare('SELECT h, tier, until, revoked FROM api_keys WHERE prefix = ? AND wallet = ?').bind(prefix, u.wallet).first();
  if (!row) return json(404, { err: 'no_key' });
  if (b.action === 'revoke') { await env.REV.prepare('UPDATE api_keys SET revoked = 1 WHERE h = ?').bind(row.h).run(); return json(200, { ok: true }); }
  if (b.action === 'upgrade') {
    const tier = b.tier === 'business' ? 'business' : b.tier === 'starter' ? 'starter' : null;
    if (!tier || row.revoked) return json(400, { err: 'bad_tier' });
    const P = PRICES.api[tier];
    const tx = String(b.tx || '').trim();
    const p = await claimPayment(env, { tx, wallet: u.wallet, kind: 'api_' + tier, ref: prefix, minUsdc: P.usdc });
    if (!p.ok) return json(400, { ...p, need: P.usdc });
    const periods = Math.min(12, Math.max(1, Math.floor((p.usdc + 1e-9) / P.usdc)));
    const base = row.tier === tier && +row.until > now ? +row.until : now, until = base + periods * P.days * 864e5;
    await env.REV.prepare('UPDATE api_keys SET tier = ?, until = ? WHERE h = ?').bind(tier, until, row.h).run();
    notifyOwnerPayment(env, waitUntil, { product: 'api_' + tier, amountUsdc: p.usdc, wallet: u.wallet, tx, ref: prefix });
    return json(200, { ok: true, tier, until, periods });
  }
  return json(400, { err: 'action' });
}
