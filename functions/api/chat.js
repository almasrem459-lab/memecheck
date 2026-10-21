// /api/chat -> MemeCheckShield community chat. All state lives in the `memecheck-chat` Worker's ChatRoom Durable Object
// (SQLite-backed, Workers Free), bound here as env.CHAT via script_name in wrangler.toml. No KV, no secrets.
//   GET  /api/chat?ws=1&uid=...   WebSocket upgrade (live room; WebSocket Hibernation in the DO)
//   GET  /api/chat?since=<id>     polling fallback: messages newer than <id> (+ current ids so clients can drop deleted ones)
//   POST /api/chat {op:'post', uid, nick, text} | {op:'report', id}   (polling fallback; WebSocket clients send these over the socket)
// The client IP (CF-Connecting-IP) is forwarded as x-mc-ip for per-IP rate limits/bans; the DO stores only a salted hash.
import { rateLimit } from '../_lib/rl.js';
// Abuse monitoring: per-IP edge rate limit in front of the Durable Object's own limits; floods are logged (hashed IP) via rl.js.
const ORIGIN_OK = /^https:\/\/([a-z0-9-]+\.)?memecheck\.pages\.dev$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const room = (env) => env.CHAT.get(env.CHAT.idFromName('global'));
const ipOf = (req) => req.headers.get('cf-connecting-ip') || '';

export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.CHAT) return json(503, { err: 'chat_unavailable' });
  const lim = await rateLimit(request, 'chatget', 240, 60, waitUntil); if (lim) return lim;
  const u = new URL(request.url);
  if (u.searchParams.has('ws')) {
    if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return json(426, { err: 'websocket expected' });
    const o = request.headers.get('origin') || ''; if (o && !ORIGIN_OK.test(o)) return json(403, { err: 'origin' });
    const uid = (u.searchParams.get('uid') || '').slice(0, 40);
    return room(env).fetch(new Request('https://chat/ws?uid=' + encodeURIComponent(uid), { headers: { upgrade: 'websocket', 'x-mc-ip': ipOf(request) } }));
  }
  const since = Math.max(0, parseInt(u.searchParams.get('since') || '0', 10) || 0);
  return room(env).fetch(new Request('https://chat/history?since=' + since, { headers: { 'x-mc-ip': ipOf(request) } }));
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.CHAT) return json(503, { err: 'chat_unavailable' });
  const lim = await rateLimit(request, 'chat', 20, 60, waitUntil); if (lim) return lim;
  const o = request.headers.get('origin') || ''; if (o && !ORIGIN_OK.test(o)) return json(403, { err: 'origin' });
  const len = +(request.headers.get('content-length') || 0); if (len > 4096) return json(413, { err: 'too_long' });
  let b; try { b = JSON.parse((await request.text()).slice(0, 4096)); } catch { return json(400, { err: 'json' }); }
  const op = b && b.op === 'report' ? 'report' : 'post';
  const body = op === 'report' ? { id: +b.id || 0 } : { uid: String(b.uid || '').slice(0, 40), nick: String(b.nick || '').slice(0, 60), text: String(b.text || '').slice(0, 1000) };
  return room(env).fetch(new Request('https://chat/' + op, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mc-ip': ipOf(request) }, body: JSON.stringify(body) }));
}

export async function onRequestOptions() { return new Response(null, { status: 204 }); }
