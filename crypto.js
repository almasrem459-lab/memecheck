// Crypto tab: top 20 by market cap. CoinGecko (keyless, CORS *), CoinPaprika fallback. Loaded on first open.
const $ = (s) => document.querySelector(s);
const L = { en: { rank:'#', coin:'Coin', price:'Price', ch:'24h', mcap:'Market cap', fg:{ 'Extreme Fear':'Extreme Fear', Fear:'Fear', Neutral:'Neutral', Greed:'Greed', 'Extreme Greed':'Extreme Greed' }, fgSrc:'Source: alternative.me', moverNote:'Among the top 100 by market cap, stablecoins excluded.', err:'Could not load prices. Retrying in 60 s.', loading:'Loading…' },
  ar: { rank:'#', coin:'العملة', price:'السعر', ch:'24 ساعة', mcap:'القيمة السوقية', fg:{ 'Extreme Fear':'خوف شديد', Fear:'خوف', Neutral:'محايد', Greed:'طمع', 'Extreme Greed':'طمع شديد' }, fgSrc:'المصدر: alternative.me', moverNote:'من بين أكبر 100 عملة حسب القيمة السوقية، باستثناء العملات المستقرة.', err:'تعذّر تحميل الأسعار. إعادة المحاولة خلال 60 ثانية.', loading:'جارٍ التحميل…' } };
let lang = 'en', fg = null, movers = null, rows = null, src = '', at = null, timer = null;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const price = (n) => n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 6 : 2 });
const big = (n) => n == null ? '—' : '$' + (n >= 1e12 ? (n / 1e12).toFixed(2) + 'T' : n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : (n / 1e6).toFixed(2) + 'M');
async function j(u) { const r = await fetch(u, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(r.status); return r.json(); }
const STABLE = /^(usdt|usdc|usds|dai|usde|fdusd|tusd|pyusd|usdd|usd0|usdtb|usd1|rlusd|frax|gho|susde|bsc-usd|usdf|usdg|buidl|eurc|xaut|paxg)$/i;
function moverCalc(all) {
  const ok = all.filter(c => c.price_change_percentage_24h != null && c.current_price != null && !STABLE.test(c.symbol) && !/\busd|stable/i.test(c.name) && Math.abs(c.current_price - 1) > 0.02);
  const s = [...ok].sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h);
  movers = { g: s.slice(0, 5), l: s.slice(-5).reverse() };
}
async function loadFg() { try { const d = await j('https://api.alternative.me/fng/'); fg = d.data[0]; } catch { fg = false; } renderFg(); }
function renderFg() {
  const t = L[lang]; if (fg === null) return; if (!fg) { $('#fg').textContent = t.err; return; }
  const v = +fg.value, col = `hsl(${Math.round(v * 1.2)},75%,55%)`;
  $('#fg').innerHTML = `<div class="fgv"><b style="color:${col}" dir="ltr">${v}</b><span style="color:${col}">${esc(t.fg[fg.value_classification] || fg.value_classification)}</span></div><div class="fgbar"><i style="inset-inline-start:${v}%"></i></div><div class="fgs" dir="ltr"><span>0</span><span>50</span><span>100</span></div><div class="muted">${t.fgSrc}</div>`;
}
function renderMovers() {
  if (!movers) return;
  const li = (c) => `<div class="row"><img src="${esc(c.image)}" alt="" width="20" height="20" style="border-radius:50%"><b>${esc(c.symbol.toUpperCase())}</b><span class="muted" style="margin:0">${price(c.current_price)}</span><b dir="ltr" class="${c.price_change_percentage_24h >= 0 ? 'up' : 'dn'}" style="margin-inline-start:auto">${(c.price_change_percentage_24h > 0 ? '+' : '') + c.price_change_percentage_24h.toFixed(2)}%</b></div>`;
  $('#gain').innerHTML = movers.g.map(li).join('') + `<div class="muted">${L[lang].moverNote}</div>`; $('#lose').innerHTML = movers.l.map(li).join('');
}
async function load() {
  try {
    const all = await j('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h');
    const d = all.slice(0, 20); moverCalc(all);
    rows = d.map(c => ({ r: c.market_cap_rank, img: c.image, n: c.name, s: c.symbol.toUpperCase(), p: c.current_price, ch: c.price_change_percentage_24h, m: c.market_cap })); src = 'CoinGecko';
  } catch {
    try {
      const d = await j('https://api.coinpaprika.com/v1/tickers?limit=20');
      rows = d.map(c => ({ r: c.rank, img: `https://static.coinpaprika.com/coin/${c.id}/logo.png`, n: c.name, s: c.symbol, p: c.quotes.USD.price, ch: c.quotes.USD.percent_change_24h, m: c.quotes.USD.market_cap })); src = 'CoinPaprika';
    } catch { if (!rows) { $('#cx').innerHTML = `<div class="muted">${L[lang].err}</div>`; return; } }
  }
  at = new Date(); render(); renderMovers();
}
function render() {
  if (!rows) { $('#cx').innerHTML = `<div class="muted"><span class="spin"></span> ${L[lang].loading}</div>`; return; }
  const t = L[lang];
  $('#cx').innerHTML = `<table class="ctab"><thead><tr><th>${t.rank}</th><th>${t.coin}</th><th>${t.price}</th><th>${t.ch}</th><th class="hm">${t.mcap}</th></tr></thead><tbody>${rows.map(c =>
    `<tr><td class="muted">${c.r ?? ''}</td><td><span class="cn"><img src="${esc(c.img)}" alt="" loading="lazy" width="22" height="22"><b>${esc(c.n)}</b><span class="muted">${esc(c.s)}</span></span></td><td dir="ltr">${price(c.p)}</td><td dir="ltr" class="${c.ch >= 0 ? 'up' : 'dn'}">${c.ch == null ? '—' : (c.ch > 0 ? '+' : '') + c.ch.toFixed(2) + '%'}</td><td dir="ltr" class="hm">${big(c.m)}</td></tr>`).join('')}</tbody></table>`;
  $('#csrc').textContent = src; $('#cupd').textContent = at.toLocaleTimeString(lang === 'ar' ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
export function setLang(l) { lang = l; render(); renderFg(); renderMovers(); }
export function start(l) { lang = l; render(); load(); loadFg(); timer ??= setInterval(() => { load(); loadFg(); }, 60000); }
