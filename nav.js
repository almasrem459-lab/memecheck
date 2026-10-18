(function () {
  const btn = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!btn || !nav) return;

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
      navRugs: 'عمليات السحب التي رصدناها',
      navHow: 'كيف يعمل التقييم',
      navOpenSrc: 'مفتوح المصدر',
    };
    const lang = localStorage.getItem('mc_lang') || 'en';
    if (lang === 'ar') {
      document.documentElement.lang = 'ar';
      document.documentElement.dir = 'rtl';
      btn.setAttribute('aria-label', AR.navMenu);
      nav.querySelectorAll('[data-t]').forEach((e) => {
        if (AR[e.dataset.t]) e.textContent = AR[e.dataset.t];
      });
    }
  }
})();
