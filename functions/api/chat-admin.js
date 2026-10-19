// POST /api/chat-admin  (Authorization: Bearer <ADMIN_TOKEN>)  -> moderation actions on the chat Durable Object.
// The token is checked inside the DO against the `memecheck-chat` Worker secret ADMIN_TOKEN (constant-time compare);
// this function only forwards. Body: {action:'list'|'delete'|'delete_user'|'ban'|'bans'|'unban'|'unhide'|'clear'|'post'|'stats', ...}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
export async function onRequestPost({ request, env }) {
  if (!env.CHAT) return json(503, { err: 'chat_unavailable' });
  const auth = request.headers.get('authorization') || ''; if (!/^Bearer\s+\S{20,200}$/i.test(auth)) return json(401, { err: 'unauthorized' });
  const body = (await request.text()).slice(0, 8192);
  const stub = env.CHAT.get(env.CHAT.idFromName('global'));
  return stub.fetch(new Request('https://chat/admin', { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth, 'x-mc-ip': request.headers.get('cf-connecting-ip') || '' }, body }));
}
