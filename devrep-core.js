// Dev Reputation Score (M1 v1) — shared by /api/devrep, /api/dev (attached), and the browser.
 // Score 0–100 (higher = better reputation) + label Builder | Neutral | Serial Launcher | High Risk.
 // Built on the same dead/rugged rules as Developer history (devhist-core.js / phase 1).
 // Honest gaps (not scored in v1 — need paid RPC / indexing in M2):
 //   - funded-wallet launches (linked creators)
 //   - dev sell speed in first hour / first day (tx tracing)
 //   - linked-wallet supply distribution (holder cluster graph)
 //   - full LP lock/burn history (v1 may sample up to 2 RugCheck reports when present)
 // Backtest vs /rugs: not yet run; note published on /how.

export const LABELS = ['Builder', 'Neutral', 'Serial Launcher', 'High Risk'];
export const VERSION = 1;

function median(nums) {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const m = (a.length - 1) / 2;
  return (a[Math.floor(m)] + a[Math.ceil(m)]) / 2;
}

/** Median hours between consecutive launches (oldest → newest). Null if < 2 dated coins. */
export function launchCadenceHours(coins) {
  const ts = (coins || []).map(c => +c.created || 0).filter(t => t > 0).sort((a, b) => a - b);
  if (ts.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < ts.length; i++) gaps.push((ts[i] - ts[i - 1]) / 36e5);
  return median(gaps);
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

/**
 * @param {object} h  history summary (from summarize() + total/graduated/recent)
 * @param {object} [extra] optional soft signals: { lpSample?: { lockedPctAvg, n }, sellSpeed?: null }
 */
export function scoreDev(h, extra = {}) {
  const total = +h.total || 0;
  const checked = +h.checked || 0;
  const live = +h.live || 0;
  const dead = +h.dead || 0;
  const rugged = +h.rugged || 0;
  const bad = +h.bad || (dead + rugged);
  const neu = +h.new || 0;
  const old = Math.max(0, checked - neu);
  const graduated = +h.graduated || 0;
  const cadenceH = h.cadenceHours != null ? h.cadenceHours : launchCadenceHours(h.recent || h.coins || []);

  const evidence = [];
  let pts = 50; // start Neutral mid

  // --- Survival / dead-rugged ratio (largest weight) ---
  let survivalPts = 0;
  if (old >= 3) {
    const liveRate = live / old;
    const badRate = bad / old;
    survivalPts = liveRate * 38 - badRate * 28;
    evidence.push({
      id: 'survival',
      weight: 'high',
      live, bad, old, liveRate: Math.round(liveRate * 100), badRate: Math.round(badRate * 100),
      delta: Math.round(survivalPts),
    });
  } else if (old > 0) {
    const liveRate = live / old;
    const badRate = bad / old;
    survivalPts = liveRate * 18 - badRate * 16;
    evidence.push({
      id: 'survival_thin',
      weight: 'med',
      live, bad, old, liveRate: Math.round(liveRate * 100), badRate: Math.round(badRate * 100),
      delta: Math.round(survivalPts),
    });
  } else if (checked === 0 && total === 0) {
    evidence.push({ id: 'first_coin', weight: 'info', delta: 0 });
  } else {
    evidence.push({ id: 'too_new', weight: 'info', new: neu, total, delta: 0 });
  }
  pts += survivalPts;

  // --- Launch volume ---
  let volumePts = 0;
  if (total === 0) volumePts = 4;
  else if (total <= 2) volumePts = 10;
  else if (total <= 5) volumePts = 6;
  else if (total <= 9) volumePts = 0;
  else if (total <= 24) volumePts = -8;
  else if (total <= 49) volumePts = -16;
  else volumePts = -22;
  pts += volumePts;
  evidence.push({ id: 'launches', weight: 'med', total, delta: volumePts });

  // --- Cadence (rapid-fire) ---
  let cadencePts = 0;
  if (cadenceH != null) {
    if (cadenceH >= 168) cadencePts = 10;       // ≥ 7 days
    else if (cadenceH >= 48) cadencePts = 6;
    else if (cadenceH >= 24) cadencePts = 3;
    else if (cadenceH >= 6) cadencePts = 0;
    else if (cadenceH >= 1) cadencePts = -10;
    else cadencePts = -18;                      // < 1 h between launches
    evidence.push({ id: 'cadence', weight: 'med', medianHours: Math.round(cadenceH * 10) / 10, delta: cadencePts });
  } else {
    evidence.push({ id: 'cadence', weight: 'info', medianHours: null, delta: 0 });
  }
  pts += cadencePts;

  // --- Graduation (mild positive if some graduated and at least one still live) ---
  let gradPts = 0;
  if (total >= 1) {
    const gr = graduated / total;
    if (graduated >= 1 && live >= 1 && gr >= 0.2) gradPts = 10;
    else if (graduated >= 1 && live >= 1) gradPts = 6;
    else if (graduated >= 1) gradPts = 2;
    evidence.push({ id: 'graduated', weight: 'low', graduated, total, live, delta: gradPts });
  }
  pts += gradPts;

  // --- Soft: LP lock sample on prior launches (optional) ---
  let lpPts = 0;
  const lp = extra.lpSample;
  if (lp && lp.n > 0 && lp.lockedPctAvg != null) {
    if (lp.lockedPctAvg >= 90) lpPts = 6;
    else if (lp.lockedPctAvg >= 50) lpPts = 0;
    else lpPts = -8;
    evidence.push({ id: 'lp_sample', weight: 'low', n: lp.n, lockedPctAvg: Math.round(lp.lockedPctAvg), delta: lpPts });
    pts += lpPts;
  } else {
    evidence.push({ id: 'lp_sample', weight: 'gap', note: 'not_scored_v1', delta: 0 });
  }

  // Gaps explicitly listed for API consumers / UI
  const gaps = [
    'funded_wallets',
    'dev_sell_speed',
    'linked_wallet_supply',
    ...(lp && lp.n > 0 ? [] : ['lp_lock_history']),
  ];

  // Thin-history pull toward Neutral (50)
  if (old < 2) {
    const before = pts;
    pts = pts * 0.55 + 50 * 0.45;
    evidence.push({ id: 'thin_history', weight: 'info', old, delta: Math.round(pts - before) });
  }

  let score = Math.round(clamp(pts, 0, 100));

  // Labels
  const liveRate = old > 0 ? live / old : null;
  const badRate = old > 0 ? bad / old : null;
  const rapid = cadenceH != null && cadenceH < 6;
  const serial = total >= 10 && ((liveRate != null && liveRate < 0.15) || rapid || (badRate != null && badRate >= 0.5));
  const highRisk = score < 40 || (old >= 3 && badRate != null && badRate >= 0.7) || (total >= 10 && liveRate != null && liveRate < 0.08);

  let label;
  if (highRisk) label = 'High Risk';
  else if (serial) label = 'Serial Launcher';
  else if (score >= 70 && (total <= 8 || (liveRate != null && liveRate >= 0.35))) label = 'Builder';
  else label = 'Neutral';

  // Re-clamp Builder if somehow serial slipped through
  if (label === 'Builder' && serial) label = 'Serial Launcher';

  return {
    ok: true,
    version: VERSION,
    score,
    label,
    components: {
      total, checked, old, live, dead, rugged, bad, new: neu, graduated,
      liveRate: liveRate == null ? null : Math.round(liveRate * 1000) / 1000,
      badRate: badRate == null ? null : Math.round(badRate * 1000) / 1000,
      cadenceHours: cadenceH == null ? null : Math.round(cadenceH * 10) / 10,
      lpSample: lp && lp.n ? lp : null,
    },
    evidence,
    gaps,
    methodology: '/how#devrep',
  };
}

/** Attach a reputation object onto an /api/dev-style history payload (mutates nothing; returns new fields). */
export function repFromHist(hist, extra) {
  if (!hist?.ok) return { ok: false, reason: hist?.reason || 'no_hist' };
  const cadenceHours = launchCadenceHours(hist.recent || hist.judged || []);
  return scoreDev({ ...hist, cadenceHours }, extra);
}
