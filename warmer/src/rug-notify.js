/**
 * Push High/Extreme scans to memecheck-alert /broadcast-rug (Telegram EN+AR + optional X).
 * Secrets on warmer: RUG_BROADCAST_SECRET (or PAYMENT_NOTIFY_SECRET), optional RUG_BROADCAST_URL.
 * Failures are logged and never throw into the warmer loop.
 */
import { walletVerdict, messages } from '../../cf-dist/functions/_lib/rugdna.js';
const DEFAULT_URL = 'https://memecheck-alert.memecheck.workers.dev/broadcast-rug';

export async function notifyHighRug(env, payload, log) {
  try {
    const level = String(payload?.level || '').toLowerCase();
    if (level !== 'high' && level !== 'extreme') return;
    const secret = env.RUG_BROADCAST_SECRET || env.PAYMENT_NOTIFY_SECRET || '';
    if (!secret || secret.length < 12) {
      log?.push?.('rugpub skip: no RUG_BROADCAST_SECRET');
      return;
    }
    const url = env.RUG_BROADCAST_URL || DEFAULT_URL;
    const body = {
      ca: payload.ca || payload.mint || payload.addr,
      mint: payload.ca || payload.mint || payload.addr,
      level,
      points: payload.points ?? payload.pts ?? null,
      symbol: String(payload.symbol || payload.sym || '').replace(/^\$/, ''),
      name: payload.name || '',
      findings: payload.findings || [],
      reasons: payload.reasons || [],
      reasonEn: payload.reasonEn || null,
      reasonAr: payload.reasonAr || null,
      source: payload.source || 'warmer',
    };
    // RugDNA (optional, never blocks the alert): add the shared-funding-wallet cluster line when the creator is in the index.
    try {
      const db = env.RUGDNA, l = db && await db.prepare('SELECT creator FROM launches WHERE mint = ?').bind(body.ca).first();
      if (l) { const v = await walletVerdict(db, l.creator, body.ca), m = v.status === 'linked' && v.linkedLaunches > 0 ? messages(v) : null; if (m) { body.rugdnaEn = m.en; body.rugdnaAr = m.ar; log?.push?.(`rugdna cluster line wallets=${v.wallets} dead=${v.linkedDead}`); } }
    } catch {}
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-rug-broadcast': secret, 'user-agent': 'memecheck-warmer-rugpub/1.0' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    log?.push?.(`rugpub ${body.ca?.slice?.(0, 8)} ${level} http=${r.status} deduped=${!!j.deduped} dry=${!!j.dry}`);
  } catch (e) {
    log?.push?.('rugpub err ' + String(e?.message || e).slice(0, 60));
  }
}
