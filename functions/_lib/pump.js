// Shared pump.fun frontend-api fetch with Cache-API stale-on-error (same idea as /api/proxy).
// pump.fun often 403s Cloudflare edges; serving a recent good copy keeps /api/dev and /api/devrep usable.
const PUMP = 'https://frontend-api-v3.pump.fun';
const UA = 'Mozilla/5.0 (MemeCheck/1.0)';
const STALE = 86400; // keep last good copy up to 24 h
const TTL = 60;      // prefer fresh within 60 s

export function pumpUrl(pathAndQuery) {
  if (pathAndQuery.startsWith('http')) return pathAndQuery;
  return PUMP + (pathAndQuery.startsWith('/') ? pathAndQuery : '/' + pathAndQuery);
}

/** @returns {{ json: any, state: 'HIT'|'MISS'|'STALE'|'FAIL' }} */
export async function pumpGet(pathAndQuery, { ms = 7000, waitUntil } = {}) {
  const url = pumpUrl(pathAndQuery);
  const key = new Request('https://memecheck-cache.internal/' + encodeURIComponent(url)); // same key as /api/proxy
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  let body = null, at = 0;
  try {
    const hit = cache && await cache.match(key);
    if (hit) { body = await hit.text(); at = +hit.headers.get('x-fetched-at') || 0; }
  } catch {}
  const age = body != null ? (Date.now() - at) / 1000 : Infinity;
  if (body != null && age < TTL) {
    try { return { json: JSON.parse(body), state: 'HIT' }; } catch {}
  }

  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { accept: 'application/json', 'user-agent': UA, origin: 'https://pump.fun', referer: 'https://pump.fun/' },
      cf: { cacheTtl: TTL, cacheEverything: true },
    });
    if (r.status === 404) return { json: null, state: 'MISS' };
    const txt = await r.text();
    if (r.ok) {
      let json; try { json = JSON.parse(txt); } catch { json = null; }
      if (json != null && cache) {
        const now = Date.now();
        const p = cache.put(key, new Response(txt, {
          headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${STALE}`, 'x-fetched-at': String(now) },
        })).catch(() => {});
        waitUntil ? waitUntil(p) : await p;
      }
      return { json, state: 'MISS' };
    }
  } catch {
    // fall through to stale
  } finally { clearTimeout(tm); }

  if (body != null) {
    try { return { json: JSON.parse(body), state: 'STALE' }; } catch {}
  }
  return { json: null, state: 'FAIL' };
}

export { PUMP };

/** Fallback when pump.fun list is blocked: Helius DAS getAssetsByCreator (needs HELIUS_KEY). */
export async function heliusCreatedCoins(creator, env, { limit = 100, ms = 8000 } = {}) {
  if (!env?.HELIUS_KEY || !creator) return null;
  const up = `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_KEY}`;
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(up, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'mc-devrep',
        method: 'getAssetsByCreator',
        params: { creatorAddress: creator, onlyVerified: false, page: 1, limit },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const items = j?.result?.items;
    if (!Array.isArray(items)) return null;
    const coins = [];
    for (const it of items) {
      const mint = it?.id;
      if (!mint || typeof mint !== 'string') continue;
      // Prefer fungible / token-like; skip compressed NFTs without token_info when obvious collectible
      const md = it?.content?.metadata || {};
      const sym = String(md.symbol || '').slice(0, 20);
      const name = String(md.name || '').slice(0, 40);
      // created timestamp: Helius sometimes exposes ownership.delegated or leave null
      let created = null;
      if (it?.token_info?.mint_authority != null) {/* ignore */}
      // royalty creators first verified date not available — cadence degrades gracefully
      coins.push({
        mint,
        symbol: sym,
        name,
        created_timestamp: created,
        ath_market_cap: 0,
        complete: false,
      });
    }
    return { coins, count: coins.length, via: 'helius' };
  } catch {
    return null;
  } finally { clearTimeout(tm); }
}
