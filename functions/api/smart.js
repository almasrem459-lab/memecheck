// GET /api/smart -> "smart money" consensus snapshot (coins several tracked wallets bought recently)
// plus a SIMULATED paper track record. The data is produced by the separate `memecheck-smart` Worker
// (Durable Object alarm loop, see smart-worker/ in the repo), which publishes it to KV key `smart:v1`
// every ~10 min. We read KV first (no subrequest) and fall back to the worker's live JSON when KV is
// missing or older than 15 min. 60 s edge cache. No KV writes, no secrets.
// Research tool only: not copy-trading advice, no trades are ever executed.
const DEFAULT_SRC = 'https://memecheck-smart.memecheck.workers.dev/smart.json';
const TTL = 60;
const json = (status, body, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', ...extra },
});

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default, key = new Request(new URL('/api/smart', request.url).toString());
  const hit = await cache.match(key).catch(() => null);
  if (hit) return hit;
  let kv = null;
  try { kv = env.MEMECHECK_CACHE ? await env.MEMECHECK_CACHE.get('smart:v1', 'json') : null; } catch {}
  if (kv && kv.ok && Date.now() - (kv.at || 0) < 15 * 60e3) {
    const res = json(200, { ...kv, src: 'kv' }, { 'cache-control': `public, max-age=${TTL}` });
    waitUntil(cache.put(key, res.clone()).catch(() => {}));
    return res;
  }
  const src = env.SMART_URL || DEFAULT_SRC;
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(src, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (!d || !d.ok) return json(200, { ok: false, warming: true, list: [], picks: [], record: null, note: 'Smart-money data is warming up.' }, { 'cache-control': 'no-store' });
    const res = json(200, { ...d, src: 'live' }, { 'cache-control': `public, max-age=${TTL}` });
    waitUntil(cache.put(key, res.clone()).catch(() => {}));
    return res;
  } catch (e) {
    if (kv && kv.ok) return json(200, { ...kv, src: 'kv-stale' }, { 'cache-control': 'public, max-age=30' });
    return json(200, { ok: false, error: 'source unavailable', list: [], picks: [], record: null }, { 'cache-control': 'no-store' });
  } finally { clearTimeout(tm); }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' } });
}
