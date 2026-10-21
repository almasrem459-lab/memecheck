// GET /api/bots -> SIMULATED paper-trading bots snapshot for the Smart money page (smart.html, "Bots" section).
// The PAPER-ONLY consensus bot runs off-site; its exporter (consensus-bot/export_site.py) publishes a sanitized snapshot
// (stats, last 50 trades, open positions, rejections, public wallet labels; no addresses, keys or signatures)
// to KV key `bots:v1` at most every 15 min. Here we only READ KV (no writes) and keep a 60 s edge cache.
// Not financial advice: no real trades are ever executed.
const TTL = 60;
const json = (status, body, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', ...extra },
});

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default, key = new Request(new URL('/api/bots?v=site3c', request.url).toString());
  const hit = await cache.match(key).catch(() => null);
  if (hit) return hit;
  let raw = null;
  try { raw = env.MEMECHECK_CACHE ? await env.MEMECHECK_CACHE.get('bots:v1') : null; } catch {}
  if (!raw) return json(200, { ok: false, bots: [], note: 'Bot data is not available yet.' }, { 'cache-control': 'public, max-age=30' });
  let ok = false;
  try { const d = JSON.parse(raw); ok = !!(d && d.ok && Array.isArray(d.bots)); } catch {}
  if (!ok) return json(200, { ok: false, bots: [], note: 'Bot data is not available yet.' }, { 'cache-control': 'public, max-age=30' });
  // Paper bots whitelist (no extra KV writes): only surface the active paper bots (incl. FOMO Copy).
  const KEEP = ['c5_filter', 'c5_nofilter', 'solo_scalper', 'fomo_copy'];
  try {
    const d = JSON.parse(raw);
    const by = Object.fromEntries((d.bots || []).filter((b) => b && b.id).map((b) => [b.id, b]));
    // Empty stub so the new scalper card appears before the next scheduled KV snapshot.
    if (!by.solo_scalper) {
      by.solo_scalper = {
        id: 'solo_scalper',
        cfg: { kind: 'scalper', mc_lo: 18000, mc_hi: 45000, mc_target: 30000, min_liq: 2500, min_age_min: 3, max_age_min: 120, max_top10: 42, max_open: 3, size: 15, exits: 'scalp' },
        stats: { equity: 1000, realized: 0, unrealized: 0, pnl: 0, pnlPct: 0, closed: 0, open: 0, wins: 0, winRate: null, rejected: 0 },
        spark: [], open: [], closed: [], rejected: [],
      };
    }
    if (!by.fomo_copy) {
      by.fomo_copy = {
        id: 'fomo_copy',
        cfg: { kind: 'fomo', slots: 3, top: 8, copy_mult: 0.25, size: 15, max_open: 5, filter: true, fire_losses: 2, fire_cooldown_h: 12, fresh_min: 30, chase: 0.4, min_liq: 5000, exits: 'fomo', daily_target_usd: 50 },
        stats: { equity: 1000, realized: 0, unrealized: 0, pnl: 0, pnlPct: 0, closed: 0, open: 0, wins: 0, winRate: null, rejected: 0, hired: null, consecLoss: 0, fireCount: 0 },
        spark: [], open: [], closed: [], rejected: [],
      };
    }
    // Enrich c5 live params on read (no KV write) until the next scheduled snapshot lands.
    for (const id of ['c5_filter', 'c5_nofilter']) {
      if (!by[id]) continue;
      by[id].cfg = Object.assign({}, by[id].cfg, { window_min: 45, chase: 0.25, min_liq: 8000, exits: 'smart', n: 5, filter: id.endsWith('filter') && !id.includes('no') });
      // c5_nofilter ends with nofilter — fix filter flag explicitly
      by[id].cfg.filter = id === 'c5_filter';
    }
    d.bots = KEEP.map((id) => by[id]).filter(Boolean);
    d.config = d.config || {};
    d.config.siteBots = KEEP;
    raw = JSON.stringify(d);
  } catch {}
  const res = json(200, raw, { 'cache-control': `public, max-age=${TTL}` });
  waitUntil(cache.put(key, res.clone()).catch(() => {}));
  return res;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' } });
}
