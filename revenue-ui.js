// Revenue UI: Get Verified modal, Sponsored/Verified badges, Hero Banner + homepage ads strip.
// Payment NEVER changes risk score — badges are labeled Sponsored / Verified listing only.
import {
  PAY_TO, USDC_MINT, VERIFY_PRICE_USDC, AD_PRICE_USDC_WEEK, BANNER_PRICE_USDC_WEEK,
  VERIFY_DAYS, AD_DAYS_DEFAULT, BANNER_DAYS_DEFAULT, TERMINAL_REFS, FEE_NOTE_WHEN_OFF,
} from './revenue-cfg.js';

const L = {
  en: {
    verified: 'Verified listing',
    sponsored: 'Sponsored',
    verifiedTip: 'Paid listing badge only — risk score is unchanged.',
    getVerified: 'Get Verified',
    onlyLow: 'Get Verified is available for Low-risk scans only.',
    title: 'Get Verified listing',
    price: (n) => `${n} USDC`,
    days: (d) => `${d} days`,
    payTo: 'Pay to (Phantom / Solana)',
    mint: 'Token mint',
    steps: '1) Send USDC from Phantom  2) Paste the transaction signature  3) We verify on-chain',
    phantom: 'Open Phantom transfer',
    copyAddr: 'Copy address',
    pasteTx: 'Transaction signature',
    submit: 'Verify payment',
    cancel: 'Cancel',
    ok: 'Listed — Sponsored / Verified badge will show (score unchanged).',
    fail: 'Could not verify yet',
    advertise: 'Advertise with us',
    adTitle: 'Sponsored placement',
    adPrice: (n) => `${n} USDC / week · homepage strip`,
    adBlurb: 'Clearly labeled Sponsored — separate from organic results. Never changes risk scores.',
    stripTitle: 'Sponsored',
    emptyAds: 'No sponsored listings right now.',
    feeOff: FEE_NOTE_WHEN_OFF.en,
    howPay: 'Prefer Solana Pay / Phantom: send exactly the amount in USDC (SPL) to the address below. Optional memo: your mint.',
    copied: 'Copied!',
    proLink: 'Pro · Telegram alerts',
    bannerTitle: 'Hero Banner',
    bannerTag: 'Sponsored',
    bannerEmpty: (n) => `Advertise here — from ${n} USDC/week`,
    bannerCta: 'Book the Hero Banner',
    bannerBlurb: 'Large homepage banner — clearly labeled Sponsored. Never changes risk scores.',
    bannerModalTitle: 'Hero Banner placement',
  },
  ar: {
    verified: 'إدراج موثّق',
    sponsored: 'مموَّل',
    verifiedTip: 'شارة إدراج مدفوعة فقط — درجة الخطورة لا تتغيّر.',
    getVerified: 'احصل على التوثيق',
    onlyLow: 'التوثيق متاح لعمليات الفحص ذات الخطورة المنخفضة فقط.',
    title: 'إدراج موثّق',
    price: (n) => `${n} USDC`,
    days: (d) => `${d} يومًا`,
    payTo: 'الدفع إلى (Phantom / Solana)',
    mint: 'عنوان العملة',
    steps: '1) أرسل USDC من Phantom  2) الصق توقيع المعاملة  3) نتحقق على السلسلة',
    phantom: 'فتح تحويل Phantom',
    copyAddr: 'نسخ العنوان',
    pasteTx: 'توقيع المعاملة',
    submit: 'تحقق من الدفع',
    cancel: 'إلغاء',
    ok: 'تم الإدراج — ستظهر شارة موثّق/مموَّل (الدرجة دون تغيير).',
    fail: 'تعذّر التحقق بعد',
    advertise: 'أعلن معنا',
    adTitle: 'مساحة إعلانية',
    adPrice: (n) => `${n} USDC / أسبوع · شريط الصفحة الرئيسية`,
    adBlurb: 'موسومة بوضوح كمموَّل — منفصلة عن النتائج العادية. لا تغيّر درجات الخطورة.',
    stripTitle: 'مموَّل',
    emptyAds: 'لا إعلانات مموَّلة حاليًا.',
    feeOff: FEE_NOTE_WHEN_OFF.ar,
    howPay: 'يفضّل Solana Pay / Phantom: أرسل المبلغ بـ USDC إلى العنوان أدناه. مذكرة اختيارية: عنوان عملتك.',
    copied: 'تم النسخ!',
    proLink: 'Pro · تنبيهات تيليجرام',
    bannerTitle: 'بانر رئيسي',
    bannerTag: 'مموَّل',
    bannerEmpty: (n) => `أعلن هنا — من ${n} USDC/أسبوع`,
    bannerCta: 'احجز البانر الرئيسي',
    bannerBlurb: 'بانر كبير في الصفحة الرئيسية — موسوم بوضوح كمموَّل. لا يغيّر درجات الخطورة.',
    bannerModalTitle: 'مساحة البانر الرئيسي',
  },
};

let cache = null, cacheAt = 0;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const langOf = (lang) => L[lang] || L.en;
const safeImg = (u) => {
  if (!u || typeof u !== 'string') return '';
  const t = u.trim();
  if (!/^https:\/\//i.test(t)) return '';
  return t.slice(0, 400);
};

async function load(force) {
  if (!force && cache && Date.now() - cacheAt < 60_000) return cache;
  try {
    const r = await fetch('/api/verified', { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
    if (r.ok) cache = await r.json();
  } catch {
    try {
      const r = await fetch('/revenue-inventory.json');
      if (r.ok) cache = await r.json();
    } catch { cache = { verified: [], sponsored: [], banners: [] }; }
  }
  cacheAt = Date.now();
  return cache || { verified: [], sponsored: [], banners: [] };
}

function findVerified(mint, data) {
  if (!mint || !data) return null;
  const m = mint.toLowerCase();
  const now = Date.now();
  return (data.verified || []).find((x) => x.mint && x.mint.toLowerCase() === m && (!x.until || x.until > now))
    || (data.sponsored || []).find((x) => x.mint && x.mint.toLowerCase() === m && (!x.until || x.until > now))
    || (data.banners || []).find((x) => x.mint && x.mint.toLowerCase() === m && (!x.until || x.until > now));
}

function solanaPayUrl(amount, memo) {
  const u = new URL(`solana:${PAY_TO}`);
  u.searchParams.set('amount', String(amount));
  u.searchParams.set('spl-token', USDC_MINT);
  u.searchParams.set('label', 'MemeCheckShield');
  if (memo) u.searchParams.set('memo', memo.slice(0, 32));
  return u.toString();
}

function priceDays(kind) {
  if (kind === 'banner') return { price: BANNER_PRICE_USDC_WEEK, days: BANNER_DAYS_DEFAULT };
  if (kind === 'sponsored') return { price: AD_PRICE_USDC_WEEK, days: AD_DAYS_DEFAULT };
  return { price: VERIFY_PRICE_USDC, days: VERIFY_DAYS };
}

function modalTitle(t, kind) {
  if (kind === 'banner') return t.bannerModalTitle;
  if (kind === 'sponsored') return t.adTitle;
  return t.title;
}

function mountBadge(r, lang) {
  const t = langOf(lang);
  const host = document.querySelector('#vcard .badge');
  if (!host || !r?.addr) return;
  document.getElementById('mc-verified-badge')?.remove();
  load().then((data) => {
    const hit = findVerified(r.addr, data);
    if (!hit || document.querySelector('#out')?.dataset.addr !== r.addr) return;
    const el = document.createElement('span');
    el.id = 'mc-verified-badge';
    el.className = 'mc-rev-badge';
    el.title = t.verifiedTip;
    const paidLabel = (hit.kind === 'banner' || hit.kind === 'sponsored' || hit.url || hit.name) ? t.sponsored : t.verified;
    el.innerHTML = `<b>${esc(paidLabel)}</b> <small>${esc(t.verifiedTip)}</small>`;
    host.after(el);
  });
}

function mountGetVerifiedBtn(r, lang) {
  document.getElementById('mc-get-verified')?.remove();
  if (!r || r.chain !== 'solana') return;
  const acts = document.querySelector('#vcard .acts');
  if (!acts) return;
  const t = langOf(lang);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'mc-get-verified';
  btn.className = 'ghost act mc-rev-btn';
  btn.textContent = t.getVerified;
  btn.onclick = () => {
    if (r.verdict?.level !== 'low') {
      alert(t.onlyLow);
      return;
    }
    openVerifyModal(r, lang, 'verified');
  };
  acts.appendChild(btn);
}

function openVerifyModal(r, lang, kind) {
  const t = langOf(lang);
  const { price, days } = priceDays(kind);
  document.getElementById('mc-rev-modal')?.remove();
  const d = document.createElement('div');
  d.id = 'mc-rev-modal';
  d.className = 'mc-modal';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-modal', 'true');
  const payLink = solanaPayUrl(price, r.addr);
  d.innerHTML = `<div class="mc-mbox mc-rev-box">
    <h3>${esc(modalTitle(t, kind))}</h3>
    <p class="muted">${esc(t.verifiedTip)}</p>
    <div class="mc-rev-kv"><span>${esc(t.mint)}</span><code dir="ltr">${esc(r.addr)}</code></div>
    <div class="mc-rev-kv"><span>${esc(t.price(price))}</span><b dir="ltr">${esc(t.days(days))}</b></div>
    <p>${esc(t.howPay)}</p>
    <div class="mc-rev-kv"><span>${esc(t.payTo)}</span><code dir="ltr" id="mc-rev-pay">${esc(PAY_TO)}</code></div>
    <p class="muted">${esc(t.steps)}</p>
    <div class="mc-mact" style="flex-wrap:wrap">
      <a class="act buy" href="${esc(payLink)}" id="mc-rev-paylink">${esc(t.phantom)}</a>
      <button type="button" class="ghost act" id="mc-rev-copy">${esc(t.copyAddr)}</button>
    </div>
    <label class="mc-rev-lab">${esc(t.pasteTx)}
      <input id="mc-rev-tx" class="mc-rev-inp" dir="ltr" autocomplete="off" spellcheck="false" placeholder="5Sx…">
    </label>
    <p id="mc-rev-msg" class="muted" role="status"></p>
    <div class="mc-mact">
      <button type="button" class="ghost act" data-x>${esc(t.cancel)}</button>
      <button type="button" class="act" id="mc-rev-go">${esc(t.submit)}</button>
    </div>
  </div>`;
  const close = () => d.remove();
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-x]')) close(); });
  d.querySelector('#mc-rev-copy').onclick = () => {
    navigator.clipboard?.writeText(PAY_TO).then(() => {
      const b = d.querySelector('#mc-rev-copy'); const o = b.textContent; b.textContent = t.copied; setTimeout(() => b.textContent = o, 1200);
    });
  };
  d.querySelector('#mc-rev-go').onclick = async () => {
    const tx = d.querySelector('#mc-rev-tx').value.trim();
    const msg = d.querySelector('#mc-rev-msg');
    msg.textContent = '…';
    try {
      const res = await fetch('/api/verified', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'claim', mint: r.addr, tx, kind, name: r.meta?.symbol || r.meta?.name || '', url: r.meta?.url || '' }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        msg.textContent = `${t.fail}: ${j.err || res.status}${j.received != null ? ` (got ${j.received} USDC)` : ''}`;
        return;
      }
      msg.textContent = t.ok;
      cache = null;
      mountBadge(r, lang);
      if (kind === 'banner') mountHeroBanner(lang);
      if (kind === 'sponsored') mountHomeStrip(lang, true);
      setTimeout(close, 1600);
    } catch (e) {
      msg.textContent = t.fail + ': ' + String(e.message || e).slice(0, 80);
    }
  };
  document.body.appendChild(d);
  d.querySelector('#mc-rev-tx').focus();
}

function mountHeroBanner(lang) {
  const main = document.getElementById('sec-meme');
  const hero = main?.querySelector('.hero');
  if (!main || !hero) return;
  const t = langOf(lang);
  let sec = document.getElementById('mc-hero-banner');
  if (!sec) {
    sec = document.createElement('aside');
    sec.id = 'mc-hero-banner';
    sec.className = 'mc-hero-banner';
    sec.setAttribute('aria-label', t.bannerTitle);
    // Under hero (tagline + checker form) — prominent, above organic "what we check"
    hero.after(sec);
  }
  sec.setAttribute('aria-label', t.bannerTitle);
  sec.innerHTML = `<div class="mc-hero-inner" id="mc-hero-inner"><span class="muted">…</span></div>`;

  load().then((data) => {
    const inner = document.getElementById('mc-hero-inner');
    if (!inner) return;
    const now = Date.now();
    const ads = (data.banners || []).filter((x) => x && x.mint && (!x.until || x.until > now));
    if (!ads.length) {
      inner.innerHTML = `<a class="mc-hero-empty" href="/advertise">
        <span class="mc-spon-tag">${esc(t.bannerTag)}</span>
        <span class="mc-hero-empty-t">${esc(t.bannerEmpty(BANNER_PRICE_USDC_WEEK))}</span>
        <span class="mc-hero-empty-cta">${esc(t.bannerCta)} <span class="arr" aria-hidden="true">→</span></span>
      </a>
      <p class="muted mc-hero-note">${esc(t.bannerBlurb)}</p>`;
      return;
    }
    // Show the first active banner (highest visibility slot — one at a time)
    const x = ads[0];
    const href = `/?ca=${encodeURIComponent(x.mint)}`;
    const label = x.name || (x.mint.slice(0, 4) + '…' + x.mint.slice(-4));
    const img = safeImg(x.image || x.imageUrl);
    const imgHtml = img
      ? `<img class="mc-hero-img" src="${esc(img)}" alt="" width="72" height="72" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="mc-hero-img mc-hero-img-ph" aria-hidden="true">◎</span>`;
    inner.innerHTML = `<a class="mc-hero-paid" href="${esc(href)}">
      ${imgHtml}
      <span class="mc-hero-body">
        <span class="mc-spon-tag">${esc(t.bannerTag)}</span>
        <b class="mc-hero-name" dir="ltr">${esc(label)}</b>
        <span class="mc-hero-sub muted" dir="ltr">${esc(x.mint.slice(0, 6) + '…' + x.mint.slice(-4))} · Scan →</span>
      </span>
    </a>
    <p class="muted mc-hero-note">${esc(t.bannerBlurb)} · <a href="/advertise">${esc(t.advertise)}</a></p>`;
  });
}

function mountHomeStrip(lang, forceRemount) {
  const home = document.getElementById('home');
  if (!home) return;
  if (forceRemount) document.getElementById('mc-sponsored-strip')?.remove();
  if (document.getElementById('mc-sponsored-strip')) return;
  const t = langOf(lang);
  const sec = document.createElement('section');
  sec.id = 'mc-sponsored-strip';
  sec.className = 'card mc-sponsored';
  sec.setAttribute('aria-label', t.stripTitle);
  sec.innerHTML = `<div class="prh"><h2><span class="mc-spon-tag">${esc(t.stripTitle)}</span></h2>
    <a href="/advertise" class="prall">${esc(t.advertise)} <span class="arr">→</span></a></div>
    <div id="mc-spon-list" class="mc-spon-list"><span class="muted">…</span></div>
    <p class="muted mc-spon-note">${esc(t.adBlurb)} · <a href="/pro">${esc(t.proLink)}</a></p>`;
  const proof = document.getElementById('proof');
  if (proof) home.insertBefore(sec, proof); else home.prepend(sec);

  load().then((data) => {
    const list = document.getElementById('mc-spon-list');
    if (!list) return;
    const now = Date.now();
    const ads = (data.sponsored || []).filter((x) => x && x.mint && (!x.until || x.until > now));
    if (!ads.length) {
      list.innerHTML = `<span class="muted">${esc(t.emptyAds)}</span> <a href="/advertise">${esc(t.advertise)}</a>`;
      return;
    }
    list.innerHTML = ads.slice(0, 6).map((x) => {
      const href = `/?ca=${encodeURIComponent(x.mint)}`;
      const label = x.name || (x.mint.slice(0, 4) + '…' + x.mint.slice(-4));
      return `<a class="mc-spon-item" href="${esc(href)}"><span class="mc-spon-tag">${esc(t.sponsored)}</span> <b dir="ltr">${esc(label)}</b></a>`;
    }).join('');
  });
}

function mountTerminalRefs(lang) {
  const keys = Object.keys(TERMINAL_REFS || {}).filter((k) => TERMINAL_REFS[k]);
  if (!keys.length) return;
  const acts = document.querySelector('#vcard .acts');
  if (!acts || document.getElementById('mc-term-refs')) return;
  const bar = document.createElement('div');
  bar.id = 'mc-term-refs';
  bar.className = 'mc-term-refs muted';
  bar.innerHTML = keys.map((k) => `<a href="${esc(TERMINAL_REFS[k])}" target="_blank" rel="noopener sponsored">${esc(k)}</a>`).join(' · ');
  acts.after(bar);
}

let cur = null;
document.addEventListener('mc:render', (e) => {
  cur = e.detail;
  const { r, lang } = cur || {};
  mountBadge(r, lang);
  mountGetVerifiedBtn(r, lang);
  mountTerminalRefs(lang);
});

// Homepage: hero banner + strip (no scan yet)
const bootLang = () => (document.documentElement.lang === 'ar' ? 'ar' : 'en');
if (document.getElementById('home') || document.querySelector('#sec-meme .hero')) {
  mountHeroBanner(bootLang());
  if (document.getElementById('home')) mountHomeStrip(bootLang());
  new MutationObserver(() => {
    const lang = bootLang();
    const t = langOf(lang);
    const strip = document.getElementById('mc-sponsored-strip');
    if (strip) {
      const tag = strip.querySelector('.mc-spon-tag');
      if (tag && !tag.closest('.mc-spon-item')) tag.textContent = t.stripTitle;
    }
    const hero = document.getElementById('mc-hero-banner');
    if (hero) {
      // Refresh copy on lang flip
      mountHeroBanner(lang);
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

export { openVerifyModal, load as loadRevenue, PAY_TO, VERIFY_PRICE_USDC, BANNER_PRICE_USDC_WEEK };
