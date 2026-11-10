// RugDNA homepage card: live stats + mini search (links to /rugdna). Language comes from <html lang>, set by app.js.
(function () {
  const $ = (i) => document.getElementById(i), f = $('rgh-f'); if (!f) return;
  const ar = () => document.documentElement.lang === 'ar', q = $('rgh-q');
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const setPh = () => { q.placeholder = ar() ? 'محفظة أو عقد عملة…' : 'Wallet or token mint…'; q.setAttribute('aria-label', q.placeholder); };
  setPh(); new MutationObserver(setPh).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  f.addEventListener('submit', (e) => { e.preventDefault(); const v = q.value.trim(); location.href = '/rugdna' + (v ? '?q=' + encodeURIComponent(v) : ''); });
  const count = (el, to) => { if (matchMedia('(prefers-reduced-motion: reduce)').matches || to < 2) { el.textContent = fmt(to); return; } const t0 = performance.now(); (function step(t) { const p = Math.min(1, (t - t0) / 900); el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(step); })(t0); };
  fetch('/api/rugdna/stats').then(r => r.json()).then(s => {
    if (!s || !s.ok) throw 0;
    count($('rgh-n1'), s.launches_indexed); count($('rgh-n2'), s.wallets_resolved); count($('rgh-n3'), s.clusters);
    $('rgh-n4').textContent = fmt(s.flagged_dead) + ' / ' + fmt(s.flagged);
  }).catch(() => { ['rgh-n1', 'rgh-n2', 'rgh-n3', 'rgh-n4'].forEach(i => { $(i).textContent = '—'; }); });
})();
