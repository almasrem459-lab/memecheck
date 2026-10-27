// /api/projects — project profile pages + paid "Boost" (Promoted section).
// Paying NEVER changes a risk score: the score shown on a profile is always read from the normal scan cache.
// GET ?ca=&chain=   -> { profile, boost, risk }      GET ?promoted=1 -> { items:[...] } (cached 60 s, Cache API)
// POST {action:'boost', ca, chain, tx}  (signed in) -> 60 USDC = 7 days in Promoted (stacks, max 8 weeks per tx)
// POST {action:'edit', ca, chain, name, website, twitter, telegram, descr} (signed in, wallet that paid a boost for this CA)
import { json, originOk, session, claimPayment, PRICES, validCaChain, s, payLink, notifyOwnerPayment } from '../_lib/acct.js';
import { keyOf, readShared } from '../_lib/shared.js';
import { dec } from '../../mccache.js';
const url = (v, re) => { v = s(v, 160).trim(); return v && re.test(v) ? v : ''; };
const clean = (v, n) => s(v, n).replace(/[<>]/g, '').replace(/[\u0000-\u001f]/g, ' ').trim();
const PROMO_KEY = new Request('https://memecheck-promo.internal/v1');
async function risk(env, chain, ca) {
  try { const t = await readShared(env.MEMECHECK_CACHE, keyOf('core', chain, ca)); if (!t) return null; const j = JSON.parse(t), r = dec(j.data);
    return { level: r.verdict?.level || 'unknown', points: r.verdict?.points ?? null, at: j.at, symbol: r.meta?.symbol || null, name: r.meta?.name || null, image: r.meta?.image || null }; } catch { return null; }
}
export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.REV) return json(503, { err: 'db_not_bound' });
  const q = new URL(request.url).searchParams, now = Date.now();
  if (q.get('promoted')) {
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    try { const c = cache && await cache.match(PROMO_KEY); if (c) return new Response(c.body, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } }); } catch {}
    const r = await env.REV.prepare('SELECT b.ca, b.chain, MAX(b.until) AS until, p.name, p.website, p.twitter, p.telegram FROM boosts b LEFT JOIN projects p ON p.ca = b.ca WHERE b.until > ? AND b.start <= ? GROUP BY b.ca, b.chain ORDER BY MIN(b.start) ASC LIMIT 12').bind(now, now).all();
    const items = await Promise.all((r.results || []).map(async x => ({ ...x, risk: await risk(env, x.chain, x.ca) })));
    const body = JSON.stringify({ items, label: 'Promoted (paid placement). Paying never changes a risk score.' });
    if (cache) waitUntil(cache.put(PROMO_KEY, new Response(body, { headers: { 'cache-control': 'public, max-age=60' } })).catch(() => {}));
    return new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } });
  }
  const ca = s(q.get('ca'), 64).trim(), chain = s(q.get('chain'), 12) || 'solana';
  if (!validCaChain(ca, chain)) return json(400, { err: 'bad_ca' });
  const [p, b] = await Promise.all([
    env.REV.prepare('SELECT ca, chain, name, website, twitter, telegram, descr, updated FROM projects WHERE ca = ?').bind(ca).first(),
    env.REV.prepare('SELECT MAX(until) AS until FROM boosts WHERE ca = ? AND until > ?').bind(ca, now).first(),
  ]);
  const u = await session(request, env);
  const canEdit = !!(u && (await env.REV.prepare('SELECT 1 FROM boosts WHERE ca = ? AND wallet = ?').bind(ca, u.wallet).first()));
  return json(200, { ca, chain, profile: p || null, boost: b?.until ? { until: b.until } : null, risk: await risk(env, chain, ca), canEdit, price: PRICES.boost,
    payLink: u ? payLink(PRICES.boost.usdc, u.wallet, 'MemeCheckShield Boost 7 days') : null, note: 'Paid placement only. Paying never changes the risk score.' });
}
export async function onRequestPost({ request, env, waitUntil }) {
  if (!originOk(request)) return json(403, { err: 'origin' });
  if (!env.REV) return json(503, { err: 'db_not_bound' });
  const u = await session(request, env); if (!u) return json(401, { err: 'login_required' });
  if (+(request.headers.get('content-length') || 0) > 6000) return json(413, { err: 'too_long' });
  let b; try { b = await request.json(); } catch { return json(400, { err: 'json' }); }
  const ca = s(b?.ca, 64).trim(), chain = s(b?.chain, 12) || 'solana', now = Date.now();
  if (!validCaChain(ca, chain)) return json(400, { err: 'bad_ca' });
  if (b.action === 'boost') {
    const tx = String(b.tx || '').trim();
    const p = await claimPayment(env, { tx, wallet: u.wallet, kind: 'boost', ref: ca, minUsdc: PRICES.boost.usdc });
    if (!p.ok) return json(400, { ...p, need: PRICES.boost.usdc });
    const weeks = Math.min(8, Math.max(1, Math.floor((p.usdc + 1e-9) / PRICES.boost.usdc)));
    const cur = await env.REV.prepare('SELECT MAX(until) AS until FROM boosts WHERE ca = ? AND until > ?').bind(ca, now).first();
    const start = Math.max(now, +cur?.until || 0), until = start + weeks * PRICES.boost.days * 864e5;
    await env.REV.batch([
      env.REV.prepare('INSERT INTO boosts (tx, ca, chain, wallet, start, until, at) VALUES (?,?,?,?,?,?,?)').bind(tx, ca, chain, u.wallet, now, until, now),
      env.REV.prepare('INSERT OR IGNORE INTO projects (ca, chain, owner, updated) VALUES (?,?,?,?)').bind(ca, chain, u.wallet, now),
    ]);
    try { await caches.default.delete(PROMO_KEY); } catch {}
    notifyOwnerPayment(env, waitUntil, { product: 'boost', amountUsdc: p.usdc, wallet: u.wallet, tx, ref: ca });
    return json(200, { ok: true, until, weeks });
  }
  if (b.action === 'edit') {
    const ok = await env.REV.prepare('SELECT 1 FROM boosts WHERE ca = ? AND wallet = ?').bind(ca, u.wallet).first();
    if (!ok) return json(403, { err: 'boost_required' });
    const f = { name: clean(b.name, 60), website: url(b.website, /^https:\/\/[^\s"'<>]+$/i), twitter: url(b.twitter, /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,30}\/?$/i),
      telegram: url(b.telegram, /^https:\/\/t\.me\/[A-Za-z0-9_+]{3,60}\/?$/i), descr: clean(b.descr, 500) };
    await env.REV.prepare('INSERT INTO projects (ca, chain, owner, name, website, twitter, telegram, descr, updated) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(ca) DO UPDATE SET name=excluded.name, website=excluded.website, twitter=excluded.twitter, telegram=excluded.telegram, descr=excluded.descr, updated=excluded.updated')
      .bind(ca, chain, u.wallet, f.name, f.website, f.twitter, f.telegram, f.descr, now).run();
    try { await caches.default.delete(PROMO_KEY); } catch {}
    return json(200, { ok: true, profile: f });
  }
  return json(400, { err: 'action' });
}
