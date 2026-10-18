// Buy / Sell pressure card (Solana meme tokens). No extra on-chain calls:
//  - window summary (5m / 1h / 6h / 24h buys vs sells counts) from the DexScreener pair already fetched by the scan (r.meta.txns)
//  - timeline of recent swaps from the Liquidity-flows sample (flows-ui.js emits 'mc:flows' with /api/liquidity-flows data)
// Bars use swap COUNTS. "Big" markers rank swaps by TOKEN amount (SOL per swap can be inflated by the parser).
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const short = (a) => a && a.length > 12 ? a.slice(0, 4) + '…' + a.slice(-4) : (a || '');
const L = {
  en: { title: 'Buy / Sell pressure', loading: 'Loading recent swaps…', last5: (p, b, s) => `Last 5 min: ${p}% buys (${b} buys / ${s} sells)`, no5: 'No trades in the last 5 min',
    recent: (b, s) => `Recent swaps: ${b} buys / ${s} sells`, w: { m5: '5m', h1: '1h', h6: '6h', h24: '24h' }, buys: 'buys', sells: 'sells',
    noDex: 'No DexScreener trade counts for this token yet.', noSwaps: 'Recent swap timeline unavailable right now.', fewSwaps: 'Not enough recent swaps to draw a timeline yet.',
    retry: 'Retry', bigBuy: 'big buy', bigSell: 'big sell', ofSample: 'of sample token volume', tap: 'Tap or hover the chart for time, price and buys / sells',
    notSol: 'Buy / Sell pressure is shown for Solana meme tokens only.', note: 'Candles from our recent swap sample (price = SOL per token, outliers removed, scaled to the DexScreener USD price). Bars under it: buys (green) and sells (red) per time bucket, counted per swap. Window rows: DexScreener transaction counts. Timeline: our recent swap sample (same one as Liquidity flows). Big = among the 3 largest swaps by token amount and ≥ 10% of the sample. Not part of the risk score. Not financial advice.',
    bucket: (b, s) => `${b} buys / ${s} sells`, chipB: (p) => `${p}% buys`, chipS: (p) => `${p}% sells`, last5s: (b, s) => `last 5 min · ${b} buys / ${s} sells`, volLbl: 'Swaps', dexLine: 'Price line from DexScreener 5m / 1h / 6h / 24h changes (swap prices not reliable for this sample).' },
  ar: { title: 'ضغط الشراء / البيع', loading: 'جارٍ تحميل الصفقات الأخيرة…', last5: (p, b, s) => `آخر 5 دقائق: ${p}% شراء (${b} شراء / ${s} بيع)`, no5: 'لا صفقات في آخر 5 دقائق',
    recent: (b, s) => `الصفقات الأخيرة: ${b} شراء / ${s} بيع`, w: { m5: '5د', h1: '1س', h6: '6س', h24: '24س' }, buys: 'شراء', sells: 'بيع',
    noDex: 'لا توجد أعداد صفقات من DexScreener لهذه العملة بعد.', noSwaps: 'الخط الزمني للصفقات غير متاح الآن.', fewSwaps: 'لا توجد صفقات حديثة كافية لرسم الخط الزمني بعد.',
    retry: 'إعادة المحاولة', bigBuy: 'شراء كبير', bigSell: 'بيع كبير', ofSample: 'من حجم العينة بالعملة', tap: 'اضغط أو مرّر على الرسم لعرض الوقت والسعر والشراء / البيع',
    notSol: 'ضغط الشراء / البيع متاح لعملات الميم على سولانا فقط.', note: 'الشموع من عينة صفقاتنا الأخيرة (SOL لكل عملة، بعد استبعاد القيم الشاذة، ومحوّل لسعر DexScreener بالدولار). الأعمدة تحته: شراء (أخضر) وبيع (أحمر) لكل فترة زمنية، بعدد الصفقات. صفوف الفترات: أعداد صفقات DexScreener. الخط الزمني: عينة صفقاتنا الأخيرة (نفس عينة تدفقات السيولة). كبير = من أكبر 3 صفقات بكمية العملة و≥ 10% من العينة. لا يدخل في تقييم الخطر. ليست نصيحة مالية.',
    bucket: (b, s) => `${b} شراء / ${s} بيع`, chipB: (p) => `${p}% شراء`, chipS: (p) => `${p}% بيع`, last5s: (b, s) => `آخر 5 دقائق · ${b} شراء / ${s} بيع`, volLbl: 'الصفقات', dexLine: 'خط السعر من تغيّرات DexScreener ‏5د / 1س / 6س / 24س (أسعار الصفقات غير موثوقة لهذه العينة).' },
};
const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
const GREEN = '#3ee08f', RED = '#ff4d6a';
const flows = new Map(); // addr -> flows API data (or {error})
let cur = null;
document.addEventListener('mc:flows', (e) => { flows.set(e.detail.addr, e.detail.data); if (cur?.addr === e.detail.addr) paint(); });

function ensureBox() {
  let box = document.getElementById('bp-box'); if (box) return box;
  const out = document.getElementById('out'); if (!out) return null;
  box = document.createElement('div'); box.id = 'bp-box'; box.className = 'card';
  const lf = document.getElementById('lf-box'); if (lf) lf.before(box); else out.appendChild(box);
  return box;
}
function windowRows(tx, t) {
  if (!tx) return `<p class="muted">${t.noDex}</p>`;
  return `<div class="bp-rows">${['m5', 'h1', 'h6', 'h24'].map(k => { const b = +tx[k]?.buys || 0, s = +tx[k]?.sells || 0, n = b + s, p = n ? Math.round(b / n * 100) : null;
    const bar = n ? `<i class="bp-g" style="flex:${Math.max(p, 0.001)}">${p >= 16 ? p + '%' : ''}</i><i class="bp-r" style="flex:${Math.max(100 - p, 0.001)}">${100 - p >= 16 ? (100 - p) + '%' : ''}</i>` : `<i class="bp-e">—</i>`;
    return `<div class="bp-row"><span class="bp-k">${t.w[k]}</span><div class="bp-c"><div class="bp-bar">${bar}</div><div class="bp-n"><span class="up">${b} ${t.buys}</span><span class="dn">${s} ${t.sells}</span></div></div></div>`; }).join('')}</div>`;
}
const STEPS = [1, 2, 3, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 43200, 86400];
function buckets(sw, t0, t1) {
  const span = Math.max(1, t1 - t0), step = STEPS.find(x => span / x <= 14) || 86400, start = Math.floor(t0 / step) * step, n = Math.floor((t1 - start) / step) + 1;
  const bk = Array.from({ length: n }, (_, i) => ({ from: start + i * step, to: start + (i + 1) * step, b: 0, s: 0 }));
  sw.forEach(x => { const i = Math.min(n - 1, Math.max(0, Math.floor((x.t - start) / step))); x.b ? bk[i].b++ : bk[i].s++; });
  return { bk, step, start, end: start + n * step };
}
function bigSwaps(sw) { // top-3 by token amount, each >= 10% of the sample's token amount
  const tot = sw.reduce((a, x) => a + (x.a > 0 ? x.a : 0), 0); if (!(tot > 0)) return [];
  return [...sw].filter(x => x.a > 0).sort((a, b) => b.a - a.a).slice(0, 3).filter(x => x.a / tot >= 0.1).map(x => ({ ...x, pct: x.a / tot * 100 }));
}
const tfmt = (s, sec) => new Date(s * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...(sec ? { second: '2-digit' } : {}) });
const SUBD = '₀₁₂₃₄₅₆₇₈₉';
function pfmt(v, usd) { // compact price label: $0.0₄5123 style for tiny prices
  if (v == null || !isFinite(v)) return '—'; const pre = usd ? '$' : '';
  if (v >= 1) return pre + v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : 3 });
  const m = /^0\.(0*)(\d+)/.exec(v.toFixed(20)); if (!m) return pre + v; const z = m[1].length, d = m[2].slice(0, 4);
  return pre + (z >= 3 ? '0.0' + [...String(z)].map(x => SUBD[x]).join('') + d : '0.' + m[1] + d) + (usd ? '' : ' SOL');
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
// Price series: per-swap SOL / token, outlier-filtered (within 3x of the median), scaled to USD with the DexScreener price.
// If fewer than 4 sane points: DexScreener priceUsd + priceChange m5/h1/h6/h24 (then-price = now / (1 + change%)).
function series(sw, meta) {
  const raw = sw.filter(x => x.v > 0 && x.a > 0).map(x => ({ t: x.t, p: x.v / x.a, b: x.b }));
  const m = med(raw.map(x => x.p));
  const ok0 = m ? raw.filter(x => x.p > m / 3 && x.p < m * 3) : [];
  // Hampel-style filter: drop a swap whose price is > 15% away from the median of its 5 neighbours (parser noise
  // from router / wSOL effects shows up as one-off spikes within the same second; real moves persist across swaps)
  const ok = ok0.filter((x, i) => { const nb = ok0.slice(Math.max(0, i - 2), i + 3).map(y => y.p), mm = med(nb); return Math.abs(x.p - mm) / mm <= 0.15; });
  if (ok.length >= 4) {
    const k = meta?.priceUsd > 0 ? meta.priceUsd / med(ok.slice(-5).map(x => x.p)) : null;
    return { pts: ok.map(x => ({ t: x.t, p: k ? x.p * k : x.p })), usd: !!k, src: 'swaps' };
  }
  const now = Date.now() / 1000, pu = meta?.priceUsd, ch = meta?.ch || {};
  if (!(pu > 0)) return null;
  const pts = [['h24', 86400], ['h6', 21600], ['h1', 3600], ['m5', 300]].filter(([k]) => ch[k] != null && ch[k] > -100).map(([k, d]) => ({ t: now - d, p: pu / (1 + ch[k] / 100) }));
  pts.push({ t: now, p: pu }); return pts.length >= 2 ? { pts, usd: true, src: 'dex' } : null;
}
function drawChart(box, sw, t) {
  const wrap = box.querySelector('#bp-tl'); const S = series(sw, cur.meta), big = bigSwaps(sw);
  const dex = S?.src === 'dex', usd = S?.usd;
  const tA = dex ? S.pts[0].t : sw[0].t, tB = dex ? S.pts[S.pts.length - 1].t : sw[sw.length - 1].t;
  const B = dex ? null : buckets(sw, tA, tB);
  const x0t = B ? B.start : tA, x1t = B ? B.end : tB;
  wrap.innerHTML = `<canvas id="bp-cv" dir="ltr" aria-label="${esc(t.title)}"></canvas><div class="bp-tip" id="bp-tip" dir="auto">${t.tap}</div>${dex ? `<div class="muted bp-src">${t.dexLine}</div>` : ''}`;
  const cv = wrap.querySelector('#bp-cv'), dpr = Math.min(3, window.devicePixelRatio || 1);
  const W = Math.max(260, wrap.clientWidth || 320), H = B ? 236 : 186; cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); try { g.direction = 'ltr'; } catch {}
  const AX = 64, L0 = 4, R0 = W - AX, PT = 10, PB = B ? 150 : 160, VT = 166, VB = 214, TY = H - 6; // plot areas
  const X = (ts) => L0 + (ts - x0t) / Math.max(1, x1t - x0t) * (R0 - L0);
  // OHLC candles per bucket (swap mode): many swaps share one block time, so a plain line would draw vertical spikes
  const C = B && S && !dex ? B.bk.map(k => { const q = S.pts.filter(x => x.t >= k.from && x.t < k.to || (x.t === k.to && k === B.bk[B.bk.length - 1])); return q.length ? { o: q[0].p, c: q[q.length - 1].p, h: Math.max(...q.map(x => x.p)), l: Math.min(...q.map(x => x.p)) } : null; }) : null;
  const ps = S ? S.pts.map(x => x.p) : [], lo = Math.min(...ps), hi = Math.max(...ps), padv = (hi - lo) * 0.12 || hi * 0.02 || 1;
  const pmin = lo - padv, pmax = hi + padv, Y = (p) => PB - (p - pmin) / (pmax - pmin) * (PB - PT);
  const sec = x1t - x0t < 180;
  const priceAt = (ts) => { if (!S) return null; let best = S.pts[0]; for (const q of S.pts) { if (q.t <= ts) best = q; } return best.p; };
  function render(hx) {
    g.clearRect(0, 0, W, H); g.font = '10.5px system-ui,-apple-system,Segoe UI,sans-serif'; g.textBaseline = 'middle';
    // grid + y labels
    g.strokeStyle = 'rgba(125,135,156,.16)'; g.lineWidth = 1; g.fillStyle = '#8b93a5'; g.textAlign = 'left';
    for (let i = 0; i <= 4; i++) { const y = PT + (PB - PT) * i / 4; g.beginPath(); g.moveTo(L0, Math.round(y) + .5); g.lineTo(R0, Math.round(y) + .5); g.stroke();
      if (S && Math.abs(y - Y(S.pts[S.pts.length - 1].p)) > 13) g.fillText(pfmt(pmax - (pmax - pmin) * i / 4, usd), R0 + 6, y); } // skip labels hidden by the last-price tag
    const ticks = W < 480 ? 3 : 5; g.textAlign = 'center';
    for (let i = 0; i <= ticks; i++) { const ts = x0t + (x1t - x0t) * i / ticks, x = X(ts); g.beginPath(); g.moveTo(Math.round(x) + .5, PT); g.lineTo(Math.round(x) + .5, B ? VB : PB); g.stroke();
      g.textAlign = i === 0 ? 'left' : i === ticks ? 'right' : 'center'; g.fillText(tfmt(ts, sec), Math.min(R0, Math.max(L0, x)), TY); }
    // candles (swap sample) or price area + line (DexScreener fallback)
    if (C) {
      const bw = (R0 - L0) / B.bk.length, cw = Math.max(3, Math.min(14, bw * 0.62));
      C.forEach((k, i) => { if (!k) return; const xc = L0 + i * bw + bw / 2, col = k.c >= k.o ? GREEN : RED;
        g.strokeStyle = col; g.lineWidth = 1.2; g.beginPath(); g.moveTo(Math.round(xc) + .5, Y(k.h)); g.lineTo(Math.round(xc) + .5, Y(k.l)); g.stroke();
        const y1 = Y(Math.max(k.o, k.c)), y2 = Y(Math.min(k.o, k.c)); g.fillStyle = col; g.fillRect(Math.round(xc - cw / 2), y1, Math.round(cw), Math.max(1.5, y2 - y1)); });
    }
    if (S) {
      const up = S.pts[S.pts.length - 1].p >= S.pts[0].p, col = up ? GREEN : RED;
      if (!C) { g.beginPath(); S.pts.forEach((q, i) => i ? g.lineTo(X(q.t), Y(q.p)) : g.moveTo(X(q.t), Y(q.p)));
      const grad = g.createLinearGradient(0, PT, 0, PB); grad.addColorStop(0, up ? 'rgba(62,224,143,.28)' : 'rgba(255,77,106,.28)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.lineTo(X(S.pts[S.pts.length - 1].t), PB); g.lineTo(X(S.pts[0].t), PB); g.closePath(); g.fillStyle = grad; g.fill(); g.restore();
      g.beginPath(); S.pts.forEach((q, i) => i ? g.lineTo(X(q.t), Y(q.p)) : g.moveTo(X(q.t), Y(q.p))); g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke(); }
      const lp = S.pts[S.pts.length - 1].p, ly = Y(lp); // last-price tag on the axis + dashed last-price line
      g.save(); g.setLineDash([2, 3]); g.strokeStyle = col; g.globalAlpha = .55; g.beginPath(); g.moveTo(L0, Math.round(ly) + .5); g.lineTo(R0, Math.round(ly) + .5); g.stroke(); g.restore();
      g.fillStyle = col; g.fillRect(R0 + 1, ly - 8, AX - 2, 16); g.fillStyle = '#0b0f17'; g.textAlign = 'left'; g.font = '600 10.5px system-ui,sans-serif'; g.fillText(pfmt(lp, usd), R0 + 5, ly); g.font = '10.5px system-ui,sans-serif';
      if (!dex) big.forEach(z => { const bi = B ? Math.min(B.bk.length - 1, Math.max(0, Math.floor((z.t - B.start) / B.step))) : 0, x = B ? L0 + (bi + .5) * (R0 - L0) / B.bk.length : X(z.t), k = C?.[bi], y = k ? Y(z.b ? k.l : k.h) : Y(priceAt(z.t)); g.fillStyle = z.b ? GREEN : RED; g.strokeStyle = '#0b0f17'; g.lineWidth = 1.5; g.beginPath();
        if (z.b) { g.moveTo(x, y + 6); g.lineTo(x - 6, y + 16); g.lineTo(x + 6, y + 16); } else { g.moveTo(x, y - 6); g.lineTo(x - 6, y - 16); g.lineTo(x + 6, y - 16); } g.closePath(); g.fill(); g.stroke(); });
    }
    // volume-style histogram (swap counts per bucket): buys and sells side by side
    if (B) {
      const mx = Math.max(1, ...B.bk.map(x => Math.max(x.b, x.s))), bw = (R0 - L0) / B.bk.length;
      g.strokeStyle = 'rgba(125,135,156,.25)'; g.beginPath(); g.moveTo(L0, VB + .5); g.lineTo(R0, VB + .5); g.stroke();
      B.bk.forEach((x, i) => { const xl = L0 + i * bw, w = Math.max(1.5, bw * 0.36);
        if (x.b) { const h = x.b / mx * (VB - VT); g.fillStyle = 'rgba(62,224,143,.85)'; g.fillRect(xl + bw * 0.12, VB - h, w, h); }
        if (x.s) { const h = x.s / mx * (VB - VT); g.fillStyle = 'rgba(255,77,106,.85)'; g.fillRect(xl + bw * 0.52, VB - h, w, h); } });
      g.fillStyle = '#8b93a5'; g.textAlign = 'left'; g.fillText(t.volLbl, R0 + 6, VT + 6);
    }
    if (hx != null) { // crosshair
      g.strokeStyle = 'rgba(230,233,239,.45)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(Math.round(hx) + .5, PT); g.lineTo(Math.round(hx) + .5, B ? VB : PB); g.stroke();
      if (S) { const ts = x0t + (hx - L0) / (R0 - L0) * (x1t - x0t), y = Y(priceAt(ts)); g.beginPath(); g.moveTo(L0, y); g.lineTo(R0, y); g.stroke(); g.setLineDash([]); g.fillStyle = '#e6e9ef'; g.beginPath(); g.arc(hx, y, 3, 0, 7); g.fill(); }
      g.setLineDash([]);
    }
  }
  render(null);
  const tip = wrap.querySelector('#bp-tip');
  const show = (ev) => { const r = cv.getBoundingClientRect(), hx = Math.min(R0, Math.max(L0, ev.clientX - r.left)); render(hx);
    const ts = x0t + (hx - L0) / (R0 - L0) * (x1t - x0t); const parts = [tfmt(ts, sec)]; if (S) parts.push(pfmt(priceAt(ts), usd));
    if (B) { const x = B.bk[Math.min(B.bk.length - 1, Math.max(0, Math.floor((ts - B.start) / B.step)))]; parts.push(t.bucket(x.b, x.s)); }
    tip.textContent = parts.join(' · '); };
  cv.addEventListener('pointermove', show); cv.addEventListener('pointerdown', show); cv.addEventListener('pointerleave', () => { render(null); });
  const bl = box.querySelector('#bp-big');
  bl.innerHTML = dex ? '' : big.map(z => `<div class="bp-big"><span class="st ${z.b ? 'pass' : 'fail'}">${z.b ? '▲' : '▼'} ${z.b ? t.bigBuy : t.bigSell}</span> <span class="muted">${z.pct.toFixed(0)}% ${t.ofSample} · <span dir="ltr">${tfmt(z.t, true)}</span> · <a href="https://solscan.io/account/${esc(z.w)}" target="_blank" rel="noopener" dir="ltr">${esc(short(z.w))}</a></span></div>`).join('');
}
function paint() {
  if (!cur) return; const t = L[lang()]; const box = ensureBox(); if (!box) return;
  box.hidden = false; delete box.dataset.skel;
  if (cur.chain !== 'solana') { box.innerHTML = `<h3>${t.title}</h3><span class="muted">${t.notSol}</span>`; return; }
  const tx = cur.txns, m5 = tx?.m5, n5 = (+m5?.buys || 0) + (+m5?.sells || 0), p5 = n5 ? Math.round(m5.buys / n5 * 100) : null;
  const d = flows.get(cur.addr), sw = Array.isArray(d?.swaps) ? d.swaps.filter(x => x && x.t) : null;
  const head = tx ? (n5 ? `<span class="bp-chip ${p5 >= 50 ? 'pass' : 'fail'}">${p5 >= 50 ? t.chipB(p5) : t.chipS(100 - p5)}</span><span class="bp-hs">${t.last5s(m5.buys, m5.sells)}</span>` : `<span class="bp-hs">${t.no5}</span>`) : '';
  const rb = sw?.length ? `<div class="bp-sub">${t.recent(sw.filter(x => x.b).length, sw.filter(x => !x.b).length)}</div>` : '';
  let tl;
  if (!d) tl = `<div class="bp-wait"><span class="spin"></span> ${t.loading}</div>`;
  else if (sw && sw.length >= 4) tl = `<div id="bp-tl" class="bp-tl"></div>`;
  else if (sw || (d.empty && !d.soft && d.reason !== 'rate_limited' && !d.error)) tl = `<span class="muted">${t.fewSwaps}</span>`;
  else tl = `<span class="muted">${t.noSwaps}</span> <button type="button" class="ghost act" id="bp-retry">${t.retry}</button>`;
  box.innerHTML = `<h3>${t.title}</h3>${head ? `<div class="bp-head">${head}</div>` : ''}${rb}${windowRows(tx, t)}${tl}<div id="bp-big"></div>
    <details class="fn"><summary title="info">ⓘ</summary><div>${t.note}</div></details>`;
  box.querySelector('#bp-retry')?.addEventListener('click', () => { flows.delete(cur.addr); paint(); window.__mcFlowsRetry?.(cur.addr); });
  if (box.querySelector('#bp-tl')) { try { drawChart(box, sw, t); } catch (e) { box.querySelector('#bp-tl').innerHTML = `<span class="muted">${t.noSwaps}</span>`; } }
}
let wd = 0;
document.addEventListener('mc:render', (e) => { const { r } = e.detail; cur = { addr: r.addr, chain: r.chain, txns: r.meta?.txns || null, meta: r.meta || {} }; paint();
  // watchdog: if the flows sample never arrives (flows-ui.js missing / stuck), stop the spinner and offer Retry
  clearTimeout(wd); const a = r.addr; wd = setTimeout(() => { if (cur?.addr === a && r.chain === 'solana' && !flows.has(a)) { flows.set(a, { error: true }); paint(); } }, 45000); });
document.getElementById('lang')?.addEventListener('click', () => setTimeout(paint, 0));
let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (document.getElementById('bp-cv')) paint(); }, 200); });
