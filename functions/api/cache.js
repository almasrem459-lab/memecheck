// Read-only shared result cache (Workers KV, binding MEMECHECK_CACHE). GET ?ca=&chain=&kind= -> { at, data } or 404.
// Writes are NOT accepted from browsers (cache-poisoning fix): results are written only by server code
// (/api/deep and the memecheck-warmer Worker, via functions/_lib/shared.js).
import { readShared, keyOf, validCa } from '../_lib/shared.js';
export { ttlFor } from '../_lib/shared.js';
const KINDS = new Set(['dev', 'exit', 'bubble', 'core']);
const json = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export const onRequest = async ({ request: req, env }) => {
  if (req.method !== 'GET') return json(405, { error: 'read-only' });
  const KV = env.MEMECHECK_CACHE; if (!KV) return json(503, { error: 'cache not bound' });
  const u = new URL(req.url), ca = u.searchParams.get('ca'), chain = u.searchParams.get('chain') || 'solana', kind = u.searchParams.get('kind');
  if (!KINDS.has(kind) || !validCa(ca, chain)) return json(400, { error: 'bad params' });
  const v = await readShared(KV, keyOf(kind, chain, ca));
  return v ? json(200, v) : json(200, { miss: true }); // a miss is a normal outcome: 200 keeps browser consoles free of 404 noise
};
