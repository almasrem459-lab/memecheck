// Per-token Open Graph tags for shared links (?ca=...&chain=...). Only link-preview crawlers get the personalised HTML;
// humans get the static page untouched. Data comes from cached results only (see _lib/oginfo.js): no risk computation,
// no KV writes. The image is the dynamic PNG from /api/og (X needs PNG/JPG); the homepage keeps /og-image.png.
import { ogInfo, CA_RE } from './_lib/oginfo.js';
const BOT = /twitterbot|facebookexternalhit|facebot|discordbot|telegrambot|slackbot|whatsapp|linkedinbot|skypeuripreview|redditbot|embedly|pinterest|applebot|googlebot|bingbot|bot\b|crawler|spider|preview/i;
const LV = { low: 'Low', medium: 'Medium', high: 'High', extreme: 'Extreme' };
export const onRequest = async (ctx) => {
  const { request: req, next, env } = ctx; const url = new URL(req.url);
  // never serve deploy config / server sources as static files
  if (/^\/(wrangler\.toml|\.wrangler|functions|package(-lock)?\.json|node_modules|\.git|\.dev\.vars)(\/|$)/i.test(url.pathname)) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  const ca = url.searchParams.get('ca') || url.searchParams.get('a');
  if (req.method !== 'GET' || !(url.pathname === '/' || url.pathname === '/index.html') || !ca || !CA_RE.test(ca) || !BOT.test(req.headers.get('user-agent') || '')) return next();
  const res = await next(); if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
  const chain = ['ethereum', 'bsc', 'base'].includes(url.searchParams.get('chain')) ? url.searchParams.get('chain') : 'auto';
  let info = null; try { info = await ogInfo(env, ca, chain); } catch {}
  const share = `https://memecheck.pages.dev/?ca=${encodeURIComponent(ca)}${chain !== 'auto' ? '&chain=' + chain : ''}`;
  const img = `https://memecheck.pages.dev/api/og?ca=${encodeURIComponent(ca)}&chain=${chain}&v=${info?.level || 'n'}`;
  const nm = info?.name && info.name !== info.sym ? ` (${info.name})` : '';
  const title = info?.sym && info.level ? `$${info.sym}: ${LV[info.level]} risk on MemeCheck` : info?.sym ? `$${info.sym} safety check on MemeCheck` : 'MemeCheck — token safety check';
  const desc = info?.sym && info.level ? `I checked $${info.sym}${nm} on MemeCheck: ${LV[info.level]} risk, ${info.pts} risk points. Rug, honeypot, dev & bundle checks. Free.` : info?.sym ? `Is $${info.sym}${nm} safe? Check safety: rug, honeypot, dev & bundle checks on MemeCheck. Free.` : 'Check any meme coin before you ape in. Rug, honeypot, dev & bundle checks. Free.';
  const alt = info?.sym ? `$${info.sym}${info.level ? ` — ${LV[info.level]} risk` : ' — check safety'} on MemeCheck` : 'MemeCheck token safety check';
  const set = (v) => ({ element(e) { e.setAttribute('content', v); } });
  const out = new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(title); } })
    .on('meta[property="og:title"]', set(title)).on('meta[name="twitter:title"]', set(title))
    .on('meta[property="og:description"]', set(desc)).on('meta[name="twitter:description"]', set(desc)).on('meta[name="description"]', set(desc))
    .on('meta[property="og:url"]', set(share))
    .on('meta[property="og:image"]', set(img)).on('meta[name="twitter:image"]', set(img)).on('meta[property="og:image:alt"]', set(alt))
    .transform(new Response(res.body, res));
  out.headers.set('cache-control', 'public, max-age=300'); out.headers.append('vary', 'user-agent');
  return out;
};
