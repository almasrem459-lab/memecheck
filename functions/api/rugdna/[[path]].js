// Open RugDNA API (CORS *, rate-limited 60 req/min/IP). Data: CC-BY 4.0 (attribute "MemeCheckShield RugDNA"); code: MIT.
//   GET /api/rugdna/stats[?history=1]      headline numbers (+ daily snapshots for growth charts)
//   GET /api/rugdna/wallet/:addr           funder, cluster, linked launches for a creator wallet
//   GET /api/rugdna/mint/:mint             creator of a token + its wallet verdict (what the scan card uses)
//   GET /api/rugdna/clusters?limit=&order= top clusters (order = dead | launches | wallets | recent)
//   GET /api/rugdna/cluster/:funder        one cluster: wallets + launches
// Methodology and caveats: https://memecheck.pages.dev/rugdna#method
import * as R from '../../_lib/rugdna.js';
import { rateLimit } from '../../_lib/rl.js';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type' };
const LICENSE = { data: 'CC-BY-4.0 (attribute: MemeCheckShield RugDNA, https://memecheck.pages.dev/rugdna)', code: 'MIT', note: 'Heuristic, estimate-grade data. A shared funder is evidence of linkage, not proof of identity or intent.' };
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra } });
const wrap = (o) => ({ ok: true, license: LICENSE, ...o });

async function cached(key, ttl, waitUntil, fn) {
  const cache = typeof caches !== 'undefined' ? caches.default : null, k = new Request('https://memecheck-cache.internal/rugdna/v1/' + key);
  try { const hit = cache && await cache.match(k); if (hit) return { body: await hit.text(), hit: true }; } catch {}
  const body = JSON.stringify(await fn());
  if (cache) { const p = cache.put(k, new Response(body, { headers: { 'cache-control': `public, max-age=${ttl}` } })).catch(() => {}); waitUntil ? waitUntil(p) : await p; }
  return { body, hit: false };
}
const raw = (r, ttl) => new Response(r.body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, 'cache-control': `public, max-age=${ttl}`, 'x-cache': r.hit ? 'HIT' : 'MISS' } });

async function walletInfo(db, addr, env) {
  let v = await R.walletVerdict(db, addr);
  if (v.status === 'unknown' || (v.status === 'unresolved' && v.state === 'pending')) { // resolve on demand; only stored when a funder is found (no junk rows)
    const plain = await R.isPlainWallet(addr, env);
    if (plain === false) return wrap({ wallet: addr, status: 'not_wallet', message: null, hint: 'This address is not a plain wallet (it looks like a token mint, token account or program). Use /api/rugdna/mint/{mint} for tokens.' });
    const res = await R.resolveFunders([addr], env), x = res.get(addr);
    if (x?.funder) {
      const now = Date.now();
      await db.prepare('INSERT OR IGNORE INTO wallets (addr, state, pri, first_seen) VALUES (?, ?, 2, ?)').bind(addr, 'pending', now).run();
      const ap = await R.applyResolution(db, res, env, now);
      for (const f of ap.funders) await R.recomputeCluster(db, f, now);
      v = await R.walletVerdict(db, addr);
    } else v = { status: 'unresolved', wallet: addr, why: x?.fail || 'rpc' };
  }
  const own = await db.prepare('SELECT mint, symbol, status, rugged, grad, created_at FROM launches WHERE creator = ? ORDER BY created_at DESC LIMIT 30').bind(addr).all();
  return wrap({ wallet: addr, ...v, message: R.messages(v), ownLaunchList: (own.results || []).map(r => ({ ...r, rugged: !!r.rugged, grad: !!r.grad })) });
}

export const onRequest = async ({ request: req, env, waitUntil, params }) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'access-control-max-age': '86400' } });
  if (req.method !== 'GET') return json(405, { ok: false, error: 'GET only' });
  const db = env.RUGDNA; if (!db) return json(503, { ok: false, error: 'rugdna storage not configured' });
  const rl = await rateLimit(req, 'rugdna', 60, 60, waitUntil); if (rl) return rl;
  const url = new URL(req.url), seg = [].concat(params.path || []).filter(Boolean), [a, b] = seg;
  try {
    if (!a) return json(200, wrap({ name: 'RugDNA API', docs: 'https://memecheck.pages.dev/rugdna#api', endpoints: ['/api/rugdna/stats', '/api/rugdna/wallet/{address}', '/api/rugdna/mint/{mint}', '/api/rugdna/clusters', '/api/rugdna/cluster/{funder}'], rateLimit: '60 requests/minute/IP' }), { 'cache-control': 'public, max-age=300' });
    if (a === 'stats') {
      const hist = url.searchParams.get('history') === '1';
      const r = await cached('stats' + (hist ? '-h' : ''), 300, waitUntil, async () => { const s = await R.stats(db); return wrap({ ...s, ...(hist ? { history: await R.history(db, 120) } : {}), definitions: DEFS }); });
      return raw(r, 120);
    }
    if (a === 'clusters') {
      const limit = Math.min(100, Math.max(1, +url.searchParams.get('limit') || 25)), order = ['dead', 'launches', 'wallets', 'recent'].includes(url.searchParams.get('order')) ? url.searchParams.get('order') : 'dead';
      const r = await cached(`clusters-${order}-${limit}`, 300, waitUntil, async () => wrap({ order, clusters: await R.topClusters(db, limit, order) }));
      return raw(r, 120);
    }
    if (a === 'cluster') {
      if (!b || !R.ADDR_RE.test(b)) return json(400, { ok: false, error: 'bad funder address' });
      const r = await cached('cluster-' + b, 120, waitUntil, async () => wrap(await R.clusterDetail(db, b)));
      return raw(r, 60);
    }
    if (a === 'wallet') {
      if (!b || !R.ADDR_RE.test(b)) return json(400, { ok: false, error: 'bad wallet address' });
      const r = await cached('wallet-' + b, 60, waitUntil, () => walletInfo(db, b, env));
      return raw(r, 30);
    }
    if (a === 'mint') {
      if (!b || !R.ADDR_RE.test(b)) return json(400, { ok: false, error: 'bad mint address' });
      const r = await cached('mint-' + b, 90, waitUntil, async () => wrap(await R.lookupMint(db, b, env)));
      return raw(r, 30);
    }
    return json(404, { ok: false, error: 'unknown endpoint', see: 'https://memecheck.pages.dev/rugdna#api' });
  } catch (e) {
    return json(502, { ok: false, error: 'rugdna_unavailable', detail: String(e?.message || e).slice(0, 120) });
  }
};

const DEFS = {
  funder: 'Source of the first incoming SOL transfer (>= 0.005 SOL) to a launcher wallet, from its oldest transactions.',
  cluster: '2 or more launcher wallets sharing the same funder. Exchange wallets, high-velocity service wallets (>= 100 txs in 6 h) and funders feeding >= 100 wallets are excluded.',
  dead: 'Launch is >= 6 h old and has no DexScreener market or a market cap below $10K (same rule as Developer history). rugged = dead after reaching >= $50K and falling below 10% of that.',
  warning: 'Shown when OTHER wallets in the cluster have >= 3 dead launches and >= 70% of their judged launches are dead (level fail: >= 5 and >= 80%).',
  flagged_before_rug: 'Launches flagged at ingestion or at scan time while not yet judged dead, later re-checked: outcome dead / survived (alive after >= 24 h) / pending.',
  capital_exposed_usd_est: 'ESTIMATE. Sum of the highest observed liquidity (USD) of flagged launches that later died. It is exposure, not verified prevented loss: we cannot know how many users acted on a warning.',
  launches_indexed: 'Sampled index of newest launches (up to 25 new per 5 minutes) plus launches seen in scans and developer histories. Not every pump.fun launch.',
};
