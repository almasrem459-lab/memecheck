// memecheck-warmer: cron Worker (every minute) that prewarms MemeCheck results for tokens that are new or spreading,
// on Solana (pump.fun and any launchpad/DEX) and EVM (ethereum/bsc/base), writing the same format /api/deep and /api/cache serve.
// Free plan: 50 subrequests per invocation, so each minute does one bounded slice:
//   minute % 3 == 2 : EXIT  — exit trace for the newest prewarmed Solana token missing one (KV.list on dev keys, ~30-40 subreq)
//   otherwise       : FRESH — discovery feeds (2-6 subreq) -> score by traction -> dev+bundle for the best Solana token
//                     missing it (~15-25), then the core risk check (3-5 each) for up to 2 tokens (EVM first) if budget remains.
// minute 7 / 37: accuracy-study tracker (src/tracker.js) -> KV study:v2, read by /api/study (/rugs, /accuracy).
// KV writes go through guardedPut (daily counter, warmer paced to <=600/day, hard stop ~880 total).
import { trackerScan, trackerRecheck } from './tracker.js';
import { compute, store, keyOf, useHelius, budgetOk, writesToday } from '../../cf-dist/functions/_lib/shared.js';
const BUDGET = 48, UA = { 'user-agent': 'memecheck-warmer/2.0 (+https://memecheck.pages.dev)' };
const EVM = { eth: 'ethereum', bsc: 'bsc', base: 'base', ethereum: 'ethereum' };
const getJ = async (u, h = {}, retry = 1) => { const r = await fetch(u, { headers: { accept: 'application/json', ...UA, ...h } });
  if (r.status === 429 && retry) { await new Promise(ok => setTimeout(ok, 1500)); return getJ(u, h, retry - 1); } // one retry (1 extra subrequest)
  if (!r.ok) throw new Error(new URL(u).hostname.split('.')[0] + ' ' + r.status); return r.json(); };
const PF = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36', origin: 'https://pump.fun', referer: 'https://pump.fun/' };

async function discover(minute, log) {
  const C = new Map(); // key chain:ca -> { chain, ca, score, created }
  const add = (chain, ca, pts, created) => { if (!ca || !chain) return; if (chain !== 'solana') ca = ca.toLowerCase(); const k = chain + ':' + ca;
    const o = C.get(k) || { chain, ca, score: 0, created: null, n: 0 }; o.score += pts; o.n++; if (created) o.created = created; C.set(k, o); };
  const age = (t) => t ? (Date.now() - t) / 6e4 : 1e9; // minutes
  const jobs = [
    // pump.fun newest: brand-new launches. Rank by early traction (market cap / replies), boosted when < 3 min old.
    getJ('https://frontend-api-v3.pump.fun/coins?offset=0&limit=30&sort=created_timestamp&order=DESC&includeNsfw=false', PF).then(a => { log.push('pnew ' + a.length);
      for (const c of a) { const mc = c.usd_market_cap || 0; add('solana', c.mint, (mc > 7000 ? 3 : mc > 5500 ? 1.5 : 0.3) + Math.min(2, (c.reply_count || 0) / 3) + (age(c.created_timestamp) < 3 ? 2 : 0), c.created_timestamp); } }),
    // pump.fun currently live / about to graduate (highest bonding-curve progress = traction)
    getJ('https://frontend-api-v3.pump.fun/coins/currently-live?offset=0&limit=30&includeNsfw=false', PF).then(a => { log.push('plive ' + a.length);
      for (const c of a) add('solana', c.mint, 2 + Math.min(3, (c.usd_market_cap || 0) / 2e4) + (c.complete ? 0 : 1), c.created_timestamp); }),
  ];
  if (minute % 3 === 0) jobs.push(
    getJ('https://api.dexscreener.com/token-boosts/latest/v1').then(a => { log.push('dboost ' + a.length); for (const x of a) add(x.chainId === 'solana' ? 'solana' : EVM[x.chainId], x.tokenAddress, 2 + Math.min(3, (x.totalAmount || x.amount || 0) / 100)); }),
    getJ('https://api.dexscreener.com/token-profiles/latest/v1').then(a => { log.push('dprof ' + a.length); for (const x of a) add(x.chainId === 'solana' ? 'solana' : EVM[x.chainId], x.tokenAddress, 2); }),
    getJ('https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1', { accept: 'application/json;version=20230302' }).then(j => gecko(j, 'solana', 1, add, log, 'gnew')),
  ); else jobs.push(
    getJ('https://api.geckoterminal.com/api/v2/networks/trending_pools?page=1', { accept: 'application/json;version=20230302' }).then(j => gecko(j, null, 3, add, log, 'gtrend')),
    getJ('https://api.dexscreener.com/token-boosts/top/v1').then(a => { log.push('dtop ' + a.length); for (const x of a) add(x.chainId === 'solana' ? 'solana' : EVM[x.chainId], x.tokenAddress, 2.5); }),
  );
  await Promise.all(jobs.map(p => p.catch(e => log.push('feed err ' + (e?.message || e)))));
  for (const o of C.values()) { if (o.n > 1) o.score += 2 * (o.n - 1); // seen in several feeds = spreading
    const a = age(o.created); o.score += a < 10 ? 3 : a < 60 ? 1.5 : a > 7 * 1440 && a < 1e9 ? -2 : 0; } // brand-new first
  return [...C.values()].filter(o => o.chain).sort((a, b) => b.score - a.score);
}
function gecko(j, net, base, add, log, tag) {
  const d = j.data || []; log.push(tag + ' ' + d.length);
  d.forEach((p, i) => { const n = net || p.id.split('_')[0]; const chain = n === 'solana' ? 'solana' : EVM[n]; if (!chain) return;
    const a = p.attributes || {}, v = +a.volume_usd?.h1 || 0, tx = (a.transactions?.h1?.buys || 0) + (a.transactions?.h1?.sells || 0);
    const pts = base * (1 - i / 40) + Math.min(3, v / 5e4) + Math.min(2, tx / 500);
    if (net && v < 3000 && tx < 50) return; // new pools with no activity yet are noise
    add(chain, p.relationships?.base_token?.data?.id?.replace(/^[^_]+_/, ''), pts, a.pool_created_at ? Date.parse(a.pool_created_at) : null); });
}

async function fresh(env, minute, log) {
  const KV = env.MEMECHECK_CACHE;
  const cands = await discover(minute, log); log.push('cands ' + cands.length + ' evm ' + cands.filter(c => c.chain !== 'solana').length);
  const sol = cands.filter(c => c.chain === 'solana').slice(0, 10), evm = cands.filter(c => c.chain !== 'solana').slice(0, 8);
  const [solDev, coreHave] = await Promise.all([Promise.all(sol.map(c => KV.get(keyOf('dev', 'solana', c.ca)))), Promise.all([...evm, ...sol].map(c => KV.get(keyOf('core', c.chain, c.ca))))]);
  const i = solDev.findIndex(v => !v);
  if (i >= 0 && await budgetOk(KV, 'warmer')) {
    const c = sol[i], t = Date.now();
    try { const r = await compute('dev', 'solana', c.ca, { created: c.created });
      if (r) { const s = await store(KV, 'dev', 'solana', c.ca, r.data, r.created, 'warmer', 'warmer'); log.push(`dev ${c.ca} pump=${r.data.pump} generic=${!!r.data.generic} kv=${s.kv} ${Date.now() - t}ms age=${c.created ? ((Date.now() - c.created) / 1e3 | 0) + 's' : '?'}`); }
      else log.push('dev fail ' + c.ca);
    } catch (e) { log.push('dev err ' + c.ca + ' ' + (e?.message || e)); }
  } else log.push(i < 0 ? 'sol dev warm' : 'budget pause');
  // core risk check: EVM first (it is the only prewarm EVM tokens get), then Solana
  const coreTodo = [...evm, ...sol].filter((c, k) => !coreHave[k]).slice(0, 2);
  for (const c of coreTodo) {
    if (!(await budgetOk(KV, 'warmer'))) break;
    try { const r = await compute('core', c.chain, c.ca); if (r) { const s = await store(KV, 'core', c.chain, c.ca, r.data, r.created, 'warmer', 'warmer'); log.push(`core ${c.chain}:${c.ca.slice(0, 8)} lvl=${r.data.verdict?.level} kv=${s.kv}`); } }
    catch (e) { log.push('core err ' + (e?.message || e)); break; }
  }
}
async function exits(env, log) {
  const KV = env.MEMECHECK_CACHE;
  const l = await KV.list({ prefix: 'dev:solana:', limit: 1000 });
  const ks = l.keys.filter(k => k.metadata?.at).sort((a, b) => b.metadata.at - a.metadata.at).slice(0, 15);
  const have = await Promise.all(ks.map(k => KV.get(k.name.replace(/^dev:/, 'exit:'))));
  for (let j = 0; j < ks.length; j++) {
    if (have[j]) continue;
    const ca = ks[j].name.slice('dev:solana:'.length);
    const d = await KV.get(ks[j].name, 'json'); const { dec } = await import('../../cf-dist/mccache.js'); const dd = dec(d.data);
    if (!dd.pump) continue;
    if (!(await budgetOk(KV, 'warmer'))) { log.push('budget pause'); return; }
    let r = null; try { r = await compute('exit', 'solana', ca, { devData: dd }); } catch (e) { log.push('exit err ' + (e?.message || e)); }
    // failed/over budget: store a short-lived marker so the warmer moves on (clients still compute it locally)
    const data = r?.data || { available: false, reason: 'rpc', error: true };
    const s = await store(KV, 'exit', 'solana', ca, data, r ? r.created : null, 'warmer', 'warmer');
    log.push(`exit ${ca} avail=${data.available} kv=${s.kv}`); return;
  }
  log.push('exits warm');
}
export default {
  async scheduled(ev, env, ctx) {
    const log = [], of = globalThis.fetch; let n = 0; const t = Date.now(), minute = new Date(ev.scheduledTime || t).getUTCMinutes();
    globalThis.fetch = (...a) => { if (++n > BUDGET) return Promise.reject(new Error('subrequest budget')); return of(...a); };
    useHelius(env.HELIUS_KEY, 110);
    try { if (minute === 7) await trackerScan(env, log); else if (minute === 37) await trackerRecheck(env, log); else if (minute % 3 === 2) await exits(env, log); else await fresh(env, minute, log); } catch (e) { log.push('err ' + (e?.message || e)); } finally { globalThis.fetch = of; }
    console.log(`warmer m${minute}: ${log.join(' | ')} | subreq=${n} writesToday~${await writesToday(env.MEMECHECK_CACHE)} ms=${Date.now() - t}`);
  },
};
