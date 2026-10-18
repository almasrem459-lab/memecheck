// EVM security data in one call: GoPlus token_security + Honeypot.is IsHoneypot (+ Four.meme token info on BNB Chain).
// Used by the Pages Function /api/evm-security (browser path) and directly by core.js when it runs server-side
// (/api/deep, warmer) or when the relay is down. Each upstream answer is cached in the Cache API (Workers only;
// skipped in browsers) for TTL seconds; on an upstream failure the last good copy (<= STALE s) is served instead.
// Result: { chain, ca, goplus:{s,d}, honeypot:{s,d}, four:{s,d}|null } with s = 'ok' | 'empty' | 'fail'.
export const EVM_IDS = { ethereum: 1, bsc: 56, base: 8453, arbitrum: 42161 };
export const HP_CHAINS = new Set(['ethereum', 'bsc', 'base']); // Honeypot.is answers 400 "Invalid chain" for Arbitrum (42161)
export const TTL = 300, STALE = 3600;
const UA = { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (MemeCheck/1.0)' };
const C = () => (typeof caches !== 'undefined' && caches.default) ? caches.default : null; // Workers Cache API only
async function timed(url, ms) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: ctl.signal }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, j }; }
  finally { clearTimeout(tm); }
}
// judge(status, json) -> { s:'ok'|'empty', d } to keep, or null (= failure, not cached)
async function upstream(name, url, judge, { ms = 7000, waitUntil } = {}) {
  const cache = C(), key = new Request('https://memecheck-evmsec.internal/' + encodeURIComponent(url));
  let old = null;
  try { const h = cache && await cache.match(key); if (h) old = await h.json(); } catch {}
  if (old && Date.now() - old.at < (old.s === 'empty' ? 90 : TTL) * 1000) return { s: old.s, d: old.d, cache: 'HIT' };
  try {
    const { status, j } = await timed(url, ms);
    const v = judge(status, j);
    if (v) {
      if (cache) { const p = cache.put(key, new Response(JSON.stringify({ ...v, at: Date.now() }), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${STALE}` } })).catch(() => {}); waitUntil ? waitUntil(p) : await p; }
      return { ...v, cache: 'MISS' };
    }
  } catch {}
  if (old && old.s === 'ok' && Date.now() - old.at < STALE * 1000) return { s: old.s, d: old.d, cache: 'STALE' };
  return { s: 'fail', d: null };
}
const judgeGoplus = (ca) => (st, j) => {
  if (st !== 200 || !j || j.code !== 1) return null; // e.g. code 4029 = rate limited -> failure (served stale if we have it)
  const r = j.result?.[ca]; return r && Object.keys(r).length ? { s: 'ok', d: r } : { s: 'empty', d: null };
};
const judgeHp = (st, j) => {
  if (st === 404 || (st === 400 && j)) return { s: 'empty', d: { error: j?.error || 'no pair' } }; // no tradable pair yet (e.g. still on a bonding curve)
  if (st !== 200 || !j || !(j.honeypotResult || j.summary)) return null;
  const { summary, honeypotResult, simulationSuccess, simulationResult, contractCode, flags, token, pair } = j;
  return { s: 'ok', d: { summary, honeypotResult, simulationSuccess, simulationResult, contractCode, flags, token, pair: pair ? { pair: pair.pair, liquidity: pair.liquidity, createdAtTimestamp: pair.createdAtTimestamp } : null } };
};
const judgeFour = (st, j) => {
  if (st !== 200 || !j || j.code !== 0) return null;
  const d = j.data; if (!d?.address || !d.status) return { s: 'empty', d: null }; // not a Four.meme token
  return { s: 'ok', d: { status: d.status, progress: d.tokenPrice?.progress != null ? +d.tokenPrice.progress : null, version: d.version || null, launchTime: d.launchTime || null, dexType: d.dexType || null, raised: d.raisedAmount || null, quote: d.symbol || null } };
};
export async function getEvmSecurity(ca, chain, opt = {}) {
  ca = String(ca || '').toLowerCase(); const id = EVM_IDS[chain];
  if (!id || !/^0x[0-9a-f]{40}$/.test(ca)) throw new Error('bad params');
  const want = (k) => !opt.only || opt.only.includes(k); // opt.only: re-fetch just these parts (browser fallback)
  const [goplus, honeypot, four] = await Promise.all([
    want('goplus') ? upstream('goplus', `https://api.gopluslabs.io/api/v1/token_security/${id}?contract_addresses=${ca}`, judgeGoplus(ca), opt) : null,
    !HP_CHAINS.has(chain) ? { s: 'unsupported', d: null } : want('honeypot') ? upstream('honeypot', `https://api.honeypot.is/v2/IsHoneypot?address=${ca}&chainID=${id}`, judgeHp, opt) : null,
    chain === 'bsc' && want('four') ? upstream('four', `https://four.meme/meme-api/v1/private/token/get/v2?address=${ca}`, judgeFour, { ...opt, ms: 5000 }) : null,
  ]);
  return { chain, ca, goplus, honeypot, four };
}
