// Result extras for every chain: live sell-proof (DexScreener txns) + true-cost round-trip calculator.
// Also mounts a standalone cost calculator on the Meme tab. Does not touch scoring.
import { dexTokens, sanePairs } from './core.js?v=1793201025';
const $ = (s) => document.querySelector(s);
const fn = (txt) => txt ? `<details class="fn"><summary title="info">ⓘ</summary><div>${txt}</div></details>` : '';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => n == null || !isFinite(n) ? '—' : (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 0, minimumFractionDigits: Math.abs(n) < 10 ? 2 : 0 });
const L = {
  en: { sp:'Live sell-proof', spBlock:(b)=>`Only buys, no sells in the last hour (${b} buys). Selling may be blocked — possible honeypot.`, spLow:(b,s)=>`Very few sells in the last hour: ${b} buys / ${s} sells.`,
    spOk:(b,s,r)=>`Sells are happening: ${b} buys / ${s} sells in the last hour (ratio ${r}).`, spQuiet:'Too little trading in the last hour to judge.', spNA:'Unavailable: no DexScreener pair data.',
    m5:'5 min', h1:'1 hour', h6:'6 hours', h24:'24 hours', buys:'buys', sells:'sells', spNote:'Counts from the most liquid DexScreener pair. Unique-seller counts are not shown (not available keylessly).',
    cost:'True cost calculator', costS:'True cost calculator (any token)', size:'Trade size', fee:'Platform/bot fee % (each way)', preset:'Preset', tip:'Priority/Jito tip per tx (SOL)', gas:'Gas per tx ($)',
    dexFee:'DEX/pool fee % (each way)', liq:'Pool liquidity ($)', bt:'Buy tax %', st:'Sell tax %', none:'None (0%)', custom:'Custom',
    oCost:'Round-trip cost', oPct:'of trade', oImpact:'Price impact (both ways)', oFees:'Fees + tax', oTips:'Tips/gas', oBack:'You get back (if price unchanged)', oBE:'Break-even price move',
    note:'Fee presets are approximate and change often. Price impact uses the constant-product formula on the pool liquidity (half per side); bonding curves and concentrated pools differ. Estimate only.',
    liqCurve:'Liquidity = 2 × the pump.fun bonding curve virtual SOL reserves.', liqNA:'Pool liquidity unavailable — enter it to estimate price impact.', solErr:'SOL price unavailable; SOL amounts cannot be converted.', taxSrc:(s)=>`Tax prefilled from ${s}.`, taxSol:'Solana SPL tokens have no buy/sell tax; Token-2022 transfer fees are not checked.' },
  ar: { sp:'إثبات البيع المباشر', spBlock:(b)=>`شراء فقط بدون أي بيع خلال الساعة الأخيرة (${b} عملية شراء). قد يكون البيع محظورًا — مصيدة محتملة.`, spLow:(b,s)=>`بيع قليل جدًا خلال الساعة الأخيرة: ${b} شراء / ${s} بيع.`,
    spOk:(b,s,r)=>`البيع يحدث: ${b} شراء / ${s} بيع خلال الساعة الأخيرة (النسبة ${r}).`, spQuiet:'التداول خلال الساعة الأخيرة قليل جدًا للحكم.', spNA:'غير متاح: لا توجد بيانات زوج من DexScreener.',
    m5:'5 دقائق', h1:'ساعة', h6:'6 ساعات', h24:'24 ساعة', buys:'شراء', sells:'بيع', spNote:'الأعداد من أكثر أزواج DexScreener سيولة. عدد البائعين الفريدين غير معروض (غير متاح بدون مفتاح).',
    cost:'حاسبة التكلفة الحقيقية', costS:'حاسبة التكلفة الحقيقية (أي عملة)', size:'حجم الصفقة', fee:'رسوم المنصة/البوت % (كل اتجاه)', preset:'إعداد مسبق', tip:'رسوم الأولوية/Jito لكل معاملة (SOL)', gas:'الغاز لكل معاملة ($)',
    dexFee:'رسوم المنصة اللامركزية/المجمع % (كل اتجاه)', liq:'سيولة المجمع ($)', bt:'ضريبة الشراء %', st:'ضريبة البيع %', none:'بدون (0%)', custom:'مخصص',
    oCost:'تكلفة الذهاب والعودة', oPct:'من الصفقة', oImpact:'أثر السعر (الاتجاهين)', oFees:'الرسوم + الضريبة', oTips:'رسوم الأولوية/الغاز', oBack:'ما تسترده (إذا لم يتغير السعر)', oBE:'حركة السعر اللازمة للتعادل',
    note:'الإعدادات المسبقة للرسوم تقريبية وتتغير كثيرًا. أثر السعر محسوب بمعادلة المنتج الثابت على سيولة المجمع (النصف لكل جانب)؛ منحنيات الإطلاق والمجمعات المركّزة تختلف. تقدير فقط.',
    liqCurve:'السيولة = 2 × احتياطي SOL الافتراضي لمنحنى pump.fun.', liqNA:'سيولة المجمع غير متاحة — أدخلها لتقدير أثر السعر.', solErr:'سعر SOL غير متاح؛ لا يمكن تحويل مبالغ SOL.', taxSrc:(s)=>`الضريبة معبأة من ${s}.`, taxSol:'عملات سولانا SPL ليس لها ضريبة شراء/بيع؛ رسوم تحويل Token-2022 غير مفحوصة.' }
};
const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
// Approximate public fee levels (editable). 
const PRESETS = [['none', 0], ['Photon ~1%', 1], ['BullX ~1%', 1], ['GMGN ~1%', 1], ['Axiom ~1%', 1]];
let solUsd = null, solAt = 0;
async function solPrice() {
  if (solUsd && Date.now() - solAt < 120000) return solUsd;
  try { const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'); const d = await r.json(); if (d?.solana?.usd) { solUsd = d.solana.usd; solAt = Date.now(); } } catch {}
  return solUsd;
}
// ---- cost model ----
function roundTrip({ size, fee, dexFee, bt, st, liq, tipUsd }) {
  const f = fee / 100, df = dexFee / 100; const R = liq / 2; if (!(R > 0) || !(size > 0)) return null;
  const xin = size * (1 - f) * (1 - df);                  // after platform + pool fee
  const out = R * xin / (R + xin);                          // token value (at pre-trade spot) received
  const tok = out * (1 - bt / 100);                         // buy tax
  const sellIn = tok * (1 - st / 100);                      // sell tax
  const Rq = R, Rt = R;                                     // exit later at the same spot price as entry (price unchanged)
  const q = Rq * sellIn / (Rt + sellIn);                    // quote back from pool
  const back = q * (1 - df) * (1 - f) - tipUsd * 2;
  const noImpact = xin * (1 - bt / 100) * (1 - st / 100) * (1 - df) * (1 - f); // same trade in an infinitely deep pool
  const net = q * (1 - df) * (1 - f);
  return { back, cost: size - back, pct: (size - back) / size * 100, impact: noImpact - (back + tipUsd * 2), tips: tipUsd * 2, feesTax: size - noImpact, be: (size + tipUsd * 2) / net * 100 - 100 };
}
function calcForm(id, o) {
  const t = L[lang()], sol = o.chain === 'solana';
  const f = (k, label, v, extra = '') => `<label><span>${label}</span><input id="${id}-${k}" type="number" min="0" step="any" value="${v ?? ''}" ${extra}></label>`;
  return `<div class="calc">
   <label><span>${t.size}</span><span class="rk"><input id="${id}-size" type="number" min="0" step="any" value="${o.size ?? 100}"><select id="${id}-unit"><option value="usd">$</option><option value="sol">SOL</option></select></span></label>
   <label><span>${t.preset}</span><select id="${id}-preset">${PRESETS.map(([n, v], i) => `<option value="${v}" ${i === (o.preset ?? 1) ? 'selected' : ''}>${n === 'none' ? t.none : n}</option>`).join('')}</select></label>
   ${f('fee', t.fee, PRESETS[o.preset ?? 1][1])}
   ${sol ? f('tip', t.tip, o.tip ?? 0.001) : f('gas', t.gas, o.gas ?? '')}
   ${f('dex', t.dexFee, o.dexFee ?? 0.25)}
   ${f('liq', t.liq, o.liq != null ? Math.round(o.liq) : '')}
   ${f('bt', t.bt, o.bt ?? 0)}${f('st', t.st, o.st ?? 0)}
  </div><div class="grid" id="${id}-out" style="margin-top:12px"></div>${fn((o.taxNote ? esc(o.taxNote) + ' ' : '') + t.note)}`;
}
async function calcRun(id, chain) {
  const t = L[lang()], v = (k) => parseFloat($(`#${id}-${k}`)?.value) || 0;
  const sp = await solPrice(); let size = v('size');
  const unit = $(`#${id}-unit`).value;
  if (unit === 'sol' || chain === 'solana') { if (!sp) { if (unit === 'sol' || v('tip')) { $(`#${id}-out`).innerHTML = `<div class="muted">${t.solErr}</div>`; if (unit === 'sol') return; } } }
  if (unit === 'sol') size *= sp;
  const tipUsd = chain === 'solana' ? v('tip') * (sp || 0) : v('gas');
  const r = roundTrip({ size, fee: v('fee'), dexFee: v('dex'), bt: v('bt'), st: v('st'), liq: v('liq'), tipUsd });
  if (!r) { $(`#${id}-out`).innerHTML = `<div class="muted">—</div>`; return; }
  const kv = (k, x, c = '') => `<div class="kv"><span>${k}</span><b class="${c}" dir="ltr">${x}</b></div>`;
  $(`#${id}-out`).innerHTML = kv(t.oCost, `${money(r.cost)} (${r.pct.toFixed(2)}% ${t.oPct})`, r.pct > 10 ? 'dn' : '') + kv(t.oImpact, money(r.impact)) + kv(t.oFees, money(r.feesTax)) + kv(t.oTips, money(r.tips)) + kv(t.oBack, money(r.back)) + kv(t.oBE, '+' + r.be.toFixed(2) + '%', r.be > 10 ? 'dn' : 'up');
}
function wire(id, chain) {
  const go = () => calcRun(id, chain);
  document.querySelectorAll(`[id^="${id}-"]`).forEach(x => x.addEventListener('input', go));
  $(`#${id}-preset`).addEventListener('change', () => { $(`#${id}-fee`).value = $(`#${id}-preset`).value; go(); });
  go();
}
// ---- sell-proof ----
function sellProof(p, t) {
  if (!p?.txns) return `<span class="muted">${t.spNA}</span>`;
  const x = p.txns, b = x.h1?.buys ?? 0, s = x.h1?.sells ?? 0;
  let st, line;
  if (s === 0 && b > 10) { st = 'fail'; line = t.spBlock(b); }
  else if (b + s < 10) { st = 'na'; line = t.spQuiet; }
  else if (s / Math.max(b, 1) < 0.1) { st = 'warn'; line = t.spLow(b, s); }
  else { st = 'pass'; line = t.spOk(b, s, (s / Math.max(b, 1)).toFixed(2)); }
  const cell = (k, w) => `<div class="kv"><span>${t[k]}</span><b dir="ltr"><span class="up">${w?.buys ?? '—'}</span> / <span class="dn">${w?.sells ?? '—'}</span></b></div>`;
  return `<div class="exv ${st}">${esc(line)}</div><div class="grid" style="margin-top:10px">${cell('m5', x.m5)}${cell('h1', x.h1)}${cell('h6', x.h6)}${cell('h24', x.h24)}</div>${fn(`${t.buys} / ${t.sells}. ${t.spNote}`)}`;
}
const pairCache = new Map();
async function bestPair(addr, chain) {
  if (pairCache.has(addr)) return pairCache.get(addr);
  const p = dexTokens(addr).then(d => sanePairs((d?.pairs || []).filter(x => x.chainId === chain), addr)[0] || null).catch(() => null);
  pairCache.set(addr, p); setTimeout(() => pairCache.delete(addr), 60000); return p;
}
let seq = 0;
document.addEventListener('mc:render', async (e) => {
  const { r } = e.detail; const my = ++seq; const t = L[lang()];
  let box = $('#ex-box'); if (!box) return;
  const wasOpen = $('#ex-cost')?.open;
  if (!box.firstChild) box.innerHTML = `<div class="card"><h3>${t.sp}</h3><span class="spin"></span></div>`;
  const p = await bestPair(r.addr, r.chain); if (my !== seq) return;
  let liq = p?.liquidity?.usd ?? null, liqNote = '';
  if (liq == null && r.chain === 'solana') {
    // pump.fun bonding curve is constant-product on its virtual reserves: use 2 x virtual SOL reserves as the equivalent pool depth.
    try {
      const c = await fetch('/api/proxy?url=' + encodeURIComponent('https://frontend-api-v3.pump.fun/coins-v2/' + r.addr)).then(x => x.ok ? x.json() : null);
      const sp = await solPrice();
      if (c && !c.complete && c.virtual_sol_reserves && sp && (!c.quote_mint || c.quote_mint === 'So11111111111111111111111111111111111111112' || c.quote_mint === '11111111111111111111111111111111')) { liq = 2 * c.virtual_sol_reserves / 1e9 * sp; liqNote = t.liqCurve; }
    } catch {}
    if (my !== seq) return;
  }
  if (!box.isConnected) return; // result was cleared (New check / back) while the sell-proof was loading
  const tax = r.findings.find(f => f.id === 'tax' && f.status !== 'na');
  const o = { chain: r.chain, liq, bt: tax ? +tax.params.b.toFixed(2) : 0, st: tax ? +tax.params.s.toFixed(2) : 0,
    taxNote: (r.chain === 'solana' ? t.taxSol : tax ? t.taxSrc('GoPlus') : '') + (liqNote ? ' ' + liqNote : liq == null ? ' ' + t.liqNA : '') };
  box.innerHTML = `<div class="card" id="ex-sell"><h3>${t.sp}</h3>${sellProof(p, t)}</div><details class="card" id="ex-cost"${wasOpen ? ' open' : ''}><summary><h3>${t.cost}</h3></summary>${calcForm('rc', o)}</details>`;
  wire('rc', r.chain);
});
