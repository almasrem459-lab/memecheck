// GET /api/evm-security?chain=bsc|ethereum|base&ca=0x...  -> GoPlus + Honeypot.is (+ Four.meme on BSC) in one response.
// Upstream answers are cached for 5 min in the Cache API (stale copy up to 1 h on upstream failure), so many visitors
// scanning the same token cost one GoPlus / Honeypot.is call. Never throws: a failed source comes back as { s: 'fail' }.
import { getEvmSecurity, EVM_IDS } from '../../evmsec.js';
const json = (status, body, cc = 'no-store') => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cc, 'access-control-allow-origin': '*' } });
export const onRequest = async ({ request: req, waitUntil }) => {
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const u = new URL(req.url), ca = (u.searchParams.get('ca') || '').toLowerCase(), chain = u.searchParams.get('chain') || '';
  if (!EVM_IDS[chain] || !/^0x[0-9a-f]{40}$/.test(ca)) return json(400, { error: 'bad params' });
  try {
    const r = await getEvmSecurity(ca, chain, { waitUntil });
    const allFail = r.goplus.s === 'fail' && r.honeypot.s === 'fail';
    return json(200, { ...r, at: Date.now() }, allFail ? 'no-store' : 'public, max-age=60');
  } catch (e) { return json(200, { chain, ca, goplus: { s: 'fail', d: null }, honeypot: { s: 'fail', d: null }, four: null, error: 'internal' }); }
};
