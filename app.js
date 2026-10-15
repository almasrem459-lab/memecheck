import { analyze, detectChain } from './core.js?v=1792080000';
import { T, usd } from './i18n.js?v=1792080000';
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
const shareUrl = (r) => `${SITE}?ca=${encodeURIComponent(r.addr)}&chain=${encodeURIComponent(r.chain)}`;
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
  $('#addr').placeholder = t.placeholder; $('#lang').textContent = t.lang; $('#chain option[value=auto]').textContent = t.auto;
  onInput(); chips(); pfToggle(); if (last) render(last, true);
}
function onInput() {
  const k = detectChain($('#addr').value); const t = T[lang];
  $('#chain').style.display = k === 'evm' ? '' : 'none';
  $('#det').textContent = k ? `${t.detected}: ${k === 'solana' ? t.solana : t.evm}` : '';
}
const pc = (v) => v === null || v === undefined ? '—' : `<span dir="ltr" class="${v >= 0 ? 'up' : 'dn'}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
const SLOTS = ['db-box', 'ex-box', 'bm-box'];
function render(r, fire) {
  const t = T[lang], m = r.meta, v = r.verdict; const st = { pass: t.pass, warn: t.warn, fail: t.failS, na: t.na };
  const order = { fail: 0, warn: 1, na: 2, pass: 3 };
  const fs = [...r.findings].sort((a, b) => order[a.status] - order[b.status]);
  const ageH = m.created ? (Date.now() - m.created) / 3.6e6 : null;
  const out = $('#out'); const keep = out.dataset.addr === r.addr ? SLOTS.map(id => document.getElementById(id)) : [];
  const wl = isWatched(r.addr);
  out.dataset.addr = r.addr;
  out.innerHTML = `
  <div class="card verdict" id="vcard"><div class="badge ${v.level}">${t[v.level]}${r.partial ? ' <span class="spin"></span>' : ''}</div>
   <div class="tok">${m.image ? `<img src="${esc(m.image)}" alt="">` : ''} <b>${esc(m.name || '?')}</b> <span class="muted">$${esc(m.symbol || '')} · ${esc(CH[r.chain] || r.chain)}</span>
   <div class="mono muted" dir="ltr">${esc(r.addr)}</div><div class="muted">${v.points} ${t.riskPts}${m.url ? ` · <a href="${esc(m.url)}" target="_blank" rel="noopener">${t.viewDex}</a>` : ''}</div>
   ${m.dropFromHigh >= 90 ? `<div class="dn" style="margin-top:6px;font-weight:700">⚠️ ${esc(t.crashed(m.dropFromHigh))}</div>` : ''}
   ${r.partial ? `<div class="muted">${t.partial}</div>` : ''}</div>
   <div class="acts"><button type="button" class="ghost act" id="a-star" aria-pressed="${wl}" title="${wl ? t.unstar : t.star}">${wl ? '★' : '☆'}</button>
    <a class="ghost act" id="a-x" target="_blank" rel="noopener" href="https://x.com/intent/tweet?text=${encodeURIComponent(t.shareText(m.symbol || '?', t.lvlWord[v.level] || v.level))}&url=${encodeURIComponent(shareUrl(r))}"><b>𝕏</b> ${t.shareX}</a>
    <button type="button" class="ghost act" id="a-ca">${t.copyCA}</button><button type="button" class="ghost act" id="a-link">${t.copyLink}</button>
    <button type="button" class="ghost act" id="a-img">${navigator.canShare ? t.shareImg : t.dlImg}</button></div></div>
  <div class="card"><h3>${t.market}</h3><div class="grid">
   ${[[t.price, usd(m.priceUsd)], [t.mcap, usd(m.mcap)], [t.fdv, usd(m.fdv)], [t.liq, usd(m.liquidity)], [t.vol, usd(m.vol24)], [t.txns, m.buys24 != null ? `<span dir="ltr">${m.buys24} / ${m.sells24}</span>` : '—'],
      [`${t.change} <span dir="ltr">${t.ch1h24}</span>`, `<span dir="ltr">${pc(m.ch?.h1)} / ${pc(m.ch?.h24)}</span>`], [t.pairAge, ageH == null ? '—' : ageH < 48 ? ageH.toFixed(1) + (lang === 'ar' ? ' ساعة' : ' h') : (ageH / 24).toFixed(0) + (lang === 'ar' ? ' يوم' : ' d')], [t.holders, m.totalHolders ?? '—']]
      .map(([k, val]) => `<div class="kv"><span>${k}</span><b>${val}</b></div>`).join('')}</div></div>
  <div class="card" id="fcard"><h3>${t.findings}</h3>${r.pending.filter(k => k !== 'DexScreener').map(k => `<div class="row"><span class="st na"><span class="spin sm"></span></span><span>${esc(t.waiting(k))}</span></div>`).join('')}${fs.map(f => `<div class="row"><span class="st ${f.status}">${st[f.status]}</span><span>${esc((t.r[f.id] || (() => f.id))(f.params, f.status))}</span></div>`).join('')}</div>
  <div id="db-box"></div><div id="ex-box"></div><div id="bm-box" class="card"></div>
  ${r.extra.holders?.length ? `<div class="card"><h3>${t.topHolders}</h3>${r.extra.holders.map((h, i) => `<div class="row"><span class="st na">#${i + 1}</span><span class="mono">${esc(h.owner)}</span><b style="margin-inline-start:auto" dir="ltr">${(+h.pct).toFixed(2)}%</b></div>`).join('')}</div>` : ''}
  ${r.flags.length ? `<div class="card"><h3>${t.flags}</h3>${r.flags.map(x => `<div class="row"><span class="st ${x.level === 'danger' || x.level === 'high' ? 'fail' : 'warn'}">${esc(x.level)}</span><span dir="ltr">${esc(x.name)}${x.desc ? ' — ' + esc(x.desc) : ''}</span></div>`).join('')}</div>` : ''}
  <div class="card"><h3>${t.sources}</h3>${Object.entries(r.sources).map(([k, s]) => `<div class="row"><span class="st ${s === 'ok' ? 'pass' : 'na'}">${s === 'ok' ? t.ok : s === 'empty' ? t.empty : t.fail}</span><span>${k}</span></div>`).join('')}</div>`;
  keep.forEach((n, i) => { if (n) document.getElementById(SLOTS[i]).replaceWith(n); });
  $('#a-star').onclick = () => { toggleWatch(r); render(r); };
  const copy = (txt, btn) => navigator.clipboard?.writeText(txt).then(() => { const o = btn.textContent; btn.textContent = t.copied; setTimeout(() => btn.textContent = o, 1200); });
  // sharing: ask the server to cache the risk result (server-side compute + budget-guarded KV write) so the link preview shows it
  const warm = () => { if (warmed.has(r.addr) || !['solana', 'ethereum', 'base', 'bsc'].includes(r.chain)) return; warmed.add(r.addr); fetch(`/api/deep?ca=${encodeURIComponent(r.addr)}&chain=${r.chain}&kind=core`, { keepalive: true }).catch(() => {}); };
  $('#a-x').addEventListener('click', warm);
  $('#a-ca').onclick = (e) => copy(r.addr, e.currentTarget); $('#a-link').onclick = (e) => { warm(); copy(shareUrl(r), e.currentTarget); };
  $('#a-img').onclick = () => { warm(); shareImage(r); };
  document.body.classList.add('has-result'); pfToggle();
  if (fire) document.dispatchEvent(new CustomEvent('mc:render', { detail: { r, lang } })); // extra analyses (devbundle-ui.js, extras.js, bubble-ui.js)
}
// ---- score card -> PNG (canvas) ----
const LV = { low: ['#0f3d2a', '#3ee08f'], medium: ['#3d3510', '#ffd447'], high: ['#40220f', '#ff8f3e'], extreme: ['#4a0f17', '#ff4d6a'], unknown: ['#222', '#aaa'] };
function cardCanvas(r) {
  const t = T.en, W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0b0f17'); bg.addColorStop(1, '#141c2e'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = '#4f7cff'; g.fillRect(0, 0, W, 8);
  const F = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  g.fillStyle = '#e6e9ef'; g.font = F(800, 40); g.fillText('🛡️ MemeCheck', 60, 80);
  g.fillStyle = '#9aa4b8'; g.font = F(500, 26); g.fillText('Meme-coin safety check', 60, 120);
  const m = r.meta, v = r.verdict, [b1, b2] = LV[v.level] || LV.unknown;
  g.fillStyle = '#e6e9ef'; g.font = F(800, 64); g.fillText(('$' + (m.symbol || '?')).slice(0, 18), 60, 230);
  g.fillStyle = '#9aa4b8'; g.font = F(500, 28); g.fillText(`${(m.name || '').slice(0, 40)} · ${CH0[r.chain] || r.chain}`, 60, 275);
  g.font = '22px ui-monospace, monospace'; g.fillStyle = '#7d879c'; g.fillText(r.addr, 60, 315);
  const lbl = t[v.level] || v.level; g.font = F(800, 52); const bw = g.measureText(lbl).width + 60;
  g.fillStyle = b1; g.beginPath(); g.roundRect ? g.roundRect(60, 350, bw, 90, 18) : g.rect(60, 350, bw, 90); g.fill(); g.fillStyle = b2; g.fillText(lbl, 90, 413);
  g.fillStyle = '#e6e9ef'; g.font = F(700, 34); g.fillText(`${v.points} risk points`, 90 + bw, 410);
  const bad = r.findings.filter(f => f.status === 'fail' || f.status === 'warn').slice(0, 3);
  g.font = F(500, 24); bad.forEach((f, i) => { g.fillStyle = f.status === 'fail' ? '#ff4d6a' : '#ffd447'; let s = '• ' + (t.r[f.id] ? t.r[f.id](f.params, f.status) : f.id); if (s.length > 80) s = s.slice(0, 78) + '…'; g.fillText(s, 60, 490 + i * 34); });
  g.fillStyle = '#7fa2ff'; g.font = F(600, 24); g.fillText('memecheck.pages.dev', 60, H - 30);
  g.fillStyle = '#7d879c'; g.font = F(400, 18); g.fillText('Not financial advice', W - 250, H - 30);
  return c;
}
async function shareImage(r) {
  const c = cardCanvas(r); const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const name = `memecheck-${(r.meta.symbol || r.addr.slice(0, 6)).replace(/[^\w-]/g, '')}.png`; const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer:coarse)').matches) { try { await navigator.share({ files: [file], text: T.en.shareText(r.meta.symbol || '?', T.en.lvlWord[r.verdict.level]), url: shareUrl(r) }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
window.__mcCard = cardCanvas;
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
  document.body.classList.add('has-result'); $('#pf-tg') && ($('#pf-tg').dataset.init = ''); pfToggle();
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
