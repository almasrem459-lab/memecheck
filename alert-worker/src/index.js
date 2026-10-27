/**
 * MemeCheckShield Telegram bot: /check verdicts + rug alerts.
 * Secrets: TELEGRAM_BOT_TOKEN (from @BotFather, never commit). PAYMENT_NOTIFY_SECRET (Pages → /notify-payment).
 * Optional: TELEGRAM_WEBHOOK_SECRET, MEMECHECK_ORIGIN, ALERT_CRON_SECRET, OWNER_CHAT_ID (skip /start registration).
 */
import { DurableObject } from 'cloudflare:workers';

const J = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const ORIGIN = (env) => (env.MEMECHECK_ORIGIN || 'https://memecheck.pages.dev').replace(/\/$/, '');
import { dec } from '../../mccache.js';
const CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const LVL = { low: 'No major red flags', medium: 'Medium risk', high: 'High risk', extreme: 'EXTREME risk', unknown: 'Unknown' };
const ICON = { low: '🟢', medium: '🟡', high: '🔴', extreme: '⛔', unknown: '⚪' };
// /check: server-side cached/computed core result from /api/deep (no KV writes from here) + the tracker's measured outcome rate.
async function checkText(origin, ca) {
  const evm = EVM_RE.test(ca), chains = evm ? ['ethereum', 'bsc', 'base', 'arbitrum'] : ['solana'];
  // Prefer /api/snap-insight (works when /api/deep returns 204 under Workers subrequest/KV limits).
  for (const c of chains) {
    try {
      const res = await fetch(`${origin}/api/snap-insight?chain=${c}&ca=${encodeURIComponent(ca)}`, { headers: { 'user-agent': 'memecheck-telegram/1.0' } });
      if (res.status === 200) {
        const j = await res.json().catch(() => null);
        const ins = j?.insight;
        if (ins?.level) {
          const sym = String(ins.symbol || '?').replace(/[^\w$. -]/g, '').slice(0, 20);
          const bad = (ins.reasons || []).slice(0, 4).map(f => `• ${(f.status || 'info').toUpperCase()}: ${f.text || f.id}`);
          let prob = '';
          try {
            const s = await (await fetch(`${origin}/api/study?view=summary`)).json();
            const lv = ins.level === 'extreme' ? 'high' : ins.level, x = s?.byLevel?.[lv];
            if (x && x.n >= 10) prob = `\nTracker: ${x.bad_pct}% of ${x.n} coins rated "${LVL[lv]}" were dead or rugged within 24h (all coins: ${s.base.bad_pct}%).`;
            else if (x) prob = `\nTracker: not enough coins at this level yet (n=${x.n}).`;
          } catch {}
          return `${ICON[ins.level] || ''} $${sym} — ${LVL[ins.level] || ins.level} (${ins.points ?? '?'} pts)\n${bad.join('\n') || '• no warnings in automated checks'}${prob}\n${origin}/?ca=${ca}\nNot financial advice.`;
        }
      }
    } catch {}
  }
  let r = null;
  for (const c of chains) {
    for (let i = 0; i < 3 && !r; i++) {
      const res = await fetch(`${origin}/api/deep?ca=${encodeURIComponent(ca)}&chain=${c}&kind=core`, { headers: { 'user-agent': 'memecheck-telegram/1.0' } });
      if (res.status === 200) { const j = await res.json().catch(() => null); try { r = j?.data ? dec(j.data) : null; } catch { r = null; } }
      else if (res.status === 202) await new Promise(ok => setTimeout(ok, 2500)); else break;
    }
    if (r?.meta?.symbol || r?.verdict) break;
  }
  if (!r?.verdict) return `Could not check ${ca.slice(0, 6)}… right now. Try on the site: ${origin}/?ca=${ca}`;
  const v = r.verdict, sym = String(r.meta?.symbol || '?').replace(/[^\w$. -]/g, '').slice(0, 20);
  const bad = (r.findings || []).filter(f => f.status === 'fail' || f.status === 'warn').sort((a, b) => (b.status === 'fail') - (a.status === 'fail') || b.weight - a.weight).slice(0, 4).map(f => `• ${f.status.toUpperCase()}: ${f.id}`);
  let prob = '';
  try { const s = await (await fetch(`${origin}/api/study?view=summary`)).json(); const lv = v.level === 'extreme' ? 'high' : v.level, x = s?.byLevel?.[lv];
    if (x && x.n >= 10) prob = `\nTracker: ${x.bad_pct}% of ${x.n} coins rated "${LVL[lv]}" were dead or rugged within 24h (all coins: ${s.base.bad_pct}%).`;
    else if (x) prob = `\nTracker: not enough coins at this level yet (n=${x.n}).`; } catch {}
  return `${ICON[v.level] || ''} $${sym} — ${LVL[v.level] || v.level} (${v.points} pts)\n${bad.join('\n') || '• no warnings in automated checks'}${prob}\n${origin}/token/${ca}\nNot financial advice.`;
}
const LEVEL_RANK = { low: 1, medium: 2, high: 3, extreme: 4, unknown: 0 };

async function tg(env, method, body) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN missing' };
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json().catch(() => ({ ok: false, error: 'bad telegram json' }));
}

async function fetchJson(url, ms = 12000) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'MemeCheckShield-Alert/1.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(tm); }
}

async function snapshot(origin, ca) {
  const out = { ca, at: Date.now(), price: null, liq: null, level: null, points: null, pairUrl: null, symbol: null, mintFail: 0, freezeFail: 0 };
  try {
    const ds = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${ca}`, 8000);
    const pairs = (ds.pairs || []).filter(p => (p.chainId || '').toLowerCase() === 'solana');
    pairs.sort((a, b) => (+b.liquidity?.usd || 0) - (+a.liquidity?.usd || 0));
    const p = pairs[0];
    if (p) {
      out.price = p.priceUsd != null ? +p.priceUsd : null;
      out.liq = p.liquidity?.usd != null ? +p.liquidity.usd : null;
      out.pairUrl = p.url || null;
      out.symbol = p.baseToken?.symbol || null;
    }
  } catch (e) { out.dsError = String(e.message || e).slice(0, 80); }
  try {
    const deep = await fetchJson(`${origin}/api/deep?ca=${encodeURIComponent(ca)}&chain=solana&kind=core`, 15000);
    let data = deep?.data;
    if (data && typeof data === 'string') { try { data = dec(data); } catch { data = null; } }
    const v = data?.verdict || (data?.level ? data : null);
    if (v?.level) { out.level = v.level; out.points = v.points ?? data?.score ?? null; }
    for (const f of (data?.findings || [])) {
      if (f.id === 'mintAuth' && f.status === 'fail') out.mintFail = 1;
      if (f.id === 'freezeAuth' && f.status === 'fail') out.freezeFail = 1;
    }
  } catch (e) { out.deepError = String(e.message || e).slice(0, 80); }
  return out;
}

function detectAlerts(prev, cur) {
  const alerts = [];
  if (prev?.liq != null && cur.liq != null && prev.liq > 0) {
    const drop = (prev.liq - cur.liq) / prev.liq;
    if (drop >= 0.5) alerts.push({ type: 'liquidity_pull', msg: `Liquidity pull: $${Math.round(prev.liq)} → $${Math.round(cur.liq)} (−${Math.round(drop * 100)}%)` });
  }
  if (prev?.price != null && cur.price != null && prev.price > 0) {
    const drop = (prev.price - cur.price) / prev.price;
    if (drop >= 0.4) alerts.push({ type: 'large_dump', msg: `Large price drop: −${Math.round(drop * 100)}% (proxy for dump / possible large sell)` });
  }
  if (prev?.level && cur.level) {
    const a = LEVEL_RANK[String(prev.level).toLowerCase()] || 0;
    const b = LEVEL_RANK[String(cur.level).toLowerCase()] || 0;
    if (b > a) alerts.push({ type: 'risk_upgrade', msg: `Risk upgrade: ${prev.level} → ${cur.level}${cur.points != null ? ` (${cur.points})` : ''}` });
  }
  if (prev?.liq != null && prev.liq > 1000 && cur.liq == null && cur.price == null && !cur.dsError) {
    alerts.push({ type: 'liquidity_pull', msg: 'Pair / market data disappeared from DexScreener (possible rug)' });
  }
  if (cur.freezeFail && !prev?.freezeFail) {
    alerts.push({ type: 'freeze_auth', msg: '⚠ Freeze authority still ENABLED — soft-rug risk. Never click unlock/support links or send SOL to "support".' });
  }
  if (cur.mintFail && !prev?.mintFail) {
    alerts.push({ type: 'mint_auth', msg: '⚠ Mint authority still ENABLED — supply can be inflated.' });
  }
  return alerts;
}

export class WatchBook extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS watches (
        chat_id TEXT NOT NULL, ca TEXT NOT NULL, symbol TEXT, added INTEGER,
        last_price REAL, last_liq REAL, last_level TEXT, last_points REAL, last_check INTEGER,
        last_mint INTEGER, last_freeze INTEGER,
        PRIMARY KEY (chat_id, ca))`);
      try { this.sql.exec(`ALTER TABLE watches ADD COLUMN last_mint INTEGER`); } catch {}
      try { this.sql.exec(`ALTER TABLE watches ADD COLUMN last_freeze INTEGER`); } catch {}
      this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    });
  }

  async fetch(req) {
    const u = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    if (u.pathname === '/stats') {
      const distinct = this.sql.exec(`SELECT COUNT(DISTINCT chat_id) AS n FROM watches`).toArray()[0];
      const rows = this.sql.exec(`SELECT COUNT(*) AS n FROM watches`).toArray()[0];
      const cas = this.sql.exec(`SELECT COUNT(DISTINCT ca) AS n FROM watches`).toArray()[0];
      return J(200, {
        distinctChatIds: Number(distinct?.n || 0),
        watchRows: Number(rows?.n || 0),
        distinctCas: Number(cas?.n || 0),
        ownerRegistered: !!this.getOwner() || !!this.env.OWNER_CHAT_ID,
      });
    }
    if (u.pathname === '/list') return J(200, { watches: this.list(body.chatId) });
    if (u.pathname === '/watch') {
      const watches = await this.watch(body.chatId, body.ca, body.snap || {});
      return J(200, { ok: true, watches });
    }
    if (u.pathname === '/unwatch') return J(200, { ok: true, watches: this.unwatch(body.chatId, body.ca) });
    if (u.pathname === '/owner') {
      if (req.method === 'GET' || body.get) return J(200, { chatId: this.getOwner() });
      const r = this.setOwnerOnce(body.chatId);
      return J(200, r);
    }
    if (u.pathname === '/poll') return J(200, { ok: true, ...(await this.poll(this.env)) });
    return J(404, { error: 'do route' });
  }

  list(chatId) {
    return this.sql.exec(`SELECT ca, symbol, added, last_price, last_liq, last_level, last_check FROM watches WHERE chat_id = ? ORDER BY added DESC`, String(chatId)).toArray();
  }
  async watch(chatId, ca, snap) {
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO watches (chat_id, ca, symbol, added, last_price, last_liq, last_level, last_points, last_check, last_mint, last_freeze)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, ca) DO UPDATE SET symbol=excluded.symbol, last_price=excluded.last_price, last_liq=excluded.last_liq,
         last_level=excluded.last_level, last_points=excluded.last_points, last_check=excluded.last_check,
         last_mint=excluded.last_mint, last_freeze=excluded.last_freeze`,
      String(chatId), ca, snap.symbol || null, now, snap.price, snap.liq, snap.level, snap.points, now, snap.mintFail ? 1 : 0, snap.freezeFail ? 1 : 0,
    );
    return this.list(chatId);
  }
  unwatch(chatId, ca) {
    this.sql.exec(`DELETE FROM watches WHERE chat_id = ? AND ca = ?`, String(chatId), ca);
    return this.list(chatId);
  }
  getOwner() {
    try {
      const row = this.sql.exec(`SELECT v FROM meta WHERE k = 'owner_chat_id'`).toArray()[0];
      return row?.v ? String(row.v) : null;
    } catch { return null; }
  }
  /** One-time: first /start wins. Returns { ok, chatId, created }. */
  setOwnerOnce(chatId) {
    const id = String(chatId || '').trim();
    if (!id) return { ok: false, error: 'no_chat' };
    const cur = this.getOwner();
    if (cur) return { ok: true, chatId: cur, created: false, same: cur === id };
    this.sql.exec(`INSERT INTO meta (k, v) VALUES ('owner_chat_id', ?)`, id);
    return { ok: true, chatId: id, created: true };
  }
  allWatches() {
    return this.sql.exec(`SELECT chat_id, ca, symbol, last_price, last_liq, last_level, last_points, last_check, last_mint, last_freeze FROM watches`).toArray();
  }
  updateSnap(chatId, ca, snap) {
    this.sql.exec(
      `UPDATE watches SET symbol=COALESCE(?, symbol), last_price=?, last_liq=?, last_level=?, last_points=?, last_check=?, last_mint=?, last_freeze=? WHERE chat_id=? AND ca=?`,
      snap.symbol || null, snap.price, snap.liq, snap.level, snap.points, Date.now(), snap.mintFail ? 1 : 0, snap.freezeFail ? 1 : 0, String(chatId), ca,
    );
  }
  async poll(env) {
    const origin = ORIGIN(env);
    const rows = this.allWatches();
    const byCa = new Map();
    for (const r of rows) { if (!byCa.has(r.ca)) byCa.set(r.ca, []); byCa.get(r.ca).push(r); }
    const results = [];
    for (const [ca, watchers] of byCa) {
      const cur = await snapshot(origin, ca);
      for (const w of watchers) {
        const prev = { price: w.last_price, liq: w.last_liq, level: w.last_level, points: w.last_points, mintFail: w.last_mint || 0, freezeFail: w.last_freeze || 0 };
        const alerts = detectAlerts(prev, cur);
        this.updateSnap(w.chat_id, ca, cur);
        for (const a of alerts) {
          const text = `🛡 MemeCheckShield alert\n$${cur.symbol || '?'} \`${ca.slice(0, 4)}…${ca.slice(-4)}\`\n${a.msg}\n${origin}/?ca=${ca}`;
          await tg(env, 'sendMessage', { chat_id: w.chat_id, text, parse_mode: 'Markdown', disable_web_page_preview: true });
          results.push({ chat_id: w.chat_id, ca, type: a.type });
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }
    return { checked: byCa.size, alerts: results.length, detail: results };
  }
}

function helpText(configured, ownerNote = '') {
  return `MemeCheckShield rug alerts
${configured ? '' : '⚠️ Bot token not configured on the worker yet.\n'}
Commands:
/check <CA> — instant MemeCheckShield verdict (Solana or 0x EVM)
/watch <CA> — watch a Solana contract
/unwatch <CA> — stop watching
/list — your watches
/help — this message

Alerts: liquidity pull (≥50%), large dump (≥40%), risk-level upgrade, mint/freeze authority still enabled.
Exact "dev sell" needs paid Helius webhooks — dump/liq proxies until then.
Not financial advice.${ownerNote ? '\n\n' + ownerNote : ''}`;
}

const PRODUCT_LABEL = {
  pro: { ar: 'اشتراك Pro', en: 'Pro subscription' },
  boost: { ar: 'تعزيز مشروع (Boost)', en: 'Boost' },
  api_starter: { ar: 'خطة API Starter', en: 'API Starter' },
  api_business: { ar: 'خطة API Business', en: 'API Business' },
  verified: { ar: 'توثيق (Get Verified)', en: 'Get Verified' },
  sponsored: { ar: 'إعلان مموّل', en: 'Sponsored ad' },
  banner: { ar: 'بنر الصفحة الرئيسية', en: 'Homepage banner' },
};

function shortId(s, head = 4, tail = 4) {
  const t = String(s || '');
  if (t.length <= head + tail + 1) return t || '—';
  return t.slice(0, head) + '…' + t.slice(-tail);
}

function formatDamascus(ms) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Damascus', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(ms)) + ' Asia/Damascus';
  } catch {
    return new Date(ms).toISOString();
  }
}

function paymentAlertText(body) {
  const kind = String(body.product || body.kind || 'payment').toLowerCase();
  const lab = PRODUCT_LABEL[kind] || { ar: kind, en: kind };
  const usdc = body.amountUsdc != null ? Number(body.amountUsdc) : null;
  const amt = usdc != null && Number.isFinite(usdc) ? (Math.round(usdc * 100) / 100) : '?';
  const wallet = shortId(body.wallet, 4, 4);
  const tx = shortId(body.tx, 6, 6);
  const when = formatDamascus(+body.at || Date.now());
  const extra = body.ref ? `\nالمرجع / Ref: ${String(body.ref).slice(0, 48)}` : '';
  return `💰 دفعة جديدة — New payment
المنتج / Product: ${lab.ar} / ${lab.en}
المبلغ / Amount: ${amt} USDC
المحفظة / Wallet: ${wallet}
العملية / Tx: ${tx}${extra}
الوقت / Time: ${when}`;
}

async function handleUpdate(env, update) {
  const msg = update.message || update.edited_message;
  if (!msg?.chat?.id) return J(200, { ok: true, ignored: true });
  const chatId = msg.chat.id;
  const text = String(msg.text || '').trim();
  const stub = env.WATCH.get(env.WATCH.idFromName('global'));
  const configured = !!env.TELEGRAM_BOT_TOKEN;
  const reply = async (t) => tg(env, 'sendMessage', { chat_id: chatId, text: t, disable_web_page_preview: true });

  if (!configured) { await reply(helpText(false)); return J(200, { ok: true, configured: false }); }

  const [cmd, ...rest] = text.split(/\s+/);
  const arg = rest.join(' ').trim();

  if (/^\/(start|help)/i.test(cmd)) {
    let ownerNote = '';
    if (/^\/start/i.test(cmd)) {
      // One-time: first /start on this bot becomes the payment-alert recipient (unless OWNER_CHAT_ID env is set).
      if (env.OWNER_CHAT_ID) {
        if (String(env.OWNER_CHAT_ID) === String(chatId)) ownerNote = '✅ Payment alerts → this chat (OWNER_CHAT_ID).\n✅ تنبيهات الدفع لهذا الشات.';
        else ownerNote = 'Payment owner is set via OWNER_CHAT_ID env (not this chat).';
      } else {
        const r = await (await stub.fetch('https://do/owner', { method: 'POST', body: JSON.stringify({ chatId }) })).json().catch(() => ({}));
        if (r.created) ownerNote = '✅ تم تسجيلك لتنبيهات الدفع (مرة واحدةحدة).\n✅ Registered for payment alerts (one-time).';
        else if (r.same) ownerNote = '✅ تنبيهات الدفع مفعّلة لهذا الشات.\n✅ Payment alerts already go to this chat.';
        else if (r.chatId) ownerNote = 'Payment alerts already registered to another chat.';
      }
    }
    await reply(helpText(true, ownerNote));
    return J(200, { ok: true });
  }
  if (/^\/check/i.test(cmd)) {
    if (!CA_RE.test(arg) && !EVM_RE.test(arg)) { await reply('Usage: /check <Solana mint or 0x address>'); return J(200, { ok: true }); }
    await reply(await checkText(ORIGIN(env), arg));
    return J(200, { ok: true });
  }
  if (/^\/list/i.test(cmd)) {
    const j = await (await stub.fetch('https://do/list', { method: 'POST', body: JSON.stringify({ chatId }) })).json();
    const lines = (j.watches || []).map(w => `• ${w.symbol ? '$' + w.symbol + ' ' : ''}${w.ca.slice(0, 6)}…${w.ca.slice(-4)} (${w.last_level || '?'})`);
    await reply(lines.length ? `Watching (${lines.length}):\n` + lines.join('\n') : 'No watches. /watch <CA>');
    return J(200, { ok: true });
  }
  if (/^\/unwatch/i.test(cmd)) {
    if (!CA_RE.test(arg)) { await reply('Usage: /unwatch <Solana CA>'); return J(200, { ok: true }); }
    await stub.fetch('https://do/unwatch', { method: 'POST', body: JSON.stringify({ chatId, ca: arg }) });
    await reply('Unwatched ' + arg.slice(0, 8) + '…');
    return J(200, { ok: true });
  }
  if (/^\/watch/i.test(cmd)) {
    if (!CA_RE.test(arg)) { await reply('Usage: /watch <Solana CA>'); return J(200, { ok: true }); }
    const snap = await snapshot(ORIGIN(env), arg);
    await stub.fetch('https://do/watch', { method: 'POST', body: JSON.stringify({ chatId, ca: arg, snap }) });
    await reply(`Watching ${snap.symbol ? '$' + snap.symbol : arg.slice(0, 8) + '…'}\nLiq: ${snap.liq != null ? '$' + Math.round(snap.liq) : '?'} · Level: ${snap.level || 'pending'}`);
    return J(200, { ok: true });
  }
  // bare CA / 0x → treat as /check
  if (CA_RE.test(text) || EVM_RE.test(text)) {
    await reply(await checkText(ORIGIN(env), text));
    return J(200, { ok: true });
  }
  await reply('Unknown command. /help');
  return J(200, { ok: true });
}

async function resolveOwnerChatId(env) {
  if (env.OWNER_CHAT_ID) return String(env.OWNER_CHAT_ID);
  const stub = env.WATCH.get(env.WATCH.idFromName('global'));
  const j = await (await stub.fetch('https://do/owner', { method: 'POST', body: JSON.stringify({ get: true }) })).json().catch(() => ({}));
  return j.chatId ? String(j.chatId) : null;
}

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    if (u.pathname === '/stats') {
      const stub = env.WATCH.get(env.WATCH.idFromName('global'));
      return stub.fetch('https://do/stats', { method: 'POST', body: '{}' });
    }
    if (u.pathname === '/health') {
      let owner = !!env.OWNER_CHAT_ID;
      if (!owner) {
        try { owner = !!(await resolveOwnerChatId(env)); } catch {}
      }
      return J(200, { ok: true, service: 'memecheck-alert', telegram: !!env.TELEGRAM_BOT_TOKEN, origin: ORIGIN(env), ownerRegistered: owner, notifyAuth: !!env.PAYMENT_NOTIFY_SECRET });
    }
    if (u.pathname === '/telegram' && req.method === 'POST') {
      if (env.TELEGRAM_WEBHOOK_SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET) return J(401, { error: 'unauthorized' }); // setWebhook(secret_token=...)
      const update = await req.json().catch(() => null);
      if (!update) return J(400, { error: 'bad json' });
      return handleUpdate(env, update);
    }
    if (u.pathname === '/notify-payment' && req.method === 'POST') {
      const secret = env.PAYMENT_NOTIFY_SECRET || '';
      const got = req.headers.get('x-payment-notify') || '';
      if (!secret || got.length < 16 || got !== secret) return J(401, { error: 'unauthorized' });
      if (!env.TELEGRAM_BOT_TOKEN) return J(503, { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' });
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== 'object') return J(400, { error: 'bad json' });
      const chatId = await resolveOwnerChatId(env);
      if (!chatId) return J(503, { ok: false, error: 'owner_chat_missing', tip: 'Owner must open t.me/memecheckshield_bot and tap Start once' });
      const text = paymentAlertText(body);
      const sent = await tg(env, 'sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
      return J(sent?.ok ? 200 : 502, { ok: !!sent?.ok, telegram: sent });
    }
    if (u.pathname === '/cron' && req.method === 'POST') {
      if (env.ALERT_CRON_SECRET && req.headers.get('x-alert-cron') !== env.ALERT_CRON_SECRET) return J(401, { error: 'unauthorized' });
      if (!env.TELEGRAM_BOT_TOKEN) return J(503, { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' });
      const stub = env.WATCH.get(env.WATCH.idFromName('global'));
      return stub.fetch('https://do/poll', { method: 'POST' });
    }
    return J(404, { error: 'not found', hint: 'POST /telegram | POST /notify-payment | POST /cron | GET /health' });
  },
  async scheduled(event, env, ctx) {
    if (!env.TELEGRAM_BOT_TOKEN) { console.log('cron skip: TELEGRAM_BOT_TOKEN missing'); return; }
    const stub = env.WATCH.get(env.WATCH.idFromName('global'));
    ctx.waitUntil(stub.fetch('https://do/poll', { method: 'POST' }).then(r => r.text()).then(t => console.log('cron', t)).catch(e => console.log('cron err', e)));
  },
};
