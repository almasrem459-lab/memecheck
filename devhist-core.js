// Developer-history classification shared by the Pages Function (/api/dev) and the browser (devhist-ui.js).
// The browser re-runs it when DexScreener rate-limits the Cloudflare edge (the API is CORS-open, so visitors can fetch it directly).
// Status per previous coin (age = since its pump.fun creation):
//   new    < 6 h old (not judged)
//   live   DexScreener market cap >= $10K with liquidity/volume (or a pump.fun curve)
//   rugged reached >= $50K (pump.fun ATH) and is now < 10% of it, or has no market left
//   dead   no DexScreener market, or market cap < $10K
// flag: fail = >= 3 dead/rugged that are at least half of the judged (> 6 h old) coins, or a serial launcher (>= 10 coins) with < 10% alive;
//       warn = 2+ dead/rugged; pass otherwise (one dead test coin is common); none = could not judge.
export const LIVE_MCAP = 10000, PUMPED_ATH = 50000, MAX_DS = 150;
export function bestPairs(arr, out = new Map()) { // DexScreener pairs -> mint -> { mcap, liq, vol24, dex }
  for (const p of Array.isArray(arr) ? arr : []) {
    const a = p?.baseToken?.address; if (!a || p.chainId !== 'solana') continue;
    const m = { mcap: +(p.marketCap ?? p.fdv) || 0, liq: +p.liquidity?.usd || 0, vol24: +p.volume?.h24 || 0, dex: p.dexId };
    const o = out.get(a); if (!o || m.liq > o.liq || (m.liq === o.liq && m.mcap > o.mcap)) out.set(a, m);
  }
  return out;
}
export function classify(c, m, now) {
  if (c.created && now - c.created < 6 * 36e5) return 'new';
  const ath = c.ath || 0;
  if (m && m.mcap >= LIVE_MCAP && (m.liq >= 1000 || m.vol24 >= 1000 || /pump/i.test(m.dex || ''))) return ath >= PUMPED_ATH && m.mcap < ath * 0.1 ? 'rugged' : 'live';
  return ath >= PUMPED_ATH ? 'rugged' : 'dead';
}
// judged: newest-first previous coins [{mint,symbol,name,created,ath,grad}]; map: bestPairs() result or null when DexScreener failed
export function summarize(judged, total, map, now = Date.now()) {
  const cnt = { live: 0, dead: 0, rugged: 0, new: 0 };
  const list = judged.map(c => { const m = map?.get(c.mint); const st = map ? classify(c, m, now) : 'unknown'; if (cnt[st] != null) cnt[st]++;
    return { mint: c.mint, symbol: c.symbol, name: c.name, created: c.created, ath: c.ath ? Math.round(c.ath) : null, grad: !!c.grad, status: st, mcap: m?.mcap ? Math.round(m.mcap) : null }; });
  const checked = map ? judged.length : 0, bad = cnt.dead + cnt.rugged, old = checked - cnt.new;
  let flag = 'none';
  if (checked && ((bad >= 3 && bad >= old * 0.5) || (total >= 10 && old && cnt.live / old < 0.1))) flag = 'fail';
  else if (checked && bad >= 2) flag = 'warn';
  else if (checked || total === 0) flag = 'pass';
  return { checked, ...cnt, bad, serial: total >= 10, flag, recent: list.slice(0, 8) };
}
// DexScreener batch lookup (30 mints per call). fetchJson(url) -> parsed JSON or throws. Returns Map or null if every call failed.
export async function dexMarkets(mints, fetchJson) {
  if (!mints.length) return new Map();
  const map = new Map(), batches = []; for (let i = 0; i < mints.length; i += 30) batches.push(mints.slice(i, i + 30));
  let fails = 0;
  await Promise.all(batches.map(b => fetchJson(`https://api.dexscreener.com/tokens/v1/solana/${b.join(',')}`).then(a => bestPairs(a, map)).catch(() => { fails++; })));
  return fails === batches.length ? null : Object.assign(map, { partial: fails > 0 });
}
