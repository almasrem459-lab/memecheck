// Renders the accuracy study from /api/study on /rugs (mode "rugs") and /accuracy (mode "dash"). Auto-refreshes every 10 min.
// All token names/symbols are escaped; numbers come from the API only.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const LV = { low: 'No major red flags', medium: 'Medium', high: 'High (incl. Extreme)' };
const ST = { rug: 'RUG', dead: 'DEAD', down70: 'DOWN ≥70%', alive: 'ALIVE', pending: 'pending', nodata: 'no data' };
const P = (x) => (x == null ? '—' : x + '%');
const CI = (c) => (c ? ` <span class="muted">(${c[0]}–${c[1]}%)</span>` : '');
function tbl(t) {
  const rows = ['low', 'medium', 'high'].map(l => { const x = t.byLevel[l]; return `<tr><td><span class="badge ${l}">${LV[l]}</span></td><td>${x.n}</td><td>${P(x.rug_pct)} <span class="muted">(${x.rug})</span></td><td>${P(x.dead_pct)} <span class="muted">(${x.dead})</span></td><td><b>${P(x.bad_pct)}</b>${CI(x.bad_ci95)}</td><td>${P(x.down70_pct)}</td><td>${P(x.alive_pct)}</td></tr>`; }).join('');
  const b = t.base;
  return `<div style="overflow-x:auto"><table class="acc"><thead><tr><th>Level at scan</th><th>Coins</th><th>Actual rug</th><th>Dead (no cliff)</th><th>Rug or dead <span class="muted">(95% CI)</span></th><th>Down ≥70%</th><th>Alive</th></tr></thead><tbody>${rows}
  <tr><td><b>All coins (base rate)</b></td><td>${b.n}</td><td>${P(b.rug_pct)}</td><td>${P(b.dead_pct)}</td><td><b>${P(b.bad_pct)}</b>${CI(b.bad_ci95)}</td><td>${P(b.down70_pct)}</td><td>${P(b.alive_pct)}</td></tr></tbody></table></div>
  <p class="section-note">n = ${t.n} with a completed ${t.h}h recheck · ${t.pending} pending · ${t.nodata} without price data (excluded).</p>`;
}
function prTbl(pr) {
  const r = (k, lbl, what) => { const x = pr[k]; return `<tr><td>${lbl}</td><td>${what}</td><td>${x.flagged}</td><td><b>${P(x.precision)}</b></td><td><b>${P(x.recall)}</b></td></tr>`; };
  return `<div style="overflow-x:auto"><table class="acc"><thead><tr><th>Rule</th><th>Predicts</th><th>Coins flagged</th><th>Precision</th><th>Recall</th></tr></thead><tbody>
  ${r('high+', 'High or Extreme', 'rug or dead')}${r('medium+', 'Medium or higher', 'rug or dead')}${r('low_survivor', 'No major red flags', 'survives (not rug/dead)')}</tbody></table></div>
  <p class="section-note">Base rate: ${P(pr.base_bad_pct)} of all ${pr.n} coins were rug or dead. A rule is only useful if its precision beats the base rate. Precision = share of flagged coins that ended that way; recall = share of all such coins the rule flagged.</p>`;
}
function chart(daily) {
  const pts = daily.filter(d => d.done > 0); if (pts.length < 2) return `<p class="muted">The chart needs at least two scan days with completed rechecks (have ${pts.length}). It fills in automatically as the tracker runs.</p>`;
  const W = 760, H = 240, L = 36, B = 26, x = (i) => L + i * (W - L - 10) / (pts.length - 1), y = (v) => 8 + (H - B - 8) * (1 - v / 100);
  const C = { low: '#3ddc97', medium: '#ffd447', high: '#ff5c5c', base: '#9aa4b8' };
  const line = (get, col, dash) => { const s = pts.map((d, i) => [i, get(d)]).filter(([, v]) => v != null); return s.length ? `<polyline fill="none" stroke="${col}" stroke-width="2.5" ${dash ? 'stroke-dasharray="5 4"' : ''} points="${s.map(([i, v]) => x(i) + ',' + y(v)).join(' ')}"/>${s.map(([i, v]) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${col}"/>`).join('')}` : ''; };
  const grid = [0, 25, 50, 75, 100].map(v => `<line x1="${L}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="#1c2333"/><text x="4" y="${y(v) + 4}" fill="#7d879c" font-size="11">${v}%</text>`).join('');
  const lab = pts.map((d, i) => (pts.length <= 10 || i % Math.ceil(pts.length / 10) === 0) ? `<text x="${x(i)}" y="${H - 6}" fill="#7d879c" font-size="11" text-anchor="middle">${esc(d.day.slice(5))}</text>` : '').join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Rug-or-dead rate within 24h by scan day and level">${grid}${lab}${line(d => d.base_bad_pct, C.base, 1)}${['low', 'medium', 'high'].map(l => line(d => d.byLevel[l].n ? d.byLevel[l].bad_pct : null, C[l])).join('')}</svg>
  <p class="muted"><span style="color:${C.low}">●</span> No major red flags · <span style="color:${C.medium}">●</span> Medium · <span style="color:${C.high}">●</span> High · <span style="color:${C.base}">- -</span> all coins (base rate). Rug-or-dead within 24h, by UTC scan day.</p>`;
}
function coins(recs) {
  return `<details><summary class="muted">All ${recs.length} tracked coins (newest first)</summary><div style="overflow-x:auto"><table class="acc"><thead><tr><th>Coin</th><th>Scanned (UTC)</th><th>Level</th><th>24h</th><th>48h</th></tr></thead><tbody>${recs.map(r => {
    const ok = CA.test(r.ca), o = (x) => x ? `${ST[x.st] || esc(x.st)}${x.ch != null ? ` <span class="muted">(${x.ch > 0 ? '+' : ''}${esc(x.ch)}%)</span>` : ''}` : '—';
    return `<tr><td><b>${esc(r.sym)}</b> ${ok ? `<a class="mono muted" href="/token/${r.ca}" title="${r.ca}">${r.ca.slice(0, 4)}…${r.ca.slice(-4)}</a>` : ''}</td><td>${esc(String(r.scanned).replace('T', ' ').slice(0, 16))}</td><td><span class="badge ${esc(r.level)}">${esc(String(r.level).toUpperCase())} ${esc(r.pts)}</span></td><td>${o(r.o24)}</td><td>${o(r.o48)}</td></tr>`; }).join('')}</tbody></table></div></details>`;
}
async function paint(box, mode) {
  let s, recs;
  try { [s, recs] = await Promise.all([fetch('/api/study?view=full').then(r => r.json()), fetch('/api/study?view=records').then(r => r.json())]); } catch { s = null; }
  if (!s?.ok) { box.innerHTML = '<p class="muted">Study data is temporarily unavailable. Try again in a minute.</p>'; return; }
  const low = s.h24.byLevel.low, few = s.h24.n < 30;
  const caught = (recs?.records || []).filter(r => (r.level === 'high' || r.level === 'extreme') && r.o24?.st === 'rug');
  box.innerHTML = `
  <div class="stats">
    <div class="kv"><span>Period (UTC scan days)</span><b style="font-size:15px">${esc(s.from)} → ${esc(s.to)}</b></div>
    <div class="kv"><span>Coins with 24h result</span><b>${s.h24.n}</b></div>
    <div class="kv"><span>Unique tickers / mints</span><b>${s.unique_tickers} / ${s.unique_mints}</b></div>
    <div class="kv"><span>Base rate rug-or-dead 24h</span><b>${P(s.h24.base.bad_pct)}</b></div>
    <div class="kv"><span>“No major red flags” → rug-or-dead 24h</span><b>${P(low.bad_pct)}</b></div>
  </div>
  ${few ? `<p class="banner"><b>Small sample:</b> only ${s.h24.n} coins have a completed 24h recheck. Confidence intervals are wide.</p>` : ''}
  <p class="banner"><b>Read this first:</b> most fresh meme coins die or rug within a day no matter what. Of ${low.n} coins we rated “No major red flags”, ${P(low.bad_pct)} were rug or dead within 24h, vs ${P(s.h24.base.bad_pct)} for all tracked coins. The label means our checks found nothing big — not that the coin is safe.</p>
  <h3 style="margin-top:14px">Outcome 24h after scan</h3>${tbl(s.h24)}
  <h3 style="margin-top:14px">Outcome 48h after scan <span class="muted">(computed separately from 48h prices)</span></h3>${tbl(s.h48)}
  <h3 style="margin-top:14px">Precision / recall per level (24h)</h3>${prTbl(s.pr24)}
  <details><summary class="muted">Precision / recall at 48h</summary>${prTbl(s.pr48)}</details>
  <h3 style="margin-top:14px">Rug-or-dead rate per level over time</h3>${chart(s.daily)}
  ${mode === 'rugs' ? `<h3 style="margin-top:18px">Caught: High/Extreme at scan, then an actual rug within 24h (${caught.length})</h3>${caught.length ? `<ul>${caught.map(r => `<li><b>${esc(r.sym)}</b> · ${esc(String(r.level).toUpperCase())} ${esc(r.pts)} · ${esc(r.scanned.slice(0, 16).replace('T', ' '))} · ${r.o24.ch != null ? esc(r.o24.ch) + '%' : ''} ${CA.test(r.ca) ? `· <a href="/token/${r.ca}">details</a>` : ''}</li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}` : ''}
  ${recs?.records ? coins(recs.records) : ''}
  <p class="section-note"><b>Definitions.</b> ${esc(s.definitions.rug)} ${esc(s.definitions.dead)} ${esc(s.definitions.dedupe)} Entry: market cap ≥ $30K, liquidity ≥ $5K, token &lt; 24h old, live pool, not already down ≥ 50% from peak. Prices: GeckoTerminal 15-min OHLCV.</p>
  <p class="muted">Computed ${esc(s.generated.replace('T', ' ').slice(0, 16))} UTC from ${esc(s.source)} · ${s.duplicates_removed} copycat duplicate(s) removed · JSON: <a href="/api/study">/api/study</a> · refreshes automatically.</p>`;
}
const css = document.createElement('style'); css.textContent = '#study .badge{font-size:12px!important;padding:2px 8px!important;line-height:1.4!important;white-space:nowrap;display:inline-block;min-width:0!important;margin:0!important}#study table.acc td,#study table.acc th{font-size:13px}'; document.head.appendChild(css);
export function mount(box, mode) { paint(box, mode); setInterval(() => { if (!document.hidden) paint(box, mode); }, 600000); }
const el = document.getElementById('study'); if (el) mount(el, el.dataset.mode || 'rugs');
