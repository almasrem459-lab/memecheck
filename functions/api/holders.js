// Top token holders for the bubble map (Solana). GET ?mint=<base58> -> { holders:[{owner,pct,ui}], total, supply, decimals, src }.
// Sources: Helius DAS getTokenAccounts (if HELIUS_KEY, up to 4000 accounts), else getProgramAccounts (mint filter, 40-byte slice: owner + amount) on the public RPC, which serves it for Token-2022 mints
// (all new pump.fun coins). Falls back to pump.fun's top-holders list (50). Aggregated per owner, top 100, edge-cached 90 s.
// Read-only; never writes KV. Large tokens that time out or exceed limits return 502 and the browser falls back to RugCheck/RPC top 20.
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const T22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', TKEG = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const RPCS = ['https://api.mainnet-beta.solana.com'];
const TTL = 90, MAX = 100;
const json = (status, body, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra } });
function b58(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = '1' + s; } return s;
}
const unb64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const u64 = (u, o) => { let v = 0n; for (let i = 7; i >= 0; i--) v = v * 256n + BigInt(u[o + i]); return v; };
async function call(url, method, params, ms, tries = 3) {
  for (let i = 0; ; i++) {
    try { return await call1(url, method, params, ms); }
    catch (e) { if (i + 1 >= tries || !/429|rate|too many requests/i.test(String(e && e.message))) throw e; await new Promise(r => setTimeout(r, 400 * (i + 1) + Math.random() * 300)); }
  }
}
async function call1(url, method, params, ms) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'user-agent': 'memecheck-holders/1.0' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (!r.ok) throw new Error('http ' + r.status); const j = await r.json(); if (j.error) throw new Error((j.error.code === -32429 || j.error.code === 429 ? '429 ' : '') + (j.error.message || 'rpc')); return j.result;
  } finally { clearTimeout(tm); }
}
// Helius DAS getTokenAccounts (when HELIUS_KEY is set): bounded to 4 pages (4000 accounts); bigger tokens fall through.
async function viaDas(mint, env) {
  if (!env || !env.HELIUS_KEY) throw new Error('no key');
  const up = `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_KEY}`;
  const sup = await call(up, 'getTokenSupply', [mint], 6000); const supply = sup && sup.value && +sup.value.amount; if (!supply) throw new Error('no supply');
  const byOwner = new Map(); let n = 0;
  for (let page = 1; ; page++) {
    const r = await call(up, 'getTokenAccounts', { mint, page, limit: 1000, options: { showZeroBalance: false } }, 8000);
    const list = r && r.token_accounts; if (!Array.isArray(list)) throw new Error('bad das');
    for (const a of list) { const amt = +a.amount; if (!(amt > 0) || !a.owner) continue; n++; byOwner.set(a.owner, (byOwner.get(a.owner) || 0) + amt); }
    if (list.length < 1000) break;
    if (page >= 4) throw new Error('too many holders');
  }
  if (!byOwner.size) throw new Error('empty');
  const top = [...byOwner.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX);
  return { src: 'Helius', total: byOwner.size, accounts: n, supply: String(sup.value.amount), decimals: sup.value.decimals, holders: top.map(([owner, amt]) => ({ owner, pct: Math.round(amt / supply * 1e7) / 1e5 })) };
}
async function viaRpc(mint) {
  const ups = RPCS;
  let lastErr;
  for (const up of ups) {
    try {
      const info = await call(up, 'getAccountInfo', [mint, { encoding: 'base64', dataSlice: { offset: 36, length: 9 } }], 6000);
      const v = info && info.value; if (!v || (v.owner !== T22 && v.owner !== TKEG)) throw new Error('not a mint');
      const md = unb64(v.data[0]); const supply = u64(md, 0), decimals = md[8];
      if (!supply) throw new Error('no supply');
      const accs = await call(up, 'getProgramAccounts', [v.owner, { encoding: 'base64', dataSlice: { offset: 32, length: 40 }, filters: [{ memcmp: { offset: 0, bytes: mint } }] }], 8000);
      if (!Array.isArray(accs) || !accs.length) throw new Error('empty');
      const byOwner = new Map(); let holders = 0;
      for (const a of accs) {
        const d = a.account && a.account.data && a.account.data[0]; if (!d) continue; const u = unb64(d); if (u.length < 40) continue;
        const amt = u64(u, 32); if (!amt) continue; holders++;
        const key = String.fromCharCode.apply(null, u.subarray(0, 32)); // raw owner bytes as grouping key; base58 only for the top list
        const o = byOwner.get(key); if (o) o.amt += amt; else byOwner.set(key, { u, amt });
      }
      const top = [...byOwner.values()].sort((a, b) => (b.amt > a.amt ? 1 : b.amt < a.amt ? -1 : 0)).slice(0, MAX);
      const pct = (x) => Number(x * 10000000n / supply) / 1e5;
      return { src: 'Solana RPC', total: byOwner.size, accounts: holders, supply: supply.toString(), decimals, program: v.owner === T22 ? 'token-2022' : 'spl-token',
        holders: top.map(h => ({ owner: b58(h.u.subarray(0, 32)), pct: pct(h.amt) })) };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('rpc');
}
async function viaPump(mint) {
  if (!/pump$/.test(mint)) throw new Error('not pump');
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 7000);
  try {
    const [h, c] = await Promise.all([
      fetch(`https://frontend-api-v3.pump.fun/coins/top-holders/${mint}`, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (MemeCheck/1.0)' } }).then(r => r.ok ? r.json() : null),
      fetch(`https://frontend-api-v3.pump.fun/coins-v2/${mint}`, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (MemeCheck/1.0)' } }).then(r => r.ok ? r.json() : null).catch(() => null)]);
    const list = h && h.topHolders; if (!Array.isArray(list) || !list.length) throw new Error('empty');
    const sup = (c && +c.total_supply) ? +c.total_supply / 1e6 : 1e9; // pump.fun: 1B supply, 6 decimals
    return { src: 'pump.fun', total: h.totalHolders || null, holders: list.filter(x => x && x.address && +x.amount > 0).slice(0, MAX).map(x => ({ owner: x.address, pct: +x.amount / sup * 100 })) };
  } finally { clearTimeout(tm); }
}
export const onRequest = async ({ request: req, env, waitUntil }) => {
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const mint = new URL(req.url).searchParams.get('mint') || '';
  if (!MINT_RE.test(mint)) return json(400, { error: 'bad mint' });
  const key = new Request('https://memecheck-cache.internal/holders/' + mint);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  try { const hit = cache && await cache.match(key); if (hit) return json(200, await hit.text(), { 'cache-control': `public, max-age=${TTL}`, 'x-cache': 'HIT' }); } catch {}
  let res = null, why = [];
  try { res = await viaDas(mint, env); } catch (e) { why.push('das:' + String(e && e.message || e).slice(0, 60)); }
  if (!res && !/too many/.test(why.join())) try { res = await viaRpc(mint); } catch (e) { why.push('rpc:' + String(e && e.message || e).slice(0, 60)); }
  if (!res) try { res = await viaPump(mint); } catch (e) { why.push('pump:' + String(e && e.message || e).slice(0, 60)); }
  if (!res) return json(502, { error: 'holders unavailable', why }, { 'cache-control': 'no-store' });
  const body = JSON.stringify({ ...res, at: Date.now() });
  if (cache) { const p = cache.put(key, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${TTL}` } })).catch(() => {}); waitUntil ? waitUntil(p) : await p; }
  return json(200, body, { 'cache-control': `public, max-age=${TTL}`, 'x-cache': 'MISS', 'x-holders-log': why.join(', ') });
};
