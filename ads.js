// Pay-per-impression crypto ads (A-Ads) + "Promoted" strip. Loaded idle/lazily by app.js — never blocks the first paint.
// Rules: max 2 slots (homepage bottom + below a scan result), clearly labeled "Ad", fixed-size box (no layout jump inside it),
// iframe sandboxed WITHOUT allow-top-navigation (an ad can never redirect this page), no popups-on-load, no autoplay, no scripts on our origin.
// SETUP: create an ad unit at https://aads.com (site: memecheck.pages.dev) and paste its numeric unit ID below.
// While empty, no ad slot is rendered at all (no empty boxes).
export const AADS_UNIT_ID = ''; // e.g. '2401234'
const SLOTS = { home: true, result: true };
const L = { en: { ad: 'Ad', why: 'Ads keep scans free · not an endorsement', promo: 'Promoted', promoNote: 'Paid placement · risk score unchanged', all: 'All promoted', boost: 'Promote your project' },
  ar: { ad: 'إعلان', why: 'الإعلانات تُبقي الفحص مجانيًا · ليست توصية', promo: 'مُروَّج', promoNote: 'إعلان مدفوع · درجة المخاطر دون تغيير', all: 'كل المُروَّج', boost: 'روّج لمشروعك' } };
const lang = () => (document.documentElement.lang === 'ar' ? 'ar' : 'en');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function css() {
  if (document.getElementById('mc-ads-css')) return; const s = document.createElement('style'); s.id = 'mc-ads-css';
  s.textContent = `.mc-ad{margin:16px auto 0;max-width:728px;text-align:center}.mc-ad-h{display:flex;justify-content:space-between;font-size:11px;color:#7d879c;margin:0 2px 4px}.mc-ad-h b{border:1px solid #273046;border-radius:6px;padding:0 6px;font-weight:700;color:#9aa4b8}
.mc-ad-box{width:100%;height:90px;background:#0e1320;border:1px solid #1c2333;border-radius:10px;overflow:hidden;contain:strict}@media(max-width:560px){.mc-ad-box{height:100px;max-width:320px;margin:0 auto}}
.mc-ad-box iframe{border:0;padding:0;width:100%;height:100%;overflow:hidden;display:block}
.mc-promo{margin-top:16px}.mc-promo .row{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}.mc-promo a.it{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #273046;border-radius:10px;color:#e6e9ef;text-decoration:none;font-size:13px}
.mc-promo .lv{font-size:11px;font-weight:700}.mc-promo .lv-low{color:#3ee08f}.mc-promo .lv-medium{color:#ffd447}.mc-promo .lv-high{color:#ff9f43}.mc-promo .lv-extreme{color:#ff4d6a}.mc-promo .lv-unknown{color:#7d879c}`;
  document.head.appendChild(s);
}
function adSlot(where) {
  if (!/^\d{3,12}$/.test(AADS_UNIT_ID) || !SLOTS[where]) return null;
  css(); const t = L[lang()], small = matchMedia('(max-width:560px)').matches, size = small ? '320x100' : '728x90';
  const d = document.createElement('aside'); d.className = 'mc-ad'; d.id = 'mc-ad-' + where; d.setAttribute('aria-label', t.ad);
  d.innerHTML = `<div class="mc-ad-h"><b>${t.ad}</b><span>${t.why}</span></div><div class="mc-ad-box"><iframe data-aa="${AADS_UNIT_ID}" src="https://acceptable.a-ads.com/${AADS_UNIT_ID}/?size=${size}" title="${t.ad}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe></div>`;
  return d;
}
const LV = { en: { low: 'Low', medium: 'Medium', high: 'High', extreme: 'Extreme', unknown: '—' }, ar: { low: 'منخفض', medium: 'متوسط', high: 'مرتفع', extreme: 'شديد', unknown: '—' } };
async function promoStrip(after) {
  let j; try { j = await (await fetch('/api/projects?promoted=1')).json(); } catch { return; }
  const it = (j.items || []).slice(0, 8); const t = L[lang()];
  css(); const d = document.createElement('section'); d.className = 'card mc-promo'; d.id = 'mc-promo';
  d.innerHTML = `<div class="mc-ad-h"><b>${t.promo}</b><span>${t.promoNote}</span></div>` + (it.length
    ? `<div class="row">${it.map((x) => { const l = x.risk?.level || 'unknown'; return `<a class="it" href="/project?ca=${encodeURIComponent(x.ca)}&chain=${encodeURIComponent(x.chain)}">${esc(x.name || x.risk?.symbol || x.ca.slice(0, 6) + '…')} <span class="lv lv-${esc(l)}">${esc((LV[lang()] || LV.en)[l] || l)}</span></a>`; }).join('')}<a class="it" href="/projects">${t.all} →</a></div>`
    : `<p class="muted" style="margin:0"><a href="/projects#boost">${t.boost} →</a></p>`);
  after.after(d);
}
// homepage: promoted strip + one ad slot, under the new/trending list (bottom of the page => nothing below shifts)
function home() {
  const pf = document.getElementById('pf'); if (!pf || document.getElementById('mc-promo')) return;
  const go = () => promoStrip(pf).then(() => { const a = adSlot('home'); if (a && !document.getElementById('mc-ad-home')) (document.getElementById('mc-promo') || pf).after(a); });
  if (!('IntersectionObserver' in window)) return void go();
  const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '200px' }); io.observe(pf);
}
// result: one slot at the very end of the result
let lastAddr = null;
function result(r) {
  const out = document.getElementById('out'); if (!out || !r?.addr) return;
  const place = () => { if (document.getElementById('mc-ad-result')) return; const a = adSlot('result'); if (a) out.appendChild(a); };
  if (lastAddr !== r.addr) { document.getElementById('mc-ad-result')?.remove(); lastAddr = r.addr; }
  setTimeout(place, 1500);
}
home();
document.addEventListener('mc:render', (e) => result(e.detail?.r));
const outEl = document.getElementById('out');
if (outEl) new MutationObserver(() => { if (lastAddr && outEl.dataset.addr === lastAddr && outEl.childElementCount && !document.getElementById('mc-ad-result')) { const a = adSlot('result'); if (a) outEl.appendChild(a); } }).observe(outEl, { childList: true });
if (outEl?.dataset.addr && outEl.childElementCount) result({ addr: outEl.dataset.addr });
