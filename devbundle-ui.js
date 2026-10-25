// Renders "Developer" and "Early buyers / bundle" cards under a Solana pump.fun check result. Lazy + cached per mint.
import { devCheck, bundleCheck, exitTrace, withTimeout, exitCache, setCreated } from './devbundle.js?v=1793201025';
import { getDeep, ago, refreshLbl } from './mccache.js?v=1793201025';
const CHN = { en: { bsc: 'BNB Chain', ethereum: 'Ethereum', base: 'Base', arbitrum: 'Arbitrum' }, ar: { bsc: 'سلسلة BNB', ethereum: 'إيثريوم', base: 'Base', arbitrum: 'أربيتروم' } }; // EVM chain names for the 'not available yet' line
const L = {
  en: { dev:'Developer check', bundle:'Early buyers / bundle check', loading:'Analysing on-chain data…', na:'Unavailable', notPump:'Dev / bundle / exit-trace checks: Solana tokens only, when the launch history can be reached (pump.fun and other launchpads/DEXes).', notEvm:(c)=>`Developer, early-buyer bundle and exit-trace checks: not available on ${c} yet (Solana only for now).`,
    creator:'Creator wallet', launched:'Other coins launched', grad:'Graduated', dead:'Died', young:'Under 6 h old', sample:(n)=>`graduated/died counts cover only the ${n} coins pump.fun lists`, deadDef:'Died = not graduated, older than 6 h and market cap under $10K.',
    devHolds:'Dev holds now', devBuy:'Dev buy at launch', devSold:'Dev sold / moved',
    window:'Window', windowV:(n)=>`creation slot + 2 (${n} txs)`, buyers:'Early buyer wallets', sameSlot:'Bought in creation slot', bought:'Bought by early wallets', stillHeld:'Still in those accounts',
    tooMany:'Too much history to reach launch with the free RPC (older/busy token).', rpcErr:'Free Solana RPC is rate-limited or timed out. Try again later.', top:'Largest early buyers',
    fSerial:(n,g)=>`Serial launcher: ${n} other coins, ${g} graduated.`, fSerialOk:(n,g,s)=>`Creator launched ${n} other coins; ${g} of ${s} listed graduated.`, fFirst:'First coin from this creator.',
    fSold:(p)=>`Dev sold or moved ${p}% of their launch buy.`, fKept:'Dev still holds their launch buy.', fNoBuy:'Dev did not buy at launch (or bought later).',
    fBundle:(p)=>`Early/bundled wallets still hold ${p}% of supply.`, fBundleSold:(p)=>`Early wallets bought ${p}% and have mostly sold.`, fBundleLow:(p)=>`Early wallets hold ${p}% of supply (low).`, fSlot:(n)=>`${n} wallets bought in the creation slot (likely bundled with the creator).`,
    pass:'PASS', warn:'WARN', fail:'FAIL', srcs:'Sources: pump.fun API, public Solana RPC.',
    exit:'Exit trace (launch forensics)', exWait:'Waiting for the bundle check…', exNone:(n,k,m)=>`No linked wallet groups found among the first ${n} buyers (funding source found for ${k} of ${m} wallets).`,
    exHold:(n,h)=>`${n} linked wallets still hold ${h}% — they could dump on you.`, exExit:(clean,n,b,so)=>`${clean ? 'Looks clean, but ' : ''}${n} linked wallets took ${b}% at launch and sold ${so}% — you may be buying their exit.`,
    exMix:(n,b,h)=>`${n} linked wallets bought ${b}% at launch and hold ${h}% now.`, exCl:'Linked groups', exW:'wallets', exDev:'incl. dev', exBought:'bought', exHeld:'holds', exSold:'sold', exFunder:'funder',
    exNote:(n,k,m)=>`First ${n} buyers. Wallets are linked when funded by the same wallet (earliest incoming SOL) or when another wallet paid their buy fees; exchange/bot hot wallets are ignored. Funding source found for ${k} of ${m} wallets. "Sold" includes tokens moved to other wallets.` },
  ar: { dev:'فحص المطوّر', bundle:'فحص المشترين الأوائل / الحزم', loading:'جارٍ تحليل بيانات السلسلة…', na:'غير متاح', notPump:'فحوصات المطوّر / الحزم / تتبّع الخروج: لعملات pump.fun (سولانا) فقط.', notEvm:(c)=>`فحوصات المطوّر والمشترين الأوائل (الحزم) وتتبّع الخروج: غير متاحة على ${c} بعد (سولانا فقط حاليًا).`,
    creator:'محفظة المنشئ', launched:'عملات أخرى أطلقها', grad:'تخرّجت', dead:'ماتت', young:'عمرها أقل من 6 ساعات', sample:(n)=>`أعداد المتخرّجة/الميتة تشمل فقط ${n} عملة تعرضها pump.fun`, deadDef:'ماتت = لم تتخرّج، عمرها أكثر من 6 ساعات وقيمتها السوقية أقل من 10 آلاف دولار.',
    devHolds:'يملك المطوّر الآن', devBuy:'شراء المطوّر عند الإطلاق', devSold:'باع / نقل المطوّر',
    window:'النافذة', windowV:(n)=>`خانة الإنشاء + 2 (${n} معاملة)`, buyers:'محافظ المشترين الأوائل', sameSlot:'اشتروا في خانة الإنشاء', bought:'اشترته المحافظ المبكرة', stillHeld:'ما زال في تلك الحسابات',
    tooMany:'السجل طويل جدًا للوصول إلى الإطلاق عبر RPC المجاني (عملة قديمة/نشطة).', rpcErr:'RPC سولانا المجاني محدود أو انتهت المهلة. حاول لاحقًا.', top:'أكبر المشترين الأوائل',
    fSerial:(n,g)=>`مُطلق متسلسل: ${n} عملة أخرى، تخرّج منها ${g}.`, fSerialOk:(n,g,s)=>`أطلق المنشئ ${n} عملة أخرى؛ تخرّج ${g} من ${s} معروضة.`, fFirst:'أول عملة لهذا المنشئ.',
    fSold:(p)=>`باع المطوّر أو نقل ${p}% من شرائه عند الإطلاق.`, fKept:'ما زال المطوّر يحتفظ بشرائه عند الإطلاق.', fNoBuy:'لم يشترِ المطوّر عند الإطلاق (أو اشترى لاحقًا).',
    fBundle:(p)=>`المحافظ المبكرة/المحزومة ما زالت تملك ${p}% من المعروض.`, fBundleSold:(p)=>`اشترت المحافظ المبكرة ${p}% وباعت معظمها.`, fBundleLow:(p)=>`تملك المحافظ المبكرة ${p}% من المعروض (منخفض).`, fSlot:(n)=>`${n} محافظ اشترت في خانة الإنشاء (غالبًا حزمة مع المنشئ).`,
    pass:'سليم', warn:'تحذير', fail:'خطر', srcs:'المصادر: واجهة pump.fun، و RPC سولانا العام.',
    exit:'تتبّع الخروج (تحليل الإطلاق)', exWait:'بانتظار فحص الحزم…', exNone:(n,k,m)=>`لم نجد مجموعات محافظ مترابطة بين أول ${n} مشترين (عُرف مصدر التمويل لـ ${k} من ${m} محفظة).`,
    exHold:(n,h)=>`${n} محافظ مترابطة ما زالت تملك ${h}% — قد تبيع عليك.`, exExit:(clean,n,b,so)=>`${clean ? 'تبدو سليمة، لكن ' : ''}${n} محافظ مترابطة أخذت ${b}% عند الإطلاق وباعت ${so}% — قد تكون تشتري خروجهم.`,
    exMix:(n,b,h)=>`${n} محافظ مترابطة اشترت ${b}% عند الإطلاق وتملك ${h}% الآن.`, exCl:'المجموعات المترابطة', exW:'محافظ', exDev:'تشمل المطوّر', exBought:'اشترت', exHeld:'تملك', exSold:'باعت', exFunder:'المموّل',
    exNote:(n,k,m)=>`أول ${n} مشترين. تُربط المحافظ إذا موّلتها نفس المحفظة (أول SOL وارد) أو دفعت محفظة أخرى رسوم شرائها؛ يتم تجاهل محافظ المنصات/البوتات النشطة جدًا. عُرف مصدر التمويل لـ ${k} من ${m} محفظة. "باعت" تشمل نقل العملات لمحافظ أخرى.` }
};
const fn = (txt) => txt ? `<details class="fn"><summary title="info">ⓘ</summary><div>${txt}</div></details>` : '';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const short = (a) => `<a class="mono" href="https://solscan.io/account/${esc(a)}" target="_blank" rel="noopener">${esc(a.slice(0, 4))}…${esc(a.slice(-4))}</a>`;
const pc = (x) => x == null ? '—' : (+x).toFixed(x < 1 ? 2 : 1);
const cache = new Map(); let cur = null;
const kv = (k, v) => `<div class="kv"><span>${k}</span><b dir="ltr">${v}</b></div>`;
const row = (st, txt, t) => `<div class="row"><span class="st ${st}">${t[st]}</span><span>${esc(txt)}</span></div>`;

function devHtml(d, t) {
  if (d === 'loading') return `<span class="spin"></span> ${t.loading}`;
  if (!d || d.error) return `<span class="muted">${t.na}: ${t.rpcErr}</span>`;
  if (!d.pump) return `<span class="muted">${t.notPump}</span>`;
  const s = d.stats; let h = `<div class="grid">${kv(t.creator, short(d.creator))}`, rows = '';
  if (s) {
    h += kv(t.launched, s.others) + kv(t.grad, s.seen ? s.grad : '—') + kv(t.dead, s.seen ? s.dead : '—') + kv(t.young, s.seen ? s.young : '—');
    if (s.others === 0) rows += row('pass', t.fFirst, t);
    else if (s.others >= 10 && s.seen && s.grad / s.seen < 0.05) rows += row('fail', t.fSerial(s.others, s.grad), t);
    else rows += row(s.others >= 5 ? 'warn' : 'pass', t.fSerialOk(s.others, s.grad, s.seen), t);
  } else h += kv(t.launched, t.na);
  h += kv(t.devHolds, d.heldPct == null ? t.na : pc(d.heldPct) + '%');
  const b = d.bundle;
  if (b?.available) {
    h += kv(t.devBuy, pc(b.devBuyPct) + '%');
    if (b.devBuy > 0n && d.held != null) {
      const sold = Math.max(0, Number((b.devBuy - (d.held < b.devBuy ? d.held : b.devBuy)) * 1000n / b.devBuy) / 10);
      h += kv(t.devSold, sold.toFixed(0) + '%'); try { const ageH = d.coin?.created ? (Date.now() - d.coin.created) / 36e5 : null; if (d.mint || window.__mcCurAddr) (window.__mcSig||(window.__mcSig={set(a,k,v){const m=(this.m||(this.m=new Map()));const o=m.get(a)||{};if(JSON.stringify(o[k])===JSON.stringify(v))return;o[k]=v;m.set(a,o);document.dispatchEvent(new CustomEvent('mc:signal',{detail:{addr:a,key:k}}))},get(a){return this.m&&this.m.get(a)}})).set(d.mint || window.__mcCurAddr, 'devSell', { sold, ageH }); } catch {} rows += sold >= 50 ? row('warn', t.fSold(sold.toFixed(0)), t) : row('pass', t.fKept, t);
    } else if (b.devBuy === 0n) rows += row('na', t.fNoBuy, t);
  }
  h += '</div>';
  const note = s && s.seen < s.others ? fn(`${t.launched}: ${t.sample(s.seen)}. ${t.deadDef}`) : s?.seen ? fn(t.deadDef) : '';
  return h + note + (rows ? `<div style="margin-top:8px">${rows}</div>` : '');
}
function bundleHtml(d, t) {
  if (d === 'loading' || d?.bundle === 'loading') return `<span class="spin"></span> ${t.loading}`;
  if (!d || d.error) return `<span class="muted">${t.na}: ${t.rpcErr}</span>`;
  if (!d.pump) return `<span class="muted">${t.notPump}</span>`;
  const b = d.bundle;
  if (!b || b.error) return `<span class="muted">${t.na}: ${t.rpcErr}</span>`;
  if (!b.available) return `<span class="muted">${t.na}: ${b.reason === 'tooMany' ? t.tooMany : t.rpcErr}</span>`;
  let rows = '';
  if (b.sameSlot >= 3) rows += row('warn', t.fSlot(b.sameSlot), t);
  if (b.heldPct != null && b.heldPct > 15) rows += row('fail', t.fBundle(pc(b.heldPct)), t);
  else if (b.boughtPct > 15) rows += row('warn', t.fBundleSold(pc(b.boughtPct)), t);
  else if (b.heldPct != null) rows += row('pass', t.fBundleLow(pc(b.heldPct)), t);
  const top = b.top.length ? `<div class="muted" style="margin-top:10px">${t.top}</div>${b.top.map(x => `<div class="row"><span class="st na">+${x.slot}</span>${short(x.owner)}<b style="margin-inline-start:auto" dir="ltr">${pc(x.pct)}%</b></div>`).join('')}` : '';
  return `<div class="grid">${kv(t.window, t.windowV(b.txCount))}${kv(t.buyers, b.buyers)}${kv(t.sameSlot, b.sameSlot)}${kv(t.bought, pc(b.boughtPct) + '%')}${kv(t.stillHeld, b.heldPct == null ? t.na : pc(b.heldPct) + '%')}</div><div style="margin-top:8px">${rows}</div>${top}`;
}
function exitHtml(d, t) {
  if (!d || d === 'loading' || d.error || !d.pump) return d && d.pump === false ? `<span class="muted">${t.notPump}</span>` : d?.error ? `<span class="muted">${t.na}: ${t.rpcErr}</span>` : `<span class="spin"></span> ${t.loading}`;
  const e = d.exit;
  if (!e || e === 'wait') return `<span class="muted">${t.exWait}</span>`;
  if (e === 'loading') return `<span class="spin"></span> ${t.loading}`;
  if (e.error || !e.available) return `<span class="muted">${t.na}: ${e.reason === 'tooMany' ? t.tooMany : t.rpcErr}</span>`;
  const L = e.linkedBoughtPct, H = e.linkedHeldPct, sold = L > 0 ? Math.max(0, (L - H) / L * 100) : 0, n = e.linkedBuyers;
  let line, st;
  if (!e.clusters.length) { line = t.exNone(e.buyers, e.fundersKnown, e.wallets); st = 'na'; }
  else if (H >= 15) { line = t.exHold(n, pc(H)); st = 'fail'; }
  else if (L >= 10 && sold >= 80) { line = t.exExit(cur.level === 'low', n, pc(L), sold.toFixed(0)); st = 'fail'; }
  else { line = t.exMix(n, pc(L), pc(H)); st = L >= 10 ? 'warn' : 'pass'; }
  const cl = e.clusters.slice(0, 6).map(c => `<div class="row"><span class="st ${c.heldPct >= 5 ? 'fail' : c.soldPct >= 80 ? 'warn' : 'na'}">${c.buyers} ${t.exW}</span><span>${c.dev ? `<b>${t.exDev}</b> · ` : ''}${t.exBought} <b dir="ltr">${pc(c.boughtPct)}%</b> · ${t.exHeld} <b dir="ltr">${pc(c.heldPct)}%</b> · ${t.exSold} <b dir="ltr">${c.soldPct == null ? '—' : c.soldPct.toFixed(0) + '%'}</b>${c.funder ? ` · ${t.exFunder} ${short(c.funder)}` : ''}</span></div>`).join('');
  return `<div class="exv ${st}">${esc(line)}</div>${cl ? `<div class="muted" style="margin-top:10px">${t.exCl}</div>${cl}` : ''}${fn(t.exNote(e.buyers, e.fundersKnown, e.wallets))}`;
}
function paint(addr, lang) {
  const out = document.querySelector('#out'); if (!out || cur?.addr !== addr) return;
  const t = L[lang] || L.en, d = cache.get(addr);
  const box = document.querySelector('#db-box'); if (!box) return;
  if (d === 'loading') { box.innerHTML = `<div class="card"><h3>${t.dev} · ${t.bundle}</h3><span class="spin"></span> ${t.loading}</div>`; return; }
  if (d && d.pump === false) { box.innerHTML = `<div class="card oneline muted">ⓘ ${t.notPump}</div>`; return; }
  const note = d?.cachedAt ? `<div class="muted cnote" id="db-cnote">⚡ ${ago(d.cachedAt, cur.lang)} <button type="button" class="ghost act" id="db-refresh">↻ ${refreshLbl(cur.lang)}</button></div>` : '';
  box.innerHTML = note + `<div class="card" id="db-dev"><h3>${t.dev}</h3>${devHtml(d, t)}</div><div class="card" id="db-bundle"><h3>${t.bundle}</h3>${bundleHtml(d, t)}${fn(t.srcs)}</div><div class="card" id="db-exit"><h3>${t.exit}</h3>${exitHtml(d, t)}</div>`;
  box.querySelector('#db-refresh')?.addEventListener('click', () => run(addr, true));
}
async function runExit(addr, d, force) {
  d.exit = 'loading'; (cur && paint(addr, cur.lang));
  // server computes the exit trace once for everyone; if it can't (subrequest cap / RPC), compute locally (never written to the shared cache)
  const he = force ? null : await getDeep(addr, 'exit', 'solana', { maxMs: 70000 });
  if (he?.data && !he.data.error) { d.exit = he.data; exitCache.set(addr, he.data); d.cachedAt = Math.min(d.cachedAt || he.at, he.at); (cur && paint(addr, cur.lang)); return; }
  try { d.exit = await withTimeout(exitTrace(addr, d.creator, d.coin.curve), 75000, 'exit'); } catch { d.exit = { error: true }; }
  (cur && paint(addr, cur.lang));
}
async function run(addr, force) {
  cache.set(addr, 'loading'); (cur && paint(addr, cur.lang));
  if (!force) { // shared server result: cached, or computed server-side once (concurrent visitors wait on the same run)
    const hd = await getDeep(addr, 'dev', 'solana', { maxMs: 45000 });
    const d = hd?.data;
    if (d && d.pump === false) { cache.set(addr, d); (cur && paint(addr, cur.lang)); return; }
    if (d?.pump && d.bundle && !d.bundle.error && !d.error) {
      d.cachedAt = hd.at; setCreated(addr, d.coin?.created); d.exit = 'wait'; cache.set(addr, d); (cur && paint(addr, cur.lang));
      return runExit(addr, d);
    }
  }
  let d;
  try { d = await withTimeout(devCheck(addr), 20000, 'dev'); } catch { d = { error: true }; }
  if (d.pump) d.bundle = 'loading'; cache.set(addr, d); (cur && paint(addr, cur.lang));
  if (!d.pump) return;
  d.exit = 'wait';
  try { d.bundle = await withTimeout(bundleCheck(addr, d.creator, d.coin.curve), 45000, 'bundle'); } catch { d.bundle = { error: true }; }
  await runExit(addr, d, true);
}
document.addEventListener('mc:render', (e) => {
  const { r, lang } = e.detail; if (r.chain !== 'solana') { cur = null; const b = document.querySelector('#db-box'); const lg = L[lang] ? lang : 'en', nm = CHN[lg]?.[r.chain]; if (b) b.innerHTML = `<div class="card oneline muted">ⓘ ${nm ? L[lg].notEvm(nm) : L[lg].notPump}</div>`; return; }
  cur = { addr: r.addr, lang, level: r.verdict?.level };
  const c = cache.get(r.addr); if (!c || c.error || c.bundle?.error || c.exit?.error) run(r.addr); else paint(r.addr, lang);
});
