// Gold page: live XAU spot (gold-api.com, keyless + CORS) and TradingView free embed widgets.
const G = {
  en: { dir:'ltr', lang:'العربية', tabMeme:'Meme', tabGold:'Gold', tabCrypto:'Crypto', evTitle:'Next high-impact US event', evNote:'Gold can move sharply around these releases. Times in your local timezone. Source: ForexFactory weekly calendar.', evNext:'Next', evIn:'in', evNone:'No more high-impact US events this week.', evErr:'Calendar unavailable right now.',
    calc:'XAUUSD lot size & risk calculator', cBal:'Account balance ($)', cRisk:'Risk', cEntry:'Entry price', cSL:'Stop-loss price', cTP:'Take-profit (optional)', cNote:'1 lot = 100 oz: a $1 move = $100 per lot (0.01 lot = $1). Lots rounded down to 0.01. Ignores spread/commission.',
    oDist:'Stop distance', oLots:'Lot size', oRisk:'Actual risk', oRew:'Reward', oRR:'R:R', oMin:'Risk too small: minimum is 0.01 lot (risk shown is for 0.01).', oBad:'Enter entry and a stop-loss different from entry.', oTPbad:'Take-profit is on the wrong side of entry.',
    fgTitle:'Fear & Greed index', gain:'Top gainers 24h', lose:'Top losers 24h', cTag:'Top 20 cryptocurrencies by market cap. Refreshes every 60 seconds.', cTitle:'Top coins', cSrc:'Source:', tagline:'Live gold price (XAU/USD), gold news and high-impact economic events.',
    spot:'Gold spot price', spotLbl:'XAU/USD', updated:'Last update', srcSpot:'Spot source:', chart:'XAU/USD chart', news:'Gold news',
    cal:'Economic calendar', calNote:'High-impact events (CPI, NFP, FOMC…) for the US and major economies.', loadErr:'Could not load price',
    newsLoading:'Loading headlines…', readMore:'Read', tvCredit:'Daily change, chart, news and calendar: TradingView widgets.', disclaimer:'Not financial advice. Prices may be delayed. Always do your own research.' },
  ar: { dir:'rtl', lang:'English', tabMeme:'ميم', tabGold:'ذهب', tabCrypto:'كريبتو', evTitle:'الحدث الأمريكي القادم عالي التأثير', evNote:'قد يتحرك الذهب بقوة حول هذه البيانات. الأوقات بتوقيتك المحلي. المصدر: تقويم ForexFactory الأسبوعي.', evNext:'التالي', evIn:'خلال', evNone:'لا توجد أحداث أمريكية عالية التأثير متبقية هذا الأسبوع.', evErr:'التقويم غير متاح حاليًا.',
    calc:'حاسبة حجم اللوت والمخاطرة لـ XAUUSD', cBal:'رصيد الحساب ($)', cRisk:'المخاطرة', cEntry:'سعر الدخول', cSL:'سعر وقف الخسارة', cTP:'جني الأرباح (اختياري)', cNote:'اللوت = 100 أونصة: تحرك 1$ = 100$ لكل لوت (0.01 لوت = 1$). يتم تقريب اللوت للأسفل إلى 0.01. لا يشمل السبريد/العمولة.',
    oDist:'مسافة الوقف', oLots:'حجم اللوت', oRisk:'المخاطرة الفعلية', oRew:'العائد', oRR:'نسبة العائد/المخاطرة', oMin:'المخاطرة صغيرة جدًا: الحد الأدنى 0.01 لوت (المخاطرة المعروضة لـ 0.01).', oBad:'أدخل سعر الدخول ووقف خسارة مختلفًا عنه.', oTPbad:'جني الأرباح في الاتجاه الخاطئ من الدخول.',
    fgTitle:'مؤشر الخوف والطمع', gain:'الأكثر ارتفاعًا 24س', lose:'الأكثر انخفاضًا 24س', cTag:'أكبر 20 عملة رقمية حسب القيمة السوقية. يتم التحديث كل 60 ثانية.', cTitle:'أبرز العملات', cSrc:'المصدر:', tagline:'سعر الذهب المباشر (XAU/USD) وأخبار الذهب والأحداث الاقتصادية عالية التأثير.',
    spot:'سعر الذهب الفوري', spotLbl:'XAU/USD', updated:'آخر تحديث', srcSpot:'مصدر السعر الفوري:', chart:'الرسم البياني XAU/USD', news:'أخبار الذهب',
    cal:'التقويم الاقتصادي', calNote:'الأحداث عالية التأثير (التضخم CPI، الوظائف NFP، الفيدرالي FOMC…) للولايات المتحدة والاقتصادات الكبرى.', loadErr:'تعذّر تحميل السعر',
    newsLoading:'جارٍ تحميل العناوين…', readMore:'اقرأ', tvCredit:'التغير اليومي والرسم والأخبار والتقويم: أدوات TradingView.', disclaimer:'ليست نصيحة مالية. قد تكون الأسعار متأخرة. قم دائمًا ببحثك الخاص.' }
};
const $ = (s) => document.querySelector(s);
let lang = new URLSearchParams(location.search).get('lang') || localStorage.getItem('mc_lang') || 'en';
if (!G[lang]) lang = 'en';
const TV = 'https://s3.tradingview.com/external-embedding/embed-widget-';
function widget(id, name, cfg, h) {
  const box = $('#' + id); box.innerHTML = ''; box.style.height = h ? h + 'px' : '';
  const w = document.createElement('div'); w.className = 'tradingview-widget-container'; w.style.height = '100%';
  const inner = document.createElement('div'); inner.className = 'tradingview-widget-container__widget'; inner.style.height = '100%'; w.appendChild(inner);
  const s = document.createElement('script'); s.src = TV + name + '.js'; s.async = true;
  s.textContent = JSON.stringify({ colorTheme: 'dark', isTransparent: true, locale: lang === 'ar' ? 'ar_AE' : 'en', width: '100%', ...cfg });
  w.appendChild(s); box.appendChild(w);
}
function widgets() {
  widget('tv-chart', 'mini-symbol-overview', { symbol: 'OANDA:XAUUSD', height: '100%', dateRange: '1M', autosize: true }, 260);
  news();
  widget('tv-cal', 'events', { importanceFilter: '0,1', countryFilter: 'us,eu,gb,cn,jp', height: '100%' }, 480);
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Gold news: TradingView timeline widget (the Google News RSS feed was removed: it 503s from the edge).
function news() { widget('tv-news', 'timeline', { feedMode: 'symbol', symbol: 'OANDA:XAUUSD', displayMode: 'compact', height: '100%' }, 420); }
const money = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function calc() {
  const t = G[lang], v = (id) => parseFloat($('#k-' + id).value);
  const bal = v('bal'), r = v('risk'), e = v('entry'), sl = v('sl'), tp = v('tp');
  const kv = (k, x, c = '') => `<div class="kv"><span>${k}</span><b class="${c}" dir="ltr">${x}</b></div>`;
  if (!(e > 0) || !(sl > 0) || e === sl) { $('#k-out').innerHTML = `<div class="muted">${t.oBad}</div>`; return; }
  const dist = Math.abs(e - sl), riskUsd = $('#k-mode').value === 'pct' ? bal * r / 100 : r;
  let lots = Math.floor((riskUsd / (dist * 100)) * 100 + 1e-9) / 100; const small = !(lots >= 0.01); if (small) lots = 0.01;
  const act = lots * 100 * dist;
  let out = kv(t.oDist, `$${dist.toFixed(2)} (${Math.round(dist * 100)} ${lang === 'ar' ? 'نقطة' : 'pts'})`) + kv(t.oLots, lots.toFixed(2)) + kv(t.oRisk, money(act) + (bal > 0 ? ` (${(act / bal * 100).toFixed(2)}%)` : ''), small ? 'dn' : '');
  if (tp > 0) {
    const long = sl < e;
    if ((long && tp <= e) || (!long && tp >= e)) out += `<div class="kv"><span>${t.oRew}</span><b class="dn">${t.oTPbad}</b></div>`;
    else out += kv(t.oRew, money(lots * 100 * Math.abs(tp - e)), 'up') + kv(t.oRR, '1 : ' + (Math.abs(tp - e) / dist).toFixed(2));
  }
  if (small) out += `<div class="kv" style="grid-column:1/-1"><b class="dn" style="font-size:13px">${t.oMin}</b></div>`;
  $('#k-out').innerHTML = out;
}
document.querySelectorAll('#sec-gold .calc input, #k-mode').forEach(x => x.addEventListener('input', calc));
let evs = null, evErr = false;
async function loadEvents() {
  try {
    const r = await fetch('/api/proxy?url=' + encodeURIComponent('https://nfs.faireconomy.media/ff_calendar_thisweek.json')); if (!r.ok) throw 0;
    const d = await r.json(); const m = new Map();
    d.filter(e => e.country === 'USD' && e.impact === 'High').forEach(e => { const ts = Date.parse(e.date); if (!isNaN(ts)) m.set(ts, [...(m.get(ts) || []), e.title]); });
    evs = [...m].sort((a, b) => a[0] - b[0]);
  } catch { evErr = true; }
  tick();
}
function tick() {
  const t = G[lang], el = $('#ev'); if (!evs && !evErr) return;
  if (evErr) { el.textContent = t.evErr; return; }
  const n = evs.find(([ts]) => ts > Date.now()); if (!n) { el.textContent = t.evNone; return; }
  let s = Math.floor((n[0] - Date.now()) / 1000); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), mi = Math.floor(s % 3600 / 60); s %= 60;
  const when = new Date(n[0]).toLocaleString(lang === 'ar' ? 'ar' : 'en', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `<div class="evn">${t.evNext}: <b dir="ltr">${lang === 'ar' ? 'أمريكا' : 'US'} ${esc(n[1].join(' · '))}</b> ${t.evIn} <b class="cd" dir="ltr">${lang === 'ar' ? `${d}ي ${h}س ${mi}د ${s}ث` : `${d}d ${h}h ${mi}m ${s}s`}</b></div><div class="muted">${when}</div>`;
}
async function spot() {
  try {
    const r = await fetch('https://api.gold-api.com/price/XAU'); if (!r.ok) throw 0; const d = await r.json();
    if (!$('#k-entry').value) { $('#k-entry').value = (+d.price).toFixed(2); calc(); }
    $('#spot').textContent = '$' + (+d.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    $('#upd').textContent = new Date(d.updatedAt).toLocaleTimeString(lang === 'ar' ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' });
  } catch { $('#spot').textContent = G[lang].loadErr; }
}
let loaded = false;
let cm = null;
function show(tab) {
  if (!['meme', 'gold', 'crypto'].includes(tab)) tab = 'meme';
  for (const k of ['meme', 'gold', 'crypto']) { $('#sec-' + k).hidden = k !== tab; $('#tab-' + k).classList.toggle('on', k === tab); $('#tab-' + k).setAttribute('aria-selected', k === tab); }
  if (tab === 'gold' && !loaded) { loaded = true; widgets(); spot(); setInterval(spot, 60000); loadEvents(); setInterval(tick, 1000); }
  if (tab === 'crypto' && !cm) cm = import('./crypto.js?v=1792080000').then(m => (m.start(lang), m));
  history.replaceState(null, '', location.pathname + location.search + (tab === 'meme' ? '' : '#' + tab));
}
function applyGoldLang() {
  const t = G[lang]; document.querySelectorAll('[data-g]').forEach(e => e.textContent = t[e.dataset.g]);
  if (loaded) { widgets(); spot(); tick(); calc(); }
  cm?.then(m => m.setLang(lang));
}
$('#tab-meme').addEventListener('click', () => show('meme'));
$('#tab-gold').addEventListener('click', () => show('gold'));
$('#tab-crypto').addEventListener('click', () => show('crypto'));
// app.js owns the #lang button; follow its choice (it runs first and sets <html lang>).
$('#lang').addEventListener('click', () => { lang = document.documentElement.lang === 'ar' ? 'ar' : 'en'; applyGoldLang(); });
applyGoldLang(); show(location.hash.slice(1));
