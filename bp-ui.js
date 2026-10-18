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
    retry: 'Retry', bigBuy: 'big buy', bigSell: 'big sell', ofSample: 'of sample token volume', tap: 'Tap or hover a bar for details',
    notSol: 'Buy / Sell pressure is shown for Solana meme tokens only.', note: 'Green = buys, red = sells, per time bucket, counted per swap. Window rows: DexScreener transaction counts. Timeline: our recent swap sample (same one as Liquidity flows). Big = among the 3 largest swaps by token amount and ≥ 10% of the sample. Not part of the risk score. Not financial advice.',
    bucket: (b, s) => `${b} buys / ${s} sells` },
  ar: { title: 'ضغط الشراء / البيع', loading: 'جارٍ تحميل الصفقات الأخيرة…', last5: (p, b, s) => `آخر 5 دقائق: ${p}% شراء (${b} شراء / ${s} بيع)`, no5: 'لا صفقات في آخر 5 دقائق',
    recent: (b, s) => `الصفقات الأخيرة: ${b} شراء / ${s} بيع`, w: { m5: '5د', h1: '1س', h6: '6س', h24: '24س' }, buys: 'شراء', sells: 'بيع',
    noDex: 'لا توجد أعداد صفقات من DexScreener لهذه العملة بعد.', noSwaps: 'الخط الزمني للصفقات غير متاح الآن.', fewSwaps: 'لا توجد صفقات حديثة كافية لرسم الخط الزمني بعد.',
    retry: 'إعادة المحاولة', bigBuy: 'شراء كبير', bigSell: 'بيع كبير', ofSample: 'من حجم العينة بالعملة', tap: 'اضغط أو مرّر على عمود للتفاصيل',
    notSol: 'ضغط الشراء / البيع متاح لعملات الميم على سولانا فقط.', note: 'الأخضر = شراء، الأحمر = بيع، لكل فترة زمنية، بعدد الصفقات. صفوف الفترات: أعداد صفقات DexScreener. الخط الزمني: عينة صفقاتنا الأخيرة (نفس عينة تدفقات السيولة). كبير = من أكبر 3 صفقات بكمية العملة و≥ 10% من العينة. لا يدخل في تقييم الخطر. ليست نصيحة مالية.',
    bucket: (b, s) => `${b} شراء / ${s} بيع` },
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
    return `<div class="bp-row"><span class="bp-k">${t.w[k]}</span><div class="bp-bar" title="${b} ${t.buys} / ${s} ${t.sells}">${n ? `<i style="width:${p}%;background:${GREEN}"></i><i style="width:${100 - p}%;background:${RED}"></i>` : ''}</div><span class="bp-v" dir="ltr">${n ? `${p}% / ${100 - p}%` : '—'}</span></div>`; }).join('')}</div>`;
}
const STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 43200, 86400];
function buckets(sw) {
  const t0 = sw[0].t, t1 = sw[sw.length - 1].t, span = Math.max(1, t1 - t0);
  const step = STEPS.find(s => span / s <= 16) || 86400, start = Math.floor(t0 / step) * step, n = Math.floor((t1 - start) / step) + 1;
  const bk = Array.from({ length: n }, (_, i) => ({ from: start + i * step, to: start + (i + 1) * step, b: 0, s: 0, big: [] }));
  sw.forEach(x => { const i = Math.min(n - 1, Math.floor((x.t - start) / step)); x.b ? bk[i].b++ : bk[i].s++; x._i = i; });
  return { bk, step };
}
function bigSwaps(sw) { // top-3 by token amount, each >= 10% of the sample's token amount
  const tot = sw.reduce((a, x) => a + (x.a > 0 ? x.a : 0), 0); if (!(tot > 0)) return [];
  return [...sw].filter(x => x.a > 0).sort((a, b) => b.a - a.a).slice(0, 3).filter(x => x.a / tot >= 0.1).map(x => ({ ...x, pct: x.a / tot * 100 }));
}
const hhmm = (s) => new Date(s * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: s % 60 ? '2-digit' : undefined });
function drawTimeline(box, sw, t) {
  const { bk, step } = buckets(sw), big = bigSwaps(sw); big.forEach(x => bk[x._i].big.push(x));
  const wrap = box.querySelector('#bp-tl'); wrap.innerHTML = `<canvas id="bp-cv" height="150" aria-label="${esc(t.title)}"></canvas><div class="muted bp-tip" id="bp-tip">${t.tap}</div>`;
  const cv = wrap.querySelector('#bp-cv'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(240, wrap.clientWidth || 320), H = 150; cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const max = Math.max(1, ...bk.map(x => Math.max(x.b, x.s))), mid = H / 2, pad = 18, bw = W / bk.length, hMax = mid - pad;
  g.strokeStyle = '#273046'; g.beginPath(); g.moveTo(0, mid); g.lineTo(W, mid); g.stroke();
  g.font = '10px system-ui,sans-serif';
  bk.forEach((x, i) => {
    const xl = i * bw + bw * 0.15, w = Math.max(2, bw * 0.7);
    if (x.b) { g.fillStyle = GREEN; g.fillRect(xl, mid - x.b / max * hMax, w, x.b / max * hMax); }
    if (x.s) { g.fillStyle = RED; g.fillRect(xl, mid + 1, w, x.s / max * hMax); }
    x.big.forEach(z => { const y = z.b ? mid - x.b / max * hMax - 7 : mid + x.s / max * hMax + 7; g.fillStyle = '#ffd447'; g.beginPath(); g.arc(xl + w / 2, Math.max(5, Math.min(H - 5, y)), 4, 0, 7); g.fill(); });
  });
  g.fillStyle = '#7d879c'; g.textAlign = 'left'; g.fillText(hhmm(bk[0].from), 2, H - 2); g.textAlign = 'right'; g.fillText(hhmm(bk[bk.length - 1].to), W - 2, H - 2);
  const tip = wrap.querySelector('#bp-tip');
  const show = (ev) => { const r = cv.getBoundingClientRect(), i = Math.min(bk.length - 1, Math.max(0, Math.floor((ev.clientX - r.left) / bw))), x = bk[i];
    tip.textContent = `${hhmm(x.from)}–${hhmm(x.to)} · ${t.bucket(x.b, x.s)}${x.big.length ? ' · ' + x.big.map(z => z.b ? t.bigBuy : t.bigSell).join(', ') : ''}`; };
  cv.addEventListener('pointermove', show); cv.addEventListener('pointerdown', show);
  const bl = box.querySelector('#bp-big');
  bl.innerHTML = big.map(z => `<div class="bp-big"><span class="st ${z.b ? 'pass' : 'fail'}">● ${z.b ? t.bigBuy : t.bigSell}</span> <span class="muted" dir="auto">${z.pct.toFixed(0)}% ${t.ofSample} · ${hhmm(z.t)} · <a href="https://solscan.io/account/${esc(z.w)}" target="_blank" rel="noopener" dir="ltr">${esc(short(z.w))}</a></span></div>`).join('');
  return step;
}
function paint() {
  if (!cur) return; const t = L[lang()]; const box = ensureBox(); if (!box) return;
  box.hidden = false; delete box.dataset.skel;
  if (cur.chain !== 'solana') { box.innerHTML = `<h3>${t.title}</h3><span class="muted">${t.notSol}</span>`; return; }
  const tx = cur.txns, m5 = tx?.m5, n5 = (+m5?.buys || 0) + (+m5?.sells || 0);
  const d = flows.get(cur.addr), sw = Array.isArray(d?.swaps) ? d.swaps.filter(x => x && x.t) : null;
  const head = tx ? (n5 ? t.last5(Math.round(m5.buys / n5 * 100), m5.buys, m5.sells) : t.no5) : '';
  const rb = sw?.length ? t.recent(sw.filter(x => x.b).length, sw.filter(x => !x.b).length) : '';
  let tl;
  if (!d) tl = `<div><span class="spin"></span> ${t.loading}</div>`;
  else if (sw && sw.length >= 4) tl = `<div id="bp-tl" class="bp-tl"></div>`;
  else if (sw || (d.empty && !d.soft && d.reason !== 'rate_limited' && !d.error)) tl = `<span class="muted">${t.fewSwaps}</span>`;
  else tl = `<span class="muted">${t.noSwaps}</span> <button type="button" class="ghost act" id="bp-retry">${t.retry}</button>`;
  box.innerHTML = `<h3>${t.title}</h3>${head || rb ? `<p class="bp-head"><b>${esc(head)}</b>${head && rb ? ' · ' : ''}${esc(rb)}</p>` : ''}${windowRows(tx, t)}${tl}<div id="bp-big"></div>
    <details class="fn"><summary title="info">ⓘ</summary><div>${t.note}</div></details>`;
  box.querySelector('#bp-retry')?.addEventListener('click', () => { flows.delete(cur.addr); paint(); window.__mcFlowsRetry?.(cur.addr); });
  if (box.querySelector('#bp-tl')) { try { drawTimeline(box, sw, t); } catch { box.querySelector('#bp-tl').innerHTML = `<span class="muted">${t.noSwaps}</span>`; } }
}
let wd = 0;
document.addEventListener('mc:render', (e) => { const { r } = e.detail; cur = { addr: r.addr, chain: r.chain, txns: r.meta?.txns || null }; paint();
  // watchdog: if the flows sample never arrives (flows-ui.js missing / stuck), stop the spinner and offer Retry
  clearTimeout(wd); const a = r.addr; wd = setTimeout(() => { if (cur?.addr === a && r.chain === 'solana' && !flows.has(a)) { flows.set(a, { error: true }); paint(); } }, 45000); });
document.getElementById('lang')?.addEventListener('click', () => setTimeout(paint, 0));
let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (document.getElementById('bp-cv')) paint(); }, 200); });
