// Renders the accuracy study from /api/study on /rugs (mode "rugs") and /accuracy (mode "dash"). Auto-refreshes every 10 min.
// All token names/symbols are escaped; numbers come from the API only. EN + AR via mc_lang / <html lang>.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const isAr = () => (typeof localStorage !== 'undefined' && localStorage.getItem('mc_lang') === 'ar') || document.documentElement.lang === 'ar';
const T = {
  en: {
    lv: { low: 'No major red flags', medium: 'Medium', high: 'High (incl. Extreme)' },
    st: { rug: 'RUG', dead: 'DEAD', down70: 'DOWN ≥70%', alive: 'ALIVE', pending: 'pending', nodata: 'no data' },
    thLevel: 'Level at scan', thCoins: 'Coins', thRug: 'Actual rug', thDead: 'Dead (no cliff)', thBad: 'Rug or dead', thCI: '(95% CI)', thDown: 'Down ≥70%', thAlive: 'Alive',
    allBase: 'All coins (base rate)',
    nNote: (t) => `n = ${t.n} with a completed ${t.h}h recheck · ${t.pending} pending · ${t.nodata} without price data (excluded).`,
    thRule: 'Rule', thPredicts: 'Predicts', thFlagged: 'Coins flagged', thPrec: 'Precision', thRec: 'Recall',
    ruleHigh: 'High or Extreme', ruleMed: 'Medium or higher', ruleLow: 'No major red flags',
    predBad: 'rug or dead', predSurvive: 'survives (not rug/dead)',
    prNote: (pr) => `Base rate: ${pr.base_bad_pct == null ? '—' : pr.base_bad_pct + '%'} of all ${pr.n} coins were rug or dead. A rule is only useful if its precision beats the base rate. Precision = share of flagged coins that ended that way; recall = share of all such coins the rule flagged.`,
    chartNeed: (n) => `The chart needs at least two scan days with completed rechecks (have ${n}). It fills in automatically as the tracker runs.`,
    chartAria: 'Rug-or-dead rate within 24h by scan day and level',
    chartLeg: 'No major red flags · Medium · High · all coins (base rate). Rug-or-dead within 24h, by UTC scan day.',
    allCoins: (n) => `All ${n} tracked coins (newest first)`,
    thCoin: 'Coin', thScanned: 'Scanned (UTC)', thLevel: 'Level', th24: '24h', th48: '48h',
    unavail: 'Study data is temporarily unavailable. Try again in a minute.',
    period: 'Period (UTC scan days)', coins24: 'Coins with 24h result', unique: 'Unique tickers / mints',
    baseRate: 'Base rate rug-or-dead 24h', lowRate: '“No major red flags” → rug-or-dead 24h',
    small: (n) => `<b>Small sample:</b> only ${n} coins have a completed 24h recheck. Confidence intervals are wide.`,
    readFirst: (lowN, lowP, baseP) => `<b>Read this first:</b> most fresh meme coins die or rug within a day no matter what. Of ${lowN} coins we rated “No major red flags”, ${lowP} were rug or dead within 24h, vs ${baseP} for all tracked coins. The label means our checks found nothing big — not that the coin is safe.`,
    h24: 'Outcome 24h after scan',
    h48: 'Outcome 48h after scan', h48note: '(computed separately from 48h prices)',
    hPr: 'Precision / recall per level (24h)', hPr48: 'Precision / recall at 48h',
    hChart: 'Rug-or-dead rate per level over time',
    caught: (n) => `Caught: High/Extreme at scan, then an actual rug within 24h (${n})`,
    noneYet: 'None yet.', details: 'details',
    defs: (s) => `<b>Definitions.</b> ${esc(s.definitions.rug)} ${esc(s.definitions.dead)} ${esc(s.definitions.dedupe)} Entry: market cap ≥ $30K, liquidity ≥ $5K, token &lt; 24h old, live pool, not already down ≥ 50% from peak. Prices: GeckoTerminal 15-min OHLCV.`,
    foot: (gen, src, dup) => `Computed ${esc(gen)} UTC from ${esc(src)} · ${dup} copycat duplicate(s) removed · JSON: <a href="/api/study">/api/study</a> · refreshes automatically.`,
    loading: 'Loading live study numbers…',
  },
  ar: {
    lv: { low: 'لا علامات خطر كبرى', medium: 'متوسطة', high: 'عالية (يشمل القصوى)' },
    st: { rug: 'سحب', dead: 'ميتة', down70: 'هبوط ≥70%', alive: 'حيّة', pending: 'قيد الانتظار', nodata: 'لا بيانات' },
    thLevel: 'المستوى عند الفحص', thCoins: 'عملات', thRug: 'سحب فعلي', thDead: 'ميتة (بلا انهيار)', thBad: 'سحب أو ميتة', thCI: '(فاصل ثقة 95%)', thDown: 'هبوط ≥70%', thAlive: 'حيّة',
    allBase: 'كل العملات (المعدل الأساسي)',
    nNote: (t) => `ن = ${t.n} أكملت إعادة فحص ${t.h} ساعة · ${t.pending} قيد الانتظار · ${t.nodata} بلا بيانات سعر (مستبعدة).`,
    thRule: 'القاعدة', thPredicts: 'تتنبأ بـ', thFlagged: 'عملات مُعلَّمة', thPrec: 'الدقة', thRec: 'الاسترجاع',
    ruleHigh: 'عالية أو قصوى', ruleMed: 'متوسطة فأعلى', ruleLow: 'لا علامات خطر كبرى',
    predBad: 'سحب أو ميتة', predSurvive: 'تبقى حيّة (ليست سحبًا/ميتة)',
    prNote: (pr) => `المعدل الأساسي: ${pr.base_bad_pct == null ? '—' : pr.base_bad_pct + '%'} من أصل ${pr.n} عملة كانت سحبًا أو ميتة. القاعدة مفيدة فقط إذا تفوّقت دقتها على المعدل الأساسي. الدقة = نسبة المُعلَّمة التي انتهت كذلك؛ الاسترجاع = نسبة كل تلك العملات التي التقطتها القاعدة.`,
    chartNeed: (n) => `الرسم يحتاج يومي فحص على الأقل مع إعادة فحص مكتملة (لدينا ${n}). يمتلئ تلقائيًا مع تشغيل المتتبّع.`,
    chartAria: 'معدل السحب أو الموت خلال 24 ساعة حسب يوم الفحص والمستوى',
    chartLeg: 'لا علامات خطر كبرى · متوسطة · عالية · كل العملات (المعدل الأساسي). سحب أو ميتة خلال 24 ساعة، حسب يوم الفحص UTC.',
    allCoins: (n) => `كل الـ ${n} عملة المتتبَّعة (الأحدث أولًا)`,
    thCoin: 'العملة', thScanned: 'الفحص (UTC)', thLevel: 'المستوى', th24: '24 ساعة', th48: '48 ساعة',
    unavail: 'بيانات الدراسة غير متاحة مؤقتًا. حاول بعد دقيقة.',
    period: 'الفترة (أيام الفحص UTC)', coins24: 'عملات بنتيجة 24 ساعة', unique: 'رموز / عناوين فريدة',
    baseRate: 'المعدل الأساسي سحب/موت 24 ساعة', lowRate: '«لا علامات خطر كبرى» ← سحب/موت 24 ساعة',
    small: (n) => `<b>عيّنة صغيرة:</b> فقط ${n} عملة أكملت إعادة فحص 24 ساعة. فواصل الثقة واسعة.`,
    readFirst: (lowN, lowP, baseP) => `<b>اقرأ أولًا:</b> معظم عملات الميم الجديدة تموت أو تُسحب خلال يوم بغض النظر عن التصنيف. من أصل ${lowN} عملة صنّفناها «لا علامات خطر كبرى»، ${lowP} كانت سحبًا أو ميتة خلال 24 ساعة، مقابل ${baseP} لكل العملات المتتبَّعة. التصنيف يعني أن فحوصاتنا لم تجد شيئًا كبيرًا — وليس أن العملة آمنة.`,
    h24: 'النتيجة بعد 24 ساعة من الفحص',
    h48: 'النتيجة بعد 48 ساعة من الفحص', h48note: '(محسوبة منفصلة من أسعار 48 ساعة)',
    hPr: 'الدقة / الاسترجاع حسب المستوى (24 ساعة)', hPr48: 'الدقة / الاسترجاع عند 48 ساعة',
    hChart: 'معدل السحب أو الموت حسب المستوى عبر الزمن',
    caught: (n) => `رُصدت: عالية/قصوى عند الفحص ثم سحب فعلي خلال 24 ساعة (${n})`,
    noneYet: 'لا شيء بعد.', details: 'التفاصيل',
    defs: (s) => `<b>التعريفات.</b> ${esc(s.definitions.rug)} ${esc(s.definitions.dead)} ${esc(s.definitions.dedupe)} شروط الدخول: القيمة السوقية ≥ 30 ألف دولار، السيولة ≥ 5 آلاف، عمر العملة &lt; 24 ساعة، بركة حيّة، وليست منخفضة ≥ 50% من القمة مسبقًا. الأسعار: GeckoTerminal OHLCV كل 15 دقيقة.`,
    foot: (gen, src, dup) => `حُسب ${esc(gen)} UTC من ${esc(src)} · أُزيل ${dup} مكررًا نسخيًا · JSON: <a href="/api/study">/api/study</a> · يتحدّث تلقائيًا.`,
    loading: 'جارٍ تحميل أرقام الدراسة…',
  },
};
const t = () => (isAr() ? T.ar : T.en);
const P = (x) => (x == null ? '—' : x + '%');
const CI = (c) => (c ? ` <span class="muted">(${c[0]}–${c[1]}%)</span>` : '');
function tbl(x) {
  const L = t();
  const rows = ['low', 'medium', 'high'].map(l => { const v = x.byLevel[l]; return `<tr><td><span class="badge ${l}">${L.lv[l]}</span></td><td>${v.n}</td><td>${P(v.rug_pct)} <span class="muted">(${v.rug})</span></td><td>${P(v.dead_pct)} <span class="muted">(${v.dead})</span></td><td><b>${P(v.bad_pct)}</b>${CI(v.bad_ci95)}</td><td>${P(v.down70_pct)}</td><td>${P(v.alive_pct)}</td></tr>`; }).join('');
  const b = x.base;
  return `<div style="overflow-x:auto"><table class="acc"><thead><tr><th>${L.thLevel}</th><th>${L.thCoins}</th><th>${L.thRug}</th><th>${L.thDead}</th><th>${L.thBad} <span class="muted">${L.thCI}</span></th><th>${L.thDown}</th><th>${L.thAlive}</th></tr></thead><tbody>${rows}
  <tr><td><b>${L.allBase}</b></td><td>${b.n}</td><td>${P(b.rug_pct)}</td><td>${P(b.dead_pct)}</td><td><b>${P(b.bad_pct)}</b>${CI(b.bad_ci95)}</td><td>${P(b.down70_pct)}</td><td>${P(b.alive_pct)}</td></tr></tbody></table></div>
  <p class="section-note">${L.nNote(x)}</p>`;
}
function prTbl(pr) {
  const L = t();
  const r = (k, lbl, what) => { const x = pr[k]; return `<tr><td>${lbl}</td><td>${what}</td><td>${x.flagged}</td><td><b>${P(x.precision)}</b></td><td><b>${P(x.recall)}</b></td></tr>`; };
  return `<div style="overflow-x:auto"><table class="acc"><thead><tr><th>${L.thRule}</th><th>${L.thPredicts}</th><th>${L.thFlagged}</th><th>${L.thPrec}</th><th>${L.thRec}</th></tr></thead><tbody>
  ${r('high+', L.ruleHigh, L.predBad)}${r('medium+', L.ruleMed, L.predBad)}${r('low_survivor', L.ruleLow, L.predSurvive)}</tbody></table></div>
  <p class="section-note">${L.prNote(pr)}</p>`;
}
function chart(daily) {
  const L = t();
  const pts = daily.filter(d => d.done > 0); if (pts.length < 2) return `<p class="muted">${L.chartNeed(pts.length)}</p>`;
  const W = 760, H = 240, PadL = 36, B = 26, x = (i) => PadL + i * (W - PadL - 10) / (pts.length - 1), y = (v) => 8 + (H - B - 8) * (1 - v / 100);
  const C = { low: '#3ddc97', medium: '#ffd447', high: '#ff5c5c', base: '#9aa4b8' };
  const line = (get, col, dash) => { const s = pts.map((d, i) => [i, get(d)]).filter(([, v]) => v != null); return s.length ? `<polyline fill="none" stroke="${col}" stroke-width="2.5" ${dash ? 'stroke-dasharray="5 4"' : ''} points="${s.map(([i, v]) => x(i) + ',' + y(v)).join(' ')}"/>${s.map(([i, v]) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${col}"/>`).join('')}` : ''; };
  const grid = [0, 25, 50, 75, 100].map(v => `<line x1="${PadL}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="#1c2333"/><text x="4" y="${y(v) + 4}" fill="#7d879c" font-size="11">${v}%</text>`).join('');
  const lab = pts.map((d, i) => (pts.length <= 10 || i % Math.ceil(pts.length / 10) === 0) ? `<text x="${x(i)}" y="${H - 6}" fill="#7d879c" font-size="11" text-anchor="middle">${esc(d.day.slice(5))}</text>` : '').join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${L.chartAria}">${grid}${lab}${line(d => d.base_bad_pct, C.base, 1)}${['low', 'medium', 'high'].map(l => line(d => d.byLevel[l].n ? d.byLevel[l].bad_pct : null, C[l])).join('')}</svg>
  <p class="muted"><span style="color:${C.low}">●</span> ${L.lv.low} · <span style="color:${C.medium}">●</span> ${L.lv.medium} · <span style="color:${C.high}">●</span> ${L.lv.high.split(' ')[0]} · <span style="color:${C.base}">- -</span> ${L.chartLeg}</p>`;
}
function coins(recs) {
  const L = t();
  return `<details><summary class="muted">${L.allCoins(recs.length)}</summary><div style="overflow-x:auto"><table class="acc"><thead><tr><th>${L.thCoin}</th><th>${L.thScanned}</th><th>${L.thLevel}</th><th>${L.th24}</th><th>${L.th48}</th></tr></thead><tbody>${recs.map(r => {
    const ok = CA.test(r.ca), o = (x) => x ? `${L.st[x.st] || esc(x.st)}${x.ch != null ? ` <span class="muted">(${x.ch > 0 ? '+' : ''}${esc(x.ch)}%)</span>` : ''}` : '—';
    return `<tr><td><b>${esc(r.sym)}</b> ${ok ? `<a class="mono muted" href="/token/${r.ca}" title="${r.ca}">${r.ca.slice(0, 4)}…${r.ca.slice(-4)}</a>` : ''}</td><td>${esc(String(r.scanned).replace('T', ' ').slice(0, 16))}</td><td><span class="badge ${esc(r.level)}">${esc(String(r.level).toUpperCase())} ${esc(r.pts)}</span></td><td>${o(r.o24)}</td><td>${o(r.o48)}</td></tr>`; }).join('')}</tbody></table></div></details>`;
}
async function paint(box, mode) {
  const L = t();
  let s, recs;
  try { [s, recs] = await Promise.all([fetch('/api/study?view=full').then(r => r.json()), fetch('/api/study?view=records').then(r => r.json())]); } catch { s = null; }
  if (!s?.ok) { box.innerHTML = `<p class="muted">${L.unavail}</p>`; return; }
  const low = s.h24.byLevel.low, few = s.h24.n < 30;
  const caught = (recs?.records || []).filter(r => (r.level === 'high' || r.level === 'extreme') && r.o24?.st === 'rug');
  box.dir = isAr() ? 'rtl' : 'ltr';
  box.innerHTML = `
  <div class="stats">
    <div class="kv"><span>${L.period}</span><b style="font-size:15px">${esc(s.from)} → ${esc(s.to)}</b></div>
    <div class="kv"><span>${L.coins24}</span><b>${s.h24.n}</b></div>
    <div class="kv"><span>${L.unique}</span><b>${s.unique_tickers} / ${s.unique_mints}</b></div>
    <div class="kv"><span>${L.baseRate}</span><b>${P(s.h24.base.bad_pct)}</b></div>
    <div class="kv"><span>${L.lowRate}</span><b>${P(low.bad_pct)}</b></div>
  </div>
  ${few ? `<p class="banner">${L.small(s.h24.n)}</p>` : ''}
  <p class="banner">${L.readFirst(low.n, P(low.bad_pct), P(s.h24.base.bad_pct))}</p>
  <h3 style="margin-top:14px">${L.h24}</h3>${tbl(s.h24)}
  <h3 style="margin-top:14px">${L.h48} <span class="muted">${L.h48note}</span></h3>${tbl(s.h48)}
  <h3 style="margin-top:14px">${L.hPr}</h3>${prTbl(s.pr24)}
  <details><summary class="muted">${L.hPr48}</summary>${prTbl(s.pr48)}</details>
  <h3 style="margin-top:14px">${L.hChart}</h3>${chart(s.daily)}
  ${mode === 'rugs' ? `<h3 style="margin-top:18px">${L.caught(caught.length)}</h3>${caught.length ? `<ul>${caught.map(r => `<li><b>${esc(r.sym)}</b> · ${esc(String(r.level).toUpperCase())} ${esc(r.pts)} · ${esc(r.scanned.slice(0, 16).replace('T', ' '))} · ${r.o24.ch != null ? esc(r.o24.ch) + '%' : ''} ${CA.test(r.ca) ? `· <a href="/token/${r.ca}">${L.details}</a>` : ''}</li>`).join('')}</ul>` : `<p class="muted">${L.noneYet}</p>`}` : ''}
  ${recs?.records ? coins(recs.records) : ''}
  <p class="section-note">${L.defs(s)}</p>
  <p class="muted">${L.foot(s.generated.replace('T', ' ').slice(0, 16), s.source, s.duplicates_removed)}</p>`;
}
const css = document.createElement('style'); css.textContent = '#study .badge{font-size:12px!important;padding:2px 8px!important;line-height:1.4!important;white-space:nowrap;display:inline-block;min-width:0!important;margin:0!important}#study table.acc td,#study table.acc th{font-size:13px}'; document.head.appendChild(css);
export function mount(box, mode) { paint(box, mode); setInterval(() => { if (!document.hidden) paint(box, mode); }, 600000); new MutationObserver(() => paint(box, mode)).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] }); }
const el = document.getElementById('study'); if (el) mount(el, el.dataset.mode || 'rugs');
