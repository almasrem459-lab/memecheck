import { T, usd } from './i18n.js?v=1793100200';
// Homepage speed: only app.js + i18n.js + nav.js load up front. core.js (the scanner), the result-section modules and the
// new-tokens list are imported on demand: the scanner + result modules when a scan starts (or a valid CA is pasted),
// the new-tokens list when it scrolls near the viewport. Result modules only listen for mc:render / mc:final events, so
// render() waits for them to finish importing before it dispatches (see fireRender).
const V = '1793100200';
// same rules as core.js detectChain (kept inline so the homepage does not need core.js before a scan)
function detectChain(addr) { addr = (addr || '').trim(); if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return 'evm'; if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return 'solana'; return null; }
let core = null, coreP = null, modsP = null, proof = null; // proof: 'Rugs we caught' card data (see loadProof)
let riskInsight = null;
const loadCore = () => coreP ||= Promise.all([
  import(`./core.js?v=${V}`),
  import(`./risk-insight.js?v=${V}`),
]).then(([m, ri]) => { core = m; riskInsight = ri; return m; });
const RESULT_MODS = ['devbundle-ui', 'devhist-ui', 'ai-ui', 'extras', 'bubble-ui', 'flows-ui', 'snipers-ui', 'bp-ui', 'swap', 'revenue-ui', 'social-ui']; // same order as the old <script> tags
const loadResultMods = () => modsP ||= Promise.allSettled(RESULT_MODS.map(n => import(`./${n}.js?v=${V}`))).then(() => {});
const warmScan = () => { loadCore().catch(() => { coreP = null; }); loadResultMods(); };
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
let lang = params.get('lang') || localStorage.getItem('mc_lang') || 'en'; if (!T[lang]) lang = 'en'; let last = null, runId = 0;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SITE = 'https://memecheck.pages.dev/';
// GA4 events (gtag snippet lives in index.html); never throws
const ga = (n, p) => { try { if (typeof gtag === 'function') gtag('event', n, p); } catch {} }; window.__mcGa = ga;
const CH0 = { solana: 'Solana', ethereum: 'Ethereum', bsc: 'BNB Chain', base: 'Base', arbitrum: 'Arbitrum' }, CHAR = { solana: 'سولانا', ethereum: 'إيثريوم', bsc: 'سلسلة BNB', base: 'Base', arbitrum: 'أربيتروم' };
const CHIP = { bsc: 'BNB', ethereum: 'ETH', base: 'BASE', arbitrum: 'ARB', solana: 'SOL' }; // small chain chip on the result card
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
  document.querySelectorAll('[data-t]').forEach(e => { const v = t[e.dataset.t]; if (typeof v === 'string' && e.textContent !== v) e.textContent = v; });
  const nt = document.getElementById('nav-toggle'); if (nt) nt.setAttribute('aria-label', t.navMenu);
  if ($('#addr').placeholder !== t.placeholder) $('#addr').placeholder = t.placeholder; $('#addr').setAttribute('aria-label', t.placeholder); $('#lang').textContent = t.lang; $('#chain option[value=auto]').textContent = t.auto;
  onInput(); chips(); pfToggle(); syncBack(); proofPaint(); if (last) render(last, true);
}
function onInput() {
  const k = detectChain($('#addr').value); const t = T[lang];
  $('#chain').style.display = 'none'; // EVM chain is auto-detected; the result card's chain chips switch it
  const d = $('#det'), txt = k ? `${t.detected}: ${k === 'solana' ? t.solana : t.evm}` : t.chainsHint;
  if (d.textContent !== txt) d.textContent = txt; d.classList.toggle('on', !!k);
  if (k) warmScan(); // a valid address is in the box: fetch the scanner + result modules now so Scan starts instantly
}
const pc = (v) => v === null || v === undefined ? '—' : `<span dir="ltr" class="${v >= 0 ? 'up' : 'dn'}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
const SLOTS = ['ai-box', 'dh-box', 'db-box', 'ex-box', 'bm-box', 'bp-box', 'lf-box', 'sn-box', 'so-box'];
// Developer history (devhist-ui.js -> window.__mcDevHist) becomes one finding. Conservative score nudge: FAIL (serial
// launcher / >= 3 dead-or-rugged coins) = +10 risk points, WARN (2+ dead) = +3 (half of weight 6), PASS = +0. Never critical.
// "Risk unknown" stays unknown (no market/security data). The shared server snapshot (/api/deep core, OG image) is not nudged.
// Liquidity-flows / sniper cards: rendered here with a loading skeleton so they exist after every scan, independent of the
// bubble map and of flows-ui.js / snipers-ui.js (which replace the skeleton). Watchdog: if a module never painted its card
// (script failed to load), show a friendly line with a reload button instead of an endless spinner or a vanished section.
const SK = { en: { bp: 'Buy / Sell pressure', lf: 'Liquidity flows', sn: 'Live sniper detection', load: 'Loading…', na: 'This section could not load.', retry: 'Retry' },
  ar: { bp: 'ضغط الشراء / البيع', lf: 'تدفقات السيولة', sn: 'كشف القناصة اللحظي', load: 'جارٍ التحميل…', na: 'تعذّر تحميل هذا القسم.', retry: 'إعادة المحاولة' } };
const skel = (k) => `<div id="${k}-box" class="card" data-skel="1"><h3>${SK[lang][k]}</h3><div><span class="spin"></span> ${SK[lang].load}</div></div>`;
let skelTm = 0;
function skelWatch() {
  clearTimeout(skelTm);
  skelTm = setTimeout(() => ['bp', 'lf', 'sn'].forEach(k => { const b = document.getElementById(k + '-box'); if (!b || b.dataset.skel !== '1') return;
    b.innerHTML = `<h3>${SK[lang][k]}</h3><span class="muted">${SK[lang].na}</span> <button type="button" class="ghost act">${SK[lang].retry}</button>`;
    b.querySelector('button').onclick = () => location.reload(); }), 20000);
}
const DEVW = { fail: 10, warn: 6, pass: 6 };
// Signals that used to be display-only (sniper bots, bubble-map clusters, liquidity flows, dev sell speed) are folded into the
// score once their module has data (window.__mcSig, event mc:signal). FAIL = full weight, WARN = half, like every other check.
function sigFindings(r) {
  const S = r.chain === 'solana' && window.__mcSig?.get(r.addr); if (!S) return [];
  const out = [], F = (id, status, weight, params) => ({ id, status, weight, params, critical: false });
  if (S.snipers) { const { pct, pro } = S.snipers; out.push(pct >= 25 || pro >= 12 ? F('sniperSig', 'fail', 12, S.snipers) : pct >= 12 || pro >= 6 ? F('sniperSig', 'warn', 12, S.snipers) : F('sniperSig', 'pass', 12, S.snipers)); }
  if (S.bubble) { const { pct, n } = S.bubble; out.push(n >= 2 && pct >= 15 ? F('bubbleSig', 'fail', 10, S.bubble) : n >= 2 && pct >= 5 ? F('bubbleSig', 'warn', 10, S.bubble) : F('bubbleSig', 'pass', 10, S.bubble)); }
  if (S.flows) out.push(F('flowSig', S.flows.level === 'wash' ? 'fail' : S.flows.level === 'suspicious' ? 'warn' : 'pass', 8, S.flows));
  if (S.devSell) { const { sold, ageH } = S.devSell; out.push(sold >= 50 && ageH != null && ageH < 6 ? F('devSellSig', 'fail', 10, S.devSell) : sold >= 50 ? F('devSellSig', 'warn', 10, S.devSell) : F('devSellSig', 'pass', 10, S.devSell)); }
  return out;
}
function withDev(r) {
  const d = r.chain === 'solana' && window.__mcDevHist?.get(r.addr);
  const add = [];
  if (d?.ok && DEVW[d.flag] && !r.findings.some(f => f.id === 'devHistory')) add.push({ id: 'devHistory', status: d.flag, weight: DEVW[d.flag], params: { total: d.total, bad: d.bad, checked: d.checked, live: d.live, old: d.checked - (d.new || 0) }, critical: false });
  add.push(...sigFindings(r).filter(f => !r.findings.some(x => x.id === f.id)));
  if (!add.length) return r;
  const findings = [...r.findings, ...add], v = core.score(findings);
  if (r.verdict.level === 'unknown' && v.level === 'low') v.level = 'unknown';
  return { ...r, findings, verdict: v };
}
let sigT = 0;
document.addEventListener('mc:signal', (e) => { if (last && last.addr === e.detail.addr && $('#out').dataset.addr === last.addr) { clearTimeout(sigT); sigT = setTimeout(() => render(last), 150); } });
// Tracker-measured outcome rates per level (/api/study). Shown on every result; never invented: if the sample is too small we say so.
let studyP = null; const studyGet = () => (studyP ||= fetch('/api/study?view=summary').then(r => r.ok ? r.json() : null).catch(() => null));
function probHtml(r, t) {
  const S = window.__mcStudy, lv = r.verdict.level === 'extreme' ? 'high' : r.verdict.level;
  if (!S || !S.byLevel || !['low', 'medium', 'high'].includes(lv)) return '';
  const x = S.byLevel[lv], base = S.base;
  if (!x || x.n < 10) return `<div class="prob muted">${esc(t.probFew(x?.n || 0))}</div>`;
  return `<div class="prob${lv === 'low' ? ' caveat' : ''}">${esc(t.probLine(t[lv] || lv, x.bad_pct, x.rug_pct, x.n, base?.bad_pct, S.from, S.to))} <a href="/accuracy">${esc(t.probMore)}</a></div>`;
}
// AI summary (ai-ui.js): the finished, dev-history-adjusted result only; null while a scan is still streaming
window.__mcLast = () => (window.__done && last && !last.partial ? withDev(last) : null);
document.addEventListener('mc:devhist', (e) => { if (last && last.addr === e.detail.addr && $('#out').dataset.addr === last.addr) render(last); });
// Result modules are imported lazily: wait for them (settled, so a failed module never blocks the others), then announce.
// Promise callbacks run in order, so partial/final renders still reach the modules in the order they happened.
function fireRender(r) {
  const lg = lang; skelWatch();
  loadResultMods().then(() => { if ($('#out').dataset.addr !== r.addr) return; document.dispatchEvent(new CustomEvent('mc:render', { detail: { r, lang: lg } })); skelWatch(); });
}

function insightHtml(r, t) {
  if (!riskInsight || !r?.verdict || !r?.findings) return '';
  try {
    const reasonFn = (f) => {
      const fn = t.r?.[f.id];
      return typeof fn === 'function' ? String(fn(f.params, f.status)) : riskInsight.reasonText(f);
    };
    const ins = riskInsight.insightFromResult(r, { reasonFn, limit: 5 });
    const rows = (ins.reasons || []).map((x) => {
      const st = x.critical || x.status === 'fail' ? 'fail' : x.status === 'warn' ? 'warn' : 'pass';
      return `<div class="row"><span class="st ${st}">${st === 'fail' ? t.failS : st === 'warn' ? t.warn : t.pass}</span><span>${esc(x.text)}</span></div>`;
    }).join('');
    return `<div class="card insight-card" id="insight-card"><div class="insight-head"><h3>${esc(t.insightT || 'Risk insight')}</h3>
      <span class="badge ${esc(ins.level)}">${esc(t[ins.level] || ins.label)}</span></div>
      <p class="muted insight-sub">${esc(t.insightSub || '')}</p>
      ${rows || `<div class="row"><span class="st pass">${t.pass}</span><span>${esc(t.cardClean)}</span></div>`}
      <div class="insight-links muted"><a href="/how">${esc(t.insightHow || 'How we score')}</a>
        · <a href="https://github.com/almasrem459-lab/memecheck-snap" target="_blank" rel="noopener">${esc(t.insightSnap || 'MetaMask Snap')}</a>
        · <span>${esc(t.insightFormClosed || '')}</span></div></div>`;
  } catch { return ''; }
}

function render(r0, fire) {
  const r = withDev(r0); window.__mcCurAddr = r.addr;
  if (!window.__mcStudy) studyGet().then(j => { if (j && !window.__mcStudy) { window.__mcStudy = j; if (last && $('#out').dataset.addr === last.addr) render(last); } });
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
   <div class="tok">${m.image ? `<img src="${esc(m.image)}" alt="">` : ''} <b>${esc(m.name || '?')}</b> <span class="muted">$${esc(m.symbol || '')} · ${esc(CH[r.chain] || r.chain)}</span>${r.kind === 'evm' ? ` <span class="chch on ${esc(r.chain)}" title="${esc(CH[r.chain] || r.chain)}">${CHIP[r.chain] || esc(r.chain)}</span>` : ''}
   <div class="mono muted" dir="ltr">${esc(r.addr)}</div><div class="muted">${v.points} ${t.riskPts}${m.url ? ` · <a href="${esc(m.url)}" target="_blank" rel="noopener">${t.viewDex}</a>` : ''}</div>
   ${m.dropFromHigh >= 90 ? `<div class="dn" style="margin-top:6px;font-weight:700">⚠️ ${esc(t.crashed(m.dropFromHigh))}</div>` : ''}
   ${(r.chains || []).length > 1 ? `<div class="chsw"><span class="muted">${t.chainSw}</span> ${r.chains.filter(c => c !== r.chain).map(c => `<button type="button" class="chch ${esc(c)}" data-ch="${esc(c)}" title="${esc(t.chainSwT(CH[c] || c))}">${CHIP[c] || esc(c)}</button>`).join(' ')}</div>` : ''}
   ${m.uni ? `<div class="unipool">${esc(t.uniPool(m.uni.v))} · <a href="${esc(m.uni.url)}" target="_blank" rel="noopener" data-provider="uniswap">${t.uniLink} ↗</a></div>` : ''}
   ${m.launch?.four ? `<div class="fourm ${m.launch.curve ? 'curve' : 'grad'}">${esc(m.launch.curve ? t.fourCurve(m.launch.progress) : t.fourGrad)} <span class="muted">${esc(t.fourSrc(m.launch.src))}</span>${m.launch.curve ? ` <a href="https://four.meme/token/${esc(r.addr.toLowerCase())}" target="_blank" rel="noopener">four.meme ↗</a>` : ''}</div>` : ''}
   ${probHtml(r, t)}
   ${r.partial ? `<div class="muted">${t.partial}</div>` : ''}</div>
   <div class="acts"><button type="button" class="ghost act" id="a-star" aria-pressed="${wl}" title="${wl ? t.unstar : t.star}">${wl ? '★' : '☆'}</button>
    <a class="ghost act" id="a-x" target="_blank" rel="noopener" href="${esc(xIntent(r))}"><b>𝕏</b> ${t.shareX}</a>
    <button type="button" class="ghost act" id="a-ca">${t.copyCA}</button><button type="button" class="ghost act" id="a-link">${t.copyLink}</button>
    <button type="button" class="ghost act" id="a-img">📸 ${t.shareRes}</button></div></div>
  ${insightHtml(r, t)}
  <div class="card"><h3>${t.market}</h3><div class="grid">
   ${[[t.price, usd(m.priceUsd)], [t.mcap, usd(m.mcap)], [t.fdv, usd(m.fdv)], [t.liq, m.launch?.curve && !(m.liquidity > 0) ? t.curveLiq : usd(m.liquidity)], [t.vol, usd(m.vol24)], [t.txns, m.buys24 != null ? `<span dir="ltr">${m.buys24} / ${m.sells24}</span>` : '—'],
      [`${t.change} <span dir="ltr">${t.ch1h24}</span>`, `<span dir="ltr">${pc(m.ch?.h1)} / ${pc(m.ch?.h24)}</span>`], [t.pairAge, ageH == null ? '—' : ageH < 48 ? ageH.toFixed(1) + (lang === 'ar' ? ' ساعة' : ' h') : (ageH / 24).toFixed(0) + (lang === 'ar' ? ' يوم' : ' d')], [t.holders, m.totalHolders ?? '—']]
      .map(([k, val]) => `<div class="kv"><span>${k}</span><b>${val}</b></div>`).join('')}</div></div>
  <div id="ai-box"></div>
  <div class="card" id="fcard"><h3>${t.findings}</h3>${r.pending.filter(k => k !== 'DexScreener').map(k => `<div class="row"><span class="st na"><span class="spin sm"></span></span><span>${esc(t.waiting(k))}</span></div>`).join('')}${fs.map(f => `<div class="row"><span class="st ${f.status}">${st[f.status]}</span><span>${esc((t.r[f.id] || (() => f.id))(f.params, f.status))}</span></div>`).join('')}</div>
  <div id="dh-box"></div><div id="db-box"></div><div id="so-box"></div><div id="ex-box"></div><div id="bm-box" class="card"></div>${skel('bp')}${skel('lf')}${skel('sn')}
  ${r.extra.holders?.length ? `<div class="card"><h3>${t.topHolders}</h3>${r.extra.holders.map((h, i) => `<div class="row"><span class="st na">#${i + 1}</span><span class="mono">${esc(h.owner)}</span><b style="margin-inline-start:auto" dir="ltr">${(+h.pct).toFixed(2)}%</b></div>`).join('')}</div>` : ''}
  ${r.flags.length ? `<div class="card"><h3>${t.flags}</h3>${r.flags.map(x => `<div class="row"><span class="st ${x.level === 'danger' || x.level === 'high' ? 'fail' : 'warn'}">${esc(x.level)}</span><span dir="ltr">${esc(x.name)}${x.desc ? ' — ' + esc(x.desc) : ''}</span></div>`).join('')}</div>` : ''}
  <div class="card"><h3>${t.sources}</h3>${Object.entries(r.sources).map(([k, s]) => `<div class="row"><span class="st ${s === 'ok' ? 'pass' : 'na'}">${s === 'ok' ? t.ok : s === 'empty' ? t.empty : s === 'unsupported' ? t.unsup : t.fail}</span><span>${k}</span></div>`).join('')}</div>`;
  keep.forEach((n, i) => { if (n) document.getElementById(SLOTS[i]).replaceWith(n); });
  $('#a-new').onclick = goHome;
  document.querySelectorAll('#vcard [data-ch]').forEach(b => b.onclick = () => { $('#chain').value = b.dataset.ch; ga('chain_switch', { ca: r.addr, from: r.chain, to: b.dataset.ch }); run(null, 'chain_switch'); }); $('#a-star').onclick = () => { toggleWatch(r); render(r0); };
  const copy = (txt, btn) => navigator.clipboard?.writeText(txt).then(() => { const o = btn.textContent; btn.textContent = t.copied; setTimeout(() => btn.textContent = o, 1200); });
  // sharing: ask the server to cache the risk result (server-side compute + budget-guarded KV write) so the link preview shows it
  const warm = () => { if (warmed.has(r.addr) || !['solana', 'ethereum', 'base', 'bsc', 'arbitrum'].includes(r.chain)) return; warmed.add(r.addr); fetch(`/api/deep?ca=${encodeURIComponent(r.addr)}&chain=${r.chain}&kind=core`, { keepalive: true }).catch(() => {}); };
  $('#a-x').addEventListener('click', () => { warm(); ga('share_x_click', { ca: r.addr, risk_level: r.verdict.level, where: 'result' }); });
  $('#a-ca').onclick = (e) => copy(r.addr, e.currentTarget); $('#a-link').onclick = (e) => { warm(); copy(shareUrl(r), e.currentTarget); };
  $('#a-img').onclick = () => { warm(); openShare(r); };
  document.body.classList.add('has-result'); pfToggle(); syncBack();
  if (fire) fireRender(r); // extra analyses (devbundle-ui.js, extras.js, bubble-ui.js, flows-ui.js, snipers-ui.js)
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
  text('MemeCheckShield', icon ? 122 : 60, 70, F(800, 34), '#e6e9ef', { ltr: true });
  g.font = F(800, 34); const bw = g.measureText('MemeCheckShield').width;
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
  $('#addr').value = ''; $('#chain').value = 'auto'; $('#go').disabled = false; onInput();
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
  e?.preventDefault(); const a = $('#addr').value.trim(); const t = T[lang]; const my = ++runId; window.__done = false;
  const source = src || (e && !e.submitter ? 'trending' : 'form'), k0 = detectChain(a), gch = k0 === 'solana' ? 'solana' : $('#chain').value;
  ga('scan_start', { chain: gch, ca: a, source });
  if (!k0) { ga('scan_error', { chain: gch, ca: a, source, error: 'invalid_address' }); $('#out').innerHTML = `<div class="card">${t.invalid}</div>`; return; }
  $('#out').dataset.addr = ''; $('#out').innerHTML = `<div class="card"><span class="spin"></span> ${t.checking}</div>`; $('#go').disabled = true;
  warmScan(); try { await loadCore(); } catch { coreP = null; if (my === runId) { $('#out').innerHTML = `<div class="card">${esc(t.fail)} — <button type="button" class="ghost act" onclick="location.reload()">↻</button></div>`; $('#go').disabled = false; } return; }
  if (my !== runId) return;
  document.body.classList.add('has-result'); $('#pf-tg') && ($('#pf-tg').dataset.init = ''); pfToggle(); syncBack();
  let fired = false;
  // Prewarmed server snapshot of the main check (read-only peek): shows instantly, then the live check replaces it.
  const kind0 = detectChain(a), sel = $('#chain').value;
  const chs = kind0 === 'solana' ? ['solana'] : (['ethereum', 'bsc', 'base', 'arbitrum'].includes(sel) ? [sel] : ['bsc', 'ethereum', 'base', 'arbitrum']);
  Promise.any(chs.map(c => fetch(`/api/cache?kind=core&chain=${c}&ca=${encodeURIComponent(a)}`).then(r => r.ok ? r.json() : Promise.reject()).then(j => j?.data && j.lv >= 4 ? j : Promise.reject()))).then(j => { // lv: core-logic version (older snapshots used the stale pump.fun curve price)
    if (my !== runId || fired || !j?.data?.verdict) return; const p = { ...j.data, cachedAt: j.at }; last = p; render(p, true); fired = true; }).catch(() => {});
  try {
    const r = await core.analyze(a, detectChain(a) === 'evm' ? $('#chain').value : 'solana', (p) => { if (my !== runId) return; last = p; render(p, !fired); fired = true; });
    if (my !== runId) return;
    last = r; render(r, true); window.__done = true; remember(r);
    loadResultMods().then(() => { if (my === runId) document.dispatchEvent(new CustomEvent('mc:final', { detail: { addr: r.addr, chain: r.chain } })); }); // ai-ui.js starts here, after the main result
    ga('scan_result', { chain: r.chain, risk_level: r.verdict?.level, score: r.verdict?.points, symbol: r.meta?.symbol || undefined, ca: r.addr, source });
    const q = new URLSearchParams(location.search); q.delete('a'); q.set('ca', r.addr); q.set('chain', r.chain);
    history.replaceState(null, '', '?' + q + location.hash);
  } catch (err) { if (my === runId) { $('#out').innerHTML = `<div class="card">${esc(err.message)}</div>`; ga('scan_error', { chain: gch, ca: a, source, error: String(err?.message || err).slice(0, 100) }); } }
  $('#go').disabled = false;
}
$('#f').addEventListener('submit', run); $('#addr').addEventListener('input', () => { $('#chain').value = 'auto'; onInput(); }); // typed/pasted address: auto-detect the EVM chain again
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
// ?ca= must be a Solana base58 mint (32-44 chars) or a 0x EVM address; ?chain= a known chain id. Anything else is ignored.
const ca0 = (params.get('ca') || params.get('a') || '').trim(), ca = detectChain(ca0) ? ca0 : '', pch0 = params.get('chain'), pch = /^(solana|ethereum|bsc|base|arbitrum|auto)$/.test(pch0 || '') ? pch0 : null;
if (pch && $(`#chain option[value="${pch}"]`)) $('#chain').value = pch;
if (ca) $('#addr').value = ca;
applyLang(); if (ca) run(null, 'url');
// ---- new / trending tokens list (pump.js): imported when the card comes near the viewport, or when its toggle is used ----
let pumpP = null; const loadPump = () => pumpP ||= import(`./pump.js?v=${V}`).catch(() => { pumpP = null; });
const lazyOn = (el, fn, margin = '300px') => { if (!el) return; if (!('IntersectionObserver' in window)) return void fn();
  const io = new IntersectionObserver((es) => { if (es.some(x => x.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: margin }); io.observe(el); };
const afterLoad = (fn) => { const go = () => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200)); if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true }); };
afterLoad(() => lazyOn($('#pf'), loadPump, '150px'));
// Homepage revenue surfaces (Hero Banner + Sponsored strip) — idle-load so empty CTA is visible without a scan
afterLoad(() => { import(`./revenue-ui.js?v=${V}`).catch(() => {}); }); document.addEventListener('click', (e) => { if (e.target.closest?.('#pf-tg')) loadPump(); });
// ---- 'Rugs we caught' proof: count + 2-3 examples parsed from the static /rugs page (same origin, edge-cached), so it can
// never drift from the full page. Loaded when it nears the viewport, 6 s timeout; on failure only the link stays. ----
// proof state is declared at the top (applyLang -> proofPaint runs before this point)
//  null = not loaded, false = failed, else { study, legacy, ex: [{ s, ca, lvl, pts, drop }] }
async function loadProof() {
  // Prefer tiny static /proof.json (~0.5 KB) so the homepage never downloads the full /rugs HTML (~88 KB).
  // Falls back to parsing /rugs only if the JSON is missing (keeps older previews working).
  try {
    const r = await fetch('/proof.json', { signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined });
    if (r.ok) {
      const j = await r.json();
      if (j && Array.isArray(j.ex) && j.ex.length) {
        proof = { study: +j.study || j.ex.length, legacy: +j.legacy || 0, ex: j.ex.filter(x => x && x.s).slice(0, 3) };
        proofPaint(); return;
      }
    }
  } catch {}
  try {
    const r = await fetch('/rugs', { signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined }); if (!r.ok) throw 0;
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const h3 = [...doc.querySelectorAll('h3')].find(h => /^Caught:/.test(h.textContent));
    const rows = h3 ? [...(h3.nextElementSibling?.querySelectorAll('tbody tr') || [])] : [];
    const ex = rows.map(tr => { const td = tr.querySelectorAll('td'); const m = /(-?\d+(?:\.\d+)?)%/.exec(td[5]?.textContent || ''), b = /(\d+)/.exec(td[2]?.textContent || '');
      return { s: td[0]?.querySelector('b')?.textContent || '', ca: td[0]?.querySelector('[title]')?.getAttribute('title') || '', lvl: (td[2]?.querySelector('.badge')?.className || '').replace('badge', '').trim() || 'high', pts: b ? +b[1] : null, drop: m ? +m[1] : null }; });
    const kv = (lbl) => { const k = [...doc.querySelectorAll('.kv')].find(x => x.querySelector('span')?.textContent.trim() === lbl); return k ? +k.querySelector('b').textContent || 0 : 0; };
    for (const a of doc.querySelectorAll('h2, article.coin')) { if (ex.length >= 3) break;
      if (a.tagName === 'H2') { if (/excluded/i.test(a.textContent)) break; continue; }
      const tags = [...a.querySelectorAll('.verdict .badge')].map(b => b.textContent); if (!tags.some(x => /rugged/i.test(x))) continue;
      const lv = /(\d+)/.exec(tags[0] || ''), link = a.querySelector('a[href*="?ca="]'); let ca2 = ''; try { ca2 = new URL(link.href).searchParams.get('ca') || ''; } catch {}
      ex.push({ s: a.querySelector('.tok b')?.textContent || '', ca: ca2, lvl: 'high', pts: lv ? +lv[1] : null, drop: null }); }
    proof = { study: kv('Caught (High → rugged)') || rows.length, legacy: kv('Rugged after flag'), ex: ex.filter(x => x.s).slice(0, 3) };
  } catch { proof = false; }
  proofPaint();
}
function proofPaint() {
  const t = T[lang], n = $('#proof-n'), l = $('#proof-list'); if (!n || !l || proof === null) return;
  if (!proof || !proof.ex.length) { n.textContent = t.rugsSub; l.innerHTML = ''; $('#proof').classList.add('done'); return; }
  n.innerHTML = `<b dir="ltr">${proof.study + proof.legacy}</b> ${esc(t.proofN(proof.study + proof.legacy).replace(/^\d+\s*/, ''))}<small>${esc(t.proofSub(proof.study, proof.legacy))}</small>`;
  l.innerHTML = proof.ex.map(x => `<a class="prx" href="/?ca=${encodeURIComponent(x.ca)}" data-ca="${esc(x.ca)}"><b dir="ltr">${esc(x.s.startsWith('$') ? x.s : '$' + x.s)}</b><span class="badge ${esc(x.lvl)}">${esc(t.proofHigh)}${x.pts != null ? ` <span dir="ltr">${x.pts}</span>` : ''}</span><span class="dn" dir="ltr">${x.drop != null ? x.drop + '%' : esc(t.proofRug)}</span></a>`).join('');
}
$('#proof-list')?.addEventListener('click', (e) => { const a = e.target.closest('a[data-ca]'); if (!a || !a.dataset.ca || e.metaKey || e.ctrlKey) return; e.preventDefault(); $('#addr').value = a.dataset.ca; $('#chain').value = 'auto'; onInput(); run(null, 'rugs_home'); window.scrollTo(0, 0); });
lazyOn($('#proof'), loadProof, '200px');
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
