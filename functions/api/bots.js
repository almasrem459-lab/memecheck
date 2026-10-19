// GET /api/bots -> SIMULATED paper-trading bots snapshot for the Smart money page (smart.html, "Bots" section).
// The PAPER-ONLY consensus bot runs off-site; its exporter (consensus-bot/export_site.py) publishes a sanitized snapshot
// (stats, last 50 trades, open positions, rejections, public wallet labels; no addresses, keys or signatures)
// to KV key `bots:v1` at most every 15 min. Here we only READ KV (no writes) and keep a 60 s edge cache.
// Not financial advice: no real trades are ever executed.
const TTL = 60;
const json = (status, body, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', ...extra },
});

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default, key = new Request(new URL('/api/bots', request.url).toString());
  const hit = await cache.match(key).catch(() => null);
  if (hit) return hit;
  let raw = null;
  try { raw = env.MEMECHECK_CACHE ? await env.MEMECHECK_CACHE.get('bots:v1') : null; } catch {}
  if (!raw) return json(200, { ok: false, bots: [], note: 'Bot data is not available yet.' }, { 'cache-control': 'public, max-age=30' });
  let ok = false;
  try { const d = JSON.parse(raw); ok = !!(d && d.ok && Array.isArray(d.bots)); } catch {}
  if (!ok) return json(200, { ok: false, bots: [], note: 'Bot data is not available yet.' }, { 'cache-control': 'public, max-age=30' });
  const res = json(200, raw, { 'cache-control': `public, max-age=${TTL}` });
  waitUntil(cache.put(key, res.clone()).catch(() => {}));
  return res;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' } });
}
