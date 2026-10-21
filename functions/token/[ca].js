// /token/<ca> — static, indexable, shareable per-token page rendered server-side from the CACHED scan result
// (Cache API -> KV, read-only, same data as /api/cache) plus the token's accuracy-study record if it was tracked.
// Never computes a score and never writes KV (oginfo may store name/symbol meta through the budget guard, as for link previews).
// Every token-controlled string is HTML-escaped; the address must be base58 Solana or 0x EVM.
import { readShared, keyOf } from '../_lib/shared.js';
import { ogInfo, CA_RE } from '../_lib/oginfo.js';
import { dec } from '../../mccache.js';
import { T } from '../../i18n.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EVM = ['ethereum', 'base', 'bsc', 'arbitrum'], CHN = { solana: 'Solana', ethereum: 'Ethereum', base: 'Base', bsc: 'BNB Chain', arbitrum: 'Arbitrum' };
const ST = { rug: 'Actual rug', dead: 'Dead', down70: 'Down ≥70%', alive: 'Alive', pending: 'Pending', nodata: 'No price data' };
const page = (status, html, cc) => new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cc, 'x-robots-tag': status === 200 ? 'index, follow' : 'noindex' } });
export const onRequestGet = async ({ params, env, request }) => {
  const ca = String(params.ca || '');
  if (!CA_RE.test(ca)) return page(404, '<!doctype html><meta charset="utf-8"><title>Not found</title><p>Not a valid Solana or EVM token address. <a href="/">MemeCheckShield</a></p>', 'public, max-age=3600');
  const evm = ca.startsWith('0x');
  let r = null, at = null;
  for (const c of evm ? EVM : ['solana']) { try { const v = await readShared(env.MEMECHECK_CACHE, keyOf('core', c, ca)); if (v) { const j = JSON.parse(v); r = dec(j.data); at = j.at; break; } } catch {} }
  let rec = null;
  if (!evm) { try { const s = await fetch(new URL('/study-data.json', request.url)).then(x => x.json()); rec = (s.records || []).find(x => x.ca === ca) || null; } catch {}
    if (!rec) try { const v = await env.MEMECHECK_CACHE.get('study:v2', 'json'); rec = (v?.records || []).find(x => x.ca === ca) || null; } catch {} }
  const info = r ? { sym: r.meta?.symbol, name: r.meta?.name, chain: r.chain } : await ogInfo(env, ca, null).catch(() => ({}));
  const sym = String(info.sym || '').replace(/^\$+/, '').slice(0, 40), name = String(info.name || '').slice(0, 80), chain = info.chain || (evm ? 'ethereum' : 'solana');
  const t = T.en, lv = r?.verdict?.level, label = lv ? (t[lv] || lv) : null;
  const say = (f) => { try { const fn = t.r?.[f.id]; return typeof fn === 'function' ? fn(f.params || {}, f.status) : f.id; } catch { return f.id; } };
  const order = { fail: 0, warn: 1, na: 2, pass: 3 };
  const fs = r ? [...(r.findings || [])].filter(f => f.status !== 'na').sort((a, b) => order[a.status] - order[b.status]).slice(0, 14) : [];
  const title = `${sym ? '$' + sym : ca.slice(0, 4) + '…' + ca.slice(-4)}${name && name !== sym ? ' (' + name + ')' : ''} safety check${label ? ': ' + label : ''} – MemeCheckShield`;
  const desc = label ? `${sym ? '$' + sym : 'Token'} on ${CHN[chain] || chain}: ${label}, ${r.verdict.points} risk points at the last cached MemeCheckShield scan. Rug, honeypot, holder and dev checks.` : `Is ${sym ? '$' + sym : 'this token'} safe? Free rug, honeypot, holder and dev checks on MemeCheckShield.`;
  const canon = `https://memecheck.pages.dev/token/${ca}`, live = `/?ca=${encodeURIComponent(ca)}${evm ? '&chain=' + encodeURIComponent(chain) : ''}`;
  const when = at ? new Date(at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : null;
  const html = `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${canon}">
${r || rec ? '' : '<meta name="robots" content="noindex">'}
<meta property="og:type" content="website"><meta property="og:site_name" content="MemeCheckShield"><meta property="og:url" content="${canon}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://memecheck.pages.dev/api/og?ca=${encodeURIComponent(ca)}${evm ? '&chain=' + encodeURIComponent(chain) : ''}"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b0f17"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"><link rel="stylesheet" href="/style.css?v=1793100200">
<style>main{max-width:860px;margin:0 auto;padding:0 20px}nav.crumbs{display:flex;gap:8px;padding:0 20px;max-width:860px;margin:12px auto 0;font-size:14px}nav.crumbs a{color:#9aa4b8;text-decoration:none}.caveat{background:#121826;border:1px solid #3d3510;border-radius:12px;padding:10px 12px;color:#ffd447;font-size:14px;margin-top:10px}</style>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: title, url: canon, description: desc }).replace(/</g, '\\u003c')}</script>
</head><body><header><div class="brand"><img src="/icon-64.png" width="26" height="26" alt="MemeCheckShield"> <b>MemeCheckShield</b></div></header>
<nav class="crumbs"><a href="/">Home</a><span>/</span><span>Token</span></nav><main>
<div class="card verdict">${label ? `<div class="badge ${esc(lv)}">${esc(label)}</div>` : '<div class="badge unknown">Not scanned recently</div>'}
<div class="tok"><b>${esc(name || sym || 'Unknown token')}</b> <span class="muted">${sym ? '$' + esc(sym) + ' · ' : ''}${esc(CHN[chain] || chain)}</span>
<div class="mono muted" dir="ltr">${esc(ca)}</div>
${label ? `<div class="muted">${esc(r.verdict.points)} risk points · cached scan ${esc(when)}</div>` : '<div class="muted">No recent cached scan for this token.</div>'}</div>
${lv === 'low' ? '<div class="caveat">“No major red flags” means our checks found nothing big — not that the coin is safe. Most fresh meme coins still die or rug: see <a href="/accuracy">measured rates</a>.</div>' : ''}
<p style="margin-top:12px"><a class="act" href="${esc(live)}"><b>Run a live check now →</b></a></p></div>
${fs.length ? `<div class="card"><h3>Findings at the last scan</h3>${fs.map(f => `<div class="row"><span class="st ${esc(f.status)}">${esc(f.status === 'fail' ? 'FAIL' : f.status === 'warn' ? 'WARN' : 'PASS')}</span><span>${esc(say(f))}</span></div>`).join('')}</div>` : ''}
${rec ? `<div class="card"><h3>In our accuracy study</h3><p>Scanned ${esc(String(rec.scanned).replace('T', ' ').slice(0, 16))} UTC as <span class="badge ${esc(rec.level)}">${esc(String(rec.level).toUpperCase())} ${esc(rec.pts)}</span>. 24h later: <b>${esc(ST[rec.o24?.st] || rec.o24?.st || '—')}</b>${rec.o24?.ch != null ? ` (${esc(rec.o24.ch)}%)` : ''}; 48h: <b>${esc(ST[rec.o48?.st] || rec.o48?.st || '—')}</b>.</p><p class="muted"><a href="/rugs">All study coins</a> · <a href="/accuracy">accuracy per level</a></p></div>` : ''}
<p class="muted">Not financial advice. Automated checks can miss scams or flag legit tokens.</p></main>
<footer>· <a href="/">MemeCheckShield</a> · <a href="/how">How the score works</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></footer></body></html>`;
  return page(200, html, 'public, max-age=600');
};
