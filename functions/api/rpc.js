// Read-only Solana RPC relay for the dev/bundle analysis. The public RPC rejects browser origins, so the browser POSTs here.
// Only a few read methods are allowed and batches are capped.
// Free keyless upstreams in fallback order. split=true: upstream rejects batches, so send each call separately (in parallel).
const UPSTREAMS = [
  { url: 'https://api.mainnet-beta.solana.com' },
  { url: 'https://solana.leorpc.com/?api_key=FREE' },
  { url: 'https://solana-mainnet.gateway.tatum.io', split: true },
];
const METHODS = new Set(['getSignaturesForAddress', 'getTransaction', 'getTokenSupply', 'getTokenAccountsByOwner', 'getMultipleAccounts', 'getTokenLargestAccounts', 'getSlot', 'getBlockTime', 'getBlock']);
const json = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
import { rateLimit } from '../_lib/rl.js';
const ORIGIN_OK = /^https:\/\/([a-z0-9-]+\.)?memecheck\.pages\.dev$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
export const onRequest = async ({ request: req, env, waitUntil }) => {
  const ups = env && env.HELIUS_KEY ? [{ url: `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_KEY}` }, ...UPSTREAMS] : UPSTREAMS;
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const o = req.headers.get('origin') || ''; if (o && !ORIGIN_OK.test(o)) return json(403, { error: 'origin' });   // other sites can't use our relay/Helius key
  if (+(req.headers.get('content-length') || 0) > 16384) return json(413, { error: 'too large' });
  const lim = await rateLimit(req, 'rpc', 300, 60, waitUntil); if (lim) return lim;
  let body; try { const raw = await req.text(); if (raw.length > 16384) return json(413, { error: 'too large' }); body = JSON.parse(raw); } catch { return json(400, { error: 'bad json' }); }
  const arr = Array.isArray(body) ? body : [body];
  if (!arr.length || arr.length > 10 || !arr.every(x => x && x.jsonrpc === '2.0' && METHODS.has(x.method) && Array.isArray(x.params) && x.params.length <= 3 && JSON.stringify(x.params).length < 6000)) return json(403, { error: 'method not allowed' });
  const log = [];
  const post = (up, b) => fetch(up, { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json', 'user-agent': 'memecheck-rpc-relay/1.0' }, body: JSON.stringify(b) });
  const isLimited = (status, txt) => status === 429 || status === 403 || status === 401 || status === 402 || status >= 500 || /"code":\s*(429|-32429|403|-32005|-32052|-32029|-16401|-16402|-32603)/.test(txt) || /personal token|api key|paid plan/i.test(txt);
  const withLog = (r) => { r.headers.set('x-upstream-log', log.join(', ')); return r; };
  let last = null;
  for (const up of ups) {
    const host = new URL(up.url).host;
    try {
      if (up.split) {
        const res = await Promise.all(arr.map(async (x) => { const r = await post(up.url, x); const t = await r.text(); if (isLimited(r.status, t)) throw new Error(r.status + ''); return JSON.parse(t); }));
        log.push(host + ':200');
        if (res.every(x => x && x.jsonrpc)) return withLog(json(200, Array.isArray(body) ? res : res[0]));
      } else {
        const r = await post(up.url, body); const txt = await r.text(); log.push(host + ':' + r.status);
        last = json(r.status, txt);
        if (!isLimited(r.status, txt)) return withLog(last);
      }
    } catch (e) { log.push(host + ':err ' + String(e && e.message || e).slice(0, 40)); }
  }
  console.log('rpc upstreams failed', log.join(', '));
  return withLog(last || json(502, { error: 'upstream failed' }));
};
