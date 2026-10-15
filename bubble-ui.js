// Bubblemaps-style holder map. Solana: RugCheck topHolders (+known accounts) with RPC fallback, links via shared funders / exit-trace clusters.
// EVM: GoPlus top holders (no link data). Tiny inline force layout, SVG, no libraries. Lazy, cached, timeout, never invents data.
import { holderLinks, withTimeout, rpc as rpcBatch, exitCache } from './devbundle.js?v=1792080000';
import { getShared, putShared, ago, refreshLbl } from './mccache.js?v=1792080000';
import { rugReport } from './core.js?v=1792080000';
const fn = (txt) => txt ? `<details class="fn"><summary title="info">ⓘ</summary><div>${txt}</div></details>` : '';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const L = {
  en: { title:'Holder bubble map', loading:'Loading holders…', linking:'Finding links between holders…', na:'Unavailable', err:'Holder data unavailable right now.',
    top:(n,p)=>`Top cluster: ${n} linked wallets hold ${p}%.`, none:'No linked holders found among the top holders.', noLinks:'Links are not available for this chain (holders only).',
    lgLinked:'Linked cluster (same colour)', lgSolo:'Unlinked wallet', lgKnown:'Pool / curve / burn / locker (excluded from clusters)', tap:'Tap a bubble for details.',
    note:(n,k,m)=>`Top ${n} holders. Links: same funding wallet (earliest incoming SOL), one holder funded another, or same launch cluster (exit trace). Funding source found for ${k} of ${m} wallets. Exchange/bot hot wallets ignored.`,
    noteEvm:(n)=>`Top ${n} holders from GoPlus.`, holds:'holds', cluster:'cluster', src:'Source', empty:'No holder data for this token.', timeout:'Holder data timed out. Try again later.', linkErr:'Holder links unavailable right now.', retry:'Retry', K:{} },
  ar: { title:'خريطة فقاعات الحائزين', loading:'جارٍ تحميل الحائزين…', linking:'جارٍ البحث عن روابط بين الحائزين…', na:'غير متاح', err:'بيانات الحائزين غير متاحة حاليًا.',
    top:(n,p)=>`أكبر مجموعة: ${n} محافظ مترابطة تملك ${p}%.`, none:'لا توجد روابط بين أكبر الحائزين.', noLinks:'الروابط غير متاحة لهذه الشبكة (الحائزون فقط).',
    lgLinked:'مجموعة مترابطة (نفس اللون)', lgSolo:'محفظة غير مرتبطة', lgKnown:'مجمع / منحنى / حرق / قفل (مستبعد من المجموعات)', tap:'اضغط على فقاعة للتفاصيل.',
    note:(n,k,m)=>`أكبر ${n} حائزين. الروابط: نفس محفظة التمويل (أول SOL وارد)، أو موّل حائز حائزًا آخر، أو نفس مجموعة الإطلاق (تتبّع الخروج). عُرف مصدر التمويل لـ ${k} من ${m} محفظة. تم تجاهل محافظ المنصات/البوتات.`,
    noteEvm:(n)=>`أكبر ${n} حائزين من GoPlus.`, holds:'تملك', cluster:'مجموعة', src:'المصدر', empty:'لا توجد بيانات حائزين لهذه العملة.', timeout:'انتهت مهلة تحميل بيانات الحائزين. حاول لاحقًا.', linkErr:'روابط الحائزين غير متاحة حاليًا.', retry:'إعادة المحاولة',
    K:{ Burn:'حرق', LP:'سيولة', Locked:'مقفل', Contract:'عقد', Creator:'المنشئ', AMM:'مجمع', 'pump.fun bonding curve':'منحنى pump.fun', 'Solana RPC':'RPC سولانا' } }
};
const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
const BURN = new Set(['1nc1nerator11111111111111111111111111111111', '0x000000000000000000000000000000000000dead', '0x0000000000000000000000000000000000000000']);
const COLORS = ['#ff4d6a', '#ffd447', '#4f7cff', '#3ee08f', '#c77dff', '#ff8f3e', '#2ec4f1', '#f06bd0'];
const GOPLUS = { ethereum: 1, bsc: 56, base: 8453 };
const rpc = async (method, params) => (await rpcBatch([[method, params]]))[0];

async function solHolders(mint) {
  // 1) RugCheck report (top 20 with owners + known accounts)
  let hs = null, known = {}, src = 'RugCheck';
  try { const d = await rugReport(mint); known = d.knownAccounts || {}; if (d.topHolders?.length) hs = d.topHolders.map(h => ({ owner: h.owner || h.address, pct: +h.pct })); } catch {}
  // 2) fallback: RPC largest accounts + owner resolution
  if (!hs) {
    src = 'Solana RPC';
    const [big, sup] = await Promise.all([rpc('getTokenLargestAccounts', [mint]), rpc('getTokenSupply', [mint])]);
    if (!big?.value || !sup?.value) throw new Error('rpc');
    const accs = await rpc('getMultipleAccounts', [big.value.map(a => a.address), { encoding: 'jsonParsed' }]);
    const total = +sup.value.amount;
    hs = big.value.map((a, i) => ({ owner: accs?.value?.[i]?.data?.parsed?.info?.owner || a.address, pct: +a.amount / total * 100 }));
  }
  // pump.fun bonding curve
  if (/pump$/.test(mint)) try { const c = await fetch('/api/proxy?url=' + encodeURIComponent('https://frontend-api-v3.pump.fun/coins-v2/' + mint)).then(r => r.ok ? r.json() : null); if (c?.bonding_curve) known[c.bonding_curve] = { name: 'pump.fun bonding curve', type: 'AMM' }; } catch {}
  const merged = new Map(); for (const h of hs) { const o = merged.get(h.owner); merged.set(h.owner, { owner: h.owner, pct: (o?.pct || 0) + h.pct }); }
  const out = [...merged.values()].filter(h => h.pct > 0).map(h => {
    const k = known[h.owner]; const isKnown = BURN.has(h.owner) || (k && k.type !== 'CREATOR');
    return { ...h, known: isKnown ? (BURN.has(h.owner) ? 'Burn' : k.name || k.type) : null, label: k?.type === 'CREATOR' ? 'Creator' : null };
  });
  return { holders: out.sort((a, b) => b.pct - a.pct), src };
}
async function evmHolders(addr, chain) {
  const id = GOPLUS[chain]; if (!id) throw new Error('chain');
  const ctl = new AbortController(); setTimeout(() => ctl.abort(), 10000);
  const d = await fetch(`https://api.gopluslabs.io/api/v1/token_security/${id}?contract_addresses=${addr}`, { signal: ctl.signal }).then(r => r.json());
  const g = d?.result?.[addr.toLowerCase()]; if (!g?.holders?.length) throw new Error('empty');
  const lp = new Set((g.lp_holders || []).map(x => x.address.toLowerCase()));
  return { src: 'GoPlus', holders: g.holders.map(h => ({ owner: h.address, pct: +h.percent * 100,
    known: BURN.has(h.address.toLowerCase()) ? 'Burn' : h.is_locked ? (h.tag || 'Locked') : h.is_contract ? (h.tag || 'Contract') : lp.has(h.address.toLowerCase()) ? 'LP' : null, label: h.tag || null })) };
}
// ---- tiny force layout ----
function layout(nodes, links, W, H) {
  nodes.forEach((n, i) => { const a = i * 2.399; const r = 12 * Math.sqrt(i + 1); n.x = W / 2 + r * Math.cos(a); n.y = H / 2 + r * Math.sin(a); n.vx = n.vy = 0; });
  for (let it = 0; it < 320; it++) {
    const alpha = 1 - it / 320;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y; let d = Math.hypot(dx, dy) || 0.01; const min = a.r + b.r + 3;
      if (d < min) { const push = (min - d) / d * 0.5; dx *= push; dy *= push; a.x -= dx; a.y -= dy; b.x += dx; b.y += dy; }
      else if (a.g !== b.g) { const f = 40 * alpha / (d * d); a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f; }
    }
    for (const [s, t] of links) { const dx = t.x - s.x, dy = t.y - s.y; const d = Math.hypot(dx, dy) || 0.01; const k = (d - (s.r + t.r + 10)) / d * 0.08 * alpha; s.vx += dx * k; s.vy += dy * k; t.vx -= dx * k; t.vy -= dy * k; }
    for (const n of nodes) { n.vx += (W / 2 - n.x) * 0.02; n.vy += (H / 2 - n.y) * 0.03; n.x += n.vx; n.y += n.vy; n.vx *= 0.6; n.vy *= 0.6;
      n.x = Math.max(n.r + 2, Math.min(W - n.r - 2, n.x)); n.y = Math.max(n.r + 2, Math.min(H - n.r - 2, n.y)); }
  }
}
function draw(el, data, chain) {
  const t = L[lang()]; const K = (x) => t.K[x] || x; const { holders, groups, edges, info } = data;
  const W = 600, H = 420; const maxPct = Math.max(...holders.map(h => h.pct));
  const nodes = holders.map(h => ({ ...h, r: Math.max(5, Math.sqrt(h.pct) * (230 / Math.sqrt(Math.max(100, holders.reduce((s, x) => s + x.pct, 0))))), g: h.known ? 'k:' + h.owner : groups?.[h.owner] || h.owner }));
  const gSize = {}; nodes.forEach(n => { if (!n.known) gSize[n.g] = (gSize[n.g] || 0) + 1; });
  const linked = Object.keys(gSize).filter(g => gSize[g] >= 2).sort((a, b) => nodes.filter(n => n.g === b).reduce((s, n) => s + n.pct, 0) - nodes.filter(n => n.g === a).reduce((s, n) => s + n.pct, 0));
  const color = (n) => n.known ? '#3a4152' : linked.includes(n.g) ? COLORS[linked.indexOf(n.g) % COLORS.length] : '#5b6b8c';
  const byOwner = Object.fromEntries(nodes.map(n => [n.owner, n]));
  const links = []; for (const g of linked) { const m = nodes.filter(n => n.g === g).sort((a, b) => b.pct - a.pct); for (let i = 1; i < m.length; i++) links.push([m[0], m[i]]); }
  for (const [a, b] of edges || []) if (byOwner[a] && byOwner[b] && byOwner[a].g === byOwner[b].g && !links.some(([x, y]) => (x === byOwner[a] && y === byOwner[b]) || (x === byOwner[b] && y === byOwner[a]))) links.push([byOwner[a], byOwner[b]]);
  layout(nodes, links, W, H);
  const top = linked[0] ? nodes.filter(n => n.g === linked[0]) : [];
  const summary = !groups ? (data.linking ? t.linking : t.noLinks) : top.length ? t.top(top.length, top.reduce((s, n) => s + n.pct, 0).toFixed(1)) : t.none;
  el.innerHTML = `<div class="exv ${top.length && top.reduce((s, n) => s + n.pct, 0) >= 15 ? 'fail' : top.length ? 'warn' : 'na'}">${esc(summary)}</div>
   <svg class="bm" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t.title)}">
    ${links.map(([a, b]) => `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${color(a)}" stroke-opacity=".7" stroke-width="2"/>`).join('')}
    ${nodes.map((n, i) => `<g class="bn" data-i="${i}" tabindex="0"><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}" fill="${color(n)}" fill-opacity="${n.known ? .55 : .8}" stroke="#0b0f17" stroke-width="1.5"/>${n.r > 16 ? `<text x="${n.x.toFixed(1)}" y="${(n.y + 4).toFixed(1)}" text-anchor="middle" font-size="${Math.min(14, n.r / 2.2).toFixed(0)}" fill="#fff">${n.pct.toFixed(1)}%</text>${n.known && n.r > 26 ? `<text x="${n.x.toFixed(1)}" y="${(n.y + 20).toFixed(1)}" text-anchor="middle" font-size="11" fill="#c9d1e0">${esc(String(K(n.known)).slice(0, 22))}</text>` : ''}` : ''}</g>`).join('')}
   </svg>
   <div class="bminfo muted" id="bm-info">${t.tap}</div>
   <div class="bmlg"><span><i style="background:${COLORS[0]}"></i>${t.lgLinked}</span><span><i style="background:#5b6b8c"></i>${t.lgSolo}</span><span><i style="background:#3a4152"></i>${t.lgKnown}</span></div>
   ${data.linking && groups ? `<div class="muted"><span class="spin sm"></span> ${t.linking}</div>` : data.linkErr ? `<div class="muted">${t.linkErr}</div>` : ''}${fn(`${groups ? t.note(holders.length, info.known, info.m) : data.linking ? '' : t.noteEvm(holders.length)} ${t.src}: ${esc(K(data.src))}.`)}`;
  const show = (i) => { const n = nodes[i]; const ex = chain === 'solana' ? `https://solscan.io/account/${n.owner}` : null;
    $('#bm-info').innerHTML = `<b dir="ltr">${n.pct.toFixed(2)}%</b> · <span class="mono">${ex ? `<a href="${ex}" target="_blank" rel="noopener">${esc(n.owner)}</a>` : esc(n.owner)}</span>${n.known ? ` · <span class="st na">${esc(K(n.known))}</span>` : ''}${n.label && !n.known ? ` · <span class="st warn">${esc(K(n.label))}</span>` : ''}${linked.includes(n.g) ? ` · ${t.cluster} ${linked.indexOf(n.g) + 1} (${gSize[n.g]})` : ''}`;
    el.querySelectorAll('.bn').forEach(g => g.classList.toggle('sel', +g.dataset.i === i)); };
  el.querySelectorAll('.bn').forEach(g => { const i = +g.dataset.i; g.addEventListener('click', () => show(i)); g.addEventListener('mouseenter', () => show(i)); g.addEventListener('focus', () => show(i)); });
}
const cache = new Map(); let cur = null;
async function build(addr, chain, force) {
  if (chain === 'solana' && !force) { const h = await getShared(addr, 'bubble'); if (h?.data?.holders?.length) return { ...h.data, cachedAt: h.at }; }
  const base = chain === 'solana' ? await withTimeout(solHolders(addr), 15000, 'holders') : await withTimeout(evmHolders(addr, chain), 12000, 'holders');
  const holders = base.holders.slice(0, 50);
  if (!holders.length) return { empty: true };
  if (chain !== 'solana') return { holders, src: base.src, groups: null };
  const owners = holders.filter(h => !h.known).map(h => h.owner);
  // Draw the holders right away; links (shared funders) are computed in parallel with the launch analysis and merged when ready.
  cache.set(addr, { ...base, holders, linking: true }); paint();
  const mk = (links) => ({ holders, src: base.src, groups: links.group, edges: links.edges, info: { known: links.known, m: owners.length } });
  let links = null; try { links = await withTimeout(holderLinks(addr, owners), 45000, 'links'); } catch {}
  if (!links) return { holders, src: base.src, groups: null, linkErr: true };
  if (!exitCache.has(addr) && /pump$/.test(addr)) {
    cache.set(addr, { ...mk(links), linking: true }); if (cur?.addr === addr) paint();
    for (let i = 0; i < 60 && !exitCache.has(addr); i++) await new Promise(r => setTimeout(r, 1000));
    if (exitCache.has(addr)) try { links = await withTimeout(holderLinks(addr, owners), 20000, 'links'); } catch {}  // funders cached: cheap re-merge with exit-trace clusters
  }
  const res = mk(links); if (exitCache.has(addr) || !/pump$/.test(addr)) putShared(addr, 'bubble', res, null);
  return res;
}
function paint() {
  if (!cur) return; const t = L[lang()]; let box = $('#bm-box');
  if (!box) return;
  const d = cache.get(cur.addr);
  const body = !d || d === 'loading' ? `<span class="spin"></span> ${t.loading}` : d.error ? `<span class="muted">${d.timeout ? t.timeout : t.err}</span> <button type="button" class="ghost act" id="bm-retry">${t.retry}</button>` : d.empty ? `<span class="muted">${t.empty}</span>` : '';
  const cn = d?.cachedAt ? `<div class="muted cnote">⚡ ${ago(d.cachedAt, lang())} <button type="button" class="ghost act" id="bm-refresh">↻ ${refreshLbl(lang())}</button></div>` : '';
  box.innerHTML = `<h3>${t.title}</h3>${cn}<div id="bm-body">${body}</div>`;
  $('#bm-refresh')?.addEventListener('click', () => start(cur.addr, cur.chain, true));
  if (!body) draw($('#bm-body'), d, cur.chain);
  $('#bm-retry')?.addEventListener('click', () => start(cur.addr, cur.chain));
}
async function start(addr, chain, force) {
  cache.set(addr, 'loading'); paint();
  try { cache.set(addr, await build(addr, chain, force)); } catch (e) { cache.set(addr, { error: true, timeout: /timeout/.test(e?.message || '') }); }
  if (cur?.addr === addr) paint();
}
document.addEventListener('mc:render', async (e) => {
  const { r } = e.detail; cur = { addr: r.addr, chain: r.chain };
  if (!['solana', 'ethereum', 'bsc', 'base'].includes(r.chain)) { const b = $('#bm-box'); if (b) b.hidden = true; return; }
  const c = cache.get(r.addr);
  if (c && !c.error) { paint(); return; }
  start(r.addr, r.chain);
});
