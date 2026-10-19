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
      navHow: 'كيف يعمل التقييم',
      navOpenSrc: 'مفتوح المصدر',
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
