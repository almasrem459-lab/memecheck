// Bubblemaps-style holder map. Solana: top ~100 holders (/api/holders: getProgramAccounts, fallback pump.fun / RugCheck / RPC top 20),
// links via shared funders / exit-trace clusters. EVM: GoPlus top holders (no link data).
// Canvas + tiny custom force simulation (no libraries): collide, repel, link springs, cluster cohesion, gravity.
// Drag (mouse/touch), wheel/pinch zoom, pan, tap for details, cluster list. Lazy, cached, timeout, never invents data.
import { holderLinks, withTimeout, rpc as rpcBatch, exitCache } from './devbundle.js?v=1793000000';
import { rugReport } from './core.js?v=1793000000';
const fn = (txt) => txt ? `<details class="fn"><summary title="info">ⓘ</summary><div>${txt}</div></details>` : '';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const short = (a) => a && a.length > 12 ? a.slice(0, 4) + '…' + a.slice(-4) : a;
const L = {
  en: { title:'Holder bubble map', loading:'Loading holders…', linking:'Finding links between holders…', na:'Unavailable', err:'Holder data unavailable right now.',
    top:(n,p)=>`Top cluster: ${n} linked wallets hold ${p}%.`, none:'No linked holders found among the top holders.', noLinks:'Links are not available for this chain (holders only).',
    lgLinked:'Linked cluster (same colour)', lgSolo:'Unlinked wallet', lgKnown:'Pool / curve / burn / locker (excluded from clusters)', tap:'Tap a bubble or a cluster for details.',
    note:(n,k,m)=>`Top ${n} holders. Bubble area ∝ % of supply. Links: same funding wallet (earliest incoming SOL), one holder funded another, or same launch cluster (exit trace). Funding source found for ${k} of ${m} wallets checked. Exchange/bot hot wallets ignored.`,
    noteEvm:(n)=>`Top ${n} holders from GoPlus. Bubble area ∝ % of supply.`, holds:'holds', cluster:'Cluster', src:'Source', empty:'No holder data for this token.', timeout:'Holder data timed out. Try again later.', linkErr:'Holder links unavailable right now.', retry:'Retry',
    clusters:'Clusters', wallets:'Wallets', nW:(n)=>`${n} wallets`, ofSupply:'of supply', rank:'Rank', copy:'Copy', copied:'Copied ✓', explorer:'Solscan ↗', explorerEvm:'Explorer ↗',
    inCluster:(c,n,p)=>`${c} · ${n} wallets · ${p}% total`, solo:'Not linked to other top holders.', excluded:'Not a user wallet: excluded from cluster totals.', fundedBy:'Funded by', noClusters:'No linked clusters found.',
    hintTouch:'Drag bubbles · two fingers to zoom / pan', hintMouse:'Drag bubbles · scroll to zoom · drag background to pan', zin:'Zoom in', zout:'Zoom out', zfit:'Reset view', members:'Members', topOf:(n,m)=>`Showing top ${n} of ${m} holders.`,
    K:{ Creator:'Creator', Insider:'Insider' } },
  ar: { title:'خريطة فقاعات الحائزين', loading:'جارٍ تحميل الحائزين…', linking:'جارٍ البحث عن روابط بين الحائزين…', na:'غير متاح', err:'بيانات الحائزين غير متاحة حاليًا.',
    top:(n,p)=>`أكبر مجموعة: ${n} محافظ مترابطة تملك ${p}%.`, none:'لا توجد روابط بين أكبر الحائزين.', noLinks:'الروابط غير متاحة لهذه الشبكة (الحائزون فقط).',
    lgLinked:'مجموعة مترابطة (نفس اللون)', lgSolo:'محفظة غير مرتبطة', lgKnown:'مجمع / منحنى / حرق / قفل (مستبعد من المجموعات)', tap:'اضغط على فقاعة أو مجموعة للتفاصيل.',
    note:(n,k,m)=>`أكبر ${n} حائزين. مساحة الفقاعة ∝ نسبة المعروض. الروابط: نفس محفظة التمويل (أول SOL وارد)، أو موّل حائز حائزًا آخر، أو نفس مجموعة الإطلاق (تتبّع الخروج). عُرف مصدر التمويل لـ ${k} من ${m} محفظة. تم تجاهل محافظ المنصات/البوتات.`,
    noteEvm:(n)=>`أكبر ${n} حائزين من GoPlus. مساحة الفقاعة ∝ نسبة المعروض.`, holds:'تملك', cluster:'مجموعة', src:'المصدر', empty:'لا توجد بيانات حائزين لهذه العملة.', timeout:'انتهت مهلة تحميل بيانات الحائزين. حاول لاحقًا.', linkErr:'روابط الحائزين غير متاحة حاليًا.', retry:'إعادة المحاولة',
    clusters:'المجموعات', wallets:'المحافظ', nW:(n)=>`${n} محافظ`, ofSupply:'من المعروض', rank:'الترتيب', copy:'نسخ', copied:'تم النسخ ✓', explorer:'Solscan ↗', explorerEvm:'المستكشف ↗',
    inCluster:(c,n,p)=>`${c} · ${n} محافظ · ${p}% إجمالًا`, solo:'غير مرتبطة بحائزين كبار آخرين.', excluded:'ليست محفظة مستخدم: مستبعدة من إجمالي المجموعات.', fundedBy:'مموّلة من', noClusters:'لا توجد مجموعات مترابطة.',
    hintTouch:'اسحب الفقاعات · إصبعان للتكبير / التحريك', hintMouse:'اسحب الفقاعات · مرّر للتكبير · اسحب الخلفية للتحريك', zin:'تكبير', zout:'تصغير', zfit:'إعادة العرض', members:'الأعضاء', topOf:(n,m)=>`عرض أكبر ${n} من ${m} حائز.`,
    K:{ Burn:'حرق', LP:'سيولة', Locked:'مقفل', Contract:'عقد', Creator:'المنشئ', Insider:'مطّلع', AMM:'مجمع', 'pump.fun bonding curve':'منحنى pump.fun', 'PumpSwap pool':'مجمع PumpSwap', 'Pump Fun':'pump.fun', 'Solana RPC':'RPC سولانا' } }
};
const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
const BURN = new Set(['1nc1nerator11111111111111111111111111111111', '0x000000000000000000000000000000000000dead', '0x0000000000000000000000000000000000000000']);
const COLORS = ['#ff4d6a', '#ffd447', '#3ee08f', '#4f9dff', '#c77dff', '#ff8f3e', '#2ec4f1', '#f06bd0', '#a3e635', '#fb7185', '#5eead4', '#fbbf24'];
const SOLO = '#7f8fd6', KNOWN = '#6b7280';
const GOPLUS = { ethereum: 1, bsc: 56, base: 8453, arbitrum: 42161 };
const EXPL = { solana: 'https://solscan.io/account/', ethereum: 'https://etherscan.io/address/', base: 'https://basescan.org/address/', bsc: 'https://bscscan.com/address/', arbitrum: 'https://arbiscan.io/address/' };
const MAXN = 100, LINKN = 60;
const rpc = async (method, params) => (await rpcBatch([[method, params]]))[0];
const getJ = async (url, ms) => { const c = new AbortController(); const tm = setTimeout(() => c.abort(), ms); try { const r = await fetch(url, { signal: c.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(tm); } };

async function solHolders(mint) {
  const [rc, api, coin] = await Promise.all([
    rugReport(mint).catch(() => null),
    getJ('/api/holders?mint=' + encodeURIComponent(mint), 12000).then(j => j || new Promise(ok => setTimeout(ok, 1500)).then(() => getJ('/api/holders?mint=' + encodeURIComponent(mint), 9000))),
    /pump$/.test(mint) ? getJ('/api/proxy?url=' + encodeURIComponent('https://frontend-api-v3.pump.fun/coins-v2/' + mint), 7000) : null]);
  const known = { ...(rc?.knownAccounts || {}) }; const insider = new Set((rc?.topHolders || []).filter(h => h.insider).map(h => h.owner || h.address));
  const rcH = rc?.topHolders?.length ? rc.topHolders.map(h => ({ owner: h.owner || h.address, pct: +h.pct })) : null;
  let hs = null, src = 'RugCheck', total = null;
  if (api?.holders?.length && api.holders.length >= (rcH?.length || 0)) { hs = api.holders; src = api.src || 'Solana RPC'; total = api.total || null; }
  else if (rcH) hs = rcH;
  if (!hs) {  // fallback: RPC largest accounts + owner resolution
    src = 'Solana RPC';
    const [big, sup] = await Promise.all([rpc('getTokenLargestAccounts', [mint]), rpc('getTokenSupply', [mint])]);
    if (!big?.value || !sup?.value) throw new Error('rpc');
    const accs = await rpc('getMultipleAccounts', [big.value.map(a => a.address), { encoding: 'jsonParsed' }]);
    const tot = +sup.value.amount;
    hs = big.value.map((a, i) => ({ owner: accs?.value?.[i]?.data?.parsed?.info?.owner || a.address, pct: +a.amount / tot * 100 }));
  }
  if (coin?.bonding_curve) known[coin.bonding_curve] = { name: 'pump.fun bonding curve', type: 'AMM' };
  if (coin?.pump_swap_pool) known[coin.pump_swap_pool] = { name: 'PumpSwap pool', type: 'AMM' };
  if (coin?.creator && !known[coin.creator]) known[coin.creator] = { name: 'Creator', type: 'CREATOR' };
  const merged = new Map(); for (const h of hs) { const o = merged.get(h.owner); merged.set(h.owner, { owner: h.owner, pct: (o?.pct || 0) + h.pct }); }
  const out = [...merged.values()].filter(h => h.pct > 0).map(h => {
    const k = known[h.owner]; const isKnown = BURN.has(h.owner) || (k && k.type !== 'CREATOR');
    return { ...h, known: isKnown ? (BURN.has(h.owner) ? 'Burn' : k.name || k.type) : null, label: k?.type === 'CREATOR' ? 'Creator' : insider.has(h.owner) ? 'Insider' : null };
  });
  return { holders: out.sort((a, b) => b.pct - a.pct), src, total };
}
async function evmHolders(addr, chain) {
  const id = GOPLUS[chain]; if (!id) throw new Error('chain');
  const ctl = new AbortController(); setTimeout(() => ctl.abort(), 10000);
  // same cached relay as the risk check (one GoPlus call per token per 5 min); direct GoPlus only if the relay fails
  let g = await fetch(`/api/evm-security?chain=${chain}&ca=${addr.toLowerCase()}`, { signal: ctl.signal }).then(r => r.ok ? r.json() : null).then(j => j?.goplus?.s === 'ok' ? j.goplus.d : j?.goplus?.s === 'empty' ? {} : null).catch(() => null);
  if (!g) { const d = await fetch(`https://api.gopluslabs.io/api/v1/token_security/${id}?contract_addresses=${addr}`, { signal: ctl.signal }).then(r => r.json()); g = d?.result?.[addr.toLowerCase()]; }
  if (!g?.holders?.length) throw new Error('empty');
  const lp = new Set((g.lp_holders || []).map(x => x.address.toLowerCase()));
  return { src: 'GoPlus', total: +g.holder_count || null, holders: g.holders.map(h => ({ owner: h.address, pct: +h.percent * 100,
    known: BURN.has(h.address.toLowerCase()) ? 'Burn' : h.is_locked ? (h.tag || 'Locked') : h.is_contract ? (h.tag || 'Contract') : lp.has(h.address.toLowerCase()) ? 'LP' : null, label: h.tag || null })) };
}

// ---------- view model ----------
function model(data) {
  const { holders, groups, edges } = data;
  const tot = holders.reduce((s, h) => s + h.pct, 0) || 1;
  const R = Math.sqrt(0.42 * 900 * 620 / (Math.PI * Math.max(tot, 30)));  // world units; area ∝ % of supply
  const nodes = holders.map((h, i) => ({ ...h, i, rank: i + 1, r: Math.max(2.5, R * Math.sqrt(h.pct)), g: h.known ? 'k:' + h.owner : groups?.[h.owner] || h.owner, x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null }));
  nodes.forEach(n => { n.m = n.r * n.r; });
  const mem = {}; nodes.forEach(n => { if (!n.known) (mem[n.g] ??= []).push(n); });
  const clusters = Object.entries(mem).filter(([, m]) => m.length >= 2).map(([g, m]) => ({ g, members: m.sort((a, b) => b.pct - a.pct), pct: m.reduce((s, n) => s + n.pct, 0) }))
    .sort((a, b) => b.pct - a.pct);
  clusters.forEach((c, k) => { c.id = k + 1; c.color = COLORS[k % COLORS.length]; c.members.forEach(n => { n.c = c; }); });
  nodes.forEach(n => { n.color = n.known ? KNOWN : n.c ? n.c.color : SOLO; });
  const byOwner = Object.fromEntries(nodes.map(n => [n.owner, n]));
  const links = []; const seen = new Set(); const add = (a, b, w) => { const k = a.i < b.i ? a.i + ':' + b.i : b.i + ':' + a.i; if (a !== b && !seen.has(k)) { seen.add(k); links.push({ s: a, t: b, w }); } };
  for (const [a, b] of edges || []) { const x = byOwner[a], y = byOwner[b]; if (x && y && x.c && x.c === y.c) add(x, y, 1); }
  for (const c of clusters) for (let i = 1; i < c.members.length; i++) if (!links.some(l => l.s === c.members[i] || l.t === c.members[i])) add(c.members[0], c.members[i], .6);
  return { nodes, links, clusters };
}

// ---------- canvas map ----------
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = new Map();   // addr -> { pos: Map(owner -> [x, y]), cam, user, sel, tab }
let inst = null;
const CSS = `.bmwrap{container-type:inline-size;margin-top:10px}.bmx{display:grid;gap:10px;grid-template-columns:minmax(0,1fr)}
@container (min-width:700px){.bmx{grid-template-columns:minmax(0,1fr) 250px}.bmside .bmlist{max-height:300px}}
.bmstage{position:relative;height:min(62vh,500px);min-height:300px;background:radial-gradient(ellipse at center,#121a2c 0%,#0b0f17 75%);border-radius:12px;overflow:hidden;border:1px solid #1c2333;touch-action:manipulation;-webkit-user-select:none;user-select:none}
.bmstage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab}.bmstage canvas.drag{cursor:grabbing}.bmstage canvas.hov{cursor:pointer}
.bmzoom{position:absolute;top:8px;inset-inline-end:8px;display:flex;flex-direction:column;gap:6px}.bmzoom button{width:34px;height:34px;padding:0;border-radius:9px;background:#121826cc;border:1px solid #273046;font-size:17px;line-height:1;color:#e6e9ef}
.bmhint{position:absolute;bottom:6px;inset-inline-start:10px;font-size:11px;color:#7d879c;pointer-events:none;margin:0}
.bmtip{position:absolute;pointer-events:none;background:#0b0f17ee;border:1px solid #273046;border-radius:8px;padding:5px 8px;font-size:12px;white-space:nowrap;transform:translate(-50%,-115%);display:none;z-index:2}
.bmside{display:flex;flex-direction:column;gap:8px;min-width:0}.bmpanel{background:#0e1320;border:1px solid #1c2333;border-radius:12px;padding:10px 12px;font-size:13px;min-height:52px}
.bmpanel .bmaddr{font-family:ui-monospace,monospace;font-size:12px;word-break:break-all;margin:6px 0;color:#c9d1e0}.bmpanel .bmacts{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}
.bmpanel .bmacts button,.bmpanel .bmacts a{font-size:12px;padding:5px 10px;border-radius:8px;text-decoration:none}.bmpanel .bmacts a{border:1px solid #273046}.bmpanel p{margin:4px 0;color:#9aa4b8}
.bmdot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-inline-end:6px;vertical-align:middle;flex:none}.bmdot.k{border:1px dashed #9aa4b8;background:transparent!important}
.bmtabs{display:flex;border:1px solid #273046;border-radius:10px;overflow:hidden}.bmtabs button{flex:1;background:transparent;border:0;border-radius:0;padding:7px;font-size:12px;color:#9aa4b8}.bmtabs button.on{background:#2563eb;color:#fff}
.bmlist{max-height:240px;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:2px}
.bmrow{display:flex;align-items:center;gap:6px;width:100%;background:transparent;border:0;border-radius:8px;padding:7px 8px;font-size:13px;font-weight:500;color:#e6e9ef;text-align:start}.bmrow:hover{background:#1a2234}.bmrow.on{background:#1f2a44}
.bmrow .bmn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bmrow .bmc{color:#7d879c;font-size:12px}.bmrow b{font-variant-numeric:tabular-nums}.bmrow .mono{word-break:normal}
.bmlg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:#9aa4b8;margin:8px 0}.bmlg i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-inline-end:5px;vertical-align:middle}`;
function ensureCss() { if (!document.getElementById('bm-css')) { const s = document.createElement('style'); s.id = 'bm-css'; s.textContent = CSS; document.head.appendChild(s); } }

function mapView(stage, M, st, hooks) {
  const cv = stage.querySelector('canvas'), ctx = cv.getContext('2d'), tip = stage.querySelector('.bmtip');
  const { nodes, links, clusters } = M; const RM = reduce();
  let W = 300, H = 300, dpr = 1, raf = 0, alpha = 1, target = 0, visible = true, dead = false;
  const cam = st.cam || { x: 0, y: 0, s: 1 }; st.cam = cam; let fitCam = { x: 0, y: 0, s: 1 }, camGoal = null;
  // positions: restore, or seed near a placed cluster mate, or golden-angle spiral by rank
  let restored = 0; const placed = {};
  nodes.forEach((n, i) => { const p = st.pos.get(n.owner); if (p) { n.x = p[0]; n.y = p[1]; restored++; placed[n.g] ??= n; } });
  nodes.forEach((n, i) => { if (st.pos.has(n.owner)) return; const m = placed[n.g]; const a = i * 2.39996;
    if (m && !n.known) { n.x = m.x + Math.cos(a) * (m.r + n.r + 4); n.y = m.y + Math.sin(a) * (m.r + n.r + 4); }
    else { const rr = 26 * Math.sqrt(i + .5); n.x = rr * Math.cos(a); n.y = rr * Math.sin(a); } placed[n.g] ??= n; });
  const sig = clusters.map(c => c.members.map(m => m.owner).join(',')).join(';');
  alpha = restored === nodes.length ? (st.sig === sig ? 0.2 : 0.9) : 1; st.sig = sig;  // new links: reheat so clusters pull together
  const order = [...nodes].sort((a, b) => b.r - a.r);  // draw big first, small on top
  // ---- simulation ----
  function tick() {
    alpha += (target - alpha) * 0.0228;
    const n = nodes.length;
    for (let i = 0; i < n; i++) { const a = nodes[i];
      for (let j = i + 1; j < n; j++) { const b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) { dx = (Math.random() - .5) * .1; dy = (Math.random() - .5) * .1; d2 = dx * dx + dy * dy; }
        const same = a.c && a.c === b.c; const k = (same ? 4 : 14 + 0.35 * (a.r + b.r)) * alpha / d2;  // repulsion ∝ 1/d
        const wa = b.m / (a.m + b.m); a.vx -= dx * k * wa * 2; a.vy -= dy * k * wa * 2; b.vx += dx * k * (1 - wa) * 2; b.vy += dy * k * (1 - wa) * 2; } }
    for (const l of links) { const s = l.s, t = l.t; const dx = t.x + t.vx - s.x - s.vx, dy = t.y + t.vy - s.y - s.vy; const d = Math.hypot(dx, dy) || .01;
      const k = (d - (s.r + t.r + 10)) / d * alpha * 0.6 * l.w; const bias = s.m / (s.m + t.m); t.vx -= dx * k * bias; t.vy -= dy * k * bias; s.vx += dx * k * (1 - bias); s.vy += dy * k * (1 - bias); }
    for (const c of clusters) { let cx = 0, cy = 0, w = 0; for (const m of c.members) { cx += m.x * m.m; cy += m.y * m.m; w += m.m; } cx /= w; cy /= w;
      for (const m of c.members) { m.vx += (cx - m.x) * 0.08 * alpha; m.vy += (cy - m.y) * 0.08 * alpha; } }
    const ax = W > H ? 0.035 : 0.05, ay = W > H ? 0.05 : 0.035;  // gravity: oval matching the stage
    for (const a of nodes) { a.vx -= a.x * ax * alpha; a.vy -= a.y * ay * alpha;
      if (a.fx != null) { a.x = a.fx; a.y = a.fy; a.vx = a.vy = 0; continue; }
      a.vx *= 0.6; a.vy *= 0.6; a.x += a.vx; a.y += a.vy; }
    collide(2);
  }
  function collide(passes) {
    const n = nodes.length;
    for (let p = 0; p < passes; p++) for (let i = 0; i < n; i++) { const a = nodes[i];
      for (let j = i + 1; j < n; j++) { const b = nodes[j]; const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r + 2.5; if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
        const d2 = dx * dx + dy * dy; if (d2 >= min * min) continue; const d = Math.sqrt(d2) || .01; const o = (min - d) / d * 0.5;
        let wa = b.m / (a.m + b.m); if (a.fx != null) wa = 0; else if (b.fx != null) wa = 1;
        a.x -= dx * o * wa; a.y -= dy * o * wa; b.x += dx * o * (1 - wa); b.y += dy * o * (1 - wa); } }
  }
  function bounds() { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const n of nodes) { x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r); x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r); } return { x0, y0, x1, y1 }; }
  function computeFit() { const b = bounds(); const pad = 24; const s = Math.min((W - pad * 2) / Math.max(1, b.x1 - b.x0), (H - pad * 2) / Math.max(1, b.y1 - b.y0), 4);
    fitCam = { s, x: W / 2 - (b.x0 + b.x1) / 2 * s, y: H / 2 - (b.y0 + b.y1) / 2 * s }; return fitCam; }
  // ---- drawing ----
  const hlSet = () => { const s = st.sel; if (!s) return null; if (s.c != null) { const c = clusters.find(c => c.id === s.c); return c ? new Set(c.members) : null; }
    const n = nodes.find(n => n.owner === s.o); if (!n) return null; return n.c ? new Set(n.c.members) : new Set([n]); };
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * cam.x, dpr * cam.y);
    const hl = hlSet(), selN = st.sel?.o ? nodes.find(n => n.owner === st.sel.o) : null, s = cam.s;
    ctx.lineCap = 'round'; ctx.direction = 'ltr';
    for (const l of links) { const on = !hl || (hl.has(l.s) && hl.has(l.t)); ctx.globalAlpha = hl ? (on ? .95 : .06) : .55; ctx.strokeStyle = l.s.color; ctx.lineWidth = (on && hl ? 2.4 : 1.6) / s;
      ctx.beginPath(); ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y); ctx.stroke(); }
    for (const n of order) { const on = !hl || hl.has(n); ctx.globalAlpha = on ? 1 : .16;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.2832);
      ctx.fillStyle = n.color + (n.known ? '33' : '4d'); ctx.fill();
      if (n.known) ctx.setLineDash([4 / s, 3 / s]); ctx.lineWidth = (n === selN ? 3 : 1.6) / s; ctx.strokeStyle = n === selN ? '#ffffff' : n.color; ctx.stroke(); if (n.known) ctx.setLineDash([]);
      const sr = n.r * s;
      if (sr >= 13) { const fs = Math.min(16, Math.max(9, sr * .38)); ctx.fillStyle = on ? '#fff' : '#9aa4b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `600 ${fs / s}px system-ui,-apple-system,"Segoe UI",sans-serif`; const p = n.pct >= 10 ? n.pct.toFixed(1) : n.pct.toFixed(2);
        const lab = sr >= 30 ? (n.known ? kname(n.known) : n.label ? kname(n.label) : null) : null;
        ctx.fillText(p + '%', n.x, n.y - (lab ? fs * .45 / s : 0));
        if (lab) { ctx.font = `${Math.max(9, fs * .7) / s}px system-ui,-apple-system,"Segoe UI",sans-serif`; ctx.fillStyle = '#c9d1e0'; ctx.fillText(String(lab).slice(0, Math.max(6, sr / 4 | 0)), n.x, n.y + fs * .65 / s); } } }
    ctx.globalAlpha = 1;
  }
  const kname = hooks.K || ((x) => x);
  // ---- loop ----
  function frame() {
    raf = 0; if (dead) return;
    let busy = false;
    if (!RM && alpha > 0.004 || target > 0) { tick(); busy = true; }
    if (!st.user) { computeFit(); if (RM) Object.assign(cam, fitCam); else { const k = .18; cam.s += (fitCam.s - cam.s) * k; cam.x += (fitCam.x - cam.x) * k; cam.y += (fitCam.y - cam.y) * k;
      if (Math.abs(fitCam.s - cam.s) / fitCam.s > .002 || Math.abs(fitCam.x - cam.x) > .5) busy = true; } }
    if (camGoal) { const k = RM ? 1 : .2; cam.s += (camGoal.s - cam.s) * k; cam.x += (camGoal.x - cam.x) * k; cam.y += (camGoal.y - cam.y) * k;
      if (Math.abs(camGoal.x - cam.x) < .5 && Math.abs(camGoal.y - cam.y) < .5 && Math.abs(camGoal.s - cam.s) / camGoal.s < .002) { Object.assign(cam, camGoal); camGoal = null; } else busy = true; }
    render(); save();
    if (busy && visible) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && !dead && visible) raf = requestAnimationFrame(frame); };
  const save = () => { for (const n of nodes) st.pos.set(n.owner, [n.x, n.y]); };
  // ---- coordinates + hit test ----
  const toWorld = (sx, sy) => [(sx - cam.x) / cam.s, (sy - cam.y) / cam.s];
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function hit(sx, sy, slop) { const [wx, wy] = toWorld(sx, sy); let best = null, bd = Infinity;
    for (let i = order.length - 1; i >= 0; i--) { const n = order[i]; const d = Math.hypot(n.x - wx, n.y - wy); const lim = Math.max(n.r, slop / cam.s);
      if (d <= n.r) return n; if (d <= lim && d - n.r < bd) { bd = d - n.r; best = n; } } return best; }
  const zoomAt = (sx, sy, f) => { const lo = fitCam.s * .4, hi = Math.max(fitCam.s * 12, 3); const ns = Math.min(hi, Math.max(lo, cam.s * f)); const [wx, wy] = toWorld(sx, sy);
    st.user = true; camGoal = null; cam.s = ns; cam.x = sx - wx * ns; cam.y = sy - wy * ns; kick(); };
  const zoomed = () => st.user && cam.s > fitCam.s * 1.05;
  // ---- drag / pan / pinch ----
  let drag = null, pan = null, pinch = null, down = null;
  const startDrag = (n, sx, sy) => { const [wx, wy] = toWorld(sx, sy); drag = { n, dx: n.x - wx, dy: n.y - wy }; n.fx = n.x; n.fy = n.y; target = RM ? 0 : .25; if (!RM) alpha = Math.max(alpha, .25); cv.classList.add('drag'); kick(); };
  const moveDrag = (sx, sy) => { const [wx, wy] = toWorld(sx, sy); drag.n.fx = wx + drag.dx; drag.n.fy = wy + drag.dy; if (RM) { drag.n.x = drag.n.fx; drag.n.y = drag.n.fy; collide(2); } kick(); };
  const endDrag = () => { if (!drag) return; drag.n.fx = drag.n.fy = null; drag = null; target = 0; if (RM) collide(6); cv.classList.remove('drag'); kick(); };
  const startPan = (sx, sy) => { pan = { sx, sy, x: cam.x, y: cam.y }; st.user = true; camGoal = null; cv.classList.add('drag'); };
  const movePan = (sx, sy) => { cam.x = pan.x + sx - pan.sx; cam.y = pan.y + sy - pan.sy; kick(); };
  const tap = (n) => { hooks.select(n ? { o: n.owner } : null); };
  // mouse / pen
  cv.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.button !== 0) return; const [sx, sy] = local(e); cv.setPointerCapture(e.pointerId);
    down = { sx, sy, t: Date.now(), moved: false }; const n = hit(sx, sy, 4); if (n) startDrag(n, sx, sy); else startPan(sx, sy); tip.style.display = 'none'; });
  cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; const [sx, sy] = local(e);
    if (down && Math.hypot(sx - down.sx, sy - down.sy) > 4) down.moved = true;
    if (drag) return moveDrag(sx, sy); if (pan) return movePan(sx, sy);
    const n = hit(sx, sy, 4); cv.classList.toggle('hov', !!n);
    if (n) { tip.innerHTML = `<b dir="ltr">${n.pct.toFixed(2)}%</b> · #${n.rank} · <span class="mono" dir="ltr">${esc(short(n.owner))}</span>${n.known ? ' · ' + esc(kname(n.known)) : ''}`; tip.style.display = 'block'; tip.style.left = (n.x * cam.s + cam.x) + 'px'; tip.style.top = ((n.y - n.r) * cam.s + cam.y) + 'px'; }
    else tip.style.display = 'none'; });
  const pUp = (e) => { if (e.pointerType === 'touch' || !down) return; const was = down; down = null; const n = drag?.n; endDrag(); if (pan) { pan = null; cv.classList.remove('drag'); }
    if (!was.moved && Date.now() - was.t < 500) tap(n || null); };
  cv.addEventListener('pointerup', pUp); cv.addEventListener('pointercancel', pUp);
  cv.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const [sx, sy] = local(e); zoomAt(sx, sy, Math.exp(-Math.max(-60, Math.min(60, e.deltaY * (e.deltaMode ? 16 : 1))) * 0.0025)); }, { passive: false });
  // touch: one finger on a bubble drags it; one finger on empty space scrolls the page (pans when zoomed in); two fingers zoom + pan
  let tdown = null;
  const tpos = (t) => { const r = cv.getBoundingClientRect(); return [t.clientX - r.left, t.clientY - r.top]; };
  const startPinch = (ts) => { const [a, b] = [tpos(ts[0]), tpos(ts[1])]; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; endDrag(); pan = null;
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s: cam.s, w: toWorld(mx, my) }; st.user = true; camGoal = null; };
  cv.addEventListener('touchstart', (e) => {
    if (e.touches.length >= 2) { e.preventDefault(); tdown = null; startPinch(e.touches); return; }
    const [sx, sy] = tpos(e.touches[0]); tdown = { sx, sy, t: Date.now(), moved: false, own: false };
    const n = hit(sx, sy, 14);
    if (n) { e.preventDefault(); tdown.own = true; startDrag(n, sx, sy); } else if (zoomed()) { e.preventDefault(); tdown.own = true; startPan(sx, sy); }
  }, { passive: false });
  cv.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length >= 2) { e.preventDefault(); const [a, b] = [tpos(e.touches[0]), tpos(e.touches[1])]; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const lo = fitCam.s * .4, hi = Math.max(fitCam.s * 12, 3); cam.s = Math.min(hi, Math.max(lo, pinch.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d)); cam.x = mx - pinch.w[0] * cam.s; cam.y = my - pinch.w[1] * cam.s; kick(); return; }
    if (!tdown) return; const [sx, sy] = tpos(e.touches[0]); if (Math.hypot(sx - tdown.sx, sy - tdown.sy) > 8) tdown.moved = true;
    if (!tdown.own) return; e.preventDefault(); if (drag) moveDrag(sx, sy); else if (pan) movePan(sx, sy);
  }, { passive: false });
  const tEnd = (e) => {
    if (pinch) { if (e.touches.length < 2) { pinch = null; if (e.touches.length === 1) { const [sx, sy] = tpos(e.touches[0]); tdown = { sx, sy, t: 0, moved: true, own: true }; startPan(sx, sy); } } return; }
    if (e.touches.length) return; const was = tdown; tdown = null; const n = drag?.n; endDrag(); if (pan) { pan = null; cv.classList.remove('drag'); }
    if (was && !was.moved && Date.now() - was.t < 500) { if (e.cancelable) e.preventDefault(); tap(n || null); }
  };
  cv.addEventListener('touchend', tEnd, { passive: false }); cv.addEventListener('touchcancel', tEnd);
  // ---- size / visibility ----
  let sized = false;
  function resize() { const r = stage.getBoundingClientRect(); const nw = Math.max(200, r.width), nh = Math.max(200, r.height); dpr = Math.min(2, window.devicePixelRatio || 1);
    if (st.user && sized) { cam.x += (nw - W) / 2; cam.y += (nh - H) / 2; } W = nw; H = nh; sized = true; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    computeFit(); if (!st.user) Object.assign(cam, fitCam); render(); kick(); }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null; ro ? ro.observe(stage) : addEventListener('resize', resize);
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) kick(); }) : null; io?.observe(stage);
  resize();
  if (RM) { alpha = 1; for (let i = 0; i < 320 && alpha > 0.004; i++) tick(); alpha = 0; collide(6); if (!st.user) Object.assign(cam, computeFit()); render(); save(); }
  return {
    kick,
    zoom: (f) => zoomAt(W / 2, H / 2, f),
    fit: () => { st.user = false; camGoal = null; kick(); },
    focus: (members) => { if (!members?.length) return; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const n of members) { x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r); x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; const sx = cx * cam.s + cam.x, sy = cy * cam.s + cam.y; const w = (x1 - x0) * cam.s, h = (y1 - y0) * cam.s;
      if (sx - w / 2 > 10 && sx + w / 2 < W - 10 && sy - h / 2 > 10 && sy + h / 2 < H - 10) { kick(); return; }  // already in view
      let s = cam.s; if (w > W * .9 || h > H * .9) s = Math.min(W * .8 / (x1 - x0), H * .8 / (y1 - y0)); s = Math.max(s, fitCam.s * .4);
      st.user = true; camGoal = { s, x: W / 2 - cx * s, y: H / 2 - cy * s }; kick(); },
    destroy: () => { dead = true; if (raf) cancelAnimationFrame(raf); ro ? ro.disconnect() : removeEventListener('resize', resize); io?.disconnect(); endDrag(); },
  };
}

function draw(el, data, chain, addr) {
  ensureCss();
  const t = L[lang()]; const K = (x) => t.K[x] || x; const { holders, groups, info } = data;
  const M = model(data); const { nodes, clusters } = M;
  let st = state.get(addr); if (!st) { st = { pos: new Map(), cam: null, user: false, sel: null, tab: null }; state.set(addr, st); }
  if (st.sel?.c != null && !clusters.some(c => c.id === st.sel.c)) st.sel = null;
  const tab = st.tab || (clusters.length ? 'c' : 'w');
  const top = clusters[0]; const summary = !groups ? (data.linking ? t.linking : data.linkErr ? t.linkErr : t.noLinks) : top ? t.top(top.members.length, top.pct.toFixed(1)) : t.none;
  try { if (chain === 'solana' && groups) (window.__mcSig||(window.__mcSig={set(a,k,v){const m=(this.m||(this.m=new Map()));const o=m.get(a)||{};if(JSON.stringify(o[k])===JSON.stringify(v))return;o[k]=v;m.set(a,o);document.dispatchEvent(new CustomEvent('mc:signal',{detail:{addr:a,key:k}}))},get(a){return this.m&&this.m.get(a)}})).set(addr, 'bubble', { pct: top ? Math.min(100, top.pct) : 0, n: top ? top.members.length : 0 }); } catch {}
  const touch = matchMedia('(pointer: coarse)').matches;
  el.innerHTML = `<div class="exv ${top && top.pct >= 15 ? 'fail' : top ? 'warn' : 'na'}">${esc(summary)}</div>
   <div class="bmwrap"><div class="bmx">
    <div class="bmstage"><canvas role="img" aria-label="${esc(t.title)}"></canvas><div class="bmtip"></div>
     <div class="bmzoom"><button type="button" data-z="in" aria-label="${t.zin}" title="${t.zin}">+</button><button type="button" data-z="out" aria-label="${t.zout}" title="${t.zout}">−</button><button type="button" data-z="fit" aria-label="${t.zfit}" title="${t.zfit}">⤢</button></div>
     <p class="bmhint">${touch ? t.hintTouch : t.hintMouse}</p></div>
    <div class="bmside"><div class="bmpanel" id="bm-info" aria-live="polite"></div>
     <div class="bmtabs" role="tablist"><button type="button" data-tab="c" class="${tab === 'c' ? 'on' : ''}">${t.clusters} (${clusters.length})</button><button type="button" data-tab="w" class="${tab === 'w' ? 'on' : ''}">${t.wallets} (${nodes.length})</button></div>
     <div class="bmlist" id="bm-list"></div></div>
   </div></div>
   <div class="bmlg"><span><i style="background:${COLORS[0]}"></i>${t.lgLinked}</span><span><i style="background:${SOLO}"></i>${t.lgSolo}</span><span><i style="border:1px dashed #9aa4b8"></i>${t.lgKnown}</span></div>
   ${data.linking ? `<div class="muted"><span class="spin sm"></span> ${t.linking}</div>` : ''}
   ${fn(`${groups ? t.note(holders.length, info.known, info.m) : chain !== 'solana' ? t.noteEvm(holders.length) : ''}${data.total && data.total > holders.length ? ' ' + t.topOf(holders.length, data.total) : ''} ${t.src}: ${esc(K(data.src))}.`)}`;
  if (inst) inst.destroy();
  const stage = el.querySelector('.bmstage'), panel = el.querySelector('#bm-info'), list = el.querySelector('#bm-list');
  const ex = EXPL[chain];
  const dot = (n) => `<span class="bmdot${n.known ? ' k' : ''}" style="background:${n.color}"></span>`;
  const pctS = (p) => `<b dir="ltr">${p.toFixed(2)}%</b>`;
  function showPanel() {
    const s = st.sel;
    if (!s) { panel.innerHTML = `<span class="muted" style="margin:0">${t.tap}</span>`; return; }
    if (s.c != null) { const c = clusters.find(c => c.id === s.c); if (!c) { panel.innerHTML = ''; return; }
      panel.innerHTML = `<div><span class="bmdot" style="background:${c.color}"></span><b>${t.cluster} ${c.id}</b> · ${t.nW(c.members.length)} · ${pctS(c.pct)}</div>
        <p>${t.members}:</p>${c.members.slice(0, 8).map(n => `<button type="button" class="bmrow" data-o="${esc(n.owner)}"><span class="bmc">#${n.rank}</span><span class="bmn mono" dir="ltr">${esc(short(n.owner))}</span>${pctS(n.pct)}</button>`).join('')}${c.members.length > 8 ? `<p>+${c.members.length - 8}</p>` : ''}`;
      return; }
    const n = nodes.find(n => n.owner === s.o); if (!n) { panel.innerHTML = ''; return; }
    const f = data.fund?.[n.owner];
    panel.innerHTML = `<div>${dot(n)}<b>${t.rank} #${n.rank}</b> · ${pctS(n.pct)} <span class="muted" style="margin:0">${t.ofSupply}</span>${n.known ? ` <span class="st na">${esc(K(n.known))}</span>` : ''}${n.label && !n.known ? ` <span class="st warn">${esc(K(n.label))}</span>` : ''}</div>
      <div class="bmaddr" dir="ltr">${esc(n.owner)}</div>
      <div class="bmacts"><button type="button" class="ghost" id="bm-copy">${t.copy}</button>${ex ? `<a href="${ex}${esc(n.owner)}" target="_blank" rel="noopener">${chain === 'solana' ? t.explorer : t.explorerEvm}</a>` : ''}</div>
      <p>${n.known ? t.excluded : n.c ? `<a href="#" data-c="${n.c.id}">${esc(t.inCluster(`${t.cluster} ${n.c.id}`, n.c.members.length, n.c.pct.toFixed(2)))}</a>` : groups ? t.solo : ''}</p>
      ${f && ex ? `<p>${t.fundedBy} <a class="mono" dir="ltr" href="${ex}${esc(f)}" target="_blank" rel="noopener">${esc(short(f))}</a></p>` : ''}`;
    panel.querySelector('#bm-copy').onclick = (e) => { const b = e.currentTarget; const done = () => { b.textContent = t.copied; setTimeout(() => { b.textContent = t.copy; }, 1300); };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(n.owner).then(done, () => {}); else { const ta = document.createElement('textarea'); ta.value = n.owner; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch {} ta.remove(); } };
  }
  function showList() {
    const s = st.sel; const tb = st.tab || (clusters.length ? 'c' : 'w');
    el.querySelectorAll('.bmtabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tb));
    if (tb === 'c') list.innerHTML = clusters.length ? clusters.map(c => `<button type="button" class="bmrow${s?.c === c.id ? ' on' : ''}" data-c="${c.id}"><span class="bmdot" style="background:${c.color}"></span><span class="bmn">${t.cluster} ${c.id}</span><span class="bmc">${t.nW(c.members.length)}</span>${pctS(c.pct)}</button>`).join('') : `<span class="muted">${groups ? t.noClusters : t.noLinks}</span>`;
    else list.innerHTML = nodes.map(n => `<button type="button" class="bmrow${s?.o === n.owner ? ' on' : ''}" data-o="${esc(n.owner)}"><span class="bmc">#${n.rank}</span>${dot(n)}<span class="bmn"><span class="mono" dir="ltr">${esc(short(n.owner))}</span>${n.known ? ` <span class="bmc">${esc(K(n.known))}</span>` : n.label ? ` <span class="bmc">${esc(K(n.label))}</span>` : ''}</span>${pctS(n.pct)}</button>`).join('');
  }
  const select = (sel, focus) => { st.sel = sel; showPanel(); showList(); inst.kick();
    if (focus && sel) { const ms = sel.c != null ? clusters.find(c => c.id === sel.c)?.members : (() => { const n = nodes.find(n => n.owner === sel.o); return n ? (n.c ? n.c.members : [n]) : null; })(); inst.focus(ms); } };
  inst = mapView(stage, M, st, { K, select: (s) => select(s, false) });
  const onPick = (e) => { const b = e.target.closest('[data-c],[data-o]'); if (!b) return; e.preventDefault();
    const sel = b.dataset.c ? { c: +b.dataset.c } : { o: b.dataset.o }; const same = st.sel && ((sel.c != null && st.sel.c === sel.c) || (sel.o && st.sel.o === sel.o));
    select(same && b.closest('#bm-list') ? null : sel, true); };
  list.addEventListener('click', onPick); panel.addEventListener('click', (e) => { if (e.target.closest('[data-c],[data-o]')) onPick(e); });
  el.querySelectorAll('.bmtabs button').forEach(b => b.addEventListener('click', () => { st.tab = b.dataset.tab; showList(); }));
  el.querySelectorAll('.bmzoom button').forEach(b => b.addEventListener('click', () => { const z = b.dataset.z; z === 'fit' ? inst.fit() : inst.zoom(z === 'in' ? 1.4 : 1 / 1.4); }));
  showPanel(); showList();
}

// ---------- data flow ----------
const cache = new Map(); let cur = null;
async function build(addr, chain) {
  const base = chain === 'solana' ? await withTimeout(solHolders(addr), 20000, 'holders') : await withTimeout(evmHolders(addr, chain), 12000, 'holders');
  const holders = base.holders.slice(0, MAXN);
  if (!holders.length) return { empty: true };
  if (chain !== 'solana') return { holders, src: base.src, total: base.total, groups: null };
  const owners = holders.filter(h => !h.known).slice(0, LINKN).map(h => h.owner);
  // Draw the holders right away; links (shared funders) are computed in parallel with the launch analysis and merged when ready.
  cache.set(addr, { holders, src: base.src, total: base.total, groups: null, linking: true }); if (cur?.addr === addr) paint();
  const mk = (links) => ({ holders, src: base.src, total: base.total, groups: links.group, edges: links.edges, fund: links.fund, info: { known: links.known, m: owners.length } });
  let links = null; try { links = await withTimeout(holderLinks(addr, owners), 60000, 'links'); } catch {}
  if (!links) return { holders, src: base.src, total: base.total, groups: null, linkErr: true };
  if (!exitCache.has(addr) && /pump$/.test(addr)) {
    cache.set(addr, { ...mk(links), linking: true }); if (cur?.addr === addr) paint();
    for (let i = 0; i < 60 && !exitCache.has(addr); i++) await new Promise(r => setTimeout(r, 1000));
    if (exitCache.has(addr)) try { links = await withTimeout(holderLinks(addr, owners), 20000, 'links'); } catch {}  // funders cached: cheap re-merge with exit-trace clusters
  }
  return mk(links);
}
function paint() {
  if (!cur) return; const t = L[lang()]; const box = $('#bm-box');
  if (!box) return;
  const d = cache.get(cur.addr);
  const body = !d || d === 'loading' ? `<span class="spin"></span> ${t.loading}` : d.error ? `<span class="muted">${d.timeout ? t.timeout : t.err}</span> <button type="button" class="ghost act" id="bm-retry">${t.retry}</button>` : d.empty ? `<span class="muted">${t.empty}</span>` : '';
  if (inst) { inst.destroy(); inst = null; }
  box.hidden = false; box.innerHTML = `<h3>${t.title}</h3><div id="bm-body">${body}</div>`;
  if (!body) draw($('#bm-body'), d, cur.chain, cur.addr);
  $('#bm-retry')?.addEventListener('click', () => start(cur.addr, cur.chain));
}
async function start(addr, chain) {
  cache.set(addr, 'loading'); paint();
  try { cache.set(addr, await build(addr, chain)); } catch (e) { cache.set(addr, e?.message === 'empty' ? { empty: true } : { error: true, timeout: /timeout/.test(e?.message || '') }); }
  if (cur?.addr === addr) paint();
}
document.addEventListener('mc:render', async (e) => {
  const { r } = e.detail; cur = { addr: r.addr, chain: r.chain };
  if (!['solana', 'ethereum', 'bsc', 'base', 'arbitrum'].includes(r.chain)) { const b = $('#bm-box'); if (b) b.hidden = true; if (inst) { inst.destroy(); inst = null; } return; }
  const c = cache.get(r.addr);
  if (c && !c.error) { paint(); return; }
  start(r.addr, r.chain);
});
