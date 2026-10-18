// Allowlisted CORS proxy with light edge caching. Fresh copies are served from the Cloudflare Cache API for a per-host TTL;
// on upstream error (e.g. ForexFactory 429) the last good copy is served stale (kept up to 24 h) instead of failing.
const ALLOW = ['api.dexscreener.com', 'api.rugcheck.xyz', 'api.gopluslabs.io', 'api.honeypot.is', 'api.gold-api.com', 'nfs.faireconomy.media', 'frontend-api-v3.pump.fun', 'api.geckoterminal.com'];
const TTL = { 'nfs.faireconomy.media': 2700, 'api.gold-api.com': 60, 'api.rugcheck.xyz': 120, 'api.gopluslabs.io': 120, 'api.honeypot.is': 120, 'api.dexscreener.com': 30, 'frontend-api-v3.pump.fun': 20, 'api.geckoterminal.com': 60 };
const STALE = 86400;
const json = (status, body, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra } });
const mem = new Map(); // per-isolate fallback when the Cache API is unavailable
export const onRequest = async ({ request: req, waitUntil }) => {
  let u; try { u = new URL(new URL(req.url).searchParams.get('url')); } catch { return json(400, { error: 'bad url' }); }
  if (u.protocol !== 'https:' || !ALLOW.includes(u.hostname) || (u.hostname === 'nfs.faireconomy.media' && u.pathname !== '/ff_calendar_thisweek.json') || (u.hostname === 'frontend-api-v3.pump.fun' && !/^\/coins(-v2\/(user-created-coins\/)?[1-9A-HJ-NP-Za-km-z]{32,44})?$/.test(u.pathname))) return json(403, { error: 'host not allowed' });
  const ttl = TTL[u.hostname] || 30;
  const key = new Request('https://memecheck-cache.internal/' + encodeURIComponent(u.toString()));
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  let hit = null; try { hit = cache && await cache.match(key); } catch {}
  let body = null, at = 0;
  if (hit) { body = await hit.text(); at = +hit.headers.get('x-fetched-at') || 0; }
  else if (mem.has(key.url)) ({ body, at } = mem.get(key.url));
  const age = (Date.now() - at) / 1000;
  const out = (b, status, state) => json(status, b, { 'cache-control': `public, max-age=${Math.min(ttl, 300)}`, 'x-cache': state });
  if (body != null && age < ttl) return out(body, 200, 'HIT');
  try {
    const r = await fetch(u, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (MemeCheck/1.0)' }, cf: { cacheTtl: ttl, cacheEverything: true } });
    const txt = await r.text();
    const softErr = /"code":\s*4029|too many requests|rate limit/i.test(txt.slice(0, 300)); // e.g. GoPlus answers 200 with code 4029
    if (r.ok && !softErr) {
      const now = Date.now(); mem.set(key.url, { body: txt, at: now }); if (mem.size > 300) mem.delete(mem.keys().next().value);
      if (cache) { const p = cache.put(key, new Response(txt, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${STALE}`, 'x-fetched-at': String(now) } })).catch(() => {}); waitUntil ? waitUntil(p) : await p; }
      return out(txt, 200, 'MISS');
    }
    if (body != null) return out(body, 200, 'STALE');
    return json(r.status, txt, { 'cache-control': 'no-store' });
  } catch {
    if (body != null) return out(body, 200, 'STALE');
    return json(502, { error: 'upstream failed' });
  }
};
