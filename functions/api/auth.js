// /api/auth — Solana wallet sign-in (no email, no password, no paid service).
// GET  -> { wallet, pro, proUntil } | { wallet: null }
// POST { action:'login', wallet, message, signature(base64) } -> sets HttpOnly cookie mc_s (30 d)
// POST { action:'logout' }
// The signed message is plain text (no transaction, no fees). Replay-safe: nonce stored UNIQUE in D1, 10-minute window.
import { json, originOk, session, edVerify, b64dec, sha, rand, setCookie, SESSION_DAYS, CA_SOL, publicCfg } from '../_lib/acct.js';
import { rateLimit } from '../_lib/rl.js';
export async function onRequestGet({ request, env }) {
  const u = await session(request, env);
  return json(200, u ? { wallet: u.wallet, pro: u.pro, proUntil: u.proUntil, cfg: publicCfg() } : { wallet: null, cfg: publicCfg(), db: !!env.REV });
}
export async function onRequestPost({ request, env, waitUntil }) {
  if (!originOk(request)) return json(403, { err: 'origin' });
  if (!env.REV) return json(503, { err: 'db_not_bound' });
  if (+(request.headers.get('content-length') || 0) > 4096) return json(413, { err: 'too_long' });
  let b; try { b = await request.json(); } catch { return json(400, { err: 'json' }); }
  if (b?.action === 'logout') {
    const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)mc_s=([0-9a-f]{64})/);
    if (m) await env.REV.prepare('DELETE FROM sessions WHERE h = ?').bind(await sha(m[1])).run().catch(() => {});
    return json(200, { ok: true }, { 'set-cookie': setCookie('', 0) });
  }
  const lim = await rateLimit(request, 'auth', 10, 600, waitUntil); if (lim) return lim;
  const wallet = typeof b?.wallet === 'string' ? b.wallet : '', msg = typeof b?.message === 'string' ? b.message.slice(0, 1000) : '';
  if (!CA_SOL.test(wallet)) return json(400, { err: 'bad_wallet' });
  const lines = msg.split('\n');
  const host = new URL(request.url).host, iss = Date.parse((msg.match(/\nIssued At: (\S+)/) || [])[1] || ''), nonce = (msg.match(/\nNonce: ([0-9a-f]{16,64})$/) || [])[1];
  if (lines[0] !== `${host} wants you to sign in with your Solana account:` || lines[1] !== wallet) return json(400, { err: 'bad_message' });
  if (!nonce || !iss || Math.abs(Date.now() - iss) > 10 * 60e3) return json(400, { err: 'expired_message' });
  let sig; try { sig = b64dec(String(b.signature || '')); } catch { return json(400, { err: 'bad_signature' }); }
  if (!(await edVerify(wallet, msg, sig))) return json(401, { err: 'bad_signature' });
  const tok = rand(32), now = Date.now(), exp = now + SESSION_DAYS * 864e5;
  try {
    await env.REV.batch([
      env.REV.prepare('INSERT INTO sessions (h, wallet, nonce, exp, created) VALUES (?,?,?,?,?)').bind(await sha(tok), wallet, nonce, exp, now),
      env.REV.prepare('INSERT OR IGNORE INTO users (wallet, created) VALUES (?,?)').bind(wallet, now),
      env.REV.prepare('DELETE FROM sessions WHERE exp < ?').bind(now),
    ]);
  } catch { return json(409, { err: 'nonce_used' }); }
  const u = await env.REV.prepare('SELECT pro_until FROM users WHERE wallet = ?').bind(wallet).first();
  const proUntil = +u?.pro_until || 0;
  return json(200, { ok: true, wallet, pro: proUntil > now, proUntil }, { 'set-cookie': setCookie(tok, SESSION_DAYS * 86400) });
}
