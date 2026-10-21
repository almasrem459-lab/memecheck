// Smart money page: "Bots" section. Renders /api/bots (SIMULATED paper-trading snapshot published from the off-site bot).
// Strings live in i18n.js (BOTS, EN + AR). Everything from the API is escaped; mints are validated before linking.
import { BOTS } from './i18n.js?v=1793100200';

const AR = document.documentElement.lang === 'ar';
const L = BOTS[AR ? 'ar' : 'en'];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const okMint = (m) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m || '');
const tms = (s) => { const t = s ? Date.parse(s) : NaN; return isFinite(t) ? t : null; };
const ago = (ms) => ms == null ? '—' : L.ago(Math.max(0, Math.floor((Date.now() - ms) / 1000)));
const PAUSE_MS = 2 * 3600e3;
const fmtT = (s) => { const t = tms(s); if (t == null) return '—'; try { return new Date(t).toLocaleString(L.locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return new Date(t).toISOString().slice(5, 16).replace('T', ' '); } };
const money = (n, sign) => { if (n == null || !isFinite(n)) return '—'; const a = Math.abs(n); const s = a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return (sign ? (n > 0.005 ? '+' : n < -0.005 ? '−' : '') : (n < 0 ? '−' : '')) + '$' + s; };
const cls = (n) => n > 0.005 ? 'up' : n < -0.005 ? 'dn' : '';
const pctTxt = (p) => p == null || !isFinite(p) ? '—' : (p > 0 ? '+' : p < 0 ? '−' : '') + (Math.abs(p) >= 100 ? Math.abs(p).toFixed(0) : Math.abs(p).toFixed(1)) + '%';
const mc = (n) => { if (n == null || !(n >= 0)) return '—'; if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'; if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'; if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'; return '$' + n.toFixed(0); };
const px = (n) => { if (n == null || !isFinite(n) || n <= 0) return '—'; if (n >= 1) return '$' + n.toPrecision(4); const z = -Math.floor(Math.log10(n)) - 1; const sig = Math.round(n * Math.pow(10, z + 3)); return z >= 4 ? '$0.0<sub>' + z + '</sub>' + sig : '$' + n.toPrecision(3); };
const N = (v) => '<bdi dir="ltr">' + v + '</bdi>';

function badge(m) {
  const lv = m && L.mcLv[m.lv] ? m.lv : 'unknown';
  return '<span class="badge bsm ' + lv + '">' + esc(L.mcLv[lv]) + (m && m.pts != null && lv !== 'unknown' ? ' · ' + N(esc(m.pts)) : '') + '</span>';
}
function walletChips(ws) {
  return (ws || []).map((w) => '<span class="w' + (w.w >= 1.5 ? ' hi' : '') + '"' + (w.w != null ? ' title="' + esc(L.weight + ' ' + w.w) + '"' : '') + '>' + esc(w.n) + (w.w != null ? ' <small dir="ltr">' + esc((+w.w).toFixed(1)) + '</small>' : '') + '</span>').join('');
}
function coin(p) {
  return '<a class="bt-coin" href="/?ca=' + encodeURIComponent(p.mint) + '" title="' + esc(L.scan) + '"><bdi dir="ltr">$' + esc(p.sym || '?') + '</bdi></a>'
    + (p.name && p.name !== p.sym ? '<span class="nm">' + esc(p.name) + '</span>' : '');
}
function spark(pts) {
  const P = (pts || []).map((p) => [tms(p[0]), +p[1]]).filter((p) => p[0] != null && isFinite(p[1]));
  if (P.length < 2) return '';
  const W = 132, H = 36, t0 = P[0][0], t1 = P[P.length - 1][0] || t0 + 1;
  const ys = P.map((p) => p[1]).concat([1000]); const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const X = (t) => (t1 > t0 ? (t - t0) / (t1 - t0) : 1) * (W - 4) + 2, Y = (v) => H - 3 - ((v - lo) / span) * (H - 6);
  let d = ''; P.forEach((p, i) => { const x = X(p[0]).toFixed(1); d += (i ? ' H' + x + ' V' : 'M' + x + ' ') + Y(p[1]).toFixed(1); });   // step line: equity changes at each close
  const up = P[P.length - 1][1] >= 1000;
  return '<svg class="spk" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(L.sparkT) + '"><title>' + esc(L.sparkT) + '</title>'
    + '<line x1="2" x2="' + (W - 2) + '" y1="' + Y(1000).toFixed(1) + '" y2="' + Y(1000).toFixed(1) + '" stroke="#273046" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>'
    + '<path d="' + d + '" fill="none" stroke="' + (up ? '#3ee08f' : '#ff6b81') + '" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
}

function openRow(p) {
  const left = p.left != null && p.left < 0.999 ? ' · ' + esc(L.left(Math.round(p.left * 100))) : '';
  return '<div class="trd"><div class="trd-l"><div class="trd-t">' + coin(p) + badge(p.mc) + '</div>'
    + '<div class="sm-sub">' + esc(L.bought) + ' ' + N(esc(fmtT(p.at))) + ' · ' + esc(L.held) + ' ' + N(esc(L.dur((Date.now() - tms(p.at)) / 1000))) + left + '</div>'
    + '<div class="sm-sub">' + esc(L.entry) + ': ' + esc(L.mcap) + ' ' + N(mc(p.entryMc)) + ' · ' + esc(L.price) + ' ' + N(px(p.entryPrice)) + ' → ' + esc(L.now) + ': ' + N(mc(p.lastMc)) + ' · ' + N(px(p.last)) + '</div>'
    + (p.fills && p.fills.length ? '<div class="sm-sub">' + esc(L.partials) + ': ' + p.fills.map((f) => esc(L.why(f.r)) + ' (' + N(Math.round((f.frac || 0) * 100) + '%') + ')').join(', ') + '</div>' : '')
    + '<div class="ws"><small class="wl">' + esc(L.wallets) + ':</small>' + walletChips(p.wallets) + '</div></div>'
    + '<div class="trd-r"><small>' + esc(L.value) + '</small><b dir="ltr">' + money(p.value) + '</b><small dir="ltr" class="' + cls(p.pnlUsd) + '">' + (p.x != null ? '×' + p.x.toFixed(2) : '—') + '</small><small class="' + cls(p.pnlUsd) + '">' + N(money(p.pnlUsd, true) + ' · ' + pctTxt(p.pnlPct)) + '</small></div></div>';
}
function closedRow(p) {
  const held = tms(p.closedAt) != null && tms(p.at) != null ? ' · ' + esc(L.held) + ' ' + N(esc(L.dur((tms(p.closedAt) - tms(p.at)) / 1000))) : '';
  const parts = (p.fills || []).filter((f) => f.r !== p.why);
  return '<div class="trd"><div class="trd-l"><div class="trd-t">' + coin(p) + badge(p.mc) + '</div>'
    + '<div class="sm-sub">' + esc(L.bought) + ' ' + N(esc(fmtT(p.at))) + ' → ' + esc(L.sold) + ' ' + N(esc(fmtT(p.closedAt))) + held + '</div>'
    + '<div class="sm-sub">' + esc(L.mcap) + ' ' + N(mc(p.entryMc) + ' → ' + mc(p.exitMc)) + (p.peakX ? ' · ' + esc(L.xMax) + ' ' + N('×' + p.peakX.toFixed(2)) : '') + '</div>'
    + '<div class="why">' + esc(L.exit) + ': ' + esc(L.why(p.why)) + '</div>'
    + (parts.length ? '<div class="sm-sub">' + esc(L.partials) + ': ' + parts.map((f) => esc(L.why(f.r)) + ' (' + N(Math.round((f.frac || 0) * 100) + '%') + ')').join(', ') + '</div>' : '')
    + '<div class="ws"><small class="wl">' + esc(L.wallets) + ':</small>' + walletChips(p.wallets) + '</div></div>'
    + '<div class="trd-r"><b class="' + cls(p.pnlUsd) + '" dir="ltr">' + money(p.pnlUsd, true) + '</b><small class="' + cls(p.pnlUsd) + '" dir="ltr">' + pctTxt(p.pnlPct) + '</small></div></div>';
}
function rejRow(r) {
  const xs = [['xNow', r.xNow], ['xMax', r.xMax], ['xMin', r.xMin], ['x1h', r.x1h], ['x6h', r.x6h], ['x24h', r.x24h]].filter((x) => x[1] != null);
  return '<div class="trd"><div class="trd-l"><div class="trd-t">' + coin(r) + badge(r.mc) + '</div>'
    + '<div class="sm-sub">' + esc(L.rejected) + ' ' + N(esc(fmtT(r.at))) + ' · ' + esc(L.mcap) + ' ' + N(mc(r.mcap)) + ' → ' + esc(L.now) + ' ' + N(mc(r.lastMc)) + '</div>'
    + '<div class="why">' + esc(L.rej(r.why)) + '</div>'
    + '<div class="xs"><small>' + esc(L.after) + ':</small> ' + xs.map((x) => '<span class="xk">' + esc(L[x[0]]) + ' <b dir="ltr" class="' + cls(x[1] - 1) + '">' + esc(L.x(x[1])) + '</b></span>').join('') + '</div>'
    + '<div class="ws"><small class="wl">' + esc(L.wallets) + ':</small>' + walletChips(r.wallets) + '</div></div></div>';
}

const expanded = new Set();
function panel(b) {
  const op = (b.open || []).filter((p) => okMint(p.mint)), cl = (b.closed || []).filter((p) => okMint(p.mint)), rj = (b.rejected || []).filter((p) => okMint(p.mint));
  const filterOff = (b.cfg.kind ? b.cfg.gate === 'none' : !b.cfg.filter);
  return '<h4>' + esc(L.openH) + ' <span class="cnt">' + N(op.length) + '</span></h4>' + (op.length ? op.map(openRow).join('') : '<p class="bt-empty">' + esc(L.noOpen) + '</p>')
    + '<h4>' + esc(L.closedH) + ' <span class="cnt">' + N(esc(L.closedLast(cl.length, b.stats.closed))) + '</span></h4>' + (cl.length ? cl.map(closedRow).join('') : '<p class="bt-empty">' + esc(L.noClosed) + '</p>')
    + '<h4>' + esc(L.rejH) + ' <span class="cnt">' + N(b.stats.rejected || 0) + '</span></h4>' + (rj.length ? rj.map(rejRow).join('') : '<p class="bt-empty">' + esc(filterOff ? L.filterOff : L.noRej) + '</p>');
}
function card(b, i, bank) {
  const s = b.stats, open = expanded.has(b.id), pid = 'bp-' + esc(b.id);
  return '<article class="bot' + (open ? ' on' : '') + '" data-id="' + esc(b.id) + '">'
    + '<button type="button" class="bot-h" aria-expanded="' + open + '" aria-controls="' + pid + '">'
    + '<div class="bot-top"><span class="rk">' + N('#' + (i + 1)) + '</span><div class="bot-nm"><b>' + esc(L.title(b.cfg)) + '</b> <code dir="ltr">' + esc(b.id) + '</code>'
    + '<div class="bot-rule">' + esc(L.rule(b.cfg)) + '</div><div class="bot-ex">' + esc(L.exits(b.cfg)) + '</div></div>' + spark(b.spark) + '</div>'
    + ((s.hired || (s.hiredList && s.hiredList.length)) ? '<div class="bot-rule" style="margin-top:4px">' + esc(L.hiredLine ? L.hiredLine(s) : ('Hired: ' + s.hired + (s.consecLoss != null ? ' · losses ' + s.consecLoss : '') + (s.fireCount ? ' · fired ' + s.fireCount : ''))) + '</div>' : '')
    + '<div class="bot-st">'
    + '<div class="kv2"><small>' + esc(L.equity) + '</small><b dir="ltr">' + money(s.equity) + '</b><small>' + esc(L.fromBank(bank.toLocaleString('en-US'))) + '</small></div>'
    + '<div class="kv2"><small>' + esc(L.pnl) + '</small><b dir="ltr" class="' + cls(s.pnl) + '">' + money(s.pnl, true) + '</b><small dir="ltr" class="' + cls(s.pnl) + '">' + pctTxt(s.pnlPct) + '</small></div>'
    + '<div class="kv2"><small>' + esc(L.win) + '</small><b dir="ltr">' + (s.winRate == null ? '—' : Math.round(s.winRate) + '%') + '</b><small dir="ltr">' + (s.closed ? s.wins + '/' + s.closed : '') + '</small></div>'
    + '<div class="kv2"><small>' + esc(L.counts) + '</small><b dir="ltr">' + (s.open || 0) + ' / ' + (s.closed || 0) + '</b><small>' + (s.rejected ? esc(L.rejectedN(s.rejected)) : '&nbsp;') + '</small></div>'
    + '<span class="chev" aria-hidden="true"></span></div>'
    + '<span class="sr">' + esc(open ? L.hide : L.show) + '</span></button>'
    + '<div class="bot-p" id="' + pid + '"' + (open ? '' : ' hidden') + '>' + (open ? panel(b) : '') + '</div></article>';
}

let DATA = null;
function render(d) {
  DATA = d;
  const KEEP = new Set(['c5_filter', 'c5_nofilter', 'solo_scalper', 'fomo_copy']);
  const bots = (d.bots || []).filter((b) => b && KEEP.has(b.id) && b.stats && b.cfg).sort((a, b) => (b.stats.pnl || 0) - (a.stats.pnl || 0));
  const bank = (d.config && d.config.bank) || 1000;
  const at = d.at || tms(d.generatedAt), tick = tms(d.bot && d.bot.lastPriceAt);
  const paused = at == null || Date.now() - at > PAUSE_MS || (tick != null && Date.now() - tick > PAUSE_MS);
  $('bots-status').innerHTML = esc(L.updated(ago(at))) + (tick ? ' · ' + esc(L.tick(ago(tick))) : '') + ' · ' + esc(L.sorted);
  const pn = $('bots-paused'); pn.hidden = !paused; if (paused) pn.textContent = L.paused(ago(Math.min(at || Infinity, tick || Infinity)));
  $('bots-list').innerHTML = bots.length ? bots.map((b, i) => card(b, i, bank)).join('') : '<div class="empty">' + esc(L.none) + '</div>';
}
function toggle(art) {
  const id = art.dataset.id, b = DATA && (DATA.bots || []).find((x) => x.id === id); if (!b) return;
  const btn = art.querySelector('.bot-h'), p = art.querySelector('.bot-p');
  const open = !expanded.has(id);
  if (open) { expanded.add(id); p.innerHTML = panel(b); } else expanded.delete(id);
  p.hidden = !open; art.classList.toggle('on', open); btn.setAttribute('aria-expanded', String(open));
  art.querySelector('.sr').textContent = open ? L.hide : L.show;
}

function init() {
  const sec = $('bots'); if (!sec) return;
  sec.querySelectorAll('[data-b]').forEach((e) => { const v = L[e.dataset.b]; if (typeof v !== 'string') return; if (e.hasAttribute('data-html')) e.innerHTML = v; else e.textContent = v; });
  $('bots-list').addEventListener('click', (e) => { const h = e.target.closest('.bot-h'); if (h) toggle(h.closest('.bot')); });
  const load = async () => {
    try {
      const r = await fetch('/api/bots', { headers: { accept: 'application/json' } });
      const d = await r.json();
      if (!d || !d.ok || !Array.isArray(d.bots)) { if (!DATA) { $('bots-status').textContent = ''; $('bots-list').innerHTML = '<div class="empty">' + esc(L.none) + '</div>'; } return; }
      render(d);
    } catch (e) { if (!DATA) { $('bots-status').textContent = ''; $('bots-list').innerHTML = '<div class="empty">' + esc(L.none) + '</div>'; } else render(DATA); }
  };
  load(); setInterval(() => { if (!document.hidden) load(); }, 120e3);
}
init();
