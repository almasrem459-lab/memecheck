// GET /api/snap-insight?chain=ethereum|bsc|base|arbitrum|solana&ca=...
// Optional: &data=0x...&to=0x...  (raw tx fields from MetaMask Snap) to add approve/unlimited notes.
// Returns severity + plain-language reasons (same formatter as Solana/EVM site scans).
import { analyze } from '../../core.js';
import { insightFromResult, decodeEvmTxNotes, CHAIN_ID_MAP } from '../../risk-insight.js';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type' };
const json = (status, body, cc = 'public, max-age=60') => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': cc, ...cors },
});

export const onRequest = async ({ request: req }) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return json(405, { error: 'GET only' }, 'no-store');

  const u = new URL(req.url);
  let chain = (u.searchParams.get('chain') || '').toLowerCase();
  const chainId = u.searchParams.get('chainId') || '';
  if (!chain && chainId) chain = CHAIN_ID_MAP[chainId] || '';
  let ca = (u.searchParams.get('ca') || '').trim();
  const to = (u.searchParams.get('to') || '').trim();
  const data = u.searchParams.get('data') || '0x';

  let txNotes = [];
  if (/^0x[0-9a-fA-F]{40}$/.test(to) || (data && data !== '0x')) {
    const dec = decodeEvmTxNotes({ to: to || ca, data });
    txNotes = dec.notes;
    if (!ca && dec.token) ca = dec.token;
    if (!ca && to) ca = to;
  }

  const solOk = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ca);
  const evmOk = /^0x[0-9a-fA-F]{40}$/.test(ca);
  if (!ca || (!solOk && !evmOk)) return json(400, { error: 'bad ca' }, 'no-store');
  if (solOk) chain = 'solana';
  else if (!['ethereum', 'bsc', 'base', 'arbitrum'].includes(chain)) {
    // auto: analyze() will pick from DexScreener
    chain = 'auto';
  }

  try {
    const result = await analyze(ca, chain === 'solana' ? 'auto' : chain);
    const insight = insightFromResult(result, { txNotes });
    return json(200, {
      ok: true,
      at: Date.now(),
      insight,
      verdict: result.verdict,
      sources: result.sources,
      snap: {
        proposedName: 'MemeCheckShield',
        formStatus: 'closed',
        note: 'MetaMask Snap: open source, not yet listed in the Snaps directory.',
      },
    }, insight.critical ? 'public, max-age=30' : 'public, max-age=60');
  } catch (e) {
    return json(200, {
      ok: false,
      error: 'analyze_failed',
      insight: {
        level: 'unknown',
        label: 'Risk unknown',
        points: 0,
        critical: false,
        reasons: [{ id: 'error', status: 'warn', critical: false, weight: 0, text: 'Could not fetch risk data. Try again or open memecheck.pages.dev.' }],
        methodologyUrl: 'https://memecheck.pages.dev/how',
        siteUrl: 'https://memecheck.pages.dev',
      },
    }, 'no-store');
  }
};
