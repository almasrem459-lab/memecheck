// Shared server cache client (/api/cache, Workers KV). Results contain BigInt/Set, so encode them as tagged objects.
const enc = (v) => JSON.parse(JSON.stringify(v, (k, x) => typeof x === 'bigint' ? { $b: x.toString() } : x instanceof Set ? [...x] : x instanceof Map ? Object.fromEntries(x) : x));
const dec = (v) => JSON.parse(JSON.stringify(v), (k, x) => x && typeof x === 'object' && !Array.isArray(x) && typeof x.$b === 'string' && Object.keys(x).length === 1 ? BigInt(x.$b) : x);
export async function getShared(ca, kind, chain = 'solana') {
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(`/api/cache?ca=${encodeURIComponent(ca)}&chain=${chain}&kind=${kind}`, { signal: ctl.signal }); clearTimeout(tm);
    if (!r.ok) return null; const j = await r.json(); return j?.data ? { at: j.at, data: dec(j.data) } : null;
  } catch { return null; }
}
// Browsers never write the shared cache (writes are server-only). Kept as a no-op for old call sites.
export function putShared() {}
// Ask the server for a deep result; it computes it once (shared by concurrent visitors) if missing.
// Resolves { at, data } or null (null = compute locally, nothing is written). onWait() fires while another visitor's run is in progress.
export async function getDeep(ca, kind, chain = 'solana', { maxMs = 60000, onWait } = {}) {
  const t0 = Date.now();
  for (let i = 0; Date.now() - t0 < maxMs; i++) {
    try {
      const r = await fetch(`/api/deep?ca=${encodeURIComponent(ca)}&chain=${chain}&kind=${kind}`);
      if (r.status === 200) { const j = await r.json(); return j?.data ? { at: j.at, src: j.src, data: dec(j.data) } : null; }
      if (r.status !== 202) return null;
      onWait && onWait();
    } catch { return null; }
    await new Promise(ok => setTimeout(ok, 1500));
  }
  return null;
}
export const ago = (at, lang) => { const m = Math.max(0, Math.round((Date.now() - at) / 60e3)); return lang === 'ar' ? (m < 1 ? 'تم الفحص الآن' : m < 60 ? `تم الفحص قبل ${m} د` : `تم الفحص قبل ${Math.round(m / 60)} س`) : (m < 1 ? 'checked just now' : m < 60 ? `checked ${m} min ago` : `checked ${Math.round(m / 60)} h ago`); };
export const refreshLbl = (lang) => lang === 'ar' ? 'تحديث' : 'Refresh';
export { enc, dec };
