import { analyze, detectChain, score } from './core.js?v=1792080000';
import { T, usd } from './i18n.js?v=nav1';
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
let lang = params.get('lang') || localStorage.getItem('mc_lang') || 'en'; if (!T[lang]) lang = 'en'; let last = null, runId = 0;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SITE = 'https://memecheck.pages.dev/';
// GA4 events (gtag snippet lives in index.html); never throws
const ga = (n, p) => { try { if (typeof gtag === 'function') gtag('event', n, p); } catch {} }; window.__mcGa = ga;
const CH0 = { solana: 'Solana', ethereum: 'Ethereum', bsc: 'BSC', base: 'Base' }, CHAR = { solana: 'سولانا', ethereum: 'إيثريوم', bsc: 'BSC', base: 'Base' };
const CH = new Proxy({}, { get: (_, k) => (lang === 'ar' ? CHAR : CH0)[k] });
// ---- recent searches + watchlist (localStorage) ----
const ls = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
const warmed = new Set();
const shareUrl = (r) => `${SITE}?ca=${encodeURIComponent(r.addr)}${r.chain === 'solana' ? '' : '&chain=' + encodeURIComponent(r.chain)}`; // Solana is auto-detected
function remember(r) {
  const it = { a: r.addr, c: r.chain, s: r.meta.symbol || r.addr.slice(0, 4) + '…' };
  ls.set('mc_recent', [it, ...ls.get('mc_recent').filter(x => x.a !== it.a)].slice(0, 8));
  const w = ls.get('mc_watch'); const i = w.findIndex(x => x.a === it.a); if (i >= 0 && w[i].s !== it.s) { w[i] = it; ls.set('mc_watch', w); }
  chips();
}
const isWatched = (a) => ls.get('mc_watch').some(x => x.a === a);
function toggleWatch(r) {
  const w = ls.get('mc_watch'); const it = { a: r.addr, c: r.chain, s: r.meta.symbol || r.addr.slice(0, 4) + '…' };
  ls.set('mc_watch', isWatched(r.addr) ? w.filter(x => x.a !== r.addr) : [it, ...w].slice(0, 30)); chips();
}
function chips() {
  const t = T[lang], rec = ls.get('mc_recent'), w = ls.get('mc_watch');
  const chip = (x, star) => `<button type="button" class="cchip" data-a="${esc(x.a)}" data-c="${esc(x.c)}" title="${esc(x.a)}">${star ? '★ ' : ''}<span dir="ltr">$${esc(String(x.s).replace(/^\$/, ''))}</span> <small>${esc(CH[x.c] || x.c)}</small></button>`;
  $('#chips').innerHTML = (w.length ? `<div class="chrow"><span class="chl">★ ${t.watch}</span>${w.map(x => chip(x, 1)).join('')}</div>` : '') +
    (rec.length ? `<div class="chrow"><span class="chl">${t.recent}</span>${rec.map(x => chip(x)).join('')}<button type="button" class="cchip clr" id="clr-rec">${t.clear}</button></div>` : '');
}
$('#chips').addEventListener('click', (e) => {
  if (e.target.closest('#clr-rec')) { ls.set('mc_recent', []); chips(); return; }
  const b = e.target.closest('.cchip'); if (!b) return;
  $('#addr').value = b.dataset.a; $('#chain').value = b.dataset.c === 'solana' ? 'auto' : b.dataset.c; onInput(); run(null, 'recent');
});
function applyLang() {
  const t = T[lang]; document.documentElement.lang = lang; document.documentElement.dir = t.dir;
  document.querySelectorAll('[data-t]').forEach(e => e.textContent = t[e.dataset.t]);
  const nt = document.getElementById('nav-toggle'); if (nt) nt.setAttribute('aria-label', t.navMenu);
  $('#addr').placeholder = t.placeholder; $('#lang').textContent = t.lang; $('#chain option[value=auto]').textContent = t.auto;
  onInput(); chips(); pfToggle(); syncBack(); if (last) render(last, true);
}
function onInput() {
  const k = detectChain($('#addr').value); const t = T[lang];
  $('#chain').style.display = k === 'evm' ? '' : 'none';
  $('#det').textContent = k ? `${t.detected}: ${k === 'solana' ? t.solana : t.evm}` : '';
}
const pc = (v) => v === null || v === undefined ? '—' : `<span dir="ltr" class="${v >= 0 ? 'up' : 'dn'}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
const SLOTS = ['dh-box', 'db-box', 'ex-box', 'bm-box', 'lf-box', 'sn-box'];
// Developer history (devhist-ui.js -> window.__mcDevHist) becomes one finding. Conservative score nudge: FAIL (serial
// launcher / >= 3 dead-or-rugged coins) = +10 risk points, WARN (2+ dead) = +3 (half of weight 6), PASS = +0. Never critical.
// "Risk unknown" stays unknown (no market/security data). The shared server snapshot (/api/deep core, OG image) is not nudged.
const DEVW = { fail: 10, warn: 6, pass: 6 };
function withDev(r) {
  const d = r.chain === 'solana' && window.__mcDevHist?.get(r.addr);
  if (!d?.ok || !DEVW[d.flag] || r.findings.some(f => f.id === 'devHistory')) return r;
  const f = { id: 'devHistory', status: d.flag, weight: DEVW[d.flag], params: { total: d.total, bad: d.bad, checked: d.checked, live: d.live, old: d.checked - (d.new || 0) }, critical: false };
  const findings = [...r.findings, f], v = score(findings);
  if (r.verdict.level === 'unknown' && v.level === 'low') v.level = 'unknown';
  return { ...r, findings, verdict: v };
}
document.addEventListener('mc:devhist', (e) => { if (last && last.addr === e.detail.addr && $('#out').dataset.addr === last.addr) render(last); });
function render(r0, fire) {
  const r = withDev(r0);
  const t = T[lang], m = r.meta, v = r.verdict; const st = { pass: t.pass, warn: t.warn, fail: t.failS, na: t.na };
  const order = { fail: 0, warn: 1, na: 2, pass: 3 };
  const fs = [...r.findings].sort((a, b) => order[a.status] - order[b.status]);
  const ageH = m.created ? (Date.now() - m.created) / 3.6e6 : null;
  const out = $('#out'); const keep = out.dataset.addr === r.addr ? SLOTS.map(id => document.getElementById(id)) : [];
  const wl = isWatched(r.addr);
  out.dataset.addr = r.addr;
  out.innerHTML = `
  <div class="backrow"><button type="button" class="ghost act" id="a-new">${t.newCheck}</button></div>
  <div class="card verdict" id="vcard"><div class="badge ${v.level}">${t[v.level]}${r.partial ? ' <span class="spin"></span>' : ''}</div>
   <div class="tok">${m.image ? `<img src="${esc(m.image)}" alt="">` : ''} <b>${esc(m.name || '?')}</b> <span class="muted">$${esc(m.symbol || '')} · ${esc(CH[r.chain] || r.chain)}</span>
   <div class="mono muted" dir="ltr">${esc(r.addr)}</div><div class="muted">${v.points} ${t.riskPts}${m.url ? ` · <a href="${esc(m.url)}" target="_blank" rel="noopener">${t.viewDex}</a>` : ''}</div>
   ${m.dropFromHigh >= 90 ? `<div class="dn" style="margin-top:6px;font-weight:700">⚠️ ${esc(t.crashed(m.dropFromHigh))}</div>` : ''}
   ${r.partial ? `<div class="muted">${t.partial}</div>` : ''}</div>
   <div class="acts"><button type="button" class="ghost act" id="a-star" aria-pressed="${wl}" title="${wl ? t.unstar : t.star}">${wl ? '★' : '☆'}</button>
    <a class="ghost act" id="a-x" target="_blank" rel="noopener" href="${esc(xIntent(r))}"><b>𝕏</b> ${t.shareX}</a>
    <button type="button" class="ghost act" id="a-ca">${t.copyCA}</button><button type="button" class="ghost act" id="a-link">${t.copyLink}</button>
    <button type="button" class="ghost act" id="a-img">📸 ${t.shareRes}</button></div></div>
  <div class="card"><h3>${t.market}</h3><div class="grid">
   ${[[t.price, usd(m.priceUsd)], [t.mcap, usd(m.mcap)], [t.fdv, usd(m.fdv)], [t.liq, usd(m.liquidity)], [t.vol, usd(m.vol24)], [t.txns, m.buys24 != null ? `<span dir="ltr">${m.buys24} / ${m.sells24}</span>` : '—'],
      [`${t.change} <span dir="ltr">${t.ch1h24}</span>`, `<span dir="ltr">${pc(m.ch?.h1)} / ${pc(m.ch?.h24)}</span>`], [t.pairAge, ageH == null ? '—' : ageH < 48 ? ageH.toFixed(1) + (lang === 'ar' ? ' ساعة' : ' h') : (ageH / 24).toFixed(0) + (lang === 'ar' ? ' يوم' : ' d')], [t.holders, m.totalHolders ?? '—']]
      .map(([k, val]) => `<div class="kv"><span>${k}</span><b>${val}</b></div>`).join('')}</div></div>
  <div class="card" id="fcard"><h3>${t.findings}</h3>${r.pending.filter(k => k !== 'DexScreener').map(k => `<div class="row"><span class="st na"><span class="spin sm"></span></span><span>${esc(t.waiting(k))}</span></div>`).join('')}${fs.map(f => `<div class="row"><span class="st ${f.status}">${st[f.status]}</span><span>${esc((t.r[f.id] || (() => f.id))(f.params, f.status))}</span></div>`).join('')}</div>
  <div id="dh-box"></div><div id="db-box"></div><div id="ex-box"></div><div id="bm-box" class="card"></div><div id="lf-box" class="card"></div><div id="sn-box" class="card"></div>
  ${r.extra.holders?.length ? `<div class="card"><h3>${t.topHolders}</h3>${r.extra.holders.map((h, i) => `<div class="row"><span class="st na">#${i + 1}</span><span class="mono">${esc(h.owner)}</span><b style="margin-inline-start:auto" dir="ltr">${(+h.pct).toFixed(2)}%</b></div>`).join('')}</div>` : ''}
  ${r.flags.length ? `<div class="card"><h3>${t.flags}</h3>${r.flags.map(x => `<div class="row"><span class="st ${x.level === 'danger' || x.level === 'high' ? 'fail' : 'warn'}">${esc(x.level)}</span><span dir="ltr">${esc(x.name)}${x.desc ? ' — ' + esc(x.desc) : ''}</span></div>`).join('')}</div>` : ''}
  <div class="card"><h3>${t.sources}</h3>${Object.entries(r.sources).map(([k, s]) => `<div class="row"><span class="st ${s === 'ok' ? 'pass' : 'na'}">${s === 'ok' ? t.ok : s === 'empty' ? t.empty : t.fail}</span><span>${k}</span></div>`).join('')}</div>`;
  keep.forEach((n, i) => { if (n) document.getElementById(SLOTS[i]).replaceWith(n); });
  $('#a-new').onclick = goHome; $('#a-star').onclick = () => { toggleWatch(r); render(r0); };
  const copy = (txt, btn) => navigator.clipboard?.writeText(txt).then(() => { const o = btn.textContent; btn.textContent = t.copied; setTimeout(() => btn.textContent = o, 1200); });
  // sharing: ask the server to cache the risk result (server-side compute + budget-guarded KV write) so the link preview shows it
  const warm = () => { if (warmed.has(r.addr) || !['solana', 'ethereum', 'base', 'bsc'].includes(r.chain)) return; warmed.add(r.addr); fetch(`/api/deep?ca=${encodeURIComponent(r.addr)}&chain=${r.chain}&kind=core`, { keepalive: true }).catch(() => {}); };
  $('#a-x').addEventListener('click', () => { warm(); ga('share_x_click', { ca: r.addr, risk_level: r.verdict.level, where: 'result' }); });
  $('#a-ca').onclick = (e) => copy(r.addr, e.currentTarget); $('#a-link').onclick = (e) => { warm(); copy(shareUrl(r), e.currentTarget); };
  $('#a-img').onclick = () => { warm(); openShare(r); };
  document.body.classList.add('has-result'); pfToggle(); syncBack();
  if (fire) document.dispatchEvent(new CustomEvent('mc:render', { detail: { r, lang } })); // extra analyses (devbundle-ui.js, extras.js, bubble-ui.js, flows-ui.js, snipers-ui.js)
}
// ---- shareable result card: PNG drawn client-side (canvas 1200x675), in the current language (RTL aware) ----
const LV = { low: ['#0f3d2a', '#3ee08f'], medium: ['#3d3510', '#ffd447'], high: ['#40220f', '#ff8f3e'], extreme: ['#4a0f17', '#ff4d6a'], unknown: ['#222833', '#aab2c0'] };
const loadImg = (src, ms = 3000) => new Promise((ok) => {
  if (!src) return ok(null); const i = new Image(); i.crossOrigin = 'anonymous'; i.decoding = 'async';
  const tm = setTimeout(() => ok(null), ms); i.onload = () => { clearTimeout(tm); ok(i.naturalWidth ? i : null); }; i.onerror = () => { clearTimeout(tm); ok(null); }; i.src = src;
});
const pixelsOk = (img) => { try { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1, 1); g.getImageData(0, 0, 1, 1); return true; } catch { return false; } };
// token logo: direct (if the CDN sends CORS headers) -> same-origin relay /api/img -> skipped (canvas must stay untainted)
async function logoOf(url) {
  if (!url || !/^https:\/\//.test(url)) return null;
  const relay = ['/api/img?url=' + encodeURIComponent(url), 5000], direct = [url, 2500];
  let host = ''; try { host = new URL(url).hostname; } catch {}
  const order = /(^|\.)(dexscreener\.com|ipfs\.io|pinata\.cloud|cf-ipfs\.com|coingecko\.com|arweave\.net)$/.test(host) ? [relay] : [direct, relay]; // those CDNs send no CORS headers
  for (const [u, ms] of order) { const i = await loadImg(u, ms); if (i && pixelsOk(i)) return i; }
  return null;
}
const shortCa = (a) => a.length > 16 ? a.slice(0, 6) + '…' + a.slice(-6) : a;
const xIntent = (r) => { const t = T[lang]; return `https://x.com/intent/tweet?text=${encodeURIComponent(t.shareText(r.meta.symbol || '?', t.lvlWord[r.verdict.level] || r.verdict.level) + ` (${r.verdict.points} ${T.en.riskPts})`)}&url=${encodeURIComponent(shareUrl(r))}`; };
function cardCanvas(r, lg = lang, logo = null, icon = null) {
  const t = T[lg] || T.en, rtl = t.dir === 'rtl', W = 1200, H = 675, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const m = r.meta, v = r.verdict, [b1, b2] = LV[v.level] || LV.unknown;
  const X = (x) => rtl ? W - x : x; // layout is written left-to-right and mirrored for Arabic
  const F = (w, s, mono) => mono ? `${w} ${s}px ui-monospace, Menlo, Consolas, monospace` : `${w} ${s}px system-ui, -apple-system, "Segoe UI", Tahoma, "Noto Sans Arabic", sans-serif`;
  const fit = (s, max) => { s = String(s ?? ''); if (g.measureText(s).width <= max) return s; while (s && g.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; };
  // side: 'start' | 'end' | 'center' in layout terms; ltr: force LTR shaping (addresses, $SYMBOL, URLs)
  const text = (s, x, y, font, color, { side = 'start', max = 0, ltr = false } = {}) => {
    g.font = font; g.fillStyle = color; g.direction = ltr || !rtl ? 'ltr' : 'rtl';
    g.textAlign = side === 'center' ? 'center' : (side === 'start') !== rtl ? 'left' : 'right';
    g.fillText(max ? fit(s, max) : String(s), X(x), y);
  };
  const rr = (x, y, w, h, rad) => { g.beginPath(); if (g.roundRect) g.roundRect(rtl ? W - x - w : x, y, w, h, rad); else g.rect(rtl ? W - x - w : x, y, w, h); };
  // background
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0b0f17'); bg.addColorStop(1, '#141c2e'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(X(980), 200, 10, X(980), 200, 420); glow.addColorStop(0, b2 + '30'); glow.addColorStop(1, b2 + '00'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.fillStyle = b2; g.fillRect(0, 0, W, 10);
  // header: brand + date
  if (icon) { g.save(); rr(60, 34, 48, 48, 10); g.clip(); g.drawImage(icon, rtl ? W - 108 : 60, 34, 48, 48); g.restore(); }
  text('MemeCheck', icon ? 122 : 60, 70, F(800, 34), '#e6e9ef', { ltr: true });
  g.font = F(800, 34); const bw = g.measureText('MemeCheck').width;
  text(t.cardTag, (icon ? 122 : 60) + bw + 18, 70, F(500, 22), '#9aa4b8', { max: 360 });
  let date; try { date = new Date().toLocaleDateString(lg === 'ar' ? 'ar' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { date = new Date().toISOString().slice(0, 10); }
  text(date, W - 60, 70, F(500, 22), '#9aa4b8', { side: 'end' });
  // token block
  const LX = 60, LY = 128, LS = 132;
  g.save(); g.beginPath(); g.arc(X(LX + LS / 2), LY + LS / 2, LS / 2, 0, Math.PI * 2); g.closePath(); g.fillStyle = '#1c2333'; g.fill();
  if (logo) { g.clip(); g.drawImage(logo, X(LX + LS / 2) - LS / 2, LY, LS, LS); }
  else { g.fillStyle = '#7fa2ff'; g.font = F(800, 60); g.textAlign = 'center'; g.direction = 'ltr'; g.fillText(String(m.symbol || '?').replace(/^\$/, '').slice(0, 1).toUpperCase(), X(LX + LS / 2), LY + LS / 2 + 21); }
  g.restore();
  g.strokeStyle = b2; g.lineWidth = 4; g.beginPath(); g.arc(X(LX + LS / 2), LY + LS / 2, LS / 2 + 2, 0, Math.PI * 2); g.stroke();
  const TX = LX + LS + 28, TW = 780 - TX;
  text('$' + String(m.symbol || '?').replace(/^\$/, ''), TX, LY + 62, F(800, 60), '#e6e9ef', { max: TW, ltr: true });
  text(`${m.name || ''}${m.name ? ' · ' : ''}${CH[r.chain] || r.chain}`, TX, LY + 104, F(500, 28), '#9aa4b8', { max: TW });
  text('CA ' + shortCa(r.addr), TX, LY + 142, F(500, 24, true), '#7d879c', { ltr: true });
  // risk panel
  const PX = 820, PY = 112, PW = 320, PH = 176;
  rr(PX, PY, PW, PH, 22); g.fillStyle = b1; g.fill(); g.lineWidth = 3; g.strokeStyle = b2; g.stroke();
  text(t.risk, PX + PW / 2, PY + 42, F(700, 22), b2 + 'cc', { side: 'center' });
  let ls = 44; g.font = F(800, ls); while (ls > 26 && g.measureText(t[v.level] || v.level).width > PW - 30) g.font = F(800, --ls); // shrink to fit, never cut the level
  text(t[v.level] || v.level, PX + PW / 2, PY + 100, F(800, ls), b2, { side: 'center', max: PW - 20 });
  text(`${v.points} ${t.riskPts}`, PX + PW / 2, PY + 146, F(700, 26), '#e6e9ef', { side: 'center', max: PW - 30 });
  // reasons
  g.fillStyle = '#1c2333'; g.fillRect(60, 306, W - 120, 2);
  const order = { fail: 0, warn: 1 };
  const bad = r.findings.filter(f => f.status === 'fail' || f.status === 'warn').sort((a, b) => order[a.status] - order[b.status] || b.weight - a.weight).slice(0, 3);
  const say = (f) => { const s = String(t.r[f.id] ? t.r[f.id](f.params, f.status) : f.id); return rtl ? s.replace(/[$]?\d[\d.,]*[%KMB]?(?:\s?\/\s?\d[\d.,]*%?)?/g, '\u2066$&\u2069') : s; }; // keep $1.2K / 30% LTR inside Arabic
  text(bad.length ? t.cardWhy : t.cardClean, 60, 348, F(700, 22), '#9aa4b8', { max: W - 120 });
  const list = bad.length ? bad : r.findings.filter(f => f.status === 'pass').sort((a, b) => b.weight - a.weight).slice(0, 2);
  // each reason wraps to at most 2 lines (word-wise), the second line is ellipsized
  const RW = W - 156, RF = F(500, list.length > 2 ? 24 : 27), LH = list.length > 2 ? 30 : 34; let y = 394;
  const lines = (s) => { g.font = RF; if (g.measureText(s).width <= RW) return [s]; const w = s.split(' '); let a = '';
    for (let k = 0; k < w.length; k++) { const n = a ? a + ' ' + w[k] : w[k]; if (g.measureText(n).width > RW && a) return [a, w.slice(k).join(' ')]; a = n; } return [a]; };
  list.forEach((f) => {
    const col = f.status === 'fail' ? '#ff4d6a' : f.status === 'warn' ? '#ffd447' : '#3ee08f';
    g.fillStyle = col; g.beginPath(); g.arc(X(72), y - 9, 8, 0, Math.PI * 2); g.fill();
    lines(say(f)).forEach((ln, k) => text(ln, 96, y + k * LH, RF, k ? '#c4cad6' : '#e6e9ef', { max: RW }));
    y += LH * lines(say(f)).length + 14;
  });
  // footer
  g.fillStyle = '#1c2333'; g.fillRect(60, 584, W - 120, 2);
  text('memecheck.pages.dev', 60, 634, F(700, 30), '#7fa2ff', { ltr: true });
  text(t.cardNfa, W - 60, 634, F(400, 20), '#7d879c', { side: 'end', max: 560 });
  return c;
}
let scUrl = null;
function closeShare() { document.getElementById('sc-modal')?.remove(); if (scUrl) { URL.revokeObjectURL(scUrl); scUrl = null; } document.removeEventListener('keydown', scKey); }
const scKey = (e) => { if (e.key === 'Escape') closeShare(); };
async function openShare(r) {
  const t = T[lang]; closeShare();
  ga('share_card_open', { ca: r.addr, chain: r.chain, risk_level: r.verdict.level, score: r.verdict.points, lang });
  const m = document.createElement('div'); m.className = 'mc-modal sc-modal'; m.id = 'sc-modal'; m.dir = t.dir;
  m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', t.shareRes);
  m.innerHTML = `<div class="sc-box"><div class="sc-head"><h3>${t.shareRes}</h3><button type="button" class="ghost act" id="sc-close" aria-label="${t.close}">✕</button></div>
    <div class="sc-prev" id="sc-prev"><span class="spin"></span> ${t.cardMaking}</div>
    <div class="sc-acts"><button type="button" class="act sc-main" id="sc-ns" hidden>📤 ${t.shareNative}</button><button type="button" class="act sc-main" id="sc-dl" disabled>⬇ ${t.dlImg}</button>
    <a class="ghost act" id="sc-xl" target="_blank" rel="noopener" href="${esc(xIntent(r))}"><b>𝕏</b> ${t.shareX}</a><button type="button" class="ghost act" id="sc-cp">🔗 ${t.copyLink}</button></div>
    <p class="muted sc-tip">${t.cardTip}</p></div>`;
  document.body.append(m); document.addEventListener('keydown', scKey);
  m.addEventListener('click', (e) => { if (e.target === m) closeShare(); }); m.querySelector('#sc-close').onclick = closeShare;
  m.querySelector('#sc-xl').addEventListener('click', () => ga('share_x_click', { ca: r.addr, risk_level: r.verdict.level, where: 'card' }));
  m.querySelector('#sc-cp').onclick = (e) => { const b = e.currentTarget, o = b.textContent; navigator.clipboard?.writeText(shareUrl(r)).then(() => { b.textContent = '✓ ' + t.copied; setTimeout(() => b.textContent = o, 1200); }).catch(() => {}); ga('share_link_copy', { ca: r.addr, where: 'card' }); };
  m.querySelector('#sc-close').focus();
  let blob;
  try {
    const [logo, icon] = await Promise.all([logoOf(r.meta.image), loadImg('/icon-192.png', 2000)]);
    const c = cardCanvas(r, lang, logo, icon); blob = await new Promise(res => c.toBlob(res, 'image/png'));
    if (!blob) throw new Error('toBlob');
  } catch { const p = m.querySelector('#sc-prev'); if (p) p.innerHTML = `<span class="muted">${t.cardErr}</span>`; return; }
  if (!m.isConnected) return;
  scUrl = URL.createObjectURL(blob);
  m.querySelector('#sc-prev').innerHTML = `<img src="${scUrl}" alt="${esc(t.shareRes)}: $${esc(r.meta.symbol || '?')} — ${esc(t[r.verdict.level] || '')}" width="1200" height="675">`;
  const name = `memecheck-${(r.meta.symbol || r.addr.slice(0, 6)).replace(/[^\w-]/g, '') || 'token'}.png`, file = new File([blob], name, { type: 'image/png' });
  const dl = m.querySelector('#sc-dl'); dl.disabled = false;
  dl.onclick = () => { const a = document.createElement('a'); a.href = scUrl; a.download = name; document.body.append(a); a.click(); a.remove(); ga('share_card_download', { ca: r.addr, risk_level: r.verdict.level, method: 'download' }); };
  let canFile = false; try { canFile = !!navigator.canShare?.({ files: [file] }); } catch {}
  if (canFile) {
    const ns = m.querySelector('#sc-ns'); ns.hidden = false; if (!matchMedia('(pointer:coarse)').matches) ns.classList.remove('sc-main');
    ns.onclick = async () => { try { await navigator.share({ files: [file], text: T[lang].shareText(r.meta.symbol || '?', T[lang].lvlWord[r.verdict.level] || r.verdict.level), url: shareUrl(r) }); ga('share_card_download', { ca: r.addr, risk_level: r.verdict.level, method: 'web_share' }); } catch (e) { if (e?.name !== 'AbortError') dl.click(); } };
  }
}
window.__mcCard = cardCanvas;
// ---- back to home (clear result, restore search UI, no full reload) ----
function syncBack() {
  const t = T[lang]; let b = $('#back-home');
  if (!b) {
    b = document.createElement('button'); b.type = 'button'; b.id = 'back-home';
    b.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    document.body.appendChild(b); b.onclick = goHome;
  }
  b.hidden = !document.body.classList.contains('has-result');
  b.setAttribute('aria-label', t.backHome);
}
function goHome() {
  runId++; last = null; window.__done = false;
  document.body.classList.remove('has-result');
  const out = $('#out'); out.innerHTML = ''; out.dataset.addr = '';
  $('#addr').value = ''; $('#go').disabled = false; onInput();
  const q = new URLSearchParams(location.search); q.delete('ca'); q.delete('a'); q.delete('chain');
  const s = q.toString(); history.replaceState(null, '', (s ? '?' + s : location.pathname) + location.hash);
  const tg = $('#pf-tg'); if (tg) { tg.dataset.init = ''; $('#pf').classList.remove('collapsed'); }
  pfToggle(); syncBack();
  window.scrollTo(0, 0); requestAnimationFrame(() => $('#addr').focus());
  ga('back_home', {});
}
// ---- trending list collapses once a result is showing ----
function pfToggle() {
  const t = T[lang], has = document.body.classList.contains('has-result'); let b = $('#pf-tg');
  if (!b) { b = document.createElement('button'); b.type = 'button'; b.id = 'pf-tg'; b.className = 'ghost'; $('#pf').before(b); b.onclick = () => { $('#pf').classList.toggle('collapsed'); pfToggle(); }; }
  b.hidden = !has; if (has && !b.dataset.init) { b.dataset.init = 1; $('#pf').classList.add('collapsed'); }
  b.textContent = $('#pf').classList.contains('collapsed') ? '▾ ' + t.showTrend : '▴ ' + t.hideTrend;
}
async function run(e, src) {
  e?.preventDefault(); const a = $('#addr').value.trim(); const t = T[lang]; const my = ++runId;
  const source = src || (e && !e.submitter ? 'trending' : 'form'), k0 = detectChain(a), gch = k0 === 'solana' ? 'solana' : $('#chain').value;
  ga('scan_start', { chain: gch, ca: a, source });
  if (!k0) { ga('scan_error', { chain: gch, ca: a, source, error: 'invalid_address' }); $('#out').innerHTML = `<div class="card">${t.invalid}</div>`; return; }
  $('#out').dataset.addr = ''; $('#out').innerHTML = `<div class="card"><span class="spin"></span> ${t.checking}</div>`; $('#go').disabled = true;
  document.body.classList.add('has-result'); $('#pf-tg') && ($('#pf-tg').dataset.init = ''); pfToggle(); syncBack();
  let fired = false;
  // Prewarmed server snapshot of the main check (read-only peek): shows instantly, then the live check replaces it.
  const kind0 = detectChain(a), sel = $('#chain').value;
  const chs = kind0 === 'solana' ? ['solana'] : (['ethereum', 'bsc', 'base'].includes(sel) ? [sel] : ['ethereum', 'bsc', 'base']);
  Promise.any(chs.map(c => fetch(`/api/cache?kind=core&chain=${c}&ca=${encodeURIComponent(a)}`).then(r => r.ok ? r.json() : Promise.reject()).then(j => j?.data && j.lv >= 2 ? j : Promise.reject()))).then(j => { // lv: core-logic version (older snapshots used the stale pump.fun curve price)
    if (my !== runId || fired || !j?.data?.verdict) return; const p = { ...j.data, cachedAt: j.at }; last = p; render(p, true); fired = true; }).catch(() => {});
  try {
    const r = await analyze(a, detectChain(a) === 'evm' ? $('#chain').value : 'solana', (p) => { if (my !== runId) return; last = p; render(p, !fired); fired = true; });
    if (my !== runId) return;
    last = r; render(r, true); window.__done = true; remember(r);
    ga('scan_result', { chain: r.chain, risk_level: r.verdict?.level, score: r.verdict?.points, symbol: r.meta?.symbol || undefined, ca: r.addr, source });
    const q = new URLSearchParams(location.search); q.delete('a'); q.set('ca', r.addr); q.set('chain', r.chain);
    history.replaceState(null, '', '?' + q + location.hash);
  } catch (err) { if (my === runId) { $('#out').innerHTML = `<div class="card">${esc(err.message)}</div>`; ga('scan_error', { chain: gch, ca: a, source, error: String(err?.message || err).slice(0, 100) }); } }
  $('#go').disabled = false;
}
$('#f').addEventListener('submit', run); $('#addr').addEventListener('input', onInput);
$('#lang').addEventListener('click', () => { lang = lang === 'en' ? 'ar' : 'en'; localStorage.setItem('mc_lang', lang); applyLang(); ga('language_change', { lang }); });
// outbound links (DexScreener, X, Solscan, ...); trading-bot/swap links count as trade_click
const BOTS = { 'axiom.trade': 'axiom', 'photon-sol.tinyastro.io': 'photon', 'bullx.io': 'bullx', 'gmgn.ai': 'gmgn', 'jup.ag': 'jupiter', 't.me': 'telegram_bot' };
document.addEventListener('click', (e) => {
  const el = e.target.closest?.('a[href]'); if (!el) return; let u; try { u = new URL(el.href, location.href); } catch { return; }
  if (!/^https?:$/.test(u.protocol) || u.host === location.host) return;
  const d = u.hostname.replace(/^www\./, ''), pv = el.dataset.provider || Object.entries(BOTS).find(([h]) => d === h || d.endsWith('.' + h))?.[1];
  if (pv && (el.dataset.action || pv !== 'telegram_bot' || /bot/i.test(u.pathname))) ga('trade_click', { action: el.dataset.action || (/sell/i.test(el.textContent + u.search) ? 'sell' : 'buy'), provider: pv, risk_level: last?.verdict?.level, ca: last?.addr, link_url: u.href.slice(0, 100) });
  ga('outbound_click', { url: u.href.slice(0, 100), domain: d, link_id: el.id || undefined, ca: last?.addr });
}, true);
const ca = params.get('ca') || params.get('a'), pch = params.get('chain');
if (pch && $(`#chain option[value="${pch}"]`)) $('#chain').value = pch;
if (ca) $('#addr').value = ca;
applyLang(); if (ca) run(null, 'url');
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
