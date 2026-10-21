// MemeCheckShield community chat client (/chat). Plain text only: every message is built with DOM nodes + textContent,
// never innerHTML, so nothing a user types can become markup. Contract addresses become scan chips (/?ca=<addr>).
// Live via WebSocket (/api/chat?ws=1, Durable Object with hibernation); falls back to polling /api/chat?since=<id>.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const C = {
    en: { dir: 'ltr', langBtn: 'العربية', title: 'Community chat', sub: 'Talk coins in real time. Paste a contract address and it becomes a one-tap MemeCheckShield scan for everyone.',
      pin: 'Never share your seed phrase. Admins will never DM you. Not financial advice.', connecting: 'Connecting…', live: 'Live', polling: 'Live (slow mode)', offline: 'Reconnecting…',
      online: (n) => `${n} online`, send: 'Send', save: 'Save', cancel: 'Cancel', ph: 'Say something or paste a CA…', nickTitle: 'Change nickname', empty: 'No messages yet. Say gm 👋',
      report: 'Report', reported: 'Reported', reportQ: 'Report this message as spam/scam? 3 reports hide it.', scan: 'Scan', team: 'MemeCheckShield team', newMsgs: 'New messages ↓',
      rules: 'Rules: no links (except memecheck.pages.dev), no DMs/airdrop/seed-phrase talk, 1 message per 5 s. Use ⚑ to report: 3 reports hide a message.',
      nickSaved: 'Nickname saved.', sent: '', err: {
        rate_fast: (w) => `Slow down: 1 message every 5 seconds${w ? ` (wait ${w}s)` : ''}.`, rate_10m: (w) => `Limit reached: 20 messages per 10 minutes${w ? ` (try again in ${Math.ceil(w / 60)} min)` : ''}.`,
        too_long: () => 'Max 300 characters.', empty: () => 'Type a message first.', link: () => 'Links are not allowed (only memecheck.pages.dev). Paste the contract address instead: it becomes a scan chip.',
        scam: () => 'Blocked: looks like a common scam phrase (DMs, seed phrase/private key, wallet connect, airdrop claims, "send SOL").', bad_word: () => 'Blocked: hateful language is not allowed.',
        dup: () => 'Duplicate message.', banned: (w) => `You are muted${w ? ` for ${Math.ceil(w / 60)} more min` : ''}.`, auto_muted: () => 'Muted for 1 hour after repeated blocked messages.',
        nick: () => 'Nickname: 2–24 letters, numbers, spaces or # . _ -', nick_reserved: () => 'That nickname is reserved (no admin / support / team / MemeCheckShield names).',
        too_many_ca: () => 'Max 3 contract addresses per message.', report_self: () => 'You cannot report your own message.', report_admin: () => 'Team messages cannot be reported.',
        full: () => 'The room is full right now. Try again soon.', net: () => 'Network error. Try again.', x: () => 'Could not send. Try again.' },
      nav: { navMenu: 'Menu', navChecker: 'Checker', navWhales: 'Whale buys', navSmart: 'Smart money', navChat: 'Community chat', navRugs: 'Rugs we caught', navHow: 'How the score works', navOpenSrc: 'Open source',
        disclaimer: 'Not financial advice. Automated checks can miss scams or flag legit tokens. Always DYOR.' } },
    ar: { dir: 'rtl', langBtn: 'English', title: 'غرفة النقاش', sub: 'ناقش العملات مباشرة. الصق عنوان العقد ليتحوّل إلى فحص MemeCheckShield بلمسة واحدة للجميع.',
      pin: 'لا تشارك عبارة الاسترداد أبدًا. المشرفون لن يراسلوك على الخاص أبدًا. ليست نصيحة مالية.', connecting: 'جارٍ الاتصال…', live: 'مباشر', polling: 'مباشر (وضع بطيء)', offline: 'إعادة الاتصال…',
      online: (n) => `${n} متصل`, send: 'إرسال', save: 'حفظ', cancel: 'إلغاء', ph: 'اكتب رسالة أو الصق عنوان عقد…', nickTitle: 'تغيير الاسم', empty: 'لا توجد رسائل بعد. قل مرحبًا 👋',
      report: 'إبلاغ', reported: 'تم الإبلاغ', reportQ: 'الإبلاغ عن هذه الرسالة كاحتيال/إزعاج؟ ثلاثة بلاغات تخفيها.', scan: 'افحص', team: 'فريق MemeCheckShield', newMsgs: 'رسائل جديدة ↓',
      rules: 'القواعد: لا روابط (إلا memecheck.pages.dev)، لا حديث عن الخاص أو الإيردروب أو عبارة الاسترداد، رسالة كل 5 ثوانٍ. استخدم ⚑ للإبلاغ: ثلاثة بلاغات تخفي الرسالة.',
      nickSaved: 'تم حفظ الاسم.', sent: '', err: {
        rate_fast: (w) => `تمهّل: رسالة واحدة كل 5 ثوانٍ${w ? ` (انتظر ${w} ث)` : ''}.`, rate_10m: (w) => `وصلت للحد: 20 رسالة كل 10 دقائق${w ? ` (حاول بعد ${Math.ceil(w / 60)} د)` : ''}.`,
        too_long: () => 'الحد الأقصى 300 حرف.', empty: () => 'اكتب رسالة أولًا.', link: () => 'الروابط غير مسموحة (إلا memecheck.pages.dev). الصق عنوان العقد بدلًا من ذلك ليصبح زر فحص.',
        scam: () => 'محظور: تبدو كعبارة احتيال شائعة (الخاص، عبارة الاسترداد/المفتاح الخاص، ربط المحفظة، الإيردروب، "أرسل SOL").', bad_word: () => 'محظور: خطاب الكراهية غير مسموح.',
        dup: () => 'رسالة مكررة.', banned: (w) => `أنت مكتوم${w ? ` لمدة ${Math.ceil(w / 60)} د أخرى` : ''}.`, auto_muted: () => 'تم كتمك لمدة ساعة بسبب تكرار رسائل محظورة.',
        nick: () => 'الاسم: من 2 إلى 24 حرفًا أو رقمًا أو مسافة أو # . _ -', nick_reserved: () => 'هذا الاسم محجوز (لا أسماء مشرف / دعم / فريق / MemeCheckShield).',
        too_many_ca: () => 'الحد الأقصى 3 عناوين عقود في الرسالة.', report_self: () => 'لا يمكنك الإبلاغ عن رسالتك.', report_admin: () => 'لا يمكن الإبلاغ عن رسائل الفريق.',
        full: () => 'الغرفة ممتلئة الآن. حاول لاحقًا.', net: () => 'خطأ في الشبكة. حاول مرة أخرى.', x: () => 'تعذّر الإرسال. حاول مرة أخرى.' },
      nav: { navMenu: 'القائمة', navChecker: 'الفاحص', navWhales: 'حيتان', navSmart: 'الأموال الذكية', navChat: 'غرفة النقاش', navRugs: 'عمليات السحب التي رصدناها', navHow: 'كيف يعمل التقييم', navOpenSrc: 'مفتوح المصدر',
        disclaimer: 'ليست نصيحة مالية. قد تفوّت الفحوصات الآلية بعض عمليات الاحتيال أو تُنبّه على عملات سليمة. ابحث بنفسك دائمًا.' } },
  };
  let lang = new URLSearchParams(location.search).get('lang') || localStorage.getItem('mc_lang') || 'en'; if (!C[lang]) lang = 'en';
  const t = () => C[lang];

  // ---- identity (no account): random uid + editable nickname in localStorage ----
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  let uid = ls.get('mc_chat_uid');
  if (!/^[a-z0-9]{12,40}$/i.test(uid || '')) { const b = new Uint8Array(12); crypto.getRandomValues(b); uid = [...b].map(x => x.toString(16).padStart(2, '0')).join(''); ls.set('mc_chat_uid', uid); }
  let nick = ls.get('mc_chat_nick');
  if (!nick) { nick = 'Degen#' + (1000 + (crypto.getRandomValues(new Uint16Array(1))[0] % 9000)); ls.set('mc_chat_nick', nick); }
  const mine = new Set(JSON.parse(sessionStorage.getItem('mc_chat_mine') || '[]'));
  const reported = new Set(JSON.parse(sessionStorage.getItem('mc_chat_rep') || '[]'));
  const saveSets = () => { try { sessionStorage.setItem('mc_chat_mine', JSON.stringify([...mine].slice(-300))); sessionStorage.setItem('mc_chat_rep', JSON.stringify([...reported].slice(-300))); } catch {} };

  // ---- rendering (DOM only, no innerHTML with data) ----
  const log = $('log'), msgs = new Map(); let lastId = 0;
  const TOKEN = /(0x[0-9a-fA-F]{40}(?![0-9a-zA-Z]))|((?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z]))|((?:https?:\/\/)?(?:[a-z0-9-]+\.)*memecheck\.pages\.dev(?:\/[^\s]*)?)/gi;
  const isSol = (s) => /[A-Z]/.test(s) && /[a-z]/.test(s);
  const short = (a) => a.slice(0, 4) + '…' + a.slice(-4);
  function textNodes(parent, s) {
    let i = 0; TOKEN.lastIndex = 0; let m;
    while ((m = TOKEN.exec(s))) {
      const [all, evm, sol, own] = m;
      if (sol && !isSol(sol)) continue;
      if (m.index > i) parent.appendChild(document.createTextNode(s.slice(i, m.index)));
      if (evm || sol) {
        const a = document.createElement('a'); a.className = 'ca'; a.href = '/?ca=' + encodeURIComponent(all); a.title = all; a.dir = 'ltr';
        const k = document.createElement('span'); k.className = 'k'; k.textContent = '🔍 ' + t().scan;
        a.append(document.createTextNode((evm ? 'EVM ' : 'SOL ') + short(all)), k); a.dataset.ca = all; parent.appendChild(a);
      } else {
        let href = null; try { const u = new URL(/^https?:/i.test(own) ? own : 'https://' + own); if (/(^|\.)memecheck\.pages\.dev$/i.test(u.hostname)) href = u.pathname + u.search + u.hash; } catch {}
        if (href && href.startsWith('/')) { const a = document.createElement('a'); a.className = 'own'; a.href = href; a.textContent = own; parent.appendChild(a); }
        else parent.appendChild(document.createTextNode(own));
      }
      i = m.index + all.length;
    }
    if (i < s.length) parent.appendChild(document.createTextNode(s.slice(i)));
  }
  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const time = (ts) => { try { return new Date(ts).toLocaleTimeString(lang === 'ar' ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  function el(m) {
    const d = document.createElement('div'); d.className = 'msg' + (mine.has(m.id) ? ' me' : '') + (m.admin ? ' team' : ''); d.dataset.id = m.id;
    const h = document.createElement('div'); h.className = 'mh';
    const b = document.createElement('b'); b.textContent = String(m.nick || '?'); b.style.color = m.admin ? '#86efac' : `hsl(${hue(m.tag || m.nick)} 70% 70%)`;
    h.appendChild(b);
    if (m.admin) { const g = document.createElement('span'); g.className = 'badge'; g.textContent = '✓ ' + t().team; h.appendChild(g); }
    else { const g = document.createElement('span'); g.className = 'tg'; g.textContent = '#' + String(m.tag || '').slice(0, 4); g.title = 'ID tag (nicknames can be copied, tags cannot)'; h.appendChild(g); }
    const tm = document.createElement('time'); tm.textContent = time(m.ts); tm.dateTime = new Date(m.ts).toISOString(); h.appendChild(tm);
    if (!m.admin && !mine.has(m.id)) {
      const r = document.createElement('button'); r.type = 'button'; r.className = 'rep'; r.dataset.id = m.id;
      if (reported.has(m.id)) { r.disabled = true; r.textContent = '⚑ ' + t().reported; } else { r.textContent = '⚑'; r.title = t().report; r.setAttribute('aria-label', t().report); }
      h.appendChild(r);
    }
    const p = document.createElement('div'); p.className = 'mt'; textNodes(p, String(m.text || ''));
    d.append(h, p); return d;
  }
  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  let pill = null;
  function showPill() { if (pill) return; pill = document.createElement('button'); pill.type = 'button'; pill.className = 'newpill'; pill.textContent = t().newMsgs; pill.onclick = () => { log.scrollTop = log.scrollHeight; hidePill(); }; log.appendChild(pill); }
  function hidePill() { if (pill) { pill.remove(); pill = null; } }
  log.addEventListener('scroll', () => { if (nearBottom()) hidePill(); });
  function emptyState() { const e = $('empty'); if (msgs.size) { if (e) e.remove(); return; } if (!e) { const d = document.createElement('div'); d.className = 'empty'; d.id = 'empty'; d.textContent = t().empty; log.appendChild(d); } else e.textContent = t().empty; }
  function add(m, scroll) {
    if (!m || !m.id || msgs.has(m.id)) return;
    const stick = scroll || nearBottom(), node = el(m);
    // keep id order (unhide can resend an older message)
    let before = null; for (const [id, n] of msgs) if (id > m.id) { before = n; break; }
    msgs.set(m.id, node); if (before) { log.insertBefore(node, before); const s = [...msgs.entries()].sort((a, b) => a[0] - b[0]); msgs.clear(); s.forEach(([k, v]) => msgs.set(k, v)); }
    else log.insertBefore(node, pill || null);
    lastId = Math.max(lastId, m.id);
    while (msgs.size > 200) { const [k, v] = msgs.entries().next().value; v.remove(); msgs.delete(k); }
    emptyState();
    if (stick) log.scrollTop = log.scrollHeight; else if (!before) showPill();
  }
  function drop(ids) { for (const id of ids) { const n = msgs.get(id); if (n) { n.remove(); msgs.delete(id); } } emptyState(); }
  function reset(list) { for (const n of msgs.values()) n.remove(); msgs.clear(); lastId = 0; hidePill(); (list || []).forEach(m => add(m, true)); emptyState(); log.scrollTop = log.scrollHeight; }

  // ---- status / errors ----
  let mode = 'connecting';
  function setMode(m) { mode = m; const d = $('dot'); d.className = 'dot' + (m === 'live' ? ' live' : m === 'polling' ? ' poll' : ''); $('conn').textContent = t()[m] || t().connecting; }
  let onlineN = null; const setOnline = (n) => { onlineN = n; $('online').textContent = n != null ? t().online(n) : ''; };
  let errT = 0; function say(code, wait, ok) {
    const e = $('cerr'); clearTimeout(errT); e.className = 'cerr' + (ok ? ' ok' : '');
    e.textContent = ok ? code : (t().err[code] || t().err.x)(wait); errT = setTimeout(() => { e.textContent = ''; }, 7000);
  }

  // ---- transport: WebSocket first, polling fallback ----
  let ws = null, fails = 0, everOpen = false, pingT = 0, pollT = 0, retryT = 0, ref = 0; const pending = new Map();
  function connect() {
    clearTimeout(retryT);
    if (!('WebSocket' in window)) return startPolling();
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/chat?ws=1&uid=' + encodeURIComponent(uid)); } catch { return onDown(); }
    ws.onopen = () => { fails = 0; everOpen = true; stopPolling(); setMode('live'); clearInterval(pingT); pingT = setInterval(() => { try { ws.readyState === 1 && ws.send('ping'); } catch {} }, 25000); };
    ws.onmessage = (ev) => {
      if (ev.data === 'pong') return; let d; try { d = JSON.parse(ev.data); } catch { return; }
      if (d.t === 'hist') { reset(d.msgs); setOnline(d.online); }
      else if (d.t === 'msg') add(d.m);
      else if (d.t === 'hide' || d.t === 'del') drop(d.ids || []);
      else if (d.t === 'reset') reset([]);
      else if (d.t === 'online') setOnline(d.n);
      else if ((d.t === 'ok' || d.t === 'err' || d.t === 'reported') && pending.has(d.ref)) { pending.get(d.ref)(d); pending.delete(d.ref); }
    };
    ws.onclose = () => { clearInterval(pingT); ws = null; for (const f of pending.values()) f({ t: 'err', err: 'net' }); pending.clear(); onDown(); };
    ws.onerror = () => {};
  }
  function onDown() {
    fails++; setMode(fails >= 3 || !everOpen && fails >= 2 ? 'polling' : 'offline');
    if (fails >= 2) startPolling();
    retryT = setTimeout(connect, Math.min(60000, 1000 * 2 ** Math.min(fails, 6)));
  }
  function startPolling() { if (pollT) return; setMode('polling'); const tick = async () => { if (document.visibilityState === 'visible') await poll(); pollT = setTimeout(tick, 8000); }; tick(); }
  function stopPolling() { clearTimeout(pollT); pollT = 0; }
  async function poll() {
    try {
      const r = await fetch('/api/chat?since=' + lastId, { cache: 'no-store' }); const d = await r.json(); if (!d.ok) return;
      if (d.ids) { const keep = new Set(d.ids); drop([...msgs.keys()].filter(id => !keep.has(id))); }
      if (!lastId) reset(d.msgs); else d.msgs.forEach(m => add(m));
      setOnline(d.online);
    } catch {}
  }
  function rpc(obj) {
    if (ws && ws.readyState === 1) return new Promise((res) => { const r = ++ref; pending.set(r, res); ws.send(JSON.stringify({ ...obj, ref: r })); setTimeout(() => { if (pending.has(r)) { pending.delete(r); res({ t: 'err', err: 'net' }); } }, 10000); });
    return fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: obj.t, ...obj, uid }) })
      .then(r => r.json()).then(d => (d.err ? { t: 'err', ...d } : { t: 'ok', ...d })).catch(() => ({ t: 'err', err: 'net' }));
  }

  // ---- composer ----
  const input = $('msg'), sendB = $('send');
  const cnt = () => { $('cnt').textContent = input.value.length + '/300'; };
  input.addEventListener('input', cnt);
  let sending = false;
  $('comp').addEventListener('submit', async (e) => {
    e.preventDefault(); if (sending) return;
    const text = input.value.trim(); if (!text) return say('empty'); if (text.length > 300) return say('too_long');
    sending = true; sendB.disabled = true;
    const d = await rpc({ t: 'post', text, nick });
    sending = false; sendB.disabled = false;
    if (d.t === 'err') { say(d.err, d.wait); return; }
    if (d.id) { mine.add(d.id); saveSets(); const n = msgs.get(d.id); if (n) { n.classList.add('me'); n.querySelector('.rep')?.remove(); } }
    input.value = ''; cnt(); $('cerr').textContent = '';
    if (mode === 'polling') poll();
    log.scrollTop = log.scrollHeight;
  });
  log.addEventListener('click', async (e) => {
    const b = e.target.closest('button.rep'); if (!b || b.disabled) return;
    if (!confirm(t().reportQ)) return;
    const id = +b.dataset.id; b.disabled = true;
    const d = await rpc({ t: 'report', id });
    if (d.t === 'err') { b.disabled = false; say(d.err, d.wait); return; }
    reported.add(id); saveSets(); b.textContent = '⚑ ' + t().reported;
    if (d.hidden) drop([id]);
  });
  // nickname editor
  const nb = $('nickb'), row = $('nickrow'), ni = $('nick');
  const showNick = () => { nb.textContent = nick + ' ✎'; nb.title = t().nickTitle; };
  nb.addEventListener('click', () => { row.hidden = false; ni.value = nick; ni.focus(); ni.select(); });
  $('nickcancel').addEventListener('click', () => { row.hidden = true; });
  const saveNick = () => {
    const v = ni.value.replace(/[^\p{L}\p{N} #._-]/gu, '').replace(/\s{2,}/g, ' ').trim();
    if (v.length < 2 || v.length > 24) return say('nick');
    nick = v; ls.set('mc_chat_nick', nick); showNick(); row.hidden = true; say(t().nickSaved, 0, true);
  };
  $('nicksave').addEventListener('click', saveNick);
  ni.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveNick(); } if (e.key === 'Escape') row.hidden = true; });

  // ---- language ----
  function applyLang() {
    const L = t(); document.documentElement.lang = lang; document.documentElement.dir = L.dir;
    document.querySelectorAll('[data-c]').forEach(e => { const v = L[e.dataset.c]; if (typeof v === 'string') e.textContent = v; });
    document.querySelectorAll('[data-t]').forEach(e => { const v = L.nav[e.dataset.t]; if (v) e.textContent = v; });
    $('nav-toggle')?.setAttribute('aria-label', L.nav.navMenu);
    $('lang').textContent = L.langBtn; input.placeholder = L.ph; showNick(); setMode(mode); setOnline(onlineN); emptyState();
    document.title = L.title + ' — MemeCheckShield';
    for (const [id, n] of msgs) { const m = n; m.querySelectorAll('.ca .k').forEach(k => { k.textContent = '🔍 ' + L.scan; }); const tb = m.querySelector('.badge'); if (tb) tb.textContent = '✓ ' + L.team;
      const r = m.querySelector('.rep'); if (r) { if (r.disabled) r.textContent = '⚑ ' + L.reported; else { r.title = L.report; r.setAttribute('aria-label', L.report); } } }
  }
  $('lang').addEventListener('click', () => { lang = lang === 'en' ? 'ar' : 'en'; ls.set('mc_lang', lang); applyLang(); });

  applyLang(); cnt(); connect();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !ws && !retryT) connect(); });
})();
