// GET /api/og?ca=<address>&chain=<auto|ethereum|base|bsc>  ->  1200x630 PNG share image (name/symbol + cached risk level).
// Rendered once per URL and cached at the edge (Cache API + CDN headers). Read-only: no KV writes, no risk computation.
import { renderOg } from '../_lib/og.js';
import { ogInfo, CA_RE } from '../_lib/oginfo.js';
export const onRequest = async ({ request: req, env, waitUntil }) => {
  const u = new URL(req.url), ca = u.searchParams.get('ca') || '', chain = u.searchParams.get('chain') || 'auto';
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('GET only', { status: 405 });
  if (!CA_RE.test(ca)) return Response.redirect(u.origin + '/og-image.png', 302);
  const key = new Request(`${u.origin}/api/og?r=2&ca=${ca}&chain=${chain}&v=${u.searchParams.get('v') || ''}`);
  const cache = caches.default;
  const hit = await cache.match(key); if (hit) return hit;
  try {
    const info = await ogInfo(env, ca, chain);
    const png = await renderOg(info);
    const ttl = info.level ? 3600 : info.sym ? 600 : 60;
    const res = new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': `public, max-age=${ttl}, s-maxage=${ttl}`, 'x-og-level': info.level || 'none' } });
    waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) { console.log('og fail', e?.message); return Response.redirect(u.origin + '/og-image.png', 302); }
};
