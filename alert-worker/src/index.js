/**
 * MemeCheckShield Telegram rug-alert bot (M3).
 * Secrets: TELEGRAM_BOT_TOKEN (ask Jojo — do not invent). Optional: MEMECHECK_ORIGIN, ALERT_CRON_SECRET.
 */
import { DurableObject } from 'cloudflare:workers';

const J = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const ORIGIN = (env) => (env.MEMECHECK_ORIGIN || 'https://memecheck.pages.dev').replace(/\/$/, '');
const CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
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
  const out = { ca, at: Date.now(), price: null, liq: null, level: null, points: null, pairUrl: null, symbol: null };
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
    const v = deep?.data?.verdict || deep?.data;
    if (v?.level) { out.level = v.level; out.points = v.points ?? deep.data?.score ?? null; }
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
        PRIMARY KEY (chat_id, ca))`);
    });
  }

  async fetch(req) {
    const u = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    if (u.pathname === '/list') return J(200, { watches: this.list(body.chatId) });
    if (u.pathname === '/watch') {
      const watches = await this.watch(body.chatId, body.ca, body.snap || {});
      return J(200, { ok: true, watches });
    }
    if (u.pathname === '/unwatch') return J(200, { ok: true, watches: this.unwatch(body.chatId, body.ca) });
    if (u.pathname === '/poll') return J(200, { ok: true, ...(await this.poll(this.env)) });
    return J(404, { error: 'do route' });
  }

  list(chatId) {
    return this.sql.exec(`SELECT ca, symbol, added, last_price, last_liq, last_level, last_check FROM watches WHERE chat_id = ? ORDER BY added DESC`, String(chatId)).toArray();
  }
  async watch(chatId, ca, snap) {
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO watches (chat_id, ca, symbol, added, last_price, last_liq, last_level, last_points, last_check)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, ca) DO UPDATE SET symbol=excluded.symbol, last_price=excluded.last_price, last_liq=excluded.last_liq,
         last_level=excluded.last_level, last_points=excluded.last_points, last_check=excluded.last_check`,
      String(chatId), ca, snap.symbol || null, now, snap.price, snap.liq, snap.level, snap.points, now,
    );
    return this.list(chatId);
  }
  unwatch(chatId, ca) {
    this.sql.exec(`DELETE FROM watches WHERE chat_id = ? AND ca = ?`, String(chatId), ca);
    return this.list(chatId);
  }
  allWatches() {
    return this.sql.exec(`SELECT chat_id, ca, symbol, last_price, last_liq, last_level, last_points, last_check FROM watches`).toArray();
  }
  updateSnap(chatId, ca, snap) {
    this.sql.exec(
      `UPDATE watches SET symbol=COALESCE(?, symbol), last_price=?, last_liq=?, last_level=?, last_points=?, last_check=? WHERE chat_id=? AND ca=?`,
      snap.symbol || null, snap.price, snap.liq, snap.level, snap.points, Date.now(), String(chatId), ca,
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
        const prev = { price: w.last_price, liq: w.last_liq, level: w.last_level, points: w.last_points };
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

function helpText(configured) {
  return `MemeCheckShield rug alerts
${configured ? '' : '⚠️ Bot token not configured on the worker yet.\n'}
Commands:
/watch <CA> — watch a Solana contract
/unwatch <CA> — stop watching
/list — your watches
/help — this message

Alerts: liquidity pull (≥50%), large dump (≥40%), risk-level upgrade.
Exact "dev sell" needs paid Helius webhooks — dump/liq proxies until then.
Not financial advice.`;
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

  if (/^\/(start|help)/i.test(cmd)) { await reply(helpText(true)); return J(200, { ok: true }); }
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
  await reply('Unknown command. /help');
  return J(200, { ok: true });
}

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    if (u.pathname === '/health') return J(200, { ok: true, service: 'memecheck-alert', telegram: !!env.TELEGRAM_BOT_TOKEN, origin: ORIGIN(env) });
    if (u.pathname === '/telegram' && req.method === 'POST') {
      const update = await req.json().catch(() => null);
      if (!update) return J(400, { error: 'bad json' });
      return handleUpdate(env, update);
    }
    if (u.pathname === '/cron' && req.method === 'POST') {
      if (env.ALERT_CRON_SECRET && req.headers.get('x-alert-cron') !== env.ALERT_CRON_SECRET) return J(401, { error: 'unauthorized' });
      if (!env.TELEGRAM_BOT_TOKEN) return J(503, { ok: false, error: 'TELEGRAM_BOT_TOKEN missing — ask Jojo' });
      const stub = env.WATCH.get(env.WATCH.idFromName('global'));
      return stub.fetch('https://do/poll', { method: 'POST' });
    }
    return J(404, { error: 'not found', hint: 'POST /telegram | POST /cron | GET /health' });
  },
  async scheduled(event, env, ctx) {
    if (!env.TELEGRAM_BOT_TOKEN) { console.log('cron skip: TELEGRAM_BOT_TOKEN missing'); return; }
    const stub = env.WATCH.get(env.WATCH.idFromName('global'));
    ctx.waitUntil(stub.fetch('https://do/poll', { method: 'POST' }).then(r => r.text()).then(t => console.log('cron', t)).catch(e => console.log('cron err', e)));
  },
};
