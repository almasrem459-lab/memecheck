(function () {
  const btn = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!btn || !nav) return;

  // Community chat link: injected here once so every page's menu + footer get it without editing each page's HTML.
  if (!nav.querySelector('a[href="/chat"]')) {
    const mk = () => { const a = document.createElement('a'); a.href = '/chat'; a.className = 'nav-chat'; return a; };
    const links = [mk()], lbl = () => { const ar = document.documentElement.lang === 'ar'; links.forEach((a) => { a.textContent = ar ? 'غرفة النقاش' : 'Community chat'; }); };
    nav.insertBefore(links[0], nav.querySelector('a[href="/rugs"]') || nav.querySelector('a[href^="http"]'));
    const ft = document.querySelector('footer');
    if (ft && !ft.querySelector('a[href="/chat"]')) { const a = mk(); links.push(a); const gh = ft.querySelector('a[href^="https://github.com"]'); const sep = document.createTextNode(' · ');
      if (gh) { ft.insertBefore(a, gh); ft.insertBefore(document.createTextNode(' · '), gh); } else { ft.append(sep, a); } }
    lbl(); new MutationObserver(lbl).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }



  // Revenue: Advertise + Pro
  if (!nav.querySelector('a[href="/advertise"]')) {
    const add = (href, en, ar, cls) => {
      const a = document.createElement('a'); a.href = href; a.className = cls || '';
      const lbl = () => { a.textContent = document.documentElement.lang === 'ar' ? ar : en; };
      lbl(); new MutationObserver(lbl).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      const how = nav.querySelector('a[href="/how"]');
      if (how) nav.insertBefore(a, how); else nav.appendChild(a);
    };
    add('/advertise', 'Advertise', 'أعلن معنا', 'nav-advertise');
    add('/pro', 'Pro', 'Pro', 'nav-pro');
  }

  // Revenue 2: Projects (Promoted) + API docs
  if (!nav.querySelector('a[href="/api-docs"]')) {
    const add2 = (href, en, ar) => {
      const a = document.createElement('a'); a.href = href;
      const lbl = () => { a.textContent = document.documentElement.lang === 'ar' ? ar : en; };
      lbl(); new MutationObserver(lbl).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      const ad = nav.querySelector('a[href="/advertise"]') || nav.querySelector('a[href="/how"]');
      if (ad) nav.insertBefore(a, ad); else nav.appendChild(a);
    };
    add2('/projects', 'Projects', 'المشاريع');
    add2('/api-docs', 'API', 'API');
  }


  // Calls channel win-rate checker
  if (!nav.querySelector('a[href="/calls"]')) {
    const a = document.createElement('a'); a.href = '/calls'; a.className = 'nav-calls';
    const lbl = () => { a.textContent = document.documentElement.lang === 'ar' ? 'فاحص الاستدعاءات' : 'Calls checker'; a.setAttribute('data-t', 'navCalls'); };
    lbl(); new MutationObserver(lbl).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    const rugs = nav.querySelector('a[href="/rugs"]');
    if (rugs) nav.insertBefore(a, rugs); else nav.appendChild(a);
  }

  // Guides + monthly report + infra
  if (!nav.querySelector('a[href="/guides"]')) {
    const add = (href, en, ar, cls) => {
      const a = document.createElement('a'); a.href = href; a.className = cls || '';
      const lbl = () => { a.textContent = document.documentElement.lang === 'ar' ? ar : en; };
      lbl(); new MutationObserver(lbl).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      const rugs = nav.querySelector('a[href="/rugs"]');
      if (rugs && rugs.nextSibling) nav.insertBefore(a, rugs.nextSibling); else nav.appendChild(a);
    };
    add('/guides', 'Guides', 'أدلة', 'nav-guides');
    add('/report', 'Report', 'التقرير', 'nav-report');
  }

  // Dev Reputation lookup link
  if (!nav.querySelector('a[href="/dev"]')) {
    const a = document.createElement('a'); a.href = '/dev'; a.className = 'nav-dev';
    const lbl = () => { a.textContent = document.documentElement.lang === 'ar' ? 'درجة المطوّر' : 'Dev score'; a.setAttribute('data-t', 'navDev'); };
    lbl(); new MutationObserver(lbl).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    const how = nav.querySelector('a[href="/how"]');
    if (how) nav.insertBefore(a, how); else nav.appendChild(a);
  }

  const setOpen = (open) => {
    nav.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) nav.classList.add('open'); else nav.classList.remove('open');
  };
  setOpen(false);

  btn.addEventListener('click', () => setOpen(nav.hidden));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));

  const path = (location.pathname.replace(/\/+$/, '') || '/');
  nav.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('http')) return;
    const h = href.replace(/\/+$/, '') || '/';
    if (h === path) a.setAttribute('aria-current', 'page');
  });

  // Subpages without app.js: apply AR labels from localStorage
  if (!document.getElementById('lang')) {
    const AR = {
      navMenu: 'القائمة',
      navChecker: 'الفاحص',
      navWhales: 'حيتان',
      navSmart: 'الأموال الذكية',
      navChat: 'غرفة النقاش',
      navRugs: 'عمليات السحب التي رصدناها',
      navDev: 'درجة المطوّر',
      navHow: 'كيف يعمل التقييم',
      navGuides: 'أدلة',
      navAdvertise: 'أعلن معنا',
      navPro: 'Pro',
      navReport: 'التقرير',
      navOpenSrc: 'مفتوح المصدر',
      navApi: 'API',
      navProjects: 'المشاريع',
      navAccount: 'حسابي',
      navCalls: 'فاحص الاستدعاءات',
    };
    const lang = localStorage.getItem('mc_lang') || 'en';
    if (lang === 'ar') {
      document.documentElement.lang = 'ar';
      document.documentElement.dir = 'rtl';
      btn.setAttribute('aria-label', AR.navMenu);
      document.querySelectorAll('[data-t]').forEach((e) => {
        if (AR[e.dataset.t]) e.textContent = AR[e.dataset.t];
      });
    }
  }
})();

// "Suggest an idea to the developer" box: injected once just above the footer on every page (POST /api/feedback).
(function () {
  const ft = document.querySelector('footer');
  if (!ft || document.getElementById('mc-fb')) return;
  const L = {
    en: { t: 'Suggest an idea to the developer', s: 'Tell us what to improve, what is missing, or what is broken.', ph: 'Your suggestion…', c: 'Name or contact (optional)', cat: 'Category (optional)', idea: 'Idea', bug: 'Bug', other: 'Other', send: 'Send', sending: 'Sending…', ty: 'Thank you! Your message reached the developer.', more: 'Send another', empty: 'Please write a message first.', rate: 'Too many messages. Please try again in an hour.', err: 'Could not send. Please try again.' },
    ar: { t: 'اقترح فكرة على المطوّر', s: 'أخبرنا بما يجب تحسينه، أو ما ينقص، أو ما لا يعمل.', ph: 'اقتراحك…', c: 'الاسم أو وسيلة التواصل (اختياري)', cat: 'الفئة (اختياري)', idea: 'فكرة', bug: 'خلل', other: 'أخرى', send: 'إرسال', sending: 'جارٍ الإرسال…', ty: 'شكرًا لك! وصلت رسالتك إلى المطوّر.', more: 'إرسال رسالة أخرى', empty: 'يرجى كتابة رسالة أولًا.', rate: 'رسائل كثيرة جدًا. حاول مرة أخرى بعد ساعة.', err: 'تعذّر الإرسال. حاول مرة أخرى.' },
  };
  const st = document.createElement('style');
  st.textContent = '#mc-fb{max-width:640px;width:100%;box-sizing:border-box;margin:28px auto 0;padding:0 16px}#mc-fb .fb-form{display:block}#mc-fb input{min-width:0;font-family:inherit}#mc-fb .fb-box{background:#121826;border:1px solid #1c2333;border-radius:12px;padding:16px}#mc-fb h2{margin:0 0 4px;font-size:16px;color:#e6edf7}#mc-fb p{margin:0 0 12px;font-size:13px;color:#7d879c}#mc-fb textarea,#mc-fb input,#mc-fb select{width:100%;box-sizing:border-box;background:#0b0f17;color:#e6edf7;border:1px solid #2a3348;border-radius:8px;padding:9px 10px;font:inherit;font-size:14px}#mc-fb textarea{min-height:84px;resize:vertical}#mc-fb .fb-row{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}#mc-fb .fb-row>*{flex:1 1 160px}#mc-fb button{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:9px 18px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;flex:0 0 auto}#mc-fb button:disabled{opacity:.6;cursor:default}#mc-fb .fb-meta{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;font-size:12px;color:#7d879c}#mc-fb .fb-err{color:#ff6b6b}#mc-fb .fb-ok{color:#3ddc97;font-size:14px;margin:4px 0 10px}#mc-fb .fb-hp{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}#mc-fb{position:relative}#mc-fb textarea:focus,#mc-fb input:focus,#mc-fb select:focus{outline:2px solid #4f7cff;outline-offset:0}';
  document.head.appendChild(st);
  const sec = document.createElement('section');
  sec.id = 'mc-fb'; sec.setAttribute('aria-labelledby', 'mc-fb-t');
  sec.innerHTML = '<div class="fb-box"><h2 id="mc-fb-t"></h2><p class="fb-sub"></p>'
    + '<form class="fb-form" novalidate><label class="fb-hp" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off"></label>'
    + '<textarea name="msg" maxlength="1000" required></textarea>'
    + '<div class="fb-row"><input name="contact" maxlength="80" autocomplete="off"><select name="cat"><option value=""></option><option value="idea"></option><option value="bug"></option><option value="other"></option></select></div>'
    + '<div class="fb-meta"><span class="fb-status" role="status" aria-live="polite"></span><span class="fb-count">0/1000</span><button type="submit"></button></div></form>'
    + '<div class="fb-done" hidden><div class="fb-ok"></div><button type="button" class="fb-more"></button></div></div>';
  ft.parentNode.insertBefore(sec, ft);
  const $ = (q) => sec.querySelector(q), f = $('.fb-form'), ta = f.msg, status = $('.fb-status');
  const lang = () => (document.documentElement.lang === 'ar' ? 'ar' : 'en');
  let busy = false;
  const apply = () => {
    const t = L[lang()]; sec.dir = lang() === 'ar' ? 'rtl' : 'ltr';
    $('#mc-fb-t').textContent = t.t; $('.fb-sub').textContent = t.s; ta.placeholder = t.ph; ta.setAttribute('aria-label', t.t);
    f.contact.placeholder = t.c; f.contact.setAttribute('aria-label', t.c); f.cat.setAttribute('aria-label', t.cat);
    const o = f.cat.options; o[0].textContent = t.cat; o[1].textContent = t.idea; o[2].textContent = t.bug; o[3].textContent = t.other;
    $('.fb-form button').textContent = busy ? t.sending : t.send; $('.fb-ok').textContent = t.ty; $('.fb-more').textContent = t.more;
  };
  apply(); new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  ta.addEventListener('input', () => { $('.fb-count').textContent = ta.value.length + '/1000'; status.textContent = ''; });
  const say = (k) => { status.textContent = L[lang()][k]; status.className = 'fb-status fb-err'; };
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); if (busy) return;
    const msg = ta.value.trim(); if (!msg) { say('empty'); ta.focus(); return; }
    busy = true; $('.fb-form button').disabled = true; apply(); status.textContent = '';
    try {
      const r = await fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ msg: msg.slice(0, 1000), contact: f.contact.value.trim().slice(0, 80), cat: f.cat.value, lang: lang(), path: location.pathname, hp: f.website.value }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { f.reset(); $('.fb-count').textContent = '0/1000'; f.hidden = true; $('.fb-done').hidden = false; }
      else say(d.err === 'rate' ? 'rate' : d.err === 'empty' ? 'empty' : 'err');
    } catch { say('err'); }
    busy = false; $('.fb-form button').disabled = false; apply();
  });
  $('.fb-more').addEventListener('click', () => { $('.fb-done').hidden = true; f.hidden = false; ta.focus(); });
})();

// Legal + accuracy links in every footer (privacy, terms, live accuracy), injected once.
(function () {
  const ft = document.querySelector('footer'); if (!ft) return;
  const L = [['/accuracy', 'Accuracy', 'الدقة'], ['/privacy', 'Privacy', 'الخصوصية'], ['/terms', 'Terms', 'الشروط']];
  const made = [];
  for (const [h, en, ar] of L) { if (ft.querySelector(`a[href="${h}"]`)) continue; const a = document.createElement('a'); a.href = h; a.dataset.en = en; a.dataset.ar = ar; ft.append(document.createTextNode(' · '), a); made.push(a); }
  const lbl = () => { const ar = document.documentElement.lang === 'ar'; made.forEach(a => { a.textContent = ar ? a.dataset.ar : a.dataset.en; }); };
  lbl(); new MutationObserver(lbl).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
})();
