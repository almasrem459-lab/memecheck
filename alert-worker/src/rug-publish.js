/**
 * High/Extreme rug broadcast: Telegram channels (EN+AR) + optional X posts.
 * Dedupe: one post per (mint, level) forever (until DO wipe).
 * Secrets (optional unless noted):
 *   TELEGRAM_BOT_TOKEN          (required for TG) — already live
 *   TELEGRAM_CHANNEL_EN         chat id or @username for English channel
 *   TELEGRAM_CHANNEL_AR         chat id or @username for Arabic channel
 *   RUG_BROADCAST_SECRET        shared with warmer (x-rug-broadcast header)
 *   RUG_DRY_RUN=1               log only, still dedupe if RUG_DEDUPE_DRY=1
 *   X_EN_API_KEY, X_EN_API_SECRET, X_EN_ACCESS_TOKEN, X_EN_ACCESS_SECRET
 *   X_AR_API_KEY, X_AR_API_SECRET, X_AR_ACCESS_TOKEN, X_AR_ACCESS_SECRET
 * If TG channels missing: dry-run text is sent to OWNER_CHAT_ID (if set) once with [DRY] prefix when RUG_NOTIFY_OWNER_DRY=1.
 */

const ORIGIN = (env) => (env.MEMECHECK_ORIGIN || 'https://memecheck.pages.dev').replace(/\/$/, '');
const LVL = { high: 'High risk', extreme: 'EXTREME risk' };
const LVL_AR = { high: 'خطر مرتفع', extreme: 'خطر شديد' };
const ICON = { high: '🔴', extreme: '⛔' };

const REASON_EN = {
  top10: (p) => `Top 10 wallets hold ${fmt(p?.v)}% of supply`,
  top1: (p) => `Largest wallet holds ${fmt(p?.v)}% of supply`,
  insiders: (p) => p?.pct != null ? `Linked insider wallets hold ~${fmt(p.pct)}% of supply` : `${p?.n || '?'} linked insider wallets detected`,
  insiderHeld: (p) => `Linked insiders still hold ~${fmt(p?.pct)}% of supply`,
  mintAuth: () => 'Mint authority is still ACTIVE — supply can be inflated',
  freezeAuth: () => 'Freeze authority is still ACTIVE — wallets can be locked',
  lpLocked: (p) => p?.v != null ? `Only ${fmt(p.v, 0)}% of liquidity is locked` : 'LP is not locked / not burned',
  honeypot: () => 'Sells look blocked (possible honeypot)',
  cannotBuy: () => 'Buying is blocked by the contract',
  tax: (p) => `High buy/sell tax (${fmt(p?.b)}% / ${fmt(p?.s)}%)`,
  sniperSig: (p) => `Snipers hold ~${fmt(p?.heldPct ?? p?.pct)}% of supply`,
  bubbleSig: (p) => `Clustered wallets hold ~${fmt(p?.pct)}% of supply`,
  flowSig: () => 'Liquidity flows look wash-like / suspicious',
  drop: (p) => `Already down ~${fmt(p?.v, 0)}% from recent high`,
  liquidity: (p) => `Very low liquidity ($${Math.round(p?.v || 0)})`,
  age: (p) => `Brand-new pair (~${fmt(p?.h, 1)}h old)`,
  rugged: () => 'Already marked rugged by RugCheck',
  creator: (p) => `Creator still holds ${fmt(p?.v)}% of supply`,
  devHistory: (p) => `Dev has ${p?.bad || '?'} prior dead/rugged coins`,
  mutable: () => 'Token metadata is still mutable',
};

const REASON_AR = {
  top10: (p) => `أكبر 10 محافظ تملك ${fmt(p?.v)}% من المعروض`,
  top1: (p) => `أكبر محفظة تملك ${fmt(p?.v)}% من المعروض`,
  insiders: (p) => p?.pct != null ? `محافظ مطلعين مترابطة تملك نحو ${fmt(p.pct)}% من المعروض` : `تم رصد ${p?.n || '?'} محفظة مطلعين مترابطة`,
  insiderHeld: (p) => `المطلعون ما زالوا ماسكين نحو ${fmt(p?.pct)}% من المعروض`,
  mintAuth: () => 'صلاحية السكّ ما زالت مفعّلة — العرض ممكن يزيد',
  freezeAuth: () => 'صلاحية التجميد ما زالت مفعّلة — المحافظ ممكن تنقفل',
  lpLocked: (p) => p?.v != null ? `فقط ${fmt(p.v, 0)}% من السيولة مقفلة` : 'السيولة مش مقفلة / مش محروقة',
  honeypot: () => 'البيع يبدو مقفول (مصيدة محتملة)',
  cannotBuy: () => 'العقد يمنع الشراء',
  tax: (p) => `ضريبة شراء/بيع مرتفعة (${fmt(p?.b)}% / ${fmt(p?.s)}%)`,
  sniperSig: (p) => `القناصة ماسكين نحو ${fmt(p?.heldPct ?? p?.pct)}% من المعروض`,
  bubbleSig: (p) => `محافظ متجمّعة تملك نحو ${fmt(p?.pct)}% من المعروض`,
  flowSig: () => 'تدفقات السيولة تبدو مشبوهة / وهمية',
  drop: (p) => `منهار أصلاً بنحو ${fmt(p?.v, 0)}% من أعلى سعر حديث`,
  liquidity: (p) => `سيولة منخفضة جدًا ($${Math.round(p?.v || 0)})`,
  age: (p) => `زوج جديد جدًا (~${fmt(p?.h, 1)} ساعة)`,
  rugged: () => 'معلّمة كمسحتوبة على RugCheck',
  creator: (p) => `المنشئ ما زال ماسك ${fmt(p?.v)}% من المعروض`,
  devHistory: (p) => `المطوّر عنده ${p?.bad || '?'} عملات سابقة ميتة/مسحتوبة`,
  mutable: () => 'بيانات العملة ما زالت قابلة للتعديل',
};

function fmt(n, d = 1) {
  if (n == null || Number.isNaN(+n)) return '—';
  return (+n).toFixed(d);
}

export function topReason(findings, lang = 'en') {
  const dict = lang === 'ar' ? REASON_AR : REASON_EN;
  const rank = { fail: 0, warn: 1 };
  const list = (findings || [])
    .filter((f) => f && (f.status === 'fail' || f.status === 'warn'))
    .sort((a, b) => (rank[a.status] - rank[b.status]) || ((b.weight || 0) - (a.weight || 0)));
  for (const f of list) {
    const fn = dict[f.id];
    if (typeof fn === 'function') return fn(f.params || {}, f.status);
  }
  return lang === 'ar' ? 'فحوصات MemeCheck رفعت التقييم إلى خطر مرتفع' : 'MemeCheck automated checks raised this to elevated risk';
}

export function buildMessages(payload, env) {
  const origin = ORIGIN(env);
  const level = String(payload.level || '').toLowerCase();
  const sym = String(payload.symbol || payload.sym || '?').replace(/^\$/, '').slice(0, 24);
  const name = String(payload.name || '').slice(0, 40);
  const ca = payload.ca || payload.mint || '';
  const pts = payload.points ?? payload.pts;
  const findings = payload.findings || [];
  // Prefer precomputed reasons from tracker ("fail:top10") when full findings missing
  let reasonEn = payload.reasonEn || topReason(findings, 'en');
  let reasonAr = payload.reasonAr || topReason(findings, 'ar');
  if ((!findings.length) && Array.isArray(payload.reasons) && payload.reasons.length) {
    const id = String(payload.reasons[0]).replace(/^(fail|warn):/, '');
    reasonEn = (REASON_EN[id] && REASON_EN[id]({})) || reasonEn;
    reasonAr = (REASON_AR[id] && REASON_AR[id]({})) || reasonAr;
    // improve top10/insiders if encoded as fail:top10 etc — params unknown
    if (id === 'top10') { reasonEn = 'Top wallets are heavily concentrated'; reasonAr = 'تركّز كبير في أكبر المحافظ'; }
  }
  const link = `${origin}/?ca=${encodeURIComponent(ca)}`;
  const title = name && name.toLowerCase() !== sym.toLowerCase() ? `${name} ($${sym})` : `$${sym}`;
  const enBase = `${ICON[level] || '🔴'} ${LVL[level] || level}${pts != null ? ` · ${pts} pts` : ''}
${title}
${reasonEn}
${link}
Not financial advice. DYOR.`;
  const arBase = `${ICON[level] || '🔴'} ${LVL_AR[level] || level}${pts != null ? ` · ${pts} نقطة` : ''}
${title}
${reasonAr}
${link}
ليس نصيحة مالية. ابحث بنفسك.`;
  // RugDNA (optional): shared-funding-wallet cluster line, Telegram only (X keeps the short base text: 280-char limit).
  const dnaEn = String(payload.rugdnaEn || '').slice(0, 160), dnaAr = String(payload.rugdnaAr || '').slice(0, 160);
  const en = dnaEn ? enBase.replace(`\n${link}`, `\n🧬 ${dnaEn}\n${link}`) : enBase;
  const ar = dnaAr ? arBase.replace(`\n${link}`, `\n🧬 ${dnaAr}\n${link}`) : arBase;
  return { en, ar, enBase, arBase, reasonEn, reasonAr, link, title, level, sym, ca };
}

async function tg(env, method, body) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN missing' };
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json().catch(() => ({ ok: false, error: 'bad telegram json' }));
}

/** Minimal OAuth1 HMAC-SHA1 for X API v2 create tweet */
async function oauthSign(method, url, params, consumerSecret, tokenSecret) {
  const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const sorted = Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join('&');
  const base = `${method.toUpperCase()}&${enc(url)}&${enc(sorted)}`;
  const key = `${enc(consumerSecret)}&${enc(tokenSecret || '')}`;
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(base));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function postX(env, lang, text) {
  const prefix = lang === 'ar' ? 'X_AR_' : 'X_EN_';
  const key = env[prefix + 'API_KEY'], secret = env[prefix + 'API_SECRET'];
  const token = env[prefix + 'ACCESS_TOKEN'], tokenSecret = env[prefix + 'ACCESS_SECRET'];
  if (!key || !secret || !token || !tokenSecret) return { ok: false, skipped: true, error: 'x_secrets_missing', lang };
  const url = 'https://api.twitter.com/2/tweets';
  const oauth = {
    oauth_consumer_key: key,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: '1.0',
  };
  oauth.oauth_signature = await oauthSign('POST', url, oauth, secret, tokenSecret);
  const auth = 'OAuth ' + Object.keys(oauth).sort().map((k) => `${k}="${encodeURIComponent(oauth[k])}"`).join(', ');
  const r = await fetch(url, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ text: text.slice(0, 280) }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, lang, response: j };
}

export async function publishRug(env, payload, { alreadyPublished, markPublished, ownerChatId }) {
  const level = String(payload.level || '').toLowerCase();
  if (level !== 'high' && level !== 'extreme') return { ok: false, error: 'level_not_alertable', level };
  const ca = payload.ca || payload.mint;
  if (!ca) return { ok: false, error: 'missing_ca' };

  const dedupeKey = `${ca}:${level}`;
  if (await alreadyPublished(dedupeKey)) return { ok: true, deduped: true, key: dedupeKey };

  const msgs = buildMessages(payload, env);
  const dry = env.RUG_DRY_RUN === '1' || env.RUG_DRY_RUN === 'true';
  const out = { ok: true, dry, key: dedupeKey, telegram: {}, x: {}, msgs: { en: msgs.en, ar: msgs.ar } };

  const sendTg = async (chat, text, tag) => {
    if (!chat) return { skipped: true, error: 'channel_missing' };
    if (dry) return { dry: true, chat, preview: text.slice(0, 180) };
    return tg(env, 'sendMessage', { chat_id: chat, text, disable_web_page_preview: false });
  };

  out.telegram.en = await sendTg(env.TELEGRAM_CHANNEL_EN, msgs.en, 'en');
  out.telegram.ar = await sendTg(env.TELEGRAM_CHANNEL_AR, msgs.ar, 'ar');

  // If no channels configured, optionally tip the owner once (dry preview)
  if (!env.TELEGRAM_CHANNEL_EN && !env.TELEGRAM_CHANNEL_AR && env.RUG_NOTIFY_OWNER_DRY === '1') {
    const owner = ownerChatId || env.OWNER_CHAT_ID;
    if (owner && !dry) {
      out.telegram.ownerPreview = await tg(env, 'sendMessage', {
        chat_id: owner,
        text: `[RUG ALERT DRY — set TELEGRAM_CHANNEL_EN/AR]\n\n${msgs.en}`,
        disable_web_page_preview: true,
      });
    } else {
      out.telegram.ownerPreview = { skipped: true, reason: dry ? 'dry_run' : 'no_OWNER_CHAT_ID' };
    }
  }

  if (dry) {
    out.x.en = { dry: true, preview: msgs.en.slice(0, 180) };
    out.x.ar = { dry: true, preview: msgs.ar.slice(0, 180) };
  } else {
    out.x.en = await postX(env, 'en', msgs.enBase || msgs.en);
    out.x.ar = await postX(env, 'ar', msgs.arBase || msgs.ar);
  }

  // Dedupe after attempt so retries can recover from total failure; if at least one channel/X succeeded OR dry, mark.
  const tgOk = !!(out.telegram.en?.ok || out.telegram.ar?.ok || out.telegram.en?.dry || out.telegram.ar?.dry || out.telegram.ownerPreview?.ok);
  const xOk = !!(out.x.en?.ok || out.x.ar?.ok || out.x.en?.dry || out.x.ar?.dry);
  const anyChannel = !!(env.TELEGRAM_CHANNEL_EN || env.TELEGRAM_CHANNEL_AR);
  if (dry || tgOk || xOk || !anyChannel) await markPublished(dedupeKey, { level, ca, at: Date.now(), dry });

  out.needs = [];
  if (!env.TELEGRAM_CHANNEL_EN) out.needs.push('TELEGRAM_CHANNEL_EN');
  if (!env.TELEGRAM_CHANNEL_AR) out.needs.push('TELEGRAM_CHANNEL_AR');
  if (!(env.X_EN_API_KEY && env.X_EN_ACCESS_TOKEN)) out.needs.push('X_EN_API_KEY+SECRET+ACCESS_TOKEN+ACCESS_SECRET');
  if (!(env.X_AR_API_KEY && env.X_AR_ACCESS_TOKEN)) out.needs.push('X_AR_API_KEY+SECRET+ACCESS_TOKEN+ACCESS_SECRET');
  return out;
}
