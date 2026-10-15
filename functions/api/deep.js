// GET /api/deep?ca=&chain=&kind=dev|exit|core  — shared deep-check results, computed ONLY server-side.
//  200 {at,data,...}  cached (Cache API hot copy -> KV)
//  202 {pending:true} another request is computing it (or this one ran past WAIT): poll again in ~2 s
//  204                server could not compute it (budget/limits/RPC): the client computes locally and does NOT write anything
// Dedupe: per-isolate in-flight promise map + a 90 s lock entry in the Cache API (free; per colo). No KV writes for locks.
// Pages Functions have a 50-subrequest cap per request, so each request computes ONE kind: dev (dev+bundle, ~15-25)
// or exit (~30-40, needs the cached dev result). If exit does not fit, the client runs it locally.
import { KINDS, validCa, keyOf, readShared, store, compute, useHelius, hotGet, hotPut, hotDel } from '../_lib/shared.js';
import { dec } from '../../mccache.js';
const WAIT = 25000;
const inflight = new Map();
const json = (status, body) => new Response(body == null ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export const onRequest = async ({ request: req, env, waitUntil }) => {
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const u = new URL(req.url), ca = u.searchParams.get('ca'), chain = u.searchParams.get('chain') || 'solana', kind = u.searchParams.get('kind');
  const peek = u.searchParams.get('peek') === '1'; // read-only, never triggers compute
  if (!KINDS.has(kind) || !validCa(ca, chain) || (kind !== 'core' && chain !== 'solana')) return json(400, { error: 'bad params' });
  const KV = env.MEMECHECK_CACHE, k = keyOf(kind, chain, ca);
  const hit = await readShared(KV, k); if (hit) return json(200, hit);
  if (peek) return json(404, { miss: true });
  if (inflight.has(k)) return race(inflight.get(k));
  const lockK = 'lock:' + k;
  if (await hotGet(lockK)) return json(202, { pending: true });
  let devData = null;
  if (kind === 'exit') { const d = await readShared(KV, keyOf('dev', chain, ca)); devData = d && dec(JSON.parse(d).data); if (!devData?.pump) return json(204); }
  await hotPut(lockK, '1', 90);
  useHelius(env.HELIUS_KEY);
  const job = (async () => {
    // over the 50-subrequest cap the runtime throws -> job fails -> 204 -> client computes locally
    try { const r = await compute(kind, chain, ca, { devData }); if (!r) return null; return (await store(KV, kind, chain, ca, r.data, r.created, 'server', 'pages')).txt; }
    catch (e) { console.log('deep fail', k, e?.message); return null; }
    finally { await hotDel(lockK); inflight.delete(k); }
  })();
  inflight.set(k, job); waitUntil(job);
  return race(job);
};
async function race(p) {
  const r = await Promise.race([p, new Promise(ok => setTimeout(() => ok(undefined), WAIT))]);
  return r === undefined ? json(202, { pending: true }) : r ? json(200, r) : json(204);
}
