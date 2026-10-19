// POST /api/feedback {msg, contact?, cat?: 'idea'|'bug'|'other', lang?: 'en'|'ar', path?, hp?}
// "Suggest an idea to the developer" box (injected by nav.js). Stored in the `memecheck-chat` ChatRoom Durable Object's
// SQLite (feedback table) via the CHAT binding - no KV writes. The DO keeps only a salted IP hash (3 posts / IP / hour).
// Admin read/delete: POST /api/chat-admin {action:'feedback_list'|'feedback_delete'}.
const ORIGIN_OK = /^https:\/\/([a-z0-9-]+\.)?memecheck\.pages\.dev$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
export async function onRequestPost({ request, env }) {
  if (!env.CHAT) return json(503, { err: 'unavailable' });
  const o = request.headers.get('origin') || ''; if (o && !ORIGIN_OK.test(o)) return json(403, { err: 'origin' });
  const len = +(request.headers.get('content-length') || 0); if (len > 8192) return json(413, { err: 'too_long' });
  const raw = await request.text(); if (raw.length > 8192) return json(413, { err: 'too_long' });
  let b; try { b = JSON.parse(raw); } catch { return json(400, { err: 'json' }); }
  if (!b || typeof b !== 'object') return json(400, { err: 'json' });
  const s = (v) => (typeof v === 'string' ? v : '');
  const msg = s(b.msg).trim(), contact = s(b.contact).trim();
  if (s(b.hp)) return json(200, { ok: true });                         // honeypot: bots get a fake success
  if (!msg) return json(400, { err: 'empty' });
  if (msg.length > 1000 || contact.length > 80) return json(400, { err: 'too_long' });
  const body = { msg, contact, cat: s(b.cat), lang: s(b.lang), path: s(b.path).slice(0, 200) };
  const stub = env.CHAT.get(env.CHAT.idFromName('global'));
  return stub.fetch(new Request('https://chat/feedback', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mc-ip': request.headers.get('cf-connecting-ip') || '' }, body: JSON.stringify(body) }));
}
export async function onRequestOptions() { return new Response(null, { status: 204 }); }
