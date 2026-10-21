// "Developer history" card (Solana): creator wallet + earlier launches (/api/dev) + Dev Reputation Score (M1).
// Lazy, cached per mint, 25 s timeout; shows "unavailable" on any failure and never blocks the main scan.
// If DexScreener rate-limited the server, the browser fetches it directly and re-scores with devrep-core.js.
// Result on window.__mcDevHist + 'mc:devhist' event; app.js turns history flag into a finding.
import { summarize, dexMarkets } from './devhist-core.js?v=1793100200';
import { repFromHist, launchCadenceHours } from './devrep-core.js?v=1793100200';
const CHN = { en: { bsc: 'BNB Chain', ethereum: 'Ethereum', base: 'Base', arbitrum: 'Arbitrum' }, ar: { bsc: 'سلسلة BNB', ethereum: 'إيثريوم', base: 'Base', arbitrum: 'أربيتروم' } };
const LAB = {
  en: { Builder: 'Builder', Neutral: 'Neutral', 'Serial Launcher': 'Serial Launcher', 'High Risk': 'High Risk' },
  ar: { Builder: 'بنّاء', Neutral: 'محايد', 'Serial Launcher': 'مُطلق متسلسل', 'High Risk': 'خطر مرتفع' },
};
const L = {
  en: { title:'Developer history', loading:'Looking up the creator\'s other coins…', na:'Unavailable', naWhy:'Developer history is unavailable for this token right now.', naMkt:'Market status of the earlier coins is unavailable right now.', evm:'Developer history: Solana tokens only.', notEvm:(c)=>`Not available on ${c} yet. Developer history currently looks up pump.fun (Solana) launches only.`,
    creator:'Creator wallet', made:'Other coins created', bad:'Dead / rugged', live:'Still live', grad:'Graduated', copy:'Copy', copied:'Copied ✓', solscan:'Solscan ↗',
    vFail:(b,c,t)=>`Serial launcher red flag: ${b} of ${c} checked previous coins are dead or rugged (${t} coins created).`, vWarn:(b,c)=>`${b} of ${c} checked previous coins are dead or rugged.`,
    vFirst:'First coin from this creator wallet (no earlier launches found).', vOk:(l,c)=>`${l} of ${c} checked previous coins are still live.`, vNew:'Only very new previous coins (< 6 h); too early to judge.',
    last:'Latest coins by this creator', st:{ live:'LIVE', dead:'DEAD', rugged:'RUGGED', new:'NEW', unknown:'?' }, mc:'mcap', ath:'ATH', noMkt:'no market', scan:'Check this coin',
    rep:'Dev Reputation', look:'Full lookup ↗', how:'How it works',
    note:(n,c)=>`Creator = the wallet that launched the coin (pump.fun; RugCheck for other launchpads). Coins: up to 200 listed by pump.fun for this wallet; market status checked on DexScreener for the ${c} most recent. Dead = no DexScreener market or market cap < $10K. Rugged = reached ≥ $50K (pump.fun ATH) and is now < 10% of it or gone. New = under 6 h old, not judged. Red flag (adds risk points): ≥ 3 dead/rugged and at least half of them, or 10+ launches with < 10% still live. Dev Reputation Score (0–100) summarises launches, survival, cadence and graduations — see /how#devrep.`,
    ago:(h)=>h < 1 ? 'just now' : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago` },
  ar: { title:'سجل المطوّر', loading:'جارٍ البحث عن العملات الأخرى للمنشئ…', na:'غير متاح', naWhy:'سجل المطوّر غير متاح لهذه العملة حاليًا.', naMkt:'حالة السوق للعملات السابقة غير متاحة حاليًا.', evm:'سجل المطوّر: لعملات سولانا فقط.', notEvm:(c)=>`غير متاح على ${c} بعد. سجل المطوّر يبحث حاليًا في إطلاقات pump.fun (سولانا) فقط.`,
    creator:'محفظة المنشئ', made:'عملات أخرى أنشأها', bad:'ميتة / مسحوبة', live:'ما زالت نشطة', grad:'تخرّجت', copy:'نسخ', copied:'تم النسخ ✓', solscan:'Solscan ↗',
    vFail:(b,c,t)=>`تحذير مُطلق متسلسل: ${b} من ${c} عملة سابقة تم فحصها ميتة أو مسحوبة (أنشأ ${t} عملة).`, vWarn:(b,c)=>`${b} من ${c} عملة سابقة تم فحصها ميتة أو مسحوبة.`,
    vFirst:'أول عملة من محفظة هذا المنشئ (لم نجد إطلاقات سابقة).', vOk:(l,c)=>`${l} من ${c} عملة سابقة تم فحصها ما زالت نشطة.`, vNew:'العملات السابقة جديدة جدًا (أقل من 6 ساعات)؛ من المبكر الحكم.',
    last:'أحدث عملات هذا المنشئ', st:{ live:'نشطة', dead:'ميتة', rugged:'مسحوبة', new:'جديدة', unknown:'؟' }, mc:'القيمة', ath:'الأعلى', noMkt:'لا سوق', scan:'افحص هذه العملة',
    rep:'سمعة المطوّر', look:'البحث الكامل ↗', how:'كيف يعمل',
    note:(n,c)=>`المنشئ = المحفظة التي أطلقت العملة (pump.fun؛ و RugCheck لمنصات الإطلاق الأخرى). العملات: حتى 200 عملة تعرضها pump.fun لهذه المحفظة؛ تم فحص حالة السوق على DexScreener لأحدث ${c} منها. ميتة = لا سوق على DexScreener أو قيمة سوقية أقل من 10 آلاف دولار. مسحوبة = وصلت إلى 50 ألف دولار أو أكثر (أعلى قيمة في pump.fun) وهي الآن أقل من 10% منها أو اختفت. جديدة = عمرها أقل من 6 ساعات، لا يُحكم عليها. التحذير (يضيف نقاط مخاطرة): 3 أو أكثر ميتة/مسحوبة وتمثل نصفها على الأقل، أو 10 إطلاقات أو أكثر وأقل من 10% منها نشطة. درجة سمعة المطوّر (0–100) تلخّص الإطلاقات والبقاء والإيقاع والتخرّج — راجع /how#devrep.`,
    ago:(h)=>h < 1 ? 'الآن' : h < 48 ? `قبل ${Math.round(h)} س` : `قبل ${Math.round(h / 24)} يوم` }
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fn = (txt) => txt ? `<details class="fn"><summary title="info">ⓘ</summary><div>${esc(txt)}</div></details>` : '';
const usd = (n) => n == null ? '—' : '$' + (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n));
const ga = (n, p) => { try { window.__mcGa?.(n, p); } catch {} };
const ST = { live: 'pass', dead: 'fail', rugged: 'fail', new: 'na', unknown: 'na' };
const CLS = { Builder: 'dr-builder', Neutral: 'dr-neutral', 'Serial Launcher': 'dr-serial', 'High Risk': 'dr-risk' };
const store = window.__mcDevHist = window.__mcDevHist || new Map();
const pending = new Map(); let cur = null;

function ensureRep(d) {
  if (!d?.ok) return d;
  if (d.rep?.ok && d.rep.score != null) return d;
  try {
    const cadenceHours = d.cadenceHours != null ? d.cadenceHours : launchCadenceHours(d.recent || d.judged || []);
    d.cadenceHours = cadenceHours;
    d.rep = repFromHist({ ...d, cadenceHours });
  } catch { d.rep = { ok: false, reason: 'score_error' }; }
  return d;
}

async function load(addr) {
  if (store.has(addr)) return store.get(addr);
  if (pending.has(addr)) return pending.get(addr);
  const p = (async () => {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 25000);
    let d; try { const r = await fetch('/api/dev?ca=' + encodeURIComponent(addr), { signal: ctl.signal }); d = r.ok ? await r.json() : { ok: false, reason: 'http' }; }
    catch { d = { ok: false, reason: 'network' }; } finally { clearTimeout(tm); }
    if (!d || typeof d !== 'object') d = { ok: false };
    if (d.ok && d.needMarket && Array.isArray(d.judged)) {
      const getJ = async (u) => { const c = new AbortController(), t = setTimeout(() => c.abort(), 8000); try { const r = await fetch(u, { signal: c.signal, headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); } };
      const map = await dexMarkets(d.judged.map(c => c.mint), getJ).catch(() => null);
      if (map) {
        Object.assign(d, summarize(d.judged, d.total, map), { sources: { ...d.sources, dexscreener: 'browser' } });
        d.rep = null; // force rescore after market fill
      }
      delete d.judged; delete d.needMarket;
    }
    if (d.ok) ensureRep(d);
    store.set(addr, d); pending.delete(addr);
    if (d.ok) ga('dev_history_loaded', { ca: addr, tokens_created: d.total, dead_rugged: d.bad, checked: d.checked, flag: d.flag, rep_score: d.rep?.score, rep_label: d.rep?.label });
    else ga('dev_history_loaded', { ca: addr, error: String(d.reason || 'unavailable').slice(0, 40) });
    document.dispatchEvent(new CustomEvent('mc:devhist', { detail: { addr, data: d } }));
    return d;
  })();
  pending.set(addr, p); return p;
}

function repHtml(d, t, lang) {
  const r = d.rep;
  if (!r?.ok || r.score == null) return '';
  const lab = (LAB[lang] || LAB.en)[r.label] || r.label;
  const cls = CLS[r.label] || 'dr-neutral';
  const w = d.creator ? encodeURIComponent(d.creator) : '';
  return `<div class="dr-score ${cls}" style="margin-top:12px">
    <div class="dr-top"><span class="dr-num" dir="ltr">${r.score}</span><span class="dr-of" dir="ltr">/100</span>
      <span class="dr-lab">${esc(lab)}</span>
      <span class="dr-links muted"><a href="/dev?wallet=${w}">${t.look}</a> · <a href="/how#devrep">${t.how}</a></span></div>
    <div class="dr-bar" aria-hidden="true"><i style="width:${Math.max(2, Math.min(100, r.score))}%"></i></div>
  </div>`;
}

function html(d, t, lang) {
  if (d === 'loading') return `<span class="spin"></span> ${t.loading}`;
  if (!d?.ok) return `<span class="muted">${t.na}: ${t.naWhy}</span>`;
  const c = d.creator, sc = `https://solscan.io/account/${encodeURIComponent(c)}`;
  const wallet = `<span class="dh-w"><a class="mono" dir="ltr" href="${sc}" target="_blank" rel="noopener" title="${esc(c)}">${esc(c.slice(0, 4))}…${esc(c.slice(-4))}</a> <button type="button" class="ghost act dh-copy" data-c="${esc(c)}">${t.copy}</button></span>`;
  const kv = (k, v, cls = '') => `<div class="kv"><span>${k}</span><b dir="ltr" class="${cls}">${v}</b></div>`;
  const old = d.checked - (d.new || 0);
  let line, st;
  if (d.flag === 'fail') { line = t.vFail(d.bad, d.checked, d.total); st = 'fail'; }
  else if (d.flag === 'warn') { line = t.vWarn(d.bad, d.checked); st = 'warn'; }
  else if (!d.total) { line = t.vFirst; st = 'pass'; }
  else if (d.checked && !old) { line = t.vNew; st = 'na'; }
  else if (d.checked) { line = t.vOk(d.live, old); st = 'pass'; }
  else { line = t.naMkt; st = 'na'; }
  const now = Date.now();
  const rows = (d.recent || []).slice(0, 6).map(x => `<div class="row dh-r"><span class="st ${ST[x.status] || 'na'}">${t.st[x.status] || '?'}</span><span class="dh-n"><a href="/?ca=${encodeURIComponent(x.mint)}" title="${t.scan}" dir="ltr">$${esc(String(x.symbol || '?').replace(/^\$/, ''))}</a> <span class="muted">${esc(x.name || '')}</span></span><span class="dh-m muted"><bdi>${x.created ? t.ago((now - x.created) / 36e5) : ''}</bdi> · ${x.mcap != null ? `${t.mc} <bdi dir="ltr">${usd(x.mcap)}</bdi>` : t.noMkt}${x.ath ? ` · ${t.ath} <bdi dir="ltr">${usd(x.ath)}</bdi>` : ''}</span></div>`).join('');
  return `${repHtml(d, t, lang)}<div class="grid" style="margin-top:10px">${kv(t.creator, wallet)}${kv(t.made, d.total)}${kv(t.bad, d.checked ? `${d.bad} / ${d.checked}` : '—', d.bad && d.flag !== 'pass' ? 'dn' : '')}${kv(t.live, d.checked ? d.live : '—')}${kv(t.grad, d.graduated ?? '—')}</div>
    <div class="exv ${st}" style="margin-top:10px">${esc(line)}</div>${rows ? `<div class="muted" style="margin-top:10px">${t.last}</div>${rows}` : ''}${fn(t.note(d.total, d.checked))}`;
}
function paint() {
  const box = document.getElementById('dh-box'); if (!box || !cur) return;
  const t = L[cur.lang] || L.en;
  if (cur.chain !== 'solana') { const nm = CHN[L[cur.lang] ? cur.lang : 'en']?.[cur.chain]; box.innerHTML = nm ? `<div class="card" id="dh-card"><h3>${t.title}</h3><div class="muted evmna">ⓘ <span>${t.notEvm(nm)}</span></div></div>` : ''; return; }
  const d = store.get(cur.addr) || 'loading';
  box.innerHTML = `<div class="card" id="dh-card"><h3>${t.title}</h3>${html(d, t, cur.lang)}</div>`;
  box.querySelector('.dh-copy')?.addEventListener('click', (e) => { const b = e.currentTarget; navigator.clipboard?.writeText(b.dataset.c).then(() => { b.textContent = t.copied; setTimeout(() => b.textContent = t.copy, 1200); }).catch(() => {}); });
}
document.addEventListener('mc:render', (e) => {
  const { r, lang } = e.detail; cur = { addr: r.addr, chain: r.chain, lang };
  paint(); if (r.chain === 'solana' && !store.has(r.addr)) load(r.addr).then(() => { if (cur?.addr === r.addr) paint(); });
});
