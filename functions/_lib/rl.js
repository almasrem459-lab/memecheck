// Best-effort per-IP rate limit on the Cache API (free, per colo; no KV writes). Fixed window counters.
// Returns null when allowed, or a 429 Response. Abuse events are logged (console -> Workers Logs / `wrangler pages deployment tail`)
// with a hashed IP only, so operators can spot floods without storing raw IPs.
const enc = new TextEncoder();
export async function ipHash(ip) {
  try { const d = await crypto.subtle.digest('SHA-256', enc.encode('mc-rl:' + ip)); return [...new Uint8Array(d)].slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join(''); } catch { return 'x'; }
}
const mem = new Map();
export async function rateLimit(req, bucket, max, winSec, waitUntil) {
  const ip = req.headers.get('cf-connecting-ip') || '';
  if (!ip) return null; // local dev
  const h = await ipHash(ip), slot = Math.floor(Date.now() / 1000 / winSec);
  const key = new Request(`https://memecheck-rl.internal/${bucket}/${h}/${slot}`);
  let n = 0; const cache = typeof caches !== 'undefined' ? caches.default : null;
  try { const r = cache && await cache.match(key); if (r) n = +(await r.text()) || 0; } catch {}
  const mk = bucket + h + slot; n = Math.max(n, mem.get(mk) || 0) + 1; mem.set(mk, n); if (mem.size > 2000) mem.delete(mem.keys().next().value);
  if (cache) { const p = cache.put(key, new Response(String(n), { headers: { 'cache-control': `public, max-age=${winSec}` } })).catch(() => {}); waitUntil ? waitUntil(p) : await p; }
  if (n > max) {
    if (n === max + 1 || n % 50 === 0) console.log(JSON.stringify({ abuse: bucket, ip: h, n, win: winSec, path: new URL(req.url).pathname }));
    return new Response(JSON.stringify({ error: 'rate limited', retry_after: winSec }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(winSec), 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
  }
  return null;
}
