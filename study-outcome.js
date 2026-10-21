// Classify a coin's outcome H hours after a scan from GeckoTerminal OHLCV candles ([ts, o, h, l, c, v], any order).
// Used by the tracker Worker and the backfill script. See study-core.js for the definitions.
// liq (optional): { liq0, liqNow, gone } measured by the tracker at recheck time (DexScreener). Liquidity pulled (pair gone or
// liquidity down >= 90% from the scan) is an actual rug even when no swap shows it in the price candles.
export function outcome(candles, scanTs, h, nowTs = Date.now() / 1000, liq = null) {
  const end = scanTs + h * 3600;
  if (nowTs < end) return { st: 'pending' };
  const pulled = !!liq && (liq.gone || (liq.liq0 > 0 && liq.liqNow != null && liq.liqNow <= liq.liq0 * 0.1));
  const cs = (candles || []).filter(c => c && +c[4] > 0).map(c => c.map(Number)).sort((a, b) => a[0] - b[0]);
  const before = cs.filter(c => c[0] <= scanTs), win = cs.filter(c => c[0] > scanTs - 900 && c[0] <= end);
  const ref = before.length ? before[before.length - 1] : win[0];
  if (!ref || (ref[0] < scanTs - 6 * 3600 && !win.length)) return pulled ? { st: 'rug', pull: 1 } : { st: 'nodata' };
  const p0 = ref[4];
  const upto = cs.filter(c => c[0] <= end), last = upto[upto.length - 1];
  const pH = last[4], ch = +(100 * (pH / p0 - 1)).toFixed(1), quiet = (end - last[0]) > 6 * 3600;
  // cliff: >= 80% from a 30-minute rolling high to a low (15-min candles: the candle itself or the next one)
  let cliff = false;
  for (let i = 0; i < win.length && !cliff; i++) {
    const hi = Math.max(win[i][2], win[i][1]);
    for (let j = i; j < win.length && win[j][0] - win[i][0] <= 1800; j++) if (win[j][3] <= hi * 0.2) { cliff = true; break; }
  }
  if (cliff && ch <= -80) return { st: 'rug', ch };
  if (pulled) return { st: 'rug', ch, pull: 1 };
  if (ch <= -90 || (quiet && ch <= -50)) return { st: 'dead', ch, ...(quiet ? { quiet: 1 } : {}) };
  if (ch <= -70) return { st: 'down70', ch };
  return { st: 'alive', ch };
}
