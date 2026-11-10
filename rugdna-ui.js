// RugDNA card (Solana): "is this developer linked, through a shared funding wallet, to other dead launches?"
// Lazy, never blocks the scan. Waits for Developer history (so the creator's earlier coins are in the index), then asks
// /api/rugdna/mint/:mint once per token. Result -> window.__mcRugdna + mc:signal 'rugdna' (app.js scores warn/fail modestly:
// warn +3, fail +8 risk points; unknown / solo / unresolved / service funder = neutral, never penalised).
const L = {
  en: { title: 'RugDNA: linked launches', loading: 'Tracing the creator wallet\'s funding source…', na: 'RugDNA is unavailable for this token right now (neutral, not scored).',
    none: 'No other launches are linked to this developer through a shared funding wallet (neutral, not scored).', svc: (k) => `The creator wallet was funded by ${k || 'a high-volume service wallet'} (exchange / service), so it is not clustered (neutral).`,
    pending: 'Funding source not traced yet (neutral, not scored). Try again in a few minutes.', wallets: 'Linked wallets', launches: 'Other launches', dead: 'Dead', rugged: 'Rugged',
    msg: (n, m) => `This developer is linked (shared funding wallet) to ${n} other launch${n === 1 ? '' : 'es'}, ${m} dead.`,
    sub: { fail: 'Serial-launcher cluster: many of the linked launches died. Adds risk points to the score.', warn: 'Several linked launches died. Adds a few risk points to the score.', info: 'Below the warning threshold (needs ≥ 3 dead launches by linked wallets, ≥ 70% of judged). Not scored.' },
    recent: 'Linked launches', open: 'Open in RugDNA ↗', how: 'Method', note: 'Heuristic: a shared first funder is evidence of linkage, not proof of identity. Dead = ≥ 6 h old and market cap < $10K or no market. Open data (CC-BY) at /rugdna.',
    st: { dead: 'DEAD', live: 'LIVE', new: 'NEW' } },
  ar: { title: 'RugDNA: إطلاقات مرتبطة', loading: 'جارٍ تتبّع مصدر تمويل محفظة المنشئ…', na: 'RugDNA غير متاح لهذه العملة حاليًا (محايد، غير محسوب).',
    none: 'لا توجد إطلاقات أخرى مرتبطة بهذا المطوّر عبر محفظة تمويل مشتركة (محايد، غير محسوب).', svc: (k) => `تم تمويل محفظة المنشئ من ${k || 'محفظة خدمة عالية النشاط'} (منصة / خدمة)، لذلك لا تُجمَّع في مجموعة (محايد).`,
    pending: 'لم يُتتبَّع مصدر التمويل بعد (محايد، غير محسوب). حاول بعد دقائق.', wallets: 'محافظ مرتبطة', launches: 'إطلاقات أخرى', dead: 'ميتة', rugged: 'مسحوبة',
    msg: (n, m) => `هذا المطوّر مرتبط (بمحفظة تمويل مشتركة) بـ ${n} إطلاقًا آخر، ${m} منها ميت.`,
    sub: { fail: 'مجموعة مُطلقين متسلسلين: ماتت معظم الإطلاقات المرتبطة. تضيف نقاط مخاطرة للدرجة.', warn: 'عدة إطلاقات مرتبطة ماتت. تضيف بضع نقاط مخاطرة للدرجة.', info: 'أقل من حدّ التحذير (يلزم 3 إطلاقات ميتة أو أكثر من المحافظ المرتبطة وبنسبة 70% من المحكوم). غير محسوب.' },
    recent: 'الإطلاقات المرتبطة', open: 'افتح في RugDNA ↗', how: 'المنهجية', note: 'تقدير تقريبي: التمويل الأول المشترك دليل على الارتباط وليس إثباتًا للهوية. ميتة = عمرها 6 ساعات أو أكثر وقيمتها السوقية أقل من 10 آلاف دولار أو بلا سوق. بيانات مفتوحة (CC-BY) في /rugdna.',
    st: { dead: 'ميتة', live: 'نشطة', new: 'جديدة' } },
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = window.__mcRugdna = window.__mcRugdna || new Map();
const pending = new Map(); let cur = null;
const sigSet = (addr, v) => { try { (window.__mcSig || (window.__mcSig = { set(a, k, x) { const m = (this.m || (this.m = new Map())); const o = m.get(a) || {}; if (JSON.stringify(o[k]) === JSON.stringify(x)) return; o[k] = x; m.set(a, o); document.dispatchEvent(new CustomEvent('mc:signal', { detail: { addr: a, key: k } })); }, get(a) { return this.m && this.m.get(a); } })).set(addr, 'rugdna', v); } catch {} };
const toSig = (d) => d?.ok && d.status === 'linked' ? { done: 1, status: 'linked', level: d.level, n: d.linkedLaunches, dead: d.linkedDead, judged: d.linkedJudged, wallets: d.wallets } : { done: 1, status: d?.ok ? d.status : 'error' };

function devhistReady(addr, ms = 9000) {
  if (window.__mcDevHist?.has(addr)) return Promise.resolve();
  return new Promise((ok) => { const h = (e) => { if (e.detail?.addr === addr) { document.removeEventListener('mc:devhist', h); clearTimeout(tm); ok(); } }; const tm = setTimeout(() => { document.removeEventListener('mc:devhist', h); ok(); }, ms); document.addEventListener('mc:devhist', h); });
}
async function load(addr) {
  if (store.has(addr)) return store.get(addr);
  if (pending.has(addr)) return pending.get(addr);
  const p = (async () => {
    await devhistReady(addr);
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 14000); let d;
    try { const r = await fetch('/api/rugdna/mint/' + encodeURIComponent(addr), { signal: ctl.signal }); d = r.ok ? await r.json() : { ok: false, reason: 'http' }; } catch { d = { ok: false, reason: 'network' }; } finally { clearTimeout(tm); }
    if (!d || typeof d !== 'object') d = { ok: false };
    store.set(addr, d); pending.delete(addr); sigSet(addr, toSig(d));
    try { window.__mcGa?.('rugdna_loaded', { ca: addr, status: d.status || 'error', level: d.level, linked: d.linkedLaunches, dead: d.linkedDead }); } catch {}
    return d;
  })();
  pending.set(addr, p); return p;
}
function html(d, t, lang) {
  if (d === 'loading') return `<span class="spin"></span> ${t.loading}`;
  if (!d?.ok) return `<span class="muted">${t.na}</span>`;
  if (d.status === 'service') return `<span class="muted">${esc(t.svc(d.funderLabel))}</span>`;
  if (d.status === 'unresolved' || d.status === 'unknown') return `<span class="muted">${t.pending}</span>`;
  if (d.status !== 'linked') return `<span class="muted">${t.none}</span>`;
  const lv = d.level, st = lv === 'fail' ? 'fail' : lv === 'warn' ? 'warn' : 'na';
  const big = (lab, val, cls = '') => `<div class="dh-stat ${cls}"><div class="dh-stat-n" dir="ltr">${val}</div><div class="dh-stat-l">${lab}</div></div>`;
  const rows = (d.sample || []).slice(0, 5).map(x => `<div class="row dh-r"><span class="st ${x.status === 'dead' ? 'fail' : x.status === 'live' ? 'pass' : 'na'}">${t.st[x.status] || '?'}${x.rugged ? ' ⚠' : ''}</span><span class="dh-n"><a href="/?ca=${encodeURIComponent(x.mint)}" dir="ltr">$${esc(String(x.symbol || '?').replace(/^\$/, '') || x.mint.slice(0, 6))}</a></span><span class="dh-m muted mono" dir="ltr">${esc(x.wallet.slice(0, 4))}…${esc(x.wallet.slice(-4))}</span></div>`).join('');
  return `<div class="exv ${st}">${esc(t.msg(d.linkedLaunches, d.linkedDead))}</div>
    <div class="dh-stats" style="margin-top:10px">${big(t.wallets, d.wallets)}${big(t.launches, d.linkedLaunches)}${big(t.dead, d.linkedDead, d.linkedDead ? 'bad' : '')}${big(t.rugged, d.linkedRugged || 0)}</div>
    <div class="muted" style="margin-top:6px">${esc(t.sub[lv] || t.sub.info)}</div>
    ${rows ? `<div class="muted" style="margin-top:10px">${t.recent}</div>${rows}` : ''}
    <div class="muted" style="margin-top:8px"><a href="/rugdna?q=${encodeURIComponent(d.wallet)}${lang === 'ar' ? '&lang=ar' : ''}">${t.open}</a> · <a href="/rugdna${lang === 'ar' ? '?lang=ar' : ''}#method">${t.how}</a></div>`;
}
function paint() {
  const box = document.getElementById('rg-box'); if (!box || !cur) return;
  if (cur.chain !== 'solana') { box.innerHTML = ''; return; }
  const t = L[cur.lang] || L.en, d = store.get(cur.addr) || 'loading';
  box.innerHTML = `<div class="card" id="rg-card"><h3>🧬 ${t.title}</h3>${html(d, t, cur.lang)}<details class="fn"><summary title="info">ⓘ</summary><div>${esc(t.note)}</div></details></div>`;
}
document.addEventListener('mc:render', (e) => {
  const { r, lang } = e.detail; cur = { addr: r.addr, chain: r.chain, lang };
  paint(); if (r.chain === 'solana' && !store.has(r.addr)) load(r.addr).then(() => { if (cur?.addr === r.addr) paint(); });
});
