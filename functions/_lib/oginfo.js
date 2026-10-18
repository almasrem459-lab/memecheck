// Share-preview info for a token: cached core result (Cache API hot copy -> KV, read-only) or, if none, a single
// cached DexScreener lookup for name/symbol. Never computes a risk score and never writes KV.
import { readShared, keyOf, guardedPut } from './shared.js';
export const CA_RE = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;
const EVM = ['ethereum', 'base', 'bsc', 'arbitrum'];
const RPC = { ethereum: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'], base: ['https://base-rpc.publicnode.com', 'https://base.drpc.org'], bsc: ['https://bsc-rpc.publicnode.com', 'https://bsc.drpc.org'] };
function abiStr(hex) { // decode an ABI string (or bytes32) return value
  try { if (!hex || hex.length < 66) return ''; const b = hex.slice(2); let h;
    if (b.length >= 128 && parseInt(b.slice(0, 64), 16) === 32) { const n = parseInt(b.slice(64, 128), 16); h = b.slice(128, 128 + n * 2); } else h = b.slice(0, 64).replace(/(00)+$/, '');
    return new TextDecoder().decode(Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16))).replace(/\0/g, ''); } catch { return ''; } }
const LEVELS = new Set(['low', 'medium', 'high', 'extreme']);
const clean = (s) => String(s ?? '').replace(/^\$+/, '').replace(/[<>"\u0000-\u001f]/g, '').trim().slice(0, 40);
export async function ogInfo(env, ca, chain) {
  const evm = ca.startsWith('0x'), chains = evm ? (EVM.includes(chain) ? [chain] : EVM) : ['solana'];
  const KV = env.MEMECHECK_CACHE;
  for (const c of chains) {
    try {
      const v = await readShared(KV, keyOf('core', c, ca)); if (!v) continue;
      const r = JSON.parse(v).data; if (!r?.meta) continue;
      const lv = r.verdict?.level;
      return { sym: clean(r.meta.symbol), name: clean(r.meta.name), level: LEVELS.has(lv) && r.sources?.DexScreener === 'ok' ? lv : null, pts: r.verdict?.points ?? null, chain: r.chain || c, ca };
    } catch {}
  }
  // no cached risk: just name/symbol. Edge cache (1 h) -> KV meta:<ca> (7 d) -> one or two cheap lookups.
  const key = new Request('https://memecheck-og.internal/meta3/' + ca); const cache = caches.default;
  try { const h = await cache.match(key); if (h) return { ...(await h.json()), level: null, ca }; } catch {}
  const mk = 'meta:' + (evm ? ca.toLowerCase() : ca);
  try { const v = KV && await KV.get(mk); if (v) { const info = JSON.parse(v); await cache.put(key, new Response(v, { headers: { 'cache-control': 'public, max-age=3600' } })); return { ...info, level: null, ca }; } } catch {}
  let info = { sym: '', name: '', chain: evm ? (EVM.includes(chain) ? chain : null) : 'solana' };
  const get = async (url, init = {}) => { const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 3000);
    try { const r = await fetch(url, { ...init, signal: ctl.signal, headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (MemeCheck/1.0)' } }); return r.ok ? await r.json() : null; }
    catch { return null; } finally { clearTimeout(tm); } };
  if (!evm) { // Solana: Helius DAS (keyed, reliable), then Jupiter token search
    if (env.HELIUS_KEY) { const j = await get('https://mainnet.helius-rpc.com/?api-key=' + env.HELIUS_KEY, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: ca } }) });
      const m = j?.result?.content?.metadata, t = j?.result?.token_info; const sym = m?.symbol || t?.symbol; if (sym) info = { sym: clean(sym), name: clean(m?.name || ''), chain: 'solana' }; }
    if (!info.sym) { const j = await get('https://lite-api.jup.ag/tokens/v2/search?query=' + ca); const t = Array.isArray(j) && j.find(x => x.id === ca); if (t) info = { sym: clean(t.symbol), name: clean(t.name), chain: 'solana' }; }
  } else { // EVM: DexScreener, then GeckoTerminal
    const j = await get('https://api.dexscreener.com/latest/dex/tokens/' + ca);
    const ps = (j?.pairs || []).filter(p => (p.baseToken?.address || '').toLowerCase() === ca.toLowerCase() && EVM.includes(p.chainId));
    const p = ps.find(p => !EVM.includes(chain) || p.chainId === chain) || ps[0];
    if (p) info = { sym: clean(p.baseToken.symbol), name: clean(p.baseToken.name), chain: p.chainId };
    else { const NET = { ethereum: 'eth', base: 'base', bsc: 'bsc', arbitrum: 'arbitrum' };
      const g = await get(`https://api.geckoterminal.com/api/v2/networks/${NET[EVM.includes(chain) ? chain : 'ethereum']}/tokens/${ca}`); const a = g?.data?.attributes;
      if (a?.symbol) info = { sym: clean(a.symbol), name: clean(a.name), chain: EVM.includes(chain) ? chain : 'ethereum' };
      else { // last resort: read symbol()/name() straight from the token contract over public RPCs (no shared rate limit)
        const cs = EVM.includes(chain) ? [chain] : EVM;
        const rs = await Promise.all(cs.map(async c => { for (const url of RPC[c]) { const body = JSON.stringify([['0x95d89b41', 1], ['0x06fdde03', 2]].map(([d, id]) => ({ jsonrpc: '2.0', id, method: 'eth_call', params: [{ to: ca, data: d }, 'latest'] })));
            const j = await get(url, { method: 'POST', body }); if (!Array.isArray(j)) continue; const by = (id) => abiStr(j.find(x => x.id === id)?.result);
            return { sym: by(1), name: by(2), c }; } return {}; }));
        const hit = rs.find(r => r.sym); if (hit) info = { sym: clean(hit.sym), name: clean(hit.name), chain: hit.c };
      } }
  }
  if (info.sym) {
    const txt = JSON.stringify(info);
    try { await cache.put(key, new Response(txt, { headers: { 'cache-control': 'public, max-age=3600' } })); } catch {}
    try { if (KV) await guardedPut(KV, mk, txt, { expirationTtl: 7 * 86400 }, 'pages'); } catch {} // name/symbol rarely change; budget-guarded
  }
  return { ...info, level: null, ca };
}
