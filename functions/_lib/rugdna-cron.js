// RugDNA cron jobs, run from the memecheck-warmer Worker (its own cron triggers => its own CPU / subrequest budget):
//   ingest  (every 5 min)  newest launches (Jupiter token index + GeckoTerminal new pools) -> D1, flag launches of known clusters
//   resolve (every 5 min)  first-funder resolution for pending creator wallets -> clusters -> "flagged before rug" ledger, daily snapshot
//   recheck (every 10 min) dead / live outcomes for launches >= 6 h old (DexScreener batches) -> cluster counters, flag outcomes
// Everything is bounded (<= ~15 subrequests, <= 25 new launches / 18 wallet resolutions per run) and paused when the D1 row-write budget is used.
import * as R from './rugdna.js';
const GT = 'https://api.geckoterminal.com/api/v2';
const J = async (u, h = {}) => { const r = await fetch(u, { headers: { accept: 'application/json;version=20230302', 'user-agent': 'memecheck-rugdna/1.0', ...h } }); if (!r.ok) throw new Error(u.split('/')[2] + ' ' + r.status); return r.json(); };
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const inList = (a) => a.map(() => '?').join(',');

async function flagFresh(db, items, log, now) { // items: [{ mint, creator, created_at, liq }]; only creators whose funder is already known
  if (!items.length) return 0;
  const cs = [...new Set(items.map(x => x.creator))], known = new Set();
  for (const g of chunk(cs, 50)) (await db.prepare(`SELECT addr FROM wallets WHERE addr IN (${inList(g)}) AND funder IS NOT NULL`).bind(...g).all()).results?.forEach(r => known.add(r.addr));
  let n = 0;
  for (const c of known) {
    const mine = items.filter(x => x.creator === c), v = await R.walletVerdict(db, c, mine[0].mint);
    if (v.status !== 'linked' || (v.level !== 'warn' && v.level !== 'fail')) continue;
    for (const x of mine) if (await R.flagLaunch(db, v, x.mint, x.created_at, x.liq, 'cron', now)) n++;
  }
  return n;
}

export async function rugdnaIngest(env, log) {
  const db = env.RUGDNA; if (!db) return log.push('rugdna: no D1');
  const now = Date.now();
  if ((await R.writesToday(db)) > R.WRITE_LIMIT) return log.push('rugdna ingest: write budget used');
  const map = new Map();
  try { for (const r of await R.jupRecent()) map.set(r.mint, r); log.push('jup ' + map.size); } catch (e) { log.push('jup err ' + String(e?.message || e).slice(0, 30)); }
  try { // extra coverage: newest GeckoTerminal pools -> Jupiter lookup (creator)
    const mints = [];
    for (const p of [1, 2]) { const j = await J(`${GT}/networks/solana/new_pools?page=${p}`).catch(() => null); for (const x of j?.data || []) { const m = x.relationships?.base_token?.data?.id?.replace(/^solana_/, ''); if (m && R.ADDR_RE.test(m) && !map.has(m)) mints.push(m); } }
    const miss = [...new Set(mints)].slice(0, 60);
    if (miss.length) { const got = await R.jupByMints(miss); for (const [k, v] of got) map.set(k, v); log.push(`gecko +${got.size}/${miss.length}`); }
  } catch (e) { log.push('gecko err ' + String(e?.message || e).slice(0, 30)); }
  const all = [...map.values()]; if (!all.length) return;
  const ex = new Set(); for (const g of chunk(all.map(x => x.mint), 50)) (await db.prepare(`SELECT mint FROM launches WHERE mint IN (${inList(g)})`).bind(...g).all()).results?.forEach(r => ex.add(r.mint));
  const fresh = all.filter(x => !ex.has(x.mint)).sort((a, b) => (b.devMints || 0) - (a.devMints || 0)).slice(0, 25);
  const r = await R.ingestLaunches(db, fresh, 'cron', 1, now);
  const flagged = await flagFresh(db, fresh.map(x => ({ mint: x.mint, creator: x.creator, created_at: x.created_at, liq: x.liq })), log, now);
  log.push(`rugdna ingest +${r.launches} launches +${r.wallets} wallets flagged=${flagged}`);
}

export async function rugdnaResolve(env, log) {
  const db = env.RUGDNA; if (!db) return log.push('rugdna: no D1');
  const now = Date.now();
  try { const s = await R.snapshotDaily(db, now); if (s) log.push('snapshot ' + s.day + ' clusters=' + s.clusters); } catch (e) { log.push('snapshot err ' + String(e?.message || e).slice(0, 40)); }
  if ((await R.writesToday(db)) > R.WRITE_LIMIT) return log.push('rugdna resolve: write budget used');
  const pend = await R.pendingWallets(db, 18); if (!pend.length) return log.push('rugdna resolve: none pending');
  Object.assign(R.DIAG, { sigNull: 0, txNull: 0, txNoInc: 0, txOk: 0, clsNull: 0, clsOk: 0, err: '' });
  const res = await R.resolveFunders(pend, env);
  const ok = [...res.values()].filter(x => x.funder).length, why = {}; for (const x of res.values()) if (!x.funder) why[x.fail] = (why[x.fail] || 0) + 1;
  const ap = await R.applyResolution(db, res, env, now);
  const clusters = []; for (const f of ap.funders) { const c = await R.recomputeCluster(db, f, now); if (c) clusters.push(c); }
  // flag fresh launches of the wallets we just resolved (<= 12 h old, not judged yet)
  const done = [...res].filter(([, x]) => x.funder).map(([w]) => w); let flagged = 0;
  if (done.length) {
    const rows = (await db.prepare(`SELECT mint, creator, created_at, peak_liq FROM launches WHERE creator IN (${inList(done)}) AND status='new' AND created_at > ?`).bind(...done, now - 12 * 36e5).all()).results || [];
    flagged = await flagFresh(db, rows.map(x => ({ mint: x.mint, creator: x.creator, created_at: x.created_at, liq: x.peak_liq })), log, now);
  }
  log.push(`rugdna resolve ${ok}/${pend.length} ok ${JSON.stringify(why)} clusters>=2: ${clusters.length} flagged=${flagged} diag=${JSON.stringify(R.DIAG)} rpc=${env.RPC_URL ? 'custom' : env.HELIUS_KEY ? 'helius' : 'public'}`);
}

export async function rugdnaRecheck(env, log) {
  const db = env.RUGDNA; if (!db) return log.push('rugdna: no D1');
  const now = Date.now();
  if ((await R.writesToday(db)) > R.WRITE_LIMIT) return log.push('rugdna recheck: write budget used');
  const r = await R.recheck(db, { now });
  for (const f of r.funders) await R.recomputeCluster(db, f, now);
  log.push(`rugdna recheck checked=${r.checked} dead=${r.dead} live=${r.live}${r.err ? ' err=' + r.err : ''} clustersTouched=${r.funders.length}`);
}
