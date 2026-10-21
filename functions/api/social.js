// GET /api/social?ca=<address>&chain=<solana|ethereum|base|bsc|arbitrum>
// -> Social & Community snapshot: links (DexScreener profile, pump.fun coin + metadata URI JSON), X/Twitter public profile
//    (api.fxtwitter.com, keyless, best-effort), Telegram public member count (t.me page), website reachability + domain age (rdap.org).
// Strict outbound allowlist, per-call timeouts, per-IP rate limit (rl.js), Cache API hot copy + budget-guarded KV (server-side only).
// Every string returned is length-capped and stripped of control chars; links are re-built from validated handles/hosts.
// Informational only: does not change the risk score.
import { rateLimit } from '../_lib/rl.js';
import { validCa, hotGet, hotPut, guardedPut } from '../_lib/shared.js';
import { pumpGet } from '../_lib/pump.js';

const VER = 5, TTL = 1800, TTL_PART = 300, KV_TTL = 6 * 3600;
const UA = 'Mozilla/5.0 (MemeCheck/1.0)', BOT_UA = 'TelegramBot (like TwitterBot)';
const ALLOW = /^(api\.dexscreener\.com|api\.geckoterminal\.com|api\.fxtwitter\.com|t\.me|rdap\.org|rdap\.[a-z0-9.-]+|[a-z0-9.-]*rdap[a-z0-9.-]*|ipfs\.io|[a-z0-9-]+\.mypinata\.cloud|gateway\.pinata\.cloud|cf-ipfs\.com|dweb\.link|nftstorage\.link|arweave\.net|[a-z0-9-]+\.arweave\.net|gateway\.irys\.xyz|metadata\.pumployer\.fun|ipfs\.pump\.fun|pump\.mypinata\.cloud)$/i;
const json = (status, body, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff', ...extra },
});
const clean = (s, n = 80) => String(s ?? '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e<>"'`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const isIp = (h) => /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || h === 'localhost' || /\.(local|internal|lan)$/.test(h);

async function get(url, { ms = 5000, ua = UA, type = 'json', redirect = 'follow', cf } = {}) {
  let u; try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' || !ALLOW.test(u.hostname)) return null;
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(u.href, { signal: ctl.signal, redirect, ...(cf ? { cf } : {}), headers: { accept: type === 'json' ? 'application/json, application/rdap+json' : 'text/html', 'user-agent': ua } });
    if (!r.ok) return { status: r.status };
    const txt = (await r.text()).slice(0, 400000);
    if (type === 'text') return { body: txt };
    try { return { body: JSON.parse(txt) }; } catch { return { status: 'badjson' }; }
  } catch { return { status: 'fail' }; } finally { clearTimeout(tm); }
}

// DexScreener / GeckoTerminal answer 429 to some Cloudflare egress IPs. Share /api/proxy's Cache-API copy (same key format,
// kept up to 24 h) and use Cloudflare's fetch cache, so one good answer per colo serves everyone.
const PKEY = (url) => new Request('https://memecheck-cache.internal/' + encodeURIComponent(url));
async function sharedJson(url, ms, waitUntil) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  let old = null; try { const h = cache && await cache.match(PKEY(url)); if (h) old = { body: await h.text(), at: +h.headers.get('x-fetched-at') || 0 }; } catch {}
  if (old && Date.now() - old.at < 600e3) { try { return { body: JSON.parse(old.body) }; } catch {} }
  const r = await get(url, { ms, cf: { cacheTtl: 300, cacheEverything: true } });
  if (r?.body) {
    if (cache) { const p = cache.put(PKEY(url), new Response(JSON.stringify(r.body), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400', 'x-fetched-at': String(Date.now()) } })).catch(() => {}); waitUntil ? waitUntil(p) : await p; }
    return r;
  }
  if (old) { try { return { body: JSON.parse(old.body), stale: true }; } catch {} }
  return r;
}

// ---- link normalization (handles only; URLs we show are rebuilt by us) ----
function xHandle(v) {
  v = String(v || '').trim(); if (!v) return null;
  const m = v.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter|x)\.com\/(?:#!\/)?@?([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i) || v.match(/^@?([A-Za-z0-9_]{1,15})$/);
  if (!m) return null; const h = m[1];
  if (/^(home|search|i|intent|share|hashtag|explore|status|communities)$/i.test(h)) return null;
  return h;
}
const xCommunity = (v) => /(?:twitter|x)\.com\/i\/communities\/(\d{5,25})/i.exec(String(v || ''))?.[1] || null;
function tgName(v) {
  v = String(v || '').trim();
  const m = v.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/(?:s\/)?([A-Za-z0-9_]{4,32})\/?(?:[?#].*)?$/i) || v.match(/^@([A-Za-z0-9_]{4,32})$/);
  if (!m || /^(joinchat|addstickers|share|proxy)$/i.test(m[1])) return null; return m[1];
}
function webUrl(v) {
  try {
    const u = new URL(/^https?:\/\//i.test(String(v)) ? String(v) : 'https://' + String(v));
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || (u.port && !['80', '443'].includes(u.port))) return null;
    const h = u.hostname.toLowerCase();
    if (isIp(h) || !/^[a-z0-9.-]+\.[a-z]{2,24}$/.test(h)) return null;
    if (/(^|\.)(twitter|x|t|telegram|discord|discordapp|dexscreener|pump)\.(com|me|gg|fun)$/.test(h)) return null;
    return { url: 'https://' + h + (u.pathname.length < 80 ? u.pathname : '/'), host: h };
  } catch { return null; }
}
const discordInv = (v) => /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})/i.exec(String(v || ''))?.[1] || null;

function collect(raw, srcName, acc) {
  for (const { kind, v } of raw) {
    if (!v) continue;
    const xc = xCommunity(v);
    if (xc) { acc.xCommunity ||= xc; continue; }
    const x = kind === 'twitter' || /(?:twitter|x)\.com\//i.test(v) ? xHandle(v) : null;
    if (x) { acc.x[x.toLowerCase()] ||= { handle: x, from: new Set() }; acc.x[x.toLowerCase()].from.add(srcName); continue; }
    const tg = kind === 'telegram' || /t\.me\/|telegram\./i.test(v) ? tgName(v) : null;
    if (tg) { acc.tg[tg.toLowerCase()] ||= { name: tg, from: new Set() }; acc.tg[tg.toLowerCase()].from.add(srcName); continue; }
    const dc = discordInv(v); if (dc) { acc.discord ||= dc; continue; }
    if (kind === 'website' || kind === 'web') { const w = webUrl(v); if (w) { acc.web[w.host] ||= { ...w, from: new Set() }; acc.web[w.host].from.add(srcName); } }
  }
}

// ---- sources ----
async function dexProfile(chain, ca, waitUntil) {
  // DexScreener rate-limits some Cloudflare egress IPs (429): fall back to its second endpoint family
  let r = await sharedJson(`https://api.dexscreener.com/tokens/v1/${chain}/${ca}`, 4000, waitUntil);
  if (!r?.body) { const r2 = await sharedJson(`https://api.dexscreener.com/latest/dex/tokens/${ca}`, 4000, waitUntil); if (r2?.body?.pairs) r = { body: r2.body.pairs.filter(p => p?.chainId === chain) }; }
  if (!r?.body) return { st: r?.status === 404 ? 'empty' : 'fail', code: r?.status };
  const pairs = Array.isArray(r.body) ? r.body : [];
  const p = pairs.find(x => x?.info && ((x.info.socials || []).length || (x.info.websites || []).length)) || pairs[0];
  if (!p) return { st: 'empty' };
  const raw = [...(p.info?.socials || []).map(s => ({ kind: String(s?.type || '').toLowerCase(), v: s?.url })), ...(p.info?.websites || []).map(w => ({ kind: 'website', v: w?.url }))];
  return { st: raw.length ? 'ok' : 'empty', raw, name: clean(p.baseToken?.name, 60), symbol: clean(p.baseToken?.symbol, 20), created: +p.pairCreatedAt || null };
}
const GT_NET = { solana: 'solana', ethereum: 'eth', base: 'base', bsc: 'bsc', arbitrum: 'arbitrum' };
async function geckoInfo(chain, ca, waitUntil) {
  const r = await sharedJson(`https://api.geckoterminal.com/api/v2/networks/${GT_NET[chain]}/tokens/${ca}/info`, 4500, waitUntil);
  const a = r?.body?.data?.attributes;
  if (!a) return { st: r?.status === 404 ? 'empty' : 'fail' };
  const raw = [{ kind: 'twitter', v: a.twitter_handle }, { kind: 'telegram', v: a.telegram_handle ? (/^https?:/.test(a.telegram_handle) ? a.telegram_handle : '@' + a.telegram_handle) : null },
    { kind: 'discord', v: a.discord_url }, ...(Array.isArray(a.websites) ? a.websites.slice(0, 3) : []).map(v => ({ kind: 'website', v }))];
  return { st: raw.some(x => x.v) ? 'ok' : 'empty', raw, name: clean(a.name, 60), symbol: clean(a.symbol, 20) };
}
async function pumpCoin(ca, waitUntil) {
  if (!/pump$/.test(ca) && ca.length < 32) return { st: 'skip' };
  let res; try { res = await pumpGet(`/coins-v2/${ca}`, { ms: 5000, waitUntil }); } catch { return { st: 'fail' }; }
  const c = res?.json; if (!c?.mint) return { st: res?.state === 'FAIL' ? 'fail' : 'empty' };
  const raw = [{ kind: 'twitter', v: c.twitter }, { kind: 'telegram', v: c.telegram }, { kind: 'website', v: c.website }];
  return { st: 'ok', raw, uri: c.metadata_uri, name: clean(c.name, 60), symbol: clean(c.symbol, 20), created: +c.created_timestamp || null };
}
async function metaUri(uri) {
  if (!uri) return { st: 'skip' };
  let u = String(uri); if (u.startsWith('ipfs://')) u = 'https://ipfs.io/ipfs/' + u.slice(7);
  const cid = /\/ipfs\/([A-Za-z0-9]{40,80})/.exec(u)?.[1];
  const urls = cid ? [`https://ipfs.io/ipfs/${cid}`, `https://gateway.pinata.cloud/ipfs/${cid}`, `https://dweb.link/ipfs/${cid}`] : [u];
  const r = await Promise.any(urls.map(x => get(x, { ms: 4500 }).then(v => v?.body ? v : Promise.reject(v)))).catch(e => e?.errors?.[0] ?? null);
  if (!r) return { st: 'skip' }; // host not on allowlist
  if (!r.body || typeof r.body !== 'object') return { st: 'fail' };
  const b = r.body, ext = b.extensions || b.properties?.links || {};
  const raw = [{ kind: 'twitter', v: b.twitter || ext.twitter }, { kind: 'telegram', v: b.telegram || ext.telegram }, { kind: 'website', v: b.website || ext.website },
    { kind: 'discord', v: b.discord || ext.discord }];
  return { st: raw.some(x => x.v) ? 'ok' : 'empty', raw };
}
async function xProfile(handle) {
  // fxtwitter sometimes answers a spurious 404 for live accounts: only call it "not found" after two 404s in a row
  const once = () => get(`https://api.fxtwitter.com/${encodeURIComponent(handle)}`, { ms: 4500, ua: BOT_UA });
  const is404 = (r) => r?.body?.code === 404 || r?.status === 404;
  let r = await once();
  if (!r?.body?.user) { await new Promise(ok => setTimeout(ok, 400)); const r2 = await once(); if (r2?.body?.user || !is404(r2)) r = r2; }
  const u = r?.body?.user;
  if (!u) return { st: is404(r) ? 'notfound' : 'fail' };
  const joined = Date.parse(u.joined) || null;
  return { st: 'ok', handle: clean(u.screen_name, 15).replace(/[^A-Za-z0-9_]/g, ''), name: clean(u.name, 50), followers: +u.followers || 0, following: +u.following || 0,
    tweets: +u.tweets || 0, joined, verified: !!u.verification?.verified, vtype: clean(u.verification?.type, 20), protected: !!u.protected };
}
async function tgInfo(name) {
  const r = await get(`https://t.me/${encodeURIComponent(name)}`, { ms: 4500, type: 'text' });
  if (!r?.body) return { st: 'fail' };
  const html = r.body;
  const extra = /<div class="tgme_page_extra">([^<]{1,80})<\/div>/.exec(html)?.[1] || '';
  const title = /<div class="tgme_page_title"[^>]*>\s*<span[^>]*>([^<]{1,120})</.exec(html)?.[1] || '';
  if (!title && !extra) return { st: 'notfound' };
  const num = (re) => { const m = re.exec(extra.replace(/&nbsp;/g, ' ')); return m ? +m[1].replace(/[\s,]/g, '') : null; };
  const members = num(/([\d\s,]+)\s+(?:members|subscribers)/i), online = num(/([\d\s,]+)\s+online/i);
  const type = /subscribers/i.test(extra) ? 'channel' : /members/i.test(extra) ? 'group' : 'other';
  return { st: 'ok', title: clean(title.replace(/&amp;/g, '&').replace(/&#39;/g, "'"), 60), members, online, type };
}
async function webInfo(w) {
  const out = { st: 'fail', live: null, status: null, domainAge: null, registered: null };
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 4500);
  try { // reachability: GET without following redirects (Workers cannot reach private networks; host is a public DNS name)
    const r = await fetch(w.url, { method: 'GET', redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': UA, accept: 'text/html' } });
    out.status = r.status; out.live = r.status < 400 || r.status === 403; // 403 = bot wall (Cloudflare etc.) but the site is up
    try { r.body?.cancel(); } catch {}
  } catch { out.live = false; } finally { clearTimeout(tm); }
  const parts = w.host.split('.'); const apex = parts.slice(-2).join('.');
  const rd = await get(`https://rdap.org/domain/${apex}`, { ms: 4500 });
  const ev = rd?.body?.events;
  if (Array.isArray(ev)) { const reg = ev.find(e => /registration/i.test(e?.eventAction || '')); const t = Date.parse(reg?.eventDate || ''); if (t) { out.registered = t; out.domainAge = Math.floor((Date.now() - t) / 864e5); } }
  out.st = 'ok';
  return out;
}

// ---- signals ----
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function signals(d) {
  const f = []; const add = (id, level, p = {}) => f.push({ id, level, ...p });
  const any = d.x.length || d.tg.length || d.web.length || d.discord || d.xCommunity;
  if (!any) { if (d.sources?.dexscreener !== 'fail' || d.sources?.geckoterminal === 'ok' || d.sources?.geckoterminal === 'empty' || d.sources?.pumpfun === 'ok') add('noSocials', 'warn'); }
  else {
    if (!d.x.length && !d.xCommunity) add('noX', 'info');
    if (!d.tg.length && !d.discord) add('noCommunity', 'info');
    if (!d.web.length) add('noWebsite', 'info');
  }
  const x = d.x[0];
  if (x?.profile?.st === 'ok') {
    const days = x.profile.joined ? (Date.now() - x.profile.joined) / 864e5 : null;
    if (days != null && days < 7) add('xNew', 'fail', { days: Math.max(0, Math.floor(days)) });
    else if (days != null && days < 30) add('xYoung', 'warn', { days: Math.floor(days) });
    if (x.profile.followers < 100) add('xFewFollowers', 'warn', { n: x.profile.followers });
    // token launched long before the X account was created -> handle likely swapped/repointed
    if (d.created && x.profile.joined && x.profile.joined - d.created > 3 * 864e5) add('xAfterToken', 'warn');
    const nm = norm(d.name), sy = norm(d.symbol), hh = norm(x.handle);
    if (hh && (nm || sy) && !(sy.length >= 2 && (hh.includes(sy) || sy.includes(hh))) && !(nm.length >= 3 && (hh.includes(nm.slice(0, 6)) || nm.includes(hh)))) add('xMismatch', 'info');
    if (x.profile.protected) add('xProtected', 'warn');
  } else if (x?.profile?.st === 'notfound') add('xGone', 'fail');
  if (d.x.length > 1) add('xMulti', 'warn', { n: d.x.length });
  const tg = d.tg[0];
  if (tg?.info?.st === 'notfound') add('tgGone', 'warn');
  else if (tg?.info?.st === 'ok' && tg.info.members != null && tg.info.members < 50) add('tgSmall', 'info', { n: tg.info.members });
  const w = d.web[0];
  if (w?.info?.live === false) add('webDown', 'warn');
  if (w?.info?.domainAge != null && w.info.domainAge < 14) add('webNew', 'warn', { days: w.info.domainAge });
  return f;
}

async function build(chain, ca, waitUntil, hints = []) {
  const src = {};
  const [dx, pf, gt] = await Promise.all([dexProfile(chain, ca, waitUntil), chain === 'solana' ? pumpCoin(ca, waitUntil) : Promise.resolve({ st: 'skip' }), geckoInfo(chain, ca, waitUntil)]);
  src.geckoterminal = gt.st; src.dexscreener = dx.st; if (dx.code) src.dexscreenerCode = String(dx.code).slice(0, 12); src.pumpfun = pf.st;
  const mu = await metaUri(pf.uri); src.metadata = mu.st;
  const acc = { x: {}, tg: {}, web: {}, discord: null, xCommunity: null };
  collect(dx.raw || [], 'dexscreener', acc); collect(gt.raw || [], 'geckoterminal', acc);
  const listsDown = dx.st === 'fail' && gt.st === 'fail';
  if (listsDown && hints.length) { collect(hints, 'browser', acc); src.browser = 'hint'; } // browser's own DexScreener links, used only when the server copy is unavailable; never cached collect(pf.raw || [], 'pumpfun', acc); collect(mu.raw || [], 'metadata', acc);
  const xs = Object.values(acc.x).slice(0, 3), tgs = Object.values(acc.tg).slice(0, 2), webs = Object.values(acc.web).slice(0, 2);
  const [xp, tp, wp] = await Promise.all([
    xs[0] ? xProfile(xs[0].handle) : null, tgs[0] ? tgInfo(tgs[0].name) : null, webs[0] ? webInfo(webs[0]) : null]);
  if (xp) src.x = xp.st; if (tp) src.telegram = tp.st; if (wp) src.website = wp.st;
  const d = {
    v: VER, ok: true, chain, ca, at: Date.now(),
    name: pf.name || dx.name || gt.name || '', symbol: pf.symbol || dx.symbol || gt.symbol || '', created: pf.created || dx.created || null,
    x: xs.map((x, i) => ({ handle: x.handle, url: 'https://x.com/' + x.handle, from: [...x.from], profile: i === 0 ? xp : undefined })),
    tg: tgs.map((t, i) => ({ name: t.name, url: 'https://t.me/' + t.name, from: [...t.from], info: i === 0 ? tp : undefined })),
    web: webs.map((w, i) => ({ host: w.host, url: w.url, from: [...w.from], info: i === 0 ? wp : undefined })),
    discord: acc.discord ? { code: acc.discord, url: 'https://discord.gg/' + acc.discord } : null,
    xCommunity: acc.xCommunity ? { id: acc.xCommunity, url: 'https://x.com/i/communities/' + acc.xCommunity } : null,
    sources: src,
  };
  d.signals = signals(d);
  d.partial = (src.dexscreener === 'fail' && src.geckoterminal === 'fail') || ['x', 'telegram'].some(k => src[k] === 'fail');
  return d;
}

export async function onRequestGet({ request, env, waitUntil }) {
  const u = new URL(request.url);
  const ca = (u.searchParams.get('ca') || '').trim(), chain = (u.searchParams.get('chain') || 'solana').toLowerCase();
  if (!validCa(ca, chain)) return json(400, { ok: false, error: 'bad ca/chain' });
  // optional ?l=<url> (max 6): the DexScreener links the browser already loaded, used only if the server cannot reach DexScreener/GeckoTerminal
  const hints = u.searchParams.getAll('l').slice(0, 6).map(v => String(v).slice(0, 140)).filter(v => /^https:\/\//i.test(v))
    .map(v => ({ kind: /t\.me\//i.test(v) ? 'telegram' : /(twitter|x)\.com\//i.test(v) ? 'twitter' : /discord/i.test(v) ? 'discord' : 'website', v }));
  const key = `social:v${VER}:${chain}:${chain === 'solana' ? ca : ca.toLowerCase()}`;
  const hot = await hotGet(key); if (hot) return json(200, hot, { 'cache-control': 'public, max-age=120', 'x-cache': 'HOT' });
  const KV = env?.MEMECHECK_CACHE;
  if (KV) { const kv = await KV.get(key).catch(() => null); if (kv) { waitUntil?.(hotPut(key, kv, 600)); return json(200, kv, { 'cache-control': 'public, max-age=120', 'x-cache': 'KV' }); } }
  { const lim = await rateLimit(request, 'social', 30, 60, waitUntil); if (lim) return lim; } // only uncached work counts (each miss = up to ~7 subrequests)
  let d; try { d = await build(chain, ca, waitUntil, hints); } catch { return json(502, { ok: false, error: 'upstream' }, { 'cache-control': 'no-store' }); }
  const txt = JSON.stringify(d);
  if (d.sources.dexscreener === 'fail' && d.sources.geckoterminal === 'fail') return json(200, txt, { 'cache-control': 'no-store', 'x-cache': 'BYPASS' }); // incomplete or hint-based: never shared
  const p = (async () => {
    await hotPut(key, txt, d.partial ? TTL_PART : TTL);
    if (KV && !d.partial) await guardedPut(KV, key, txt, { expirationTtl: KV_TTL }, 'social').catch(() => {});
  })();
  waitUntil ? waitUntil(p) : await p;
  return json(200, txt, { 'cache-control': 'public, max-age=120', 'x-cache': 'MISS' });
}
