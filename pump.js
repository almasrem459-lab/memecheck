// Meme tab: newest pump.fun tokens. pump.fun API via /api/proxy (it rejects browser origins), DexScreener fallback.
// "Check" only fills #addr and submits the existing checker form; checker logic untouched.
const $ = (s) => document.querySelector(s);
const L = { en: { title:'Newly launched', tTrend:'Trending (6H)', bTrend:'Trending', bNew:'New', tipTrend:'Hot pairs over the last 6 hours (GeckoTerminal trending, close to DexScreener Trending 6H)', tipNew:'Newest pump.fun launches', vol:'VOL', liq:'LIQ', age:'Age', h6:'6H', h24:'24H', refresh:'↻ Refresh', check:'Check', mcap:'MCAP', loading:'Loading…', errT:'Trending list is unavailable right now. Try ↻ Refresh in a minute.', err:'No new tokens to show right now. Try ↻ Refresh in a minute.', src:'Source:', now:'just now', all:(n)=>`Show all ${n}`, less:'Show fewer', gtSrc:'GeckoTerminal trending (6h)', dexSrc:'DexScreener (latest token profiles)', gtNew:'GeckoTerminal (new Solana pools)' },
  ar: { title:'آخر العملات النازلة', tTrend:'الرائجة (6 ساعات)', bTrend:'رائجة', bNew:'الأحدث', tipTrend:'الأزواج الأكثر نشاطًا خلال 6 ساعات (رائج GeckoTerminal، قريب من رائج DexScreener)', tipNew:'أحدث إطلاقات pump.fun', vol:'حجم', liq:'سيولة', age:'العمر', h6:'6س', h24:'24س', refresh:'↻ تحديث', check:'افحص', mcap:'القيمة', loading:'جارٍ التحميل…', errT:'قائمة الرائجة غير متاحة الآن. جرّب ↻ تحديث بعد دقيقة.', err:'لا توجد عملات جديدة للعرض الآن. جرّب ↻ تحديث بعد دقيقة.', src:'المصدر:', now:'الآن', all:(n)=>`عرض الكل (${n})`, less:'عرض أقل', gtSrc:'الرائجة على GeckoTerminal (6 ساعات)', dexSrc:'DexScreener (أحدث ملفات العملات)', gtNew:'GeckoTerminal (أحدث مجمعات سولانا)' } };
const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const thumb = (u) => { if (!u) return ''; try { let x = String(u); x = x.replace(/\/large(\/|\.)/g, '/small$1').replace(/\/thumb_large\//g, '/thumb/').replace(/coins\/images\/(\d+)\/large\//, 'coins/images/$1/small/'); return x; } catch { return u; } };
const usd = (n) => n == null ? '' : '$' + (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n.toFixed(0));
let items = null, src = '', busy = false, all = false; // all: list expanded past the first COMPACT rows
const COMPACT = 5; // homepage shows 5 rows; 'Show all' reveals the rest (hidden rows' lazy images are never fetched)
const TO = (ms) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined); // short timeouts: a slow API never hangs the card
const SKEL = '<div class="skr"></div>'.repeat(COMPACT);
function ago(ts) {
  if (!ts) return ''; const m = Math.floor((Date.now() - ts) / 6e4); if (m < 1) return L[lang()].now;
  const rtf = new Intl.RelativeTimeFormat(lang(), { numeric: 'always', style: 'narrow' });
  return m < 60 ? rtf.format(-m, 'minute') : m < 1440 ? rtf.format(-Math.floor(m / 60), 'hour') : rtf.format(-Math.floor(m / 1440), 'day');
}
let srcPump = 'pump.fun';
// Server-side list (/api/new-tokens): pump.fun -> DexScreener -> GeckoTerminal fallback, edge-cached ~90 s. One client retry.
async function fromPump() {
  let last = null;
  for (let i = 0; i < 2; i++) {
    try {
      if (i) await new Promise(r => setTimeout(r, 1500));
      const r = await fetch('/api/new-tokens' + (i ? '?fresh=1' : ''), { signal: TO(7000) }); if (!r.ok) throw 0; const d = await r.json();
      if (d?.items?.length) { srcPump = d.source || 'pump.fun'; return d.items; }
      last = 'empty';
    } catch (e) { last = e; }
  }
  throw last || 0;
}
const OK = { solana: 'solana', ethereum: 'ethereum', base: 'base', bsc: 'bsc', arbitrum: 'arbitrum' }; // chains the checker supports
// Trending mode: approximates DexScreener's "Trending 6H" ranking (its own ranking API is not public/keyless).
// GeckoTerminal trending_pools with duration=6h, kept in GeckoTerminal's rank order; liquidity >= $20K, majors/stables dropped.
const GTN = { solana: 'solana', ethereum: 'eth', base: 'base', bsc: 'bsc', arbitrum: 'arbitrum' };
const MAJOR = /^(w?sol|w?eth|weth|w?bnb|w?btc|cbbtc|usdc|usdt|usd1|usds|dai|fdusd|usde|pyusd)$/i;
let chain = OK[localStorage.getItem('mc_pf_chain')] || 'solana';
async function fromDex() {
  const net = GTN[chain];
  const get = (u) => fetch(u, { headers: { accept: 'application/json' }, signal: TO(6000) }).then(r => r.ok ? r.json() : null).catch(() => null);
  const pages = await Promise.all([1, 2].map(pg => get(`https://api.geckoterminal.com/api/v2/networks/${net}/trending_pools?include=base_token&duration=6h&page=${pg}`)));
  if (!pages[0]?.data) throw 0;
  const seen = new Set(), out = [];
  for (const d of pages) {
    if (!d?.data) continue; const inc = Object.fromEntries((d.included || []).map(x => [x.id, x.attributes]));
    for (const p of d.data) {
      const a = p.attributes, t = inc[p.relationships?.base_token?.data?.id]; if (!t?.address || seen.has(t.address)) continue;
      const liq = +a.reserve_in_usd || 0; if (liq < 2e4 || MAJOR.test(t.symbol)) continue; seen.add(t.address);
      const pc = a.price_change_percentage || {}, num = (v) => v == null || v === '' ? null : +v;
      out.push({ a: t.address, c: chain, n: t.name, s: t.symbol, img: t.image_url && !/missing/.test(t.image_url) ? t.image_url : null,
        ts: a.pool_created_at ? Date.parse(a.pool_created_at) : null, mc: num(a.market_cap_usd) ?? num(a.fdv_usd), liq, p: num(a.base_token_price_usd), vol: num(a.volume_usd?.h24), ch6: num(pc.h6), ch24: num(pc.h24), trend: true });
    }
  }
  if (!out.length) throw 0; return out.slice(0, 20);
}
// Fill missing logo/price/liq/vol/changes from DexScreener's token API (best-liquidity pair per token).
async function enrich(list) {
  const by = {}; for (const c of list) (by[c.c || 'solana'] ||= []).push(c);
  await Promise.all(Object.entries(by).map(async ([ch, cs]) => {
    const d = await fetch(`https://api.dexscreener.com/tokens/v1/${ch}/` + cs.map(c => c.a).slice(0, 30).join(','), { signal: TO(5000) }).then(r => r.ok ? r.json() : []).catch(() => []);
    const best = {}; for (const p of d || []) { const k = p.baseToken?.address; if (k && (!best[k] || (p.liquidity?.usd || 0) > (best[k].liquidity?.usd || 0))) best[k] = p; }
    for (const c of cs) { const p = best[c.a]; if (!p) continue; const n = (v) => v == null ? null : +v;
      c.img ||= p.info?.imageUrl || null; c.p ??= n(p.priceUsd); c.liq ??= n(p.liquidity?.usd); c.vol ??= n(p.volume?.h24);
      c.ch6 ??= n(p.priceChange?.h6); c.ch24 ??= n(p.priceChange?.h24); c.mc ??= n(p.marketCap ?? p.fdv); c.ts ||= p.pairCreatedAt || null; }
  }));
  return list;
}
let mode = localStorage.getItem('mc_pf_src') === 'pump' ? 'pump' : 'dex';
function seg() { $('#pf-chain').hidden = mode !== 'dex'; $('#pf-chain').value = chain; document.querySelectorAll('#pf-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === mode)); }
async function load() {
  if (busy) return; busy = true; $('#pf-r').disabled = true;
  if (!items) { $('#pf-list').innerHTML = SKEL; $('#pf-list').setAttribute('aria-busy', 'true'); }
  const m = mode;
  try { const r = m === 'dex' ? await fromDex() : await fromPump(); await enrich(r).catch(() => {}); if (m === mode) { items = r; src = m === 'dex' ? 'gt' : srcPump; } }
  catch { if (m === mode && !items) $('#pf-list').innerHTML = `<p class="muted pf-empty">${m === 'dex' ? L[lang()].errT : L[lang()].err}</p>`; }
  busy = false; $('#pf-r').disabled = false; $('#pf-list').removeAttribute('aria-busy'); render();
}
const SUB = '₀₁₂₃₄₅₆₇₈₉';
function price(v) {
  if (v == null || !isFinite(v)) return '—'; if (v >= 1) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: v >= 1000 ? 0 : 2 });
  const m = /^0\.(0*)(\d+)/.exec(v.toFixed(20)); if (!m) return '$' + v; const z = m[1].length, d = m[2].slice(0, 4);
  return z >= 3 ? `$0.0<sub>${[...String(z)].map(x => SUB[x]).join('')}</sub>${d}` : '$0.' + m[1] + d;
}
const cusd = (n) => n == null ? '—' : '$' + (n >= 1e9 ? +(n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : Math.round(n));
function age(ts) { if (!ts) return ''; const m = Math.max(0, Math.floor((Date.now() - ts) / 6e4)); return m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : m < 43200 ? Math.floor(m / 1440) + 'd' : Math.floor(m / 43200) + 'mo'; }
const CHI = { solana: ['#9945ff', '#14f195'], ethereum: ['#627eea', '#8aa0f2'], base: ['#0052ff', '#3d7bff'], bsc: ['#f0b90b', '#f8d33a'], arbitrum: ['#213147', '#28a0f0'] };
const chainIco = (c) => { const [a, b] = CHI[c] || CHI.solana; return `<span class="dsc" title="${esc(c)}" style="background:linear-gradient(135deg,${a},${b})">${esc((c || 's')[0].toUpperCase())}</span>`; };
function render() {
  const t = L[lang()]; $('#pf-r').textContent = '↻'; $('#pf-r').title = t.refresh.replace('↻ ', ''); $('#pf h3').textContent = mode === 'dex' ? t.tTrend : t.title;
  document.querySelectorAll('#pf-seg button').forEach(b => { b.innerHTML = b.dataset.m === 'dex' ? `🔥 ${t.bTrend} <small>6H</small>` : `🌱 ${t.bNew}`; b.title = b.dataset.m === 'dex' ? t.tipTrend : t.tipNew; });
  const more = $('#pf-more'); if (more) { more.hidden = !items || items.length <= COMPACT; if (items) more.textContent = all ? '▴ ' + t.less : '▾ ' + t.all(items.length); more.setAttribute('aria-expanded', String(all)); }
  $('#pf').classList.toggle('pf-all', all);
  if (!items) return;
  const pct = (v) => v == null ? '<span class="muted">—</span>' : `<span class="${v > -0.05 ? 'up' : 'dn'}">${v <= -0.05 ? '-' : ''}${Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(Math.abs(v) >= 1e4 ? 0 : 1) + 'K' : Math.abs(v) >= 100 ? Math.round(Math.abs(v)) : Math.abs(v).toFixed(Math.abs(v) >= 10 ? 0 : 1)}%</span>`;
  $('#pf-list').innerHTML = items.map(c => `<div class="dsr pfrow" role="button" tabindex="0" data-a="${esc(c.a)}" data-c="${esc(c.c || 'solana')}">
   <div class="dsl">${chainIco(c.c || 'solana')}<img src="${esc(thumb(c.img || ''))}" alt="" loading="lazy" decoding="async" width="22" height="22" onerror="this.style.visibility='hidden'">
    <div class="dsn"><div class="dst"><b dir="ltr">${esc(c.s || c.n)}</b>${c.ts ? `<span class="dsa ${mode === 'pump' || Date.now() - c.ts < 864e5 ? 'new' : ''}" dir="ltr">${mode === 'pump' || Date.now() - c.ts < 864e5 ? '🌱' : ''}${age(c.ts)}</span>` : ''}</div><div class="dsf" dir="auto">${esc(c.n)}</div></div></div>
   <div class="dsrt" dir="ltr"><div class="dsp"><b>${price(c.p)}</b><span><i>${t.h6}</i> ${pct(c.ch6)}</span><span><i>${t.h24}</i> ${pct(c.ch24)}</span></div>
    <div class="dsk"><span><i>${t.liq}</i> ${cusd(c.liq)}</span><span><i>${t.vol}</i> ${cusd(c.vol)}</span><span><i>${t.mcap}</i> ${cusd(c.mc)}</span></div></div></div>`).join('');
  $('#pf-src').textContent = `${t.src} ${src === 'gt' ? t.gtSrc : src === 'DexScreener' || src.startsWith('DexScreener') ? t.dexSrc : src === 'GeckoTerminal' ? t.gtNew : src} · DexScreener`;
}
function pick(b) {
  if (b.dataset.c !== 'solana') $('#chain').value = b.dataset.c;
  const i = $('#addr'); i.value = b.dataset.a; i.dispatchEvent(new Event('input', { bubbles: true }));
  $('#f').requestSubmit(); $('#out').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#pf-list').addEventListener('keydown', (e) => { const b = e.target.closest('.dsr'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(b); } });
$('#pf-list').addEventListener('click', (e) => {
  const b = e.target.closest('.dsr'); if (b) pick(b);
});
$('#pf-r').addEventListener('click', load);
$('#pf-more')?.addEventListener('click', () => { all = !all; render(); if (!all) $('#pf').scrollIntoView({ block: 'nearest' }); });
$('#pf-chain').addEventListener('change', (e) => { chain = e.target.value; localStorage.setItem('mc_pf_chain', chain); items = null; busy = false; load(); });
$('#pf-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.dataset.m === mode) return; mode = b.dataset.m; localStorage.setItem('mc_pf_src', mode); seg(); items = null; busy = false; load(); });
$('#lang').addEventListener('click', () => setTimeout(render));
seg(); render(); load(); setInterval(() => { if (!$('#sec-meme').hidden) load(); }, 60000); setInterval(() => { if (!$('#sec-meme').hidden) render(); }, 30000);
