// memecheck-smart: "Smart money" consensus for MemeCheck /smart.html. A separate Worker + one SQLite-backed Durable Object.
// It never writes the site's KV (it only READS cached MemeCheck core scans from MEMECHECK_CACHE) and needs no API key.
//
// Why this shape (Cloudflare free plan, measured from the edge):
//  * the account's 5 free cron triggers are all used by memecheck-warmer -> scheduling is a self-rescheduling DO alarm (every 2 min);
//  * 10 ms CPU and 50 subrequests per invocation -> every step below is its own alarm invocation;
//  * GeckoTerminal answers 429 and api.mainnet-beta 403 to Workers, and keyless RPCs refuse getTokenAccountsByOwner,
//    so instead of reading 100 wallets' full holdings (MBs each) we ask a much smaller question:
//    "does tracked wallet W hold hot coin M right now?" = does W's associated token account for M exist with a balance
//    (getMultipleAccounts, 100 accounts per call, publicnode).
// Steps per run: discover (Jupiter token lists) -> derive ATAs (<=30 pairs per call) -> probe balances -> verify new holders
// (wallet signed the tx that funded its ATA = a real buy, not an airdrop) -> build snapshot -> MemeCheck risk for 1 uncached coin.
// Read-only public data. The track record is SIMULATED (paper) and is not financial advice.
import { DurableObject } from 'cloudflare:workers';
import { WALLETS, WALLETS_AT } from './wallets.js';
import { ataOf, d58 } from './ata.js';
import { analyze } from '../../cf-dist/core.js';

const JUP = 'https://lite-api.jup.ag/tokens/v2';
const RPCS = ['https://solana-rpc.publicnode.com', 'https://solana.leorpc.com/?api_key=FREE'];
const UA = { 'user-agent': 'memecheck-smart/1.0 (+https://memecheck.pages.dev/smart.html)', accept: 'application/json' };
const CORE_LV = 4;                                   // = functions/_lib/shared.js CORE_LV (older cached scans are ignored)
const MIN = 60e3, EVERY_MS = 2 * MIN;
const PROBE_W = 30, HOT = 30, WATCH_MAX = 14;        // 30 top-weighted wallets x 30 hot coins = 900 pairs
const DERIVE_PER = 30, DERIVE_STEPS = 6, GMA_PER_STEP = 3, VERIFY_PER_RUN = 6;
const VER = '2026-10-19c';
const KV_KEY = 'smart:v1', KV_EVERY = 5;
const NOT_MEME = /securities|xstock|tokenized|\bindex\b|\bstock\b|\betf\b|wrapped|bridged|staked|wormhole|\(portal\)/i;
const PICK_SCORE = 2.5, PICK_MAX_H = 6, FRICTION = 0.02, NEW_MIN = 60;
const SKIP = new Set(['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN']);
// probed wallets: the top-weighted non-scalpers from the paper bot's wallet-quality model
const PW = WALLETS.map((w, i) => ({ ...w, i })).filter(w => w.w > 0).sort((a, b) => b.w - a.w).slice(0, PROBE_W);
const PWB = PW.map(w => d58(w.a));
const r2 = (x, d = 1) => x == null || !isFinite(x) ? null : +(+x).toFixed(d);

async function getJ(u, init = {}, ms = 9000) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(u, { ...init, headers: { ...UA, ...(init.headers || {}) }, signal: ctl.signal }); if (!r.ok) throw new Error(new URL(u).hostname.split('.').slice(-2, -1)[0] + ' ' + r.status); return await r.json(); }
  finally { clearTimeout(tm); }
}
async function rpc(method, params) {
  let last;
  for (const u of RPCS) {
    try { const j = await getJ(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      if (j.error) throw new Error('rpc ' + (j.error.code || '') + ' ' + String(j.error.message || '').slice(0, 40)); return j.result; }
    catch (e) { last = e; }
  }
  throw last;
}
function u64(b64) { const s = atob(b64); let n = 0n; for (let i = 7; i >= 0; i--) n = (n << 8n) | BigInt(s.charCodeAt(i)); return n; }
const BAD_TAGS = new Set(['stocks', 'rwa', 'lst', 'stablecoin', 'xstocks']);
// meme heuristic: launchpad coin, or a young token (< 60 days) that is not a stock / RWA / LST / stable / wrapped major
function isMeme(t) {
  if ((t.tags || []).some(x => BAD_TAGS.has(x)) || NOT_MEME.test(`${t.name || ''} ${t.symbol || ''}`)) return false;
  if (t.launchpad) return true;
  const c = Date.parse(t.firstPool?.createdAt || t.createdAt || ''); return c > 0 && Date.now() - c < 60 * 86400e3;
}
const jupRow = (t) => ({ meme: isMeme(t), sym: (t.symbol || '').slice(0, 20), name: (t.name || '').slice(0, 40), icon: t.icon || null, prog: t.tokenProgram, price: t.usdPrice ?? null, mcap: t.mcap ?? t.fdv ?? null,
  liq: t.liquidity ?? null, lp: t.launchpad || null, holders: t.holderCount ?? null, buys5: t.stats5m?.numBuys ?? 0, traders5: t.stats5m?.numTraders ?? 0, ch5: t.stats5m?.priceChange ?? null });

export class SmartDO extends DurableObject {
  async get(k, d) { return (await this.ctx.storage.get(k)) ?? d; }
  async stat(k, n = 1) { const s = await this.get('stats', { since: Date.now() }); s[k] = (s[k] || 0) + n; await this.ctx.storage.put('stats', s); }

  // 1) which coins to probe: coins tracked wallets hold (watch) + what is trending on Jupiter right now
  async discover(run) {
    const now = Date.now(), log = [], meta = await this.get('meta', {}), hold = await this.get('hold', {});
    if (run % 30 === 0) await this.ctx.storage.delete(['trades', 'pools']);
    if (!(await this.get('mig2', 0))) { for (const v of Object.values(hold)) v.pre = true; await this.ctx.storage.put({ hold, mig2: 1 }); }   // one-off: earlier builds mislabeled partly-derived pairs as new buys           // leftovers of the first (GeckoTerminal) design
    const lists = [['toptrending/5m?limit=100', 'toporganicscore/5m?limit=100'], ['toptraded/5m?limit=100', 'toptrending/1h?limit=100'], ['toporganicscore/1h?limit=100', 'recent?limit=60']][run % 3];
    await Promise.all(lists.map(async (l) => {
      try {
        const a = await getJ(`${JUP}/${l}`); let n = 0;
        for (const t of Array.isArray(a) ? a : []) {
          if (!t.id || SKIP.has(t.id) || !t.tokenProgram) continue;
          const mc = t.mcap ?? t.fdv ?? 0; if (mc < 4000 || mc > 30e6) continue;
          if (!isMeme(t)) continue;                                                       // stocks, RWAs, wrapped majors, old tokens are not meme coins
          const isNew = l.startsWith('recent');
          if (isNew && (t.stats5m?.numBuys || 0) < 15) continue;          // brand-new launch with no traction yet: noise
          meta[t.id] = { ...(meta[t.id] || {}), ...jupRow(t), at: now, hotUntil: now + 12 * MIN, rank: (t.stats5m?.numTraders || 0) + (t.stats5m?.numBuys || 0) / 4 }; n++;
        }
        log.push(l.split('?')[0] + ':' + n);
      } catch (e) { log.push(l.split('?')[0] + ' ' + e.message); }
    }));
    const holders = {}; for (const [k, v] of Object.entries(hold)) { const m = k.slice(k.indexOf(':') + 1); if (v.a > 0 || (v.gone && now - v.gone < 2 * 3600e3)) holders[m] = (holders[m] || 0) + 1; }
    const watch = Object.keys(holders).filter(m => meta[m]).sort((a, b) => holders[b] - holders[a]).slice(0, WATCH_MAX);
    const disc = Object.keys(meta).filter(m => !holders[m] && meta[m].hotUntil > now).sort((a, b) => (meta[b].rank || 0) - (meta[a].rank || 0));
    const hot = [...watch, ...disc].slice(0, HOT);
    for (const m of Object.keys(meta)) if (now - (meta[m].at || 0) > 60 * MIN && !holders[m]) delete meta[m];   // keeps meta/ata small (CPU per step)
    await this.ctx.storage.put('meta', meta);
    log.push(`hot ${hot.length} (watch ${watch.length})`);
    return { hot, log };
  }

  // 2) derive the associated token accounts for (wallet, coin) pairs we have not derived yet (CPU-bounded batch)
  async derive(hot) {
    const meta = await this.get('meta', {}), ata = await this.get('ata', {}); let n = 0;
    outer: for (const m of hot) {
      const prog = meta[m]?.prog; if (!prog) continue;
      const row = ata[m] || (ata[m] = []); let mb = null, pb = null;
      for (let s = 0; s < PW.length; s++) {
        if (row[s] !== undefined && row[s] !== null) continue;
        mb ||= d58(m); pb ||= d58(prog);
        row[s] = ataOf(PWB[s], pb, mb); if (++n >= DERIVE_PER) break outer;
      }
    }
    for (const m of Object.keys(ata)) if (!meta[m]) delete ata[m];
    await this.ctx.storage.put('ata', ata);
    const left = hot.reduce((s, m) => s + (meta[m]?.prog ? PW.length - (ata[m] || []).filter(x => x !== undefined && x !== null).length : 0), 0);
    return { n, left };
  }

  // 3) balances: getMultipleAccounts on the ATAs (amount = u64 at offset 64 for SPL and Token-2022)
  async probe(hot, from) {
    const now = Date.now(), meta = await this.get('meta', {}), ata = await this.get('ata', {}), hold = await this.get('hold', {});
    const q = [];
    for (const m of hot) { const row = ata[m]; if (!row) continue; for (let s = 0; s < PW.length; s++) { const v = row[s]; if (!v) continue; for (const a of (typeof v === 'string' ? [v] : v)) q.push([m, s, a]); } }
    const end = Math.min(q.length, from + GMA_PER_STEP * 100); let calls = 0, errs = 0, ev = 0, stop = end;
    const seen = new Map(); // `${s}:${m}` -> amount (bigint) | 0n
    for (let i = from; i < end; i += 100) {
      const chunk = q.slice(i, Math.min(i + 100, end));
      try {
        const r = await rpc('getMultipleAccounts', [chunk.map(c => c[2]), { encoding: 'base64', dataSlice: { offset: 64, length: 8 }, commitment: 'confirmed' }]); calls++;
        (r?.value || []).forEach((acc, j) => {
          const [m, s, a] = chunk[j], k = s + ':' + m;
          if (acc) { if (typeof ata[m][s] !== 'string') ata[m][s] = a; seen.set(k, u64(acc.data[0])); } else if (!seen.has(k)) seen.set(k, 0n);
        });
      } catch (e) { errs++; stop = i; this.lastErr = String(e?.message || e).slice(0, 60); break; }
    }
    for (const [k, amt] of seen) {
      const [s, m] = [+k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)], w = PW[s], hk = w.i + ':' + m, prev = hold[hk];
      const a = Number(amt), price = meta[m]?.price ?? null, pz = (meta[m] ||= {}).pz || '', first = pz[s] !== '1';
      if (first) meta[m].pz = (pz.padEnd(PW.length, '0')).slice(0, s) + '1' + pz.padEnd(PW.length, '0').slice(s + 1);
      if (a > 0) {
        if (!prev || !(prev.a > 0)) { hold[hk] = { a, t0: now, p0: price, pre: first, last: now, v: prev?.v ?? null }; ev++; }
        else { prev.last = now; if (a > prev.a * 1.25) prev.add = now; if (a < prev.a * 0.5) prev.trim = now; prev.a = a; }
      } else if (prev && prev.a > 0) { prev.a = 0; prev.gone = now; ev++; }
    }
    if (end >= q.length) for (const m of hot) if (meta[m]) meta[m].probed = meta[m].probed || now;
    for (const [k, v] of Object.entries(hold)) if (!(v.a > 0) && now - (v.gone || v.t0) > 8 * 3600e3) delete hold[k];
    await this.ctx.storage.put({ ata, hold, meta });
    if (errs) await this.stat('rpcErr', errs); if (calls) await this.stat('rpcOk', calls);
    return { next: stop, total: q.length, calls, errs, ev, err: this.lastErr };
  }

  // 4) a holder only counts once we saw the wallet itself sign the tx that funded its token account (airdrop spam filter)
  async verify() {
    const now = Date.now(), hold = await this.get('hold', {}), ata = await this.get('ata', {}); let n = 0, ok = 0, bad = 0;
    const by = {}; for (const [k, v] of Object.entries(hold)) if (v.a > 0) { const m = k.slice(k.indexOf(':') + 1); (by[m] ||= []).push(k); }
    const todo = Object.entries(by).filter(([, ks]) => ks.length >= 2).flatMap(([m, ks]) => ks.filter(k => hold[k].v == null && !hold[k].pre && now - hold[k].t0 < 3 * 3600e3).map(k => [k, m])).slice(0, VERIFY_PER_RUN);
    for (const [k, m] of todo) {
      const wi = +k.slice(0, k.indexOf(':')), s = PW.findIndex(w => w.i === wi), a = ata[m]?.[s]; if (typeof a !== 'string') { hold[k].v = 'na'; continue; }
      try {
        const sigs = await rpc('getSignaturesForAddress', [a, { limit: 6 }]); n++;
        let found = null;
        for (const sg of (sigs || []).filter(x => !x.err).slice(0, 2)) {
          const tx = await rpc('getTransaction', [sg.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1, commitment: 'confirmed' }]); n++;
          const keys = tx?.transaction?.message?.accountKeys || [], me = WALLETS[wi].a;
          const signer = keys.some(x => x.pubkey === me && x.signer);
          const bal = (l) => (l || []).filter(x => x.owner === me && x.mint === m).reduce((s2, x) => s2 + (+x.uiTokenAmount?.uiAmount || 0), 0);
          const inc = bal(tx?.meta?.postTokenBalances) - bal(tx?.meta?.preTokenBalances);
          if (inc > 0) { found = signer; if (signer) { hold[k].bt = (tx.blockTime || 0) * 1000; } break; }
        }
        hold[k].v = found === true ? 1 : found === false ? 0 : 'na'; found === true ? ok++ : found === false ? bad++ : 0;
      } catch { break; }
    }
    await this.ctx.storage.put('hold', hold);
    return `verify ${todo.length}: real ${ok} airdrop ${bad} rpc ${n}`;
  }

  // 5) snapshot: weighted consensus + prices + cached MemeCheck risk + simulated track record
  async build(run, job) {
    const now = Date.now(), log = job.log || [], meta = await this.get('meta', {}), hold = await this.get('hold', {});
    let picks = await this.get('picks', []); const risk = await this.get('risk', {});
    const per = {};
    for (const [k, v] of Object.entries(hold)) { const wi = +k.slice(0, k.indexOf(':')), m = k.slice(k.indexOf(':') + 1); (per[m] ||= []).push({ wi, ...v }); }
    // refresh prices of held coins that fell out of the Jupiter lists (1 call, <=50 mints)
    const stale = Object.keys(per).filter(m => meta[m] && now - (meta[m].at || 0) > 3 * MIN).concat(picks.filter(p => !p.closed && !per[p.mint]).map(p => p.mint)).slice(0, 50);
    if (stale.length) { try { const a = await getJ(`${JUP}/search?query=${stale.join(',')}`); for (const t of Array.isArray(a) ? a : []) if (t.id) meta[t.id] = { ...(meta[t.id] || {}), ...jupRow(t), at: now }; } catch (e) { log.push('jup search ' + e.message); } }
    const rows = [];
    for (const [m, hs] of Object.entries(per)) {
      const live = hs.filter(h => h.a > 0 && h.v !== 0);                      // v === 0: proven airdrop, ignored
      if (!live.length || !meta[m] || meta[m].meme === false) continue;
      if (live.filter(h => !h.pre && now - h.t0 < 5 * MIN).length >= 8) continue;   // 8+ "buys" in one probe = airdrop campaign
      // "buying now" = wallets we SAW buy (not already holding when tracking started) within the last 24 h.
      const held = live.filter(h => h.pre && WALLETS[h.wi].w > 0);
      if (held.length >= 8) continue;                                          // held by 8+ tracked wallets before tracking = airdrop/index token
      const q = live.filter(h => WALLETS[h.wi].w > 0 && !h.pre && now - h.t0 < 24 * 3600e3);
      if (!q.length) continue;
      const score = r2(q.reduce((s, h) => s + WALLETS[h.wi].w, 0), 2);
      const fresh = q.filter(h => now - h.t0 < NEW_MIN * MIN);
      const first = [...q].sort((a, b) => (a.bt || a.t0) - (b.bt || b.t0))[0];
      const sold = hs.filter(h => !(h.a > 0) && h.gone && now - h.gone < 2 * 3600e3 && h.v !== 0 && !h.pre);
      rows.push({ m, n: q.length, score, fresh: fresh.length, first, live: q, held: held.length, sold });
    }
    rows.sort((a, b) => b.n - a.n || b.score - a.score || b.fresh - a.fresh);
    const show = rows.slice(0, 24);
    // MemeCheck risk: the site's own cached core scan (KV read only), else our analyze() result kept in this DO
    const KV = this.env.MEMECHECK_CACHE, rank = show.slice(0, 12);
    if (KV) await Promise.all(rank.filter(r => !risk[r.m] || now - risk[r.m].at > 10 * MIN).slice(0, 8).map(async (r) => {
      try { const v = await KV.get('core:solana:' + r.m); if (!v) return; const j = JSON.parse(v); if (j.lv !== CORE_LV) return;
        risk[r.m] = { lv: j.data?.verdict?.level || null, pts: j.data?.verdict?.points ?? null, at: now, scannedAt: j.at, src: 'memecheck-cache' }; } catch {}
    }));
    const todo = rank.filter(r => r.n >= 1 && (!risk[r.m] || (risk[r.m].src !== 'memecheck-cache' && now - risk[r.m].at > 30 * MIN))).map(r => r.m).slice(0, 1);
    for (const k of Object.keys(risk)) if (now - risk[k].at > 6 * 3600e3) delete risk[k];
    // SIMULATED track record. pick = >= 2 weighted wallets hold, score >= PICK_SCORE, at least one bought in the last hour.
    // Paper entry = Jupiter price when we saw it (+2%); exit when more than half of those wallets (by weight) no longer hold, or 6 h (-2%).
    for (const r of rows) {
      if (r.n < 2 || r.score < PICK_SCORE || !r.fresh || picks.some(p => p.mint === r.m && now - p.at < 24 * 3600e3)) continue;
      const mt = meta[r.m]; if (!(mt?.price > 0)) continue;
      picks.unshift({ mint: r.m, sym: mt.sym, at: now, p0: mt.price, mc0: mt.mcap, score: r.score, n: r.n, ws: r.live.filter(h => WALLETS[h.wi].w > 0).map(h => h.wi), last: mt.price, max: mt.price, min: mt.price, lastAt: now, closed: false });
    }
    for (const p of picks) {
      if (p.closed) continue; const mt = meta[p.mint];
      if (mt?.price > 0 && now - (mt.at || 0) < 10 * MIN) { p.last = mt.price; p.lastMc = mt.mcap; p.max = Math.max(p.max, mt.price); p.min = Math.min(p.min, mt.price); p.lastAt = now; }
      let tot = 0, gone = 0; for (const wi of p.ws) { tot += WALLETS[wi].w; const h = hold[wi + ':' + p.mint]; if (!h || !(h.a > 0)) gone += WALLETS[wi].w; }
      const why = tot && gone / tot > 0.5 ? 'wallets_sold' : now - p.at > PICK_MAX_H * 3600e3 ? 'time_' + PICK_MAX_H + 'h' : now - p.lastAt > 45 * MIN ? 'no_price' : null;
      if (why) Object.assign(p, { closed: true, exitAt: now, exitP: p.last, why, pnl: r2((p.last * (1 - FRICTION) / (p.p0 * (1 + FRICTION)) - 1) * 100) });
    }
    picks = picks.filter(p => now - p.at < 7 * 86400e3).slice(0, 60);
    const done = picks.filter(p => p.closed), wins = done.filter(p => p.pnl > 0).length, srt = done.map(p => p.pnl).sort((a, b) => a - b);
    const record = { n: done.length, open: picks.length - done.length, wins, winRate: done.length ? r2(wins / done.length * 100, 0) : null, avg: done.length ? r2(done.reduce((s, p) => s + p.pnl, 0) / done.length) : null,
      median: srt.length ? srt[srt.length >> 1] : null, usd20: r2(done.reduce((s, p) => s + p.pnl / 100 * 20, 0), 2), size: 20, friction: FRICTION * 100, maxH: PICK_MAX_H, minScore: PICK_SCORE };
    const wl = (h) => ({ n: WALLETS[h.wi].n, w: WALLETS[h.wi].w, h: WALLETS[h.wi].h, t: h.bt || h.t0, pre: h.pre || undefined, v: h.v === 1 ? 1 : undefined });
    const list = show.map(r => { const mt = meta[r.m], f = r.first; const p0 = f?.p0;
      return { mint: r.m, sym: mt.sym, name: mt.name, img: mt.icon, mc: mt.mcap, liq: mt.liq, price: mt.price, lp: mt.lp, n: r.n, score: r.score, fresh: r.fresh, held: r.held,
        firstAt: f ? (f.bt || f.t0) : null, firstPre: f?.pre || undefined, firstBy: f ? WALLETS[f.wi].n : null, chg: p0 > 0 && mt.price ? r2((mt.price / p0 - 1) * 100) : null,
        wallets: r.live.sort((a, b) => WALLETS[b.wi].w - WALLETS[a.wi].w).slice(0, 12).map(wl), sold: r.sold.slice(0, 6).map(h => ({ n: WALLETS[h.wi].n, t: h.gone })), risk: risk[r.m] || null }; });
    const st = await this.get('stats', {}), runs = await this.get('runs', { n: 0 });
    const snap = { ok: true, v: 2, at: now, run, list,
      picks: picks.slice(0, 25).map(p => ({ mint: p.mint, sym: p.sym, at: p.at, p0: p.p0, mc0: p.mc0, score: p.score, n: p.n, wallets: p.ws.map(i => WALLETS[i].n), last: p.last, max: p.max,
        closed: p.closed, exitAt: p.exitAt || null, why: p.why || null, pnl: p.closed ? p.pnl : r2((p.last * (1 - FRICTION) / (p.p0 * (1 + FRICTION)) - 1) * 100), maxPct: r2((p.max / p.p0 - 1) * 100) })),
      record, model: { tracked: WALLETS.length, probed: PW.length, scalpers: WALLETS.filter(w => w.s).length, at: WALLETS_AT, hot: HOT },
      coverage: { hot: (job.hot || []).length, pairs: job.pairs || null, ms: now - (job.t0 || now), runs: runs.n, log: log.slice(-12), rpc: { ok: st.rpcOk || 0, err: st.rpcErr || 0 } } };
    await this.ctx.storage.put({ picks, risk, snap, meta });
    // publish to KV for the Pages Function: every KV_EVERY runs (~10 min) => ~144 writes/day, well under the 1000/day free cap
    if (this.env.MEMECHECK_CACHE && run % KV_EVERY === 0) { try { await this.env.MEMECHECK_CACHE.put(KV_KEY, JSON.stringify({ ...snap, kvAt: now }), { expirationTtl: 6 * 3600 }); log.push('kv write'); } catch (e) { log.push('kv ' + e.message); } }
    return todo;
  }

  async riskOne(mint) {
    const risk = await this.get('risk', {}), now = Date.now();
    try { const r = await analyze(mint, 'solana');
      risk[mint] = r.sources?.DexScreener === 'ok' ? { lv: r.verdict?.level || null, pts: r.verdict?.points ?? null, at: now, src: 'memecheck-worker', partial: !!r.partial } : { lv: null, at: now, src: 'failed' };
    } catch { risk[mint] = { lv: null, at: now, src: 'failed' }; }
    await this.ctx.storage.put('risk', risk); return risk[mint].lv;
  }

  // ---- scheduler: self-rescheduling alarm chain, one step per invocation ----
  async ensure() { const a = await this.ctx.storage.getAlarm(); if (!a || a < Date.now() - 300e3) await this.ctx.storage.setAlarm(Date.now() + 1000); return a; }
  async alarm() {
    const now = Date.now(); await this.ctx.storage.setAlarm(now + EVERY_MS);         // safety net first: the loop never dies
    let job = await this.get('job', null), next = 1200;
    try {
      if (!job || job.step === 'idle') { const run = Math.floor(now / EVERY_MS), { hot, log } = await this.discover(run); job = { step: 'derive', run, t0: now, hot, log, d: 0 }; }
      else if (job.step === 'derive') { const r = await this.derive(job.hot); job.d++; if (!r.left || job.d >= DERIVE_STEPS || !r.n) { job.step = 'probe'; job.pi = 0; job.log.push(`derive steps ${job.d} left ${r.left}`); } }
      else if (job.step === 'probe') { const r = await this.probe(job.hot, job.pi); job.pi = r.next; job.pairs = r.total; job.ev = (job.ev || 0) + r.ev;
        if (r.errs) { job.pe = (job.pe || 0) + 1; next = 5000; if (r.err) job.perr = r.err; }                // rate-limited: back off and resume where we stopped
        if (r.next >= r.total || job.pe >= 4) { job.step = 'verify'; job.log.push(`probe ${Math.min(job.pi, r.total)}/${r.total} accts ev ${job.ev}${job.pe ? ' rpc-retries ' + job.pe + ' (' + (job.perr || '') + ')' : ''}`); } }
      else if (job.step === 'verify') { job.log.push(await this.verify()); job.step = 'build'; }
      else if (job.step === 'build') { job.todo = await this.build(job.run, job); job.step = job.todo.length ? 'risk' : 'done'; }
      else if (job.step === 'risk') { await this.riskOne(job.todo.shift()).catch(() => null); if (!job.todo.length) job.step = 'done'; }
      else job = { step: 'idle' };                                                    // unknown/old step name: start over
      if (job.step === 'done') {
        const st = await this.get('runs', { n: 0, ms: [] }); st.n++; st.last = Date.now(); st.ms = [...(st.ms || []), Date.now() - job.t0].slice(-20); await this.ctx.storage.put('runs', st);
        job = { step: 'idle' }; next = (Math.floor(Date.now() / EVERY_MS) + 1) * EVERY_MS + 3000 - Date.now();
      }
    } catch (e) { job = { step: 'idle', err: String(e?.message || e).slice(0, 160), at: now }; next = EVERY_MS; }
    await this.ctx.storage.put('job', job);
    await this.ctx.storage.setAlarm(Date.now() + Math.max(500, next));
  }
  async status() { const [job, runs, stats, alarm] = await Promise.all([this.get('job', null), this.get('runs', null), this.get('stats', null), this.ctx.storage.getAlarm()]);
    const hold = await this.get('hold', {}), hv = Object.values(hold);
    return { ver: VER, holds: { live: hv.filter(v => v.a > 0).length, pre: hv.filter(v => v.a > 0 && v.pre).length }, mig2: await this.get('mig2', 0), job: job && { step: job.step, run: job.run, hot: job.hot?.length, pairs: job.pairs, err: job.err, log: job.log }, runs, stats, nextAlarm: alarm }; }
  async snapshot() { return (await this.ctx.storage.get('snap')) || { ok: false, error: 'warming up' }; }
}

let memo = null;  // per-isolate 20 s copy of the snapshot
export default {
  async scheduled(ev, env, ctx) { ctx.waitUntil(env.SMART.get(env.SMART.idFromName('main')).ensure()); },   // only if a cron is ever attached
  async fetch(req, env) {
    const u = new URL(req.url), stub = env.SMART.get(env.SMART.idFromName('main'));
    const hdr = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=30' };
    if (req.method !== 'GET') return new Response('GET only', { status: 405 });
    if (u.pathname === '/smart.json') {
      if (!memo || Date.now() - memo.t > 20e3) { memo = { t: Date.now(), kick: memo?.kick || 0, body: JSON.stringify(await stub.snapshot()) }; if (Date.now() - memo.kick > 600e3) { memo.kick = Date.now(); await stub.ensure(); } }
      return new Response(memo.body, { headers: hdr });
    }
    if (u.pathname === '/status') { await stub.ensure(); return new Response(JSON.stringify(await stub.status()), { headers: { ...hdr, 'cache-control': 'no-store' } }); }
    return new Response('memecheck-smart: GET /smart.json', { status: 404, headers: { 'content-type': 'text/plain' } });
  },
};
