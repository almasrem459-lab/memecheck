// memecheck-chat: one SQLite-backed Durable Object ("ChatRoom", name "global") = the MemeCheck community chat room.
// Reached ONLY through the Pages Function binding (functions/api/chat.js, chat-admin.js); workers_dev is off, so the
// x-mc-ip header (client IP, set by the Pages Function from CF-Connecting-IP) cannot be spoofed by browsers.
//
// Free-plan design:
//  * WebSocket Hibernation API (ctx.acceptWebSocket) -> no duration charges while sockets are idle; app-level "ping" is
//    answered by setWebSocketAutoResponse without waking the object.
//  * messages live in DO SQLite (never KV); ~250 rows kept (200 shown). Rate limits / duplicate checks run on an in-memory
//    copy loaded once per wake, so each post costs ~2 row writes (insert + prune) and no extra reads.
//  * IPs are stored only as salted SHA-256 hashes (salt generated inside the DO, never leaves it).
import { DurableObject } from 'cloudflare:workers';
import { checkMessage, cleanNick, clean, norm, MAX_LEN } from './filter.js';

const KEEP = 250, SHOW = 200, MIN = 60e3;
const RL_GAP = 5e3, RL_WIN = 10 * MIN, RL_MAX = 20;          // 1 msg / 5 s and 20 / 10 min, per IP and per user id
const REPORT_HIDE = 3, REPORT_MAX = 10;                       // 3 distinct reporters hide a message; 10 reports / 10 min per IP
const STRIKES = 3, STRIKE_BAN_MS = 60 * MIN;                  // 3 blocked scam/link/slur attempts in 10 min -> 1 h auto-mute
const MAX_SOCKETS = 500;
const VER = '2026-10-19b';
const FB_MAX = 1000, FB_CONTACT = 80, FB_RL = 3, FB_WIN = 60 * MIN, FB_KEEP = 2000;   // feedback: 3 per IP-hash per hour

const hex = (b) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const J = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const pub = (m) => ({ id: m.id, ts: m.ts, nick: m.nick, tag: m.tag, text: m.text, ...(m.admin ? { admin: 1 } : {}) });

export class ChatRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, nick TEXT, tag TEXT, uid TEXT, iph TEXT, text TEXT, norm TEXT, hidden INTEGER DEFAULT 0, reports INTEGER DEFAULT 0, admin INTEGER DEFAULT 0)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS reports (mid INTEGER, rh TEXT, ts INTEGER, PRIMARY KEY (mid, rh))`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS bans (k TEXT PRIMARY KEY, until INTEGER, why TEXT, ts INTEGER)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS strikes (iph TEXT, ts INTEGER)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, msg TEXT, contact TEXT, cat TEXT, lang TEXT, path TEXT, iph TEXT)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS fb_rl (iph TEXT, ts INTEGER)`);
      let salt = this.sql.exec(`SELECT v FROM meta WHERE k='salt'`).toArray()[0]?.v;
      if (!salt) { salt = hex(crypto.getRandomValues(new Uint8Array(32))); this.sql.exec(`INSERT INTO meta (k, v) VALUES ('salt', ?)`, salt); }
      this.salt = salt;
      this.msgs = this.sql.exec(`SELECT * FROM msgs ORDER BY id DESC LIMIT ?`, KEEP).toArray().reverse();
      this.bans = new Map(this.sql.exec(`SELECT k, until FROM bans WHERE until > ?`, Date.now()).toArray().map(r => [r.k, r.until]));
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  hashIp(ip) { return sha(this.salt + '|ip|' + (ip || 'unknown')); }
  async tagOf(uid, iph) { return (await sha(this.salt + '|uid|' + (uid || iph))).slice(0, 4); }
  banned(iph, uid) { const now = Date.now(); for (const k of ['i:' + iph, 'u:' + uid]) { const u = this.bans.get(k); if (u && u > now) return u; } return 0; }
  visible() { return this.msgs.filter(m => !m.hidden).slice(-SHOW).map(pub); }
  broadcast(obj, except) { const s = JSON.stringify(obj); for (const ws of this.ctx.getWebSockets()) { if (ws !== except) try { ws.send(s); } catch {} } }
  online() { return this.ctx.getWebSockets().length; }

  strike(iph) {   // persisted (the object may hibernate between attempts); only blocked messages write here
    const now = Date.now();
    this.sql.exec(`DELETE FROM strikes WHERE ts < ?`, now - RL_WIN); this.sql.exec(`INSERT INTO strikes (iph, ts) VALUES (?, ?)`, iph, now);
    const n = this.sql.exec(`SELECT COUNT(*) AS n FROM strikes WHERE iph = ?`, iph).one().n;
    if (n >= STRIKES) { this.ban('i:' + iph, STRIKE_BAN_MS, 'auto: repeated blocked messages'); this.sql.exec(`DELETE FROM strikes WHERE iph = ?`, iph); return true; }
    return false;
  }
  ban(k, ms, why) { const until = Date.now() + ms; this.bans.set(k, until); this.sql.exec(`INSERT OR REPLACE INTO bans (k, until, why, ts) VALUES (?, ?, ?, ?)`, k, until, String(why || '').slice(0, 120), Date.now()); }

  // ---- core actions (shared by WebSocket and HTTP polling paths) ----
  async post({ iph, uid, nick, text }) {
    const now = Date.now();
    const b = this.banned(iph, uid); if (b) return { err: 'banned', wait: Math.ceil((b - now) / 1000) };
    const n = cleanNick(nick); if (n.err) return { err: n.err };
    const mine = this.msgs.filter(m => (m.iph === iph || m.uid === uid) && now - m.ts < RL_WIN);
    const last = mine.length ? mine[mine.length - 1].ts : 0;
    if (now - last < RL_GAP) return { err: 'rate_fast', wait: Math.ceil((RL_GAP - (now - last)) / 1000) };
    if (mine.length >= RL_MAX) return { err: 'rate_10m', wait: Math.ceil((mine[mine.length - RL_MAX].ts + RL_WIN - now) / 1000) };
    const c = checkMessage(text);
    if (c.err) { const auto = ['link', 'scam', 'bad_word'].includes(c.err) && this.strike(iph); return auto ? { err: 'auto_muted', wait: STRIKE_BAN_MS / 1000 } : { err: c.err }; }
    const nm = norm(c.text);
    if (nm.length >= 2) {
      if (mine.some(m => m.norm === nm)) return { err: 'dup' };                                                   // same text from you in 10 min
      if (nm.length >= 10 && this.msgs.filter(m => m.norm === nm && now - m.ts < 5 * MIN).length >= 2) return { err: 'dup' };  // copy-paste spam wave
    }
    const tag = await this.tagOf(uid, iph);
    const row = this.sql.exec(`INSERT INTO msgs (ts, nick, tag, uid, iph, text, norm) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`, now, n.nick, tag, uid, iph, c.text, nm).one();
    const m = { id: row.id, ts: now, nick: n.nick, tag, uid, iph, text: c.text, norm: nm, hidden: 0, reports: 0, admin: 0 };
    this.msgs.push(m); this.prune();
    this.broadcast({ t: 'msg', m: pub(m) });
    return { ok: true, id: m.id };
  }
  prune() {
    if (this.msgs.length <= KEEP) return;
    const cut = this.msgs[this.msgs.length - KEEP].id; this.msgs = this.msgs.slice(-KEEP);
    this.sql.exec(`DELETE FROM msgs WHERE id < ?`, cut); this.sql.exec(`DELETE FROM reports WHERE mid < ?`, cut);
  }
  async report({ iph, id }) {
    const m = this.msgs.find(x => x.id === +id); if (!m || m.hidden) return { ok: true };
    if (m.admin) return { err: 'report_admin' };
    if (m.iph === iph) return { err: 'report_self' };
    const now = Date.now();
    if (this.sql.exec(`SELECT COUNT(*) AS n FROM reports WHERE rh = ? AND ts > ?`, iph, now - RL_WIN).one().n >= REPORT_MAX) return { err: 'rate_10m', wait: 60 };
    this.sql.exec(`INSERT OR IGNORE INTO reports (mid, rh, ts) VALUES (?, ?, ?)`, m.id, iph, now);
    const n = this.sql.exec(`SELECT COUNT(*) AS n FROM reports WHERE mid = ?`, m.id).one().n;
    m.reports = n;
    if (n >= REPORT_HIDE) { m.hidden = 1; this.sql.exec(`UPDATE msgs SET hidden = 1, reports = ? WHERE id = ?`, n, m.id); this.broadcast({ t: 'hide', ids: [m.id] }); }
    else this.sql.exec(`UPDATE msgs SET reports = ? WHERE id = ?`, n, m.id);
    return { ok: true, reports: n, hidden: !!m.hidden };
  }
  removeIds(ids) {
    if (!ids.length) return 0; const set = new Set(ids);
    this.msgs = this.msgs.filter(m => !set.has(m.id));
    for (const id of ids) { this.sql.exec(`DELETE FROM msgs WHERE id = ?`, id); this.sql.exec(`DELETE FROM reports WHERE mid = ?`, id); }
    this.broadcast({ t: 'del', ids }); return ids.length;
  }

  async admin(body) {
    const a = body.action, id = +body.id, m = this.msgs.find(x => x.id === id);
    const author = (mm) => this.msgs.filter(x => (x.iph === mm.iph || (mm.uid && x.uid === mm.uid)) && !x.admin).map(x => x.id);
    switch (a) {
      case 'list': return { ok: true, online: this.online(), msgs: this.msgs.slice(-(Math.min(+body.limit || 50, KEEP))).map(x => ({ ...pub(x), hidden: x.hidden, reports: x.reports, author: x.iph.slice(0, 10), uid: (x.uid || '').slice(0, 10) })) };
      case 'delete': { const ids = (Array.isArray(body.ids) ? body.ids : [id]).map(Number).filter(x => this.msgs.some(y => y.id === x)); return { ok: true, deleted: this.removeIds(ids) }; }
      case 'delete_user': if (!m) return { err: 'not_found' }; return { ok: true, deleted: this.removeIds(author(m)) };
      case 'ban': {
        if (!m) return { err: 'not_found' }; const h = Math.min(Math.max(+body.hours || 24, 0.1), 24 * 365);
        this.ban('i:' + m.iph, h * 3600e3, body.why || 'admin'); if (m.uid) this.ban('u:' + m.uid, h * 3600e3, body.why || 'admin');
        const deleted = body.keep ? 0 : this.removeIds(author(m));
        return { ok: true, banned: ['i:' + m.iph.slice(0, 10), m.uid ? 'u:' + m.uid.slice(0, 10) : null].filter(Boolean), hours: h, deleted };
      }
      case 'bans': return { ok: true, bans: this.sql.exec(`SELECT k, until, why, ts FROM bans WHERE until > ? ORDER BY ts DESC`, Date.now()).toArray().map(r => ({ ...r, k: r.k.slice(0, 12) })) };
      case 'unban': { const pre = String(body.key || ''); if (pre.length < 6) return { err: 'key' }; const ks = [...this.bans.keys()].filter(k => k.startsWith(pre));
        for (const k of ks) { this.bans.delete(k); this.sql.exec(`DELETE FROM bans WHERE k = ?`, k); if (k.startsWith('i:')) this.sql.exec(`DELETE FROM strikes WHERE iph = ?`, k.slice(2)); } return { ok: true, unbanned: ks.length }; }
      case 'unhide': if (!m) return { err: 'not_found' }; m.hidden = 0; m.reports = 0; this.sql.exec(`UPDATE msgs SET hidden = 0, reports = 0 WHERE id = ?`, id); this.sql.exec(`DELETE FROM reports WHERE mid = ?`, id); this.broadcast({ t: 'msg', m: pub(m) }); return { ok: true };
      case 'clear': { const n = this.msgs.length; this.msgs = []; this.sql.exec(`DELETE FROM msgs`); this.sql.exec(`DELETE FROM reports`); this.broadcast({ t: 'reset' }); return { ok: true, deleted: n }; }
      case 'post': {   // official message from the MemeCheck team (badge); still plain text only
        const text = clean(body.text, MAX_LEN); if (!text) return { err: 'empty' };
        const nick = (clean(body.nick || 'MemeCheck', 24) || 'MemeCheck');
        const row = this.sql.exec(`INSERT INTO msgs (ts, nick, tag, uid, iph, text, norm, admin) VALUES (?, ?, 'team', '', 'admin', ?, '', 1) RETURNING id`, Date.now(), nick, text).one();
        const mm = { id: row.id, ts: Date.now(), nick, tag: 'team', uid: '', iph: 'admin', text, norm: '', hidden: 0, reports: 0, admin: 1 };
        this.msgs.push(mm); this.prune(); this.broadcast({ t: 'msg', m: pub(mm) }); return { ok: true, id: mm.id };
      }
      case 'feedback_list': { const lim = Math.min(200, Math.max(1, +body.limit || 50)); return { ok: true, total: this.sql.exec(`SELECT COUNT(*) AS n FROM feedback`).one().n, items: this.sql.exec(`SELECT id, ts, msg, contact, cat, lang, path, substr(iph, 1, 8) AS who FROM feedback ORDER BY id DESC LIMIT ?`, lim).toArray() }; }
      case 'feedback_delete': { const fid = +body.id || 0; if (!fid) return { err: 'id' }; const n = this.sql.exec(`DELETE FROM feedback WHERE id = ?`, fid).rowsWritten; return n ? { ok: true, deleted: fid } : { err: 'not_found' }; }
      case 'stats': return { ok: true, ver: VER, online: this.online(), stored: this.msgs.length, hidden: this.msgs.filter(x => x.hidden).length, bans: this.bans.size };
      default: return { err: 'unknown_action', actions: ['list', 'delete', 'delete_user', 'ban', 'bans', 'unban', 'unhide', 'clear', 'post', 'stats', 'feedback_list', 'feedback_delete'] };
    }
  }

  feedback(iph, b) {   // suggestion box: stores message + meta; only the salted IP hash (for the rate limit), never the IP
    const str = (v) => (typeof v === 'string' ? v : '');
    if (str(b.hp)) return { ok: true };                                   // honeypot filled -> pretend success, store nothing
    const msg = str(b.msg).replace(/\r\n?/g, '\n').trim(), contact = str(b.contact).trim();
    if (!msg) return { err: 'empty' };
    if (msg.length > FB_MAX || contact.length > FB_CONTACT) return { err: 'too_long' };
    const now = Date.now();
    if (this.sql.exec(`SELECT COUNT(*) AS n FROM fb_rl WHERE iph = ? AND ts > ?`, iph, now - FB_WIN).one().n >= FB_RL) return { err: 'rate' };
    this.sql.exec(`DELETE FROM fb_rl WHERE ts < ?`, now - FB_WIN); this.sql.exec(`INSERT INTO fb_rl (iph, ts) VALUES (?, ?)`, iph, now);   // separate log so admin deletes don't reset the limit
    const cat = ['idea', 'bug', 'other'].includes(b.cat) ? b.cat : '', lang = b.lang === 'ar' ? 'ar' : 'en';
    const path = str(b.path).slice(0, 200).replace(/[^\x21-\x7e]/g, '') || '/';
    const row = this.sql.exec(`INSERT INTO feedback (ts, msg, contact, cat, lang, path, iph) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`, now, msg, contact, cat, lang, path, iph.slice(0, 16)).one();
    this.sql.exec(`DELETE FROM feedback WHERE id <= ?`, row.id - FB_KEEP);
    return { ok: true, id: row.id };
  }

  async fetch(req) {
    const u = new URL(req.url), ip = req.headers.get('x-mc-ip') || '', iph = await this.hashIp(ip);
    const uidOk = (s) => /^[a-z0-9]{12,40}$/i.test(s || '') ? s : '';
    if (u.pathname === '/ws') {
      if (req.headers.get('upgrade') !== 'websocket') return J(426, { err: 'websocket expected' });
      if (this.online() >= MAX_SOCKETS) return J(503, { err: 'full' });
      const pair = new WebSocketPair(), [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ iph, uid: uidOk(u.searchParams.get('uid')) || ('ip' + iph.slice(0, 20)) });
      server.send(JSON.stringify({ t: 'hist', msgs: this.visible(), online: this.online() }));
      this.broadcast({ t: 'online', n: this.online() }, server);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (u.pathname === '/history') { const since = +u.searchParams.get('since') || 0; return J(200, { ok: true, msgs: this.visible().filter(m => m.id > since), ids: since ? this.visible().map(m => m.id) : undefined, online: this.online() }); }
    if (req.method !== 'POST') return J(405, { err: 'method' });
    let body = {}; try { body = await req.json(); } catch { return J(400, { err: 'json' }); }
    if (u.pathname === '/post') { const uid = uidOk(body.uid) || ('ip' + iph.slice(0, 20)); const r = await this.post({ iph, uid, nick: body.nick, text: body.text }); return J(r.err ? 400 : 200, r); }
    if (u.pathname === '/feedback') { const r = this.feedback(iph, body); return J(r.err === 'rate' ? 429 : r.err ? 400 : 200, r); }
    if (u.pathname === '/report') { const r = await this.report({ iph, id: body.id }); return J(r.err ? 400 : 200, r); }
    if (u.pathname === '/admin') {
      const tok = this.env.ADMIN_TOKEN || '', got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      const enc = new TextEncoder(), a = enc.encode(tok), b = enc.encode(got);
      if (!tok || a.byteLength !== b.byteLength || !crypto.subtle.timingSafeEqual(a, b)) return J(401, { err: 'unauthorized' });
      const r = await this.admin(body); return J(r.err ? 400 : 200, r);
    }
    return J(404, { err: 'not found' });
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > 2000) return;
    let d; try { d = JSON.parse(data); } catch { return; }
    const at = ws.deserializeAttachment() || {};
    if (d.t === 'post') { const r = await this.post({ iph: at.iph, uid: at.uid, nick: d.nick, text: d.text }); ws.send(JSON.stringify({ t: r.err ? 'err' : 'ok', ...r, ref: d.ref })); }
    else if (d.t === 'report') { const r = await this.report({ iph: at.iph, id: d.id }); ws.send(JSON.stringify({ t: r.err ? 'err' : 'reported', ...r, id: d.id, ref: d.ref })); }
  }
  async webSocketClose(ws, code) { try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch {} this.broadcast({ t: 'online', n: Math.max(0, this.online() - 1) }, ws); }
  async webSocketError(ws) { this.broadcast({ t: 'online', n: Math.max(0, this.online() - 1) }, ws); }
}

export default {
  async fetch() { return new Response('memecheck-chat: internal Durable Object host (use https://memecheck.pages.dev/chat)', { status: 404, headers: { 'content-type': 'text/plain' } }); },
};
