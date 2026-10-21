// Social & Community card on every scan result (#so-box). Data from /api/social (server-side, cached).
// Informational only: does not change the risk score. All strings escaped; links rebuilt server-side from validated handles.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
const num = (n) => n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : Number(n).toLocaleString('en-US');
const L = {
  en: { t: 'Social & Community', sub: 'Project links found on DexScreener, GeckoTerminal, pump.fun and the token metadata. Info only — not part of the risk score.',
    loading: 'Checking socials…', fail: 'Social data unavailable right now.', none: 'No social links found.',
    x: 'X / Twitter', tg: 'Telegram', web: 'Website', dc: 'Discord', xc: 'X Community', followers: 'followers', members: 'members', subs: 'subscribers', online: 'online',
    age: (d) => d < 1 ? 'created today' : d < 60 ? `${d} d old` : d < 730 ? `${Math.round(d / 30)} mo old` : `${(d / 365).toFixed(1)} y old`,
    domAge: (d) => `domain ${d < 60 ? d + ' d' : d < 730 ? Math.round(d / 30) + ' mo' : (d / 365).toFixed(1) + ' y'} old`,
    verified: 'verified', live: 'online', down: 'not reachable', nf: 'not found', na: 'stats unavailable', via: 'from',
    s: { noSocials: 'No socials at all — anonymous launch, higher risk.', noX: 'No X/Twitter account linked.', noCommunity: 'No Telegram or Discord community linked.',
      noWebsite: 'No website linked.', xNew: (p) => `X account is brand new (${p.days} d) — common for rugs.`, xYoung: (p) => `X account is young (${p.days} d).`,
      xFewFollowers: (p) => `X account has very few followers (${p.n}).`, xAfterToken: 'X account was created after the token — the link may have been swapped.',
      xMismatch: 'X handle does not match the token name/symbol (may be a reused or personal account).', xProtected: 'X account is protected (private).',
      xGone: 'Linked X account no longer exists (deleted, renamed or suspended).', xMulti: (p) => `${p.n} different X accounts are linked across sources.`,
      tgGone: 'Linked Telegram does not exist or is private.', tgSmall: (p) => `Telegram is tiny (${p.n} members).`, webDown: 'Website is not reachable.', webNew: (p) => `Website domain is brand new (${p.days} d).` },
    note: 'X data via the public fxtwitter mirror, Telegram from the public t.me page, domain age via RDAP. Any of them can be missing or stale; cached up to 30 min.' },
  ar: { t: 'التواصل الاجتماعي والمجتمع', sub: 'روابط المشروع من DexScreener وGeckoTerminal وpump.fun وبيانات العملة. للمعلومة فقط — لا تدخل في درجة المخاطر.',
    loading: 'جارٍ فحص الحسابات…', fail: 'بيانات التواصل غير متاحة حاليًا.', none: 'لم يتم العثور على روابط تواصل.',
    x: 'X / تويتر', tg: 'تيليجرام', web: 'الموقع', dc: 'ديسكورد', xc: 'مجتمع X', followers: 'متابع', members: 'عضو', subs: 'مشترك', online: 'متصل',
    age: (d) => d < 1 ? 'أُنشئ اليوم' : d < 60 ? `عمره ${d} يوم` : d < 730 ? `عمره ${Math.round(d / 30)} شهر` : `عمره ${(d / 365).toFixed(1)} سنة`,
    domAge: (d) => `عمر النطاق ${d < 60 ? d + ' يوم' : d < 730 ? Math.round(d / 30) + ' شهر' : (d / 365).toFixed(1) + ' سنة'}`,
    verified: 'موثّق', live: 'يعمل', down: 'لا يستجيب', nf: 'غير موجود', na: 'الإحصاءات غير متاحة', via: 'من',
    s: { noSocials: 'لا توجد أي حسابات تواصل — إطلاق مجهول، مخاطرة أعلى.', noX: 'لا يوجد حساب X/تويتر مرتبط.', noCommunity: 'لا يوجد مجتمع تيليجرام أو ديسكورد مرتبط.',
      noWebsite: 'لا يوجد موقع مرتبط.', xNew: (p) => `حساب X جديد جدًا (${p.days} يوم) — شائع في عمليات الاحتيال.`, xYoung: (p) => `حساب X حديث (${p.days} يوم).`,
      xFewFollowers: (p) => `حساب X لديه متابعون قليلون جدًا (${p.n}).`, xAfterToken: 'حساب X أُنشئ بعد العملة — ربما تم تبديل الرابط.',
      xMismatch: 'اسم حساب X لا يطابق اسم/رمز العملة (قد يكون حسابًا شخصيًا أو معاد استخدامه).', xProtected: 'حساب X محمي (خاص).',
      xGone: 'حساب X المرتبط لم يعد موجودًا (محذوف أو تغيّر اسمه أو موقوف).', xMulti: (p) => `${p.n} حسابات X مختلفة مرتبطة عبر المصادر.`,
      tgGone: 'تيليجرام المرتبط غير موجود أو خاص.', tgSmall: (p) => `مجموعة تيليجرام صغيرة جدًا (${p.n} عضو).`, webDown: 'الموقع لا يستجيب.', webNew: (p) => `نطاق الموقع جديد جدًا (${p.days} يوم).` },
    note: 'بيانات X عبر مرآة fxtwitter العامة، وتيليجرام من صفحة t.me العامة، وعمر النطاق عبر RDAP. قد تكون أي منها ناقصة أو قديمة؛ تُخزَّن حتى 30 دقيقة.' },
};
const cache = new Map(); let seq = 0;
const ST = { fail: 'fail', warn: 'warn', info: 'na' };
const link = (u, txt) => /^https:\/\//.test(u || '') ? `<a href="${esc(u)}" target="_blank" rel="noopener nofollow ugc" dir="ltr">${esc(txt)}</a>` : esc(txt);

function html(d, t) {
  if (!d) return `<div class="card" id="so-card"><h3>${esc(t.t)}</h3><p class="muted">${esc(t.fail)}</p></div>`;
  const rows = [];
  const x = d.x?.[0];
  if (x) {
    const p = x.profile || {}; const days = p.joined ? Math.floor((Date.now() - p.joined) / 864e5) : null;
    const bits = p.st === 'ok' ? [`<b dir="ltr">${num(p.followers)}</b> ${esc(t.followers)}`, days != null ? esc(t.age(days)) : '', p.verified ? '✔ ' + esc(t.verified) : ''].filter(Boolean)
      : [`<span class="${p.st === 'notfound' ? 'dn' : 'muted'}">${esc(p.st === 'notfound' ? t.nf : t.na)}</span>`];
    rows.push([t.x, link(x.url, '@' + x.handle) + (d.x.length > 1 ? ' ' + d.x.slice(1).map(o => link(o.url, '@' + o.handle)).join(' ') : ''), bits.join(' · ')]);
  }
  if (d.xCommunity) rows.push([t.xc, link(d.xCommunity.url, 'x.com/i/communities'), '']);
  const g = d.tg?.[0];
  if (g) {
    const i = g.info || {};
    const bits = i.st === 'ok' && i.members != null ? [`<b dir="ltr">${num(i.members)}</b> ${esc(i.type === 'channel' ? t.subs : t.members)}`, i.online ? `${num(i.online)} ${esc(t.online)}` : ''].filter(Boolean)
      : [`<span class="${i.st === 'notfound' ? 'dn' : 'muted'}">${esc(i.st === 'notfound' ? t.nf : t.na)}</span>`];
    rows.push([t.tg, link(g.url, 't.me/' + g.name), bits.join(' · ')]);
  }
  if (d.discord) rows.push([t.dc, link(d.discord.url, 'discord.gg/' + d.discord.code), '']);
  const w = d.web?.[0];
  if (w) {
    const i = w.info || {};
    const bits = [i.live === true ? `<span class="up">● ${esc(t.live)}</span>` : i.live === false ? `<span class="dn">● ${esc(t.down)}</span>` : '', i.domainAge != null ? esc(t.domAge(i.domainAge)) : ''].filter(Boolean);
    rows.push([t.web, link(w.url, w.host), bits.join(' · ')]);
  }
  const sig = (d.signals || []).map(s => { const f = t.s[s.id]; if (!f) return ''; return `<div class="row"><span class="st ${ST[s.level] || 'na'}">${s.level === 'fail' ? '⚠' : s.level === 'warn' ? '!' : 'i'}</span><span>${esc(typeof f === 'function' ? f(s) : f)}</span></div>`; }).join('');
  return `<div class="card" id="so-card"><h3>👥 ${esc(t.t)}</h3><p class="muted">${esc(t.sub)}</p>
    ${rows.length ? `<div class="so-grid">${rows.map(([k, v, b]) => `<div class="so-row"><span class="so-k">${esc(k)}</span><span class="so-v">${v}</span><span class="so-b muted">${b}</span></div>`).join('')}</div>` : `<p class="muted">${esc(d.sources?.dexscreener === 'fail' && d.sources?.geckoterminal === 'fail' && d.sources?.pumpfun !== 'ok' ? t.fail : t.none)}</p>`}
    ${sig}<p class="muted so-note">${esc(t.note)}</p></div>`;
}
async function load(r) {
  const k = r.chain + ':' + r.addr + ':' + (r.meta?.socials || []).length;
  if (!cache.has(k)) cache.set(k, fetch(`/api/social?ca=${encodeURIComponent(r.addr)}&chain=${encodeURIComponent(r.chain)}` + (r.meta?.socials || []).slice(0, 6).map(x => '&l=' + encodeURIComponent(x.u)).join('')).then(x => x.ok ? x.json() : null).catch(() => null)
    .then(d => { if (!d?.ok) cache.delete(k); return d?.ok ? d : null; }));
  return cache.get(k);
}
document.addEventListener('mc:render', async (e) => {
  const { r } = e.detail; const box = $('#so-box'); if (!box || !r?.addr) return;
  if (!['solana', 'ethereum', 'base', 'bsc', 'arbitrum'].includes(r.chain)) { box.innerHTML = ''; return; }
  const my = ++seq, t = L[lang()];
  if (!box.firstChild || box.dataset.addr !== r.addr) { box.dataset.addr = r.addr; box.innerHTML = `<div class="card" id="so-card"><h3>👥 ${esc(t.t)}</h3><span class="spin"></span> <span class="muted">${esc(t.loading)}</span></div>`; }
  const d = await load(r); if (my !== seq || box.dataset.addr !== r.addr) return;
  if (box.dataset.lang === lang() && box.dataset.done === r.addr) return;
  box.innerHTML = html(d, t); box.dataset.lang = lang(); box.dataset.done = d ? r.addr : '';
});
