// /api/watchlist — account watchlist (signed in). Free: 5 tokens, Pro: 100. D1 only.
// GET -> { items:[{ca,chain,sym,added}], max }   POST { action:'add'|'remove', ca, chain, sym }
import { json, originOk, session, PRICES, validCaChain, s } from '../_lib/acct.js';
export async function onRequestGet({ request, env }) {
  const u = await session(request, env); if (!u) return json(401, { err: 'login_required' });
  const r = await env.REV.prepare('SELECT ca, chain, sym, added FROM watchlist WHERE wallet = ? ORDER BY added DESC LIMIT 200').bind(u.wallet).all();
  return json(200, { items: r.results || [], max: u.pro ? PRICES.watch.pro : PRICES.watch.free, pro: u.pro });
}
export async function onRequestPost({ request, env }) {
  if (!originOk(request)) return json(403, { err: 'origin' });
  const u = await session(request, env); if (!u) return json(401, { err: 'login_required' });
  let b; try { b = await request.json(); } catch { return json(400, { err: 'json' }); }
  const ca = s(b?.ca, 64), chain = s(b?.chain, 12) || 'solana';
  if (!validCaChain(ca, chain)) return json(400, { err: 'bad_ca' });
  if (b.action === 'remove') { await env.REV.prepare('DELETE FROM watchlist WHERE wallet = ? AND ca = ?').bind(u.wallet, ca).run(); return json(200, { ok: true }); }
  if (b.action !== 'add') return json(400, { err: 'action' });
  const max = u.pro ? PRICES.watch.pro : PRICES.watch.free;
  const n = (await env.REV.prepare('SELECT COUNT(*) AS n FROM watchlist WHERE wallet = ?').bind(u.wallet).first())?.n || 0;
  const exists = await env.REV.prepare('SELECT 1 FROM watchlist WHERE wallet = ? AND ca = ?').bind(u.wallet, ca).first();
  if (!exists && n >= max) return json(402, { err: 'limit', max, pro: u.pro });
  await env.REV.prepare('INSERT OR REPLACE INTO watchlist (wallet, ca, chain, sym, added) VALUES (?,?,?,?,?)').bind(u.wallet, ca, chain, s(b.sym, 20).replace(/[<>"]/g, ''), Date.now()).run();
  return json(200, { ok: true });
}
