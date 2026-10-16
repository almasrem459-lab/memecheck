// Live Sniper Detection card — first buyers after launch, red=high sniper risk / green=low.
// Listens for mc:render (Solana). Data from /api/snipers.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const L = {
  en: {
    title: 'Live sniper detection', arTitle: 'كاشف القناصة اللحظي',
    loading: 'Scanning first buyers after launch…',
    err: 'Sniper scan unavailable right now.',
    empty: 'Not enough launch data to detect snipers yet.',
    retry: 'Retry',
    high: 'High sniper risk', medium: 'Elevated sniper activity', low: 'Some early snipers', clear: 'Low sniper footprint', unknown: 'Unknown',
    headline: (n, pct) => n ? `${n} likely sniper bot${n === 1 ? '' : 's'} detected${pct != null ? ` holding ~${pct}% of supply` : ''}` : 'No clear sniper cluster in the launch sample',
    pro: (n) => n ? ` · ${n} pro (same/next slot)` : '',
    warn: 'Even if the contract looks clean, this coin can be “dead by programming” — early bots may dump into retail.',
    buyers: 'Early buyers sampled', snipers: 'Flagged snipers', held: 'Sniper-held supply', window: 'Launch window',
    top: 'Top sniper wallets', tap: 'Tap a row for Solscan',
    reasons: {
      same_slot: 'Bought in create slot', next_slot: 'Bought next slot', early_slot: 'Bought in first slots',
      multi_buy: 'Multiple buys in launch window', high_fee: 'High priority fees',
    },
    note: 'Demo v1: first ~50 buyers in the opening slots after liquidity/bonding-curve launch. Heuristic labels — not proof of bot identity. DYOR.',
    timeout: 'Sniper scan timed out. Try again.',
    noKey: 'Sniper scan needs server RPC (not configured).',
  },
  ar: {
    title: 'كشف القناصة اللحظي', arTitle: 'كاشف القناصة اللحظي',
    loading: 'جارٍ فحص أوائل المشترين بعد الإطلاق…',
    err: 'فحص القناصة غير متاح حاليًا.',
    empty: 'لا توجد بيانات إطلاق كافية لكشف القناصة.',
    retry: 'إعادة المحاولة',
    high: 'خطر قناصة مرتفع', medium: 'نشاط قناصة مرتفع', low: 'بعض القناصة الأوائل', clear: 'بصمة قناصة منخفضة', unknown: 'غير معروف',
    headline: (n, pct) => n ? `تم رصد ${n} بوت قنص محتمل${pct != null ? ` يملكون ~${pct}% من المعروض` : ''}` : 'لا توجد مجموعة قناصة واضحة في عيّنة الإطلاق',
    pro: (n) => n ? ` · ${n} محترف (نفس/التالي سلوط)` : '',
    warn: 'حتى لو العقد يبدو نظيفًا، العملة قد تكون «ميتة برمجيًا» — البوتات الأوائل قد تبيع على التجزئة.',
    buyers: 'أوائل المشترين (عيّنة)', snipers: 'قناصة مُعلَّمون', held: 'معروض بحوزة القناصة', window: 'نافذة الإطلاق',
    top: 'أكبر محافظ القناصة', tap: 'اضغط صفًا لفتح Solscan',
    reasons: {
      same_slot: 'شراء في سلوط الإنشاء', next_slot: 'شراء في السلوط التالي', early_slot: 'شراء في أوائل السلوطات',
      multi_buy: 'عدة عمليات شراء عند الإطلاق', high_fee: 'رسوم أولوية مرتفعة',
    },
    note: 'نسخة تجريبية: نحو 50 مشتريًا في أوائل السلوطات بعد الإطلاق. التصنيفات تقديرية وليست إثباتًا. ابحث بنفسك.',
    timeout: 'انتهت مهلة فحص القناصة. حاول مجددًا.',
    noKey: 'فحص القناصة يحتاج RPC على الخادم (غير مُعد).',
  },
};
const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
const cache = new Map();
let cur = null;

const levelClass = { high: 'fail', medium: 'warn', low: 'warn', clear: 'pass', unknown: 'na' };

function reasonTxt(codes, t) {
  return (codes || []).map(c => t.reasons[c] || c).join(' · ');
}

function draw(box, d) {
  const t = L[lang()];
  const risk = d.risk || { level: 'unknown', label: t.unknown };
  const lvl = risk.level || 'unknown';
  const st = levelClass[lvl] || 'na';
  const pct = d.sniperPct;
  const headline = t.headline(d.proSnipers || d.snipers || 0, pct) + t.pro(d.proSnipers || 0);
  const rows = (d.top || []).map((s, i) => {
    const badge = s.pro ? 'fail' : 'warn';
    return `<button type="button" class="snrow" data-o="${esc(s.owner)}">
      <span class="st ${badge}">#${i + 1}</span>
      <span class="snmain"><span class="mono" dir="ltr">${esc(s.short)}</span>
        <span class="muted snwhy">${esc(reasonTxt(s.reasons, t))}</span></span>
      <span class="snpct" dir="ltr">${s.heldPct != null ? s.heldPct.toFixed(2) : (s.boughtPct != null ? s.boughtPct.toFixed(2) : '—')}%</span>
    </button>`;
  }).join('');

  box.innerHTML = `
    <div class="sn-head"><h3>${t.title} <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· ${t.arTitle}</span></h3></div>
    <div class="sn-verdict"><span class="st ${st}">${esc(t[lvl] || risk.label)}</span>
      <b>${esc(headline)}</b></div>
    ${(d.warning || (lvl === 'high' || lvl === 'medium')) ? `<p class="sn-warn">${esc(d.warning || t.warn)}</p>` : ''}
    <div class="grid sn-grid">
      <div class="kv"><span>${t.buyers}</span><b dir="ltr">${d.earlyBuyers ?? '—'}</b></div>
      <div class="kv"><span>${t.snipers}</span><b class="${(d.snipers || 0) >= 6 ? 'dn' : ''}" dir="ltr">${d.snipers ?? '—'} <small class="muted">(${d.proSnipers || 0} pro)</small></b></div>
      <div class="kv"><span>${t.held}</span><b class="${(pct || 0) >= 12 ? 'dn' : (pct || 0) >= 5 ? '' : 'up'}" dir="ltr">${pct != null ? pct.toFixed(1) + '%' : '—'}</b></div>
      <div class="kv"><span>${t.window}</span><b dir="ltr">${d.windowSec != null ? d.windowSec + 's' : '—'}</b></div>
    </div>
    ${rows ? `<h4 class="sn-sub">${t.top}</h4><div class="sn-list" id="sn-list">${rows}</div><p class="muted" style="margin:6px 0 0;font-size:12px">${t.tap}</p>` : ''}
    <details class="fn"><summary title="info">ⓘ</summary><div>${t.note}${d.sampledTx != null ? ` · ${d.sampledTx} txs` : ''}</div></details>`;

  box.querySelector('#sn-list')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-o]'); if (!b) return;
    window.open('https://solscan.io/account/' + b.dataset.o, '_blank', 'noopener');
  });
}

async function fetchSnipers(mint) {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 24000);
  try {
    const r = await fetch('/api/snipers?mint=' + encodeURIComponent(mint), { signal: ctl.signal });
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } finally { clearTimeout(tm); }
}

function paint() {
  if (!cur) return;
  const t = L[lang()];
  const box = $('#sn-box');
  if (!box) return;
  const d = cache.get(cur.addr);
  box.hidden = false;
  if (!d || d === 'loading') {
    box.innerHTML = `<h3>${t.title}</h3><div><span class="spin"></span> ${t.loading}</div>`;
    return;
  }
  if (d.error) {
    box.innerHTML = `<h3>${t.title}</h3><span class="muted">${d.timeout ? t.timeout : t.err}</span>
      <button type="button" class="ghost act" id="sn-retry">${t.retry}</button>`;
    $('#sn-retry')?.addEventListener('click', () => start(cur.addr));
    return;
  }
  if (d.empty) {
    const msg = d.configured === false ? t.noKey : (d.message || t.empty);
    box.innerHTML = `<h3>${t.title}</h3><span class="muted">${esc(msg)}</span>
      <button type="button" class="ghost act" id="sn-retry">${t.retry}</button>
      <details class="fn"><summary title="info">ⓘ</summary><div>${t.note}</div></details>`;
    $('#sn-retry')?.addEventListener('click', () => start(cur.addr));
    return;
  }
  draw(box, d);
}

async function start(addr) {
  cache.set(addr, 'loading'); paint();
  try {
    const j = await fetchSnipers(addr);
    if (!j || j.ok === false) cache.set(addr, { error: true });
    else cache.set(addr, j);
  } catch (e) {
    cache.set(addr, { error: true, timeout: /abort|timeout/i.test(String(e?.name || e?.message || '')) });
  }
  if (cur?.addr === addr) paint();
}

document.addEventListener('mc:render', (e) => {
  const { r } = e.detail;
  cur = { addr: r.addr, chain: r.chain };
  const box = $('#sn-box');
  if (r.chain !== 'solana') {
    if (box) box.hidden = true;
    return;
  }
  const c = cache.get(r.addr);
  if (c && c !== 'loading' && !c.error) { paint(); return; }
  start(r.addr);
});

document.getElementById('lang')?.addEventListener('click', () => {
  if (cur && cache.get(cur.addr) && cache.get(cur.addr) !== 'loading') setTimeout(paint, 0);
});
