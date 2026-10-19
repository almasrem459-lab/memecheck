// Minimal service worker: caches same-origin static assets only. Never touches /api/* or cross-origin requests.
const V = 'mc-static-fb2';
const CORE = ['/', '/style.css?v=1792800001', '/app.js?v=1792800001', '/nav.js?v=1792800001', '/manifest.webmanifest', '/icon-192.png', '/favicon-32.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') { // network-first for pages so deploys show up immediately; cached shell when offline
    e.respondWith(fetch(req).then(r => { if (u.pathname === '/' && r.ok) { const c = r.clone(); caches.open(V).then(x => x.put('/', c)); } return r; }).catch(() => caches.match('/')));
    return;
  }
  if (!/\.(js|css|png|svg|webmanifest|ico)$/.test(u.pathname)) return;
  e.respondWith(caches.open(V).then(async c => { const hit = await c.match(req); const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }); if (hit) { net.catch(() => {}); return hit; } return net; /* no cached copy: plain network (never resolve to undefined) */ }));
});
