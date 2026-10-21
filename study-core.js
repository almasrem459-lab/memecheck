// MemeCheckShield accuracy study: aggregation shared by /api/study (Pages Function), the /rugs + /accuracy pages and the
// offline backfill script. Input = tracker records; nothing here invents outcomes — a record without data is "nodata".
// record: { ca, sym, scanned: ISO, level: low|medium|high|extreme, pts, pump?, o24: {st, ch}, o48: {st, ch} }
//   st: 'rug'    = actual rug: liquidity pulled (pair gone / liquidity -90% vs scan), or a sudden cliff (>= 80% price drop
//                  inside 30 min) and still >= 80% down at the horizon
//       'dead'   = died without a single cliff: >= 90% down at the horizon, or no trades in the last 6 h while >= 50% down
//       'down70' = >= 70% down, still trading      'alive' = everything else      'nodata' / 'pending'
export const BAD = new Set(['rug', 'dead']);
const LVS = ['low', 'medium', 'high'];
const lvOf = (l) => (l === 'extreme' ? 'high' : l);
export function wilson(k, n, z = 1.96) {
  if (!n) return null; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [+(100 * (c - m) / d).toFixed(1), +(100 * (c + m) / d).toFixed(1)];
}
const pct = (k, n) => (n ? +(100 * k / n).toFixed(1) : null);
// Copycat launches reuse a ticker (e.g. four $NODF mints in 10 minutes). Unique by mint always; "by ticker" keeps the first
// scanned mint per ticker so one meme cannot dominate the sample.
export function dedupe(recs, byTicker = true) {
  const seen = new Set(), seenT = new Set(), out = [];
  for (const r of [...recs].sort((a, b) => a.scanned < b.scanned ? -1 : 1)) {
    if (seen.has(r.ca)) continue; seen.add(r.ca);
    const t = String(r.sym || '').replace(/^\$+/, '').trim().toLowerCase();
    if (byTicker && t && seenT.has(t)) continue; seenT.add(t); out.push(r);
  }
  return out;
}
function table(recs, h) {
  const k = 'o' + h, done = recs.filter(r => r[k] && !['pending', 'nodata'].includes(r[k].st));
  const row = (sel) => { const xs = done.filter(sel), n = xs.length, c = (s) => xs.filter(r => r[k].st === s).length;
    const rug = c('rug'), dead = c('dead'), down70 = c('down70'), alive = c('alive');
    return { n, rug, dead, down70, alive, rug_pct: pct(rug, n), dead_pct: pct(dead, n), bad_pct: pct(rug + dead, n), down70_pct: pct(down70, n), alive_pct: pct(alive, n), bad_ci95: wilson(rug + dead, n) }; };
  const rows = Object.fromEntries(LVS.map(l => [l, row(r => lvOf(r.level) === l)]));
  return { h, n: done.length, pending: recs.filter(r => !r[k] || r[k].st === 'pending').length, nodata: recs.filter(r => r[k]?.st === 'nodata').length, byLevel: rows, base: row(() => true) };
}
// Precision / recall per risk level. Positive class = BAD (rug or dead). A level "flags" a coin when the coin is at that
// level or higher. For "No major red flags" (low) we also report how well it picks survivors (positive = not bad).
export function precisionRecall(recs, h) {
  const k = 'o' + h, done = recs.filter(r => r[k] && BAD.has(r[k].st) || (r[k] && ['down70', 'alive'].includes(r[k].st)));
  const rank = { low: 0, medium: 1, high: 2 }, bad = (r) => BAD.has(r[k].st);
  const out = {};
  for (const l of ['medium', 'high']) {
    const flagged = done.filter(r => rank[lvOf(r.level)] >= rank[l]), tp = flagged.filter(bad).length, P = done.filter(bad).length;
    out[l + '+'] = { flagged: flagged.length, tp, precision: pct(tp, flagged.length), recall: pct(tp, P), positives: P };
  }
  const lows = done.filter(r => lvOf(r.level) === 'low'), good = done.filter(r => !bad(r)).length, tpL = lows.filter(r => !bad(r)).length;
  out.low_survivor = { flagged: lows.length, tp: tpL, precision: pct(tpL, lows.length), recall: pct(tpL, good), positives: good };
  out.n = done.length; out.base_bad_pct = pct(done.filter(bad).length, done.length);
  return out;
}
export function daily(recs, h = 24) {
  const k = 'o' + h, days = {};
  for (const r of recs) { const d = r.scanned.slice(0, 10); (days[d] ||= []).push(r); }
  return Object.entries(days).sort().map(([day, xs]) => { const t = table(xs, h); return { day, scanned: xs.length, done: t.n, pending: t.pending, base_bad_pct: t.base.bad_pct, byLevel: Object.fromEntries(LVS.map(l => [l, { n: t.byLevel[l].n, bad_pct: t.byLevel[l].bad_pct, rug_pct: t.byLevel[l].rug_pct }])) }; });
}
export function summarize(all, { generated = new Date().toISOString(), source = '' } = {}) {
  const raw = dedupe(all, false), uniq = dedupe(all, true);
  const t24 = table(uniq, 24), t48 = table(uniq, 48), t24raw = table(raw, 24);
  const dates = uniq.map(r => r.scanned).sort();
  return {
    ok: true, brand: 'MemeCheckShield', generated, source,
    from: dates[0]?.slice(0, 10) || null, to: dates[dates.length - 1]?.slice(0, 10) || null,
    recorded_rows: all.length, unique_mints: raw.length, unique_tickers: uniq.length, duplicates_removed: raw.length - uniq.length,
    h24: t24, h48: t48, h24_all_mints: t24raw,
    pr24: precisionRecall(uniq, 24), pr48: precisionRecall(uniq, 48),
    daily: daily(uniq, 24),
    definitions: {
      rug: 'Actual rug: liquidity pulled (pair removed or liquidity down >= 90% from the scan), or a sudden cliff (>= 80% price drop within 30 minutes) and still >= 80% down at the horizon.',
      dead: 'Dead: >= 90% down at the horizon without a single cliff, or no trades in the last 6 h while >= 50% down.',
      down70: 'Down >= 70% but still trading.', alive: 'Everything else.',
      dedupe: 'Unique mints, then first-scanned mint per ticker (copycat launches with the same ticker count once).',
      precision_recall: 'Positive = rug or dead. "high+" flags High/Extreme, "medium+" flags Medium or higher. low_survivor treats "No major red flags" as a prediction of survival.',
    },
  };
}
// Small payload for the result page probability line.
export function brief(s) {
  const b = (l) => { const x = s.h24.byLevel[l]; return { n: x.n, bad_pct: x.bad_pct, rug_pct: x.rug_pct, dead_pct: x.dead_pct }; };
  return { ok: true, generated: s.generated, from: s.from, to: s.to, n: s.h24.n, base: { bad_pct: s.h24.base.bad_pct, rug_pct: s.h24.base.rug_pct }, byLevel: { low: b('low'), medium: b('medium'), high: b('high') } };
}
