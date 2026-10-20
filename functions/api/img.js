// Same-origin image relay for the client-side share card (canvas needs CORS-clean pixels; token logo CDNs send no CORS headers).
// GET ?url=<https image url>. Allowlisted logo hosts only, image/* only, max 2 MB, edge-cached 1 day. Read-only.
const ALLOW = /^(cdn\.dexscreener\.com|dd\.dexscreener\.com|ipfs\.io|[a-z0-9-]+\.mypinata\.cloud|gateway\.pinata\.cloud|cf-ipfs\.com|coin-images\.coingecko\.com|assets\.coingecko\.com|arweave\.net|[a-z0-9-]+\.arweave\.net|pump\.mypinata\.cloud|metadata\.pumplify\.eu)$/i;
const MAX = 2 * 1024 * 1024;
const err = (s) => new Response(null, { status: s, headers: { 'cache-control': 'no-store' } });
export const onRequest = async ({ request: req, waitUntil }) => {
  if (req.method !== 'GET') return err(405);
  let u; try { u = new URL(new URL(req.url).searchParams.get('url')); } catch { return err(400); }
  if (u.protocol !== 'https:' || !ALLOW.test(u.hostname)) return err(403);
  const key = new Request('https://memecheck-cache.internal/img/' + encodeURIComponent(u.toString()));
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  try { const hit = cache && await cache.match(key); if (hit) return hit; } catch {}
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 6000);
  const tryFetch = async (target) => {
    const r = await fetch(target, { signal: ctl.signal, headers: { accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8', 'user-agent': 'Mozilla/5.0 (MemeCheck/1.0)' } });
    const ct = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (!r.ok || !/^image\/(png|jpe?g|webp|gif|avif)$/i.test(ct) || +(r.headers.get('content-length') || 0) > MAX) return null;
    const buf = await r.arrayBuffer(); if (buf.byteLength > MAX || buf.byteLength < 32) return null;
    return { buf, ct };
  };
  try {
    // ask for PNG/JPEG/WebP (not AVIF) so every canvas can decode it
    let hit = await tryFetch(u);
    // ipfs.io often times out from Workers — retry once via cf-ipfs.com (same CID)
    if (!hit && u.hostname === 'ipfs.io') {
      const alt = new URL(u); alt.hostname = 'cf-ipfs.com'; hit = await tryFetch(alt);
    }
    if (!hit) return err(502);
    const { buf, ct } = hit;
    const res = new Response(buf, { headers: { 'content-type': ct, 'cache-control': 'public, max-age=86400', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } });
    if (cache) { const p = cache.put(key, res.clone()).catch(() => {}); waitUntil ? waitUntil(p) : await p; }
    return res;
  } catch { return err(502); } finally { clearTimeout(tm); }
};
