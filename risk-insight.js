// Shared risk-insight formatter for MemeCheckShield site + MetaMask Snap.
// Same severity bands and top-reason ordering everywhere (Solana + EVM).
// Plain EN strings here are Snap/API defaults; the site prefers i18n.r[id] when available.

export const LEVEL_LABEL = {
  low: 'No major red flags',
  medium: 'Medium risk',
  high: 'High risk',
  extreme: 'Extreme risk',
  unknown: 'Risk unknown',
};

// Compact EN reason map (mirrors i18n.js EN wording for the findings Snap/site care about most).
const EN = {
  mintAuth: (p, s) => (s === 'pass' ? 'Mint authority is revoked; no one can create new tokens.' : 'Mint authority is ACTIVE; the creator can print unlimited tokens.'),
  freezeAuth: (p, s) => (s === 'pass' ? 'Freeze authority is revoked; your tokens cannot be frozen.' : 'Freeze authority is ACTIVE; the creator can freeze your wallet so you cannot sell.'),
  honeypot: (p, s) => (s === 'na' ? (p?.curve ? 'Sell simulation not available while on the bonding curve.' : 'Honeypot check unavailable.') : s === 'pass' ? `Not a honeypot: selling works (${p?.src || 'sources'}).` : `HONEYPOT (${p?.src || 'sources'})${p?.reason ? ': ' + p.reason : ''}. You will likely be unable to sell.`),
  cannotBuy: () => 'Buying is blocked on this token contract.',
  tax: (p, s) => (s === 'pass' ? `Buy/sell tax looks low (${fmt(p?.b)}% / ${fmt(p?.s)}%).` : `High buy/sell tax (${fmt(p?.b)}% / ${fmt(p?.s)}%).`),
  mintable: (p, s) => (s === 'pass' ? 'Token is not mintable.' : 'Owner can mint new tokens (inflation risk).'),
  hiddenOwner: () => 'Contract has a hidden owner.',
  takeBack: () => 'Ownership can be reclaimed after renounce.',
  openSource: (p, s) => (s === 'pass' ? 'Contract source is verified.' : 'Contract source is not verified.'),
  proxy: () => 'Upgradeable proxy: logic can change later.',
  blacklist: (p, s) => (s === 'pass' && p?.ren ? 'Blacklist exists but ownership is renounced (cannot flip).' : 'Contract can blacklist wallets.'),
  pausable: (p, s) => (s === 'pass' && p?.ren ? 'Transfers pausable but ownership is renounced.' : 'Transfers can be paused.'),
  tradingCooldown: () => 'Trading cooldown can throttle sells.',
  slippageMod: () => 'Owner can change buy/sell tax (slippage modifiable).',
  renounced: (p, s) => (s === 'pass' ? (p?.fm ? 'Launch-contract ownership (Four.meme) — expected on curve.' : 'Ownership renounced.') : 'Owner wallet still controls the contract.'),
  serialScammer: () => 'Same creator deployed honeypots before.',
  lpLocked: (p, s) => (s === 'pass' ? `${fmt(p?.v, 0)}% of liquidity is locked or burned.` : p?.pump ? 'pump.fun AMM LP burned at migration.' : `Only ${fmt(p?.v, 0)}% of liquidity is locked; LP could be pulled.`),
  top10: (p, s) => (s === 'pass' ? `Top 10 wallets hold ${fmt(p?.v)}% of supply.` : `Top 10 wallets hold ${fmt(p?.v)}% of supply; concentrated risk.`),
  top1: (p, s) => (s === 'pass' ? `Largest wallet holds ${fmt(p?.v)}%.` : `Largest wallet holds ${fmt(p?.v)}% of supply.`),
  creator: (p, s) => (s === 'pass' ? `${p?.who || 'Creator'} holds ${fmt(p?.v)}%.` : `${p?.who || 'Creator'} holds ${fmt(p?.v)}% of supply.`),
  insiders: (p, s) => (s === 'pass' ? 'No insider networks flagged.' : `Insider / clustered wallets detected (n=${p?.n ?? '?'}${p?.pct != null ? `, ~${fmt(p.pct)}%` : ''}).`),
  mutable: (p, s) => (s === 'pass' ? 'Token metadata is immutable.' : 'Token metadata is mutable; name/URI can change.'),
  rugged: () => 'Marked as already rugged by RugCheck.',
  rcFlags: (p, s) => (s === 'pass' ? 'No RugCheck danger flags.' : `RugCheck flags: ${p?.n ?? 0} total, ${p?.d ?? 0} danger.`),
  liquidity: (p, s) => (s === 'pass' ? `Liquidity ${usd(p?.v)}.` : `Low liquidity (${usd(p?.v)}); exits may be hard.`),
  age: (p, s) => (s === 'pass' ? `Pair age ~${fmt(p?.h, 1)}h.` : `Very new pair (~${fmt(p?.h, 1)}h); rugs often hit early.`),
  drop: (p, s) => (p?.crash ? `Already down ~${fmt(p?.v, 0)}% from recent high (crashed before scan).` : `Price ~${fmt(p?.v, 0)}% below recent high.`),
  pressure: (p, s) => (s === 'pass' ? `Buys ${p?.b} vs sells ${p?.s} (24h).` : `Sells (${p?.s}) outnumber buys (${p?.b}) in 24h.`),
  volume: (p, s) => (s === 'pass' ? `24h volume ${usd(p?.v)}.` : `Very low 24h volume (${usd(p?.v)}).`),
  hpRisk: (p, s) => `Honeypot.is risk rating: ${p?.v ?? '—'}.`,
  // Snap / pre-sign context (not scored in core.js — mirrored as tips on Solana when authorities fail)
  txUnlimitedApprove: () => 'This transaction approves UNLIMITED token spending for a spender. Revoke later if unused.',
  txApprove: (p) => `ERC-20 approve to spender ${short(p?.spender)}. Check the spender is a known router.`,
  preSignAuthority: () => 'Before you sign: mint or freeze authority is still active — the creator can print tokens or freeze wallets.',
};

function fmt(n, d = 1) {
  if (n === null || n === undefined || Number.isNaN(+n)) return '—';
  return (+n).toFixed(d);
}
function usd(n) {
  if (n === null || n === undefined) return '—';
  const x = +n;
  if (x >= 1e9) return '$' + (x / 1e9).toFixed(2) + 'B';
  if (x >= 1e6) return '$' + (x / 1e6).toFixed(2) + 'M';
  if (x >= 1e3) return '$' + (x / 1e3).toFixed(1) + 'K';
  return '$' + x.toFixed(x < 1 ? 4 : 2);
}
function short(a) {
  if (!a || typeof a !== 'string') return '—';
  return a.slice(0, 6) + '…' + a.slice(-4);
}

export function reasonText(finding, dict = EN) {
  const fn = dict[finding.id];
  if (typeof fn === 'function') return fn(finding.params || {}, finding.status);
  return finding.id;
}

/** Prefer critical fails, then fails, then warns — highest weight first. */
export function topInsightReasons(findings, { limit = 5 } = {}) {
  const rank = { fail: 0, warn: 1 };
  return (findings || [])
    .filter((f) => f.status === 'fail' || f.status === 'warn')
    .sort((a, b) => {
      const c = (b.critical ? 1 : 0) - (a.critical ? 1 : 0);
      if (c) return c;
      const s = rank[a.status] - rank[b.status];
      if (s) return s;
      return (b.weight || 0) - (a.weight || 0);
    })
    .slice(0, limit);
}

/**
 * Build the Snap/site insight payload from a scored analyze() result.
 * @param {{ verdict, findings, chain, addr, meta }} result
 * @param {{ reasonFn?: Function, txNotes?: object[], limit?: number }} opt
 */
export function insightFromResult(result, opt = {}) {
  const v = result?.verdict || { level: 'unknown', points: 0, critical: false };
  const reasonFn = opt.reasonFn || ((f) => reasonText(f));
  const findings = [...(result?.findings || [])];

  // Solana parity for Snap "pre-sign" caution: surface authority tip when mint/freeze fail.
  const authFail = findings.some((f) => (f.id === 'mintAuth' || f.id === 'freezeAuth') && f.status === 'fail');
  const txNotes = [...(opt.txNotes || [])];
  if (authFail && !txNotes.some((n) => n.id === 'preSignAuthority')) {
    txNotes.push({ id: 'preSignAuthority', status: 'fail', critical: true, params: {} });
  }

  const scored = topInsightReasons(findings, { limit: opt.limit || 5 }).map((f) => ({
    id: f.id,
    status: f.status,
    critical: !!f.critical,
    weight: f.weight || 0,
    text: reasonFn(f),
  }));

  const notes = txNotes.map((n) => ({
    id: n.id,
    status: n.status || 'warn',
    critical: !!n.critical,
    weight: 0,
    text: reasonFn(n),
    context: true,
  }));

  // Context notes first when critical (e.g. unlimited approve / authority tip)
  const reasons = [...notes.filter((n) => n.critical), ...scored, ...notes.filter((n) => !n.critical)].slice(0, (opt.limit || 5) + notes.length);

  const level = v.level || 'unknown';
  return {
    level,
    label: LEVEL_LABEL[level] || level,
    points: v.points ?? 0,
    critical: !!v.critical || level === 'extreme' || notes.some((n) => n.critical && n.status === 'fail'),
    // MetaMask Flask transaction-insight severity (only "critical" is valid)
    mmSeverity: level === 'extreme' || v.critical || notes.some((n) => n.critical && n.id === 'txUnlimitedApprove') ? 'critical' : undefined,
    reasons,
    chain: result?.chain || null,
    ca: result?.addr || null,
    symbol: result?.meta?.symbol || null,
    name: result?.meta?.name || null,
    methodologyUrl: 'https://memecheck.pages.dev/how',
    siteUrl: result?.addr && result?.chain
      ? `https://memecheck.pages.dev/?ca=${encodeURIComponent(result.addr)}&chain=${encodeURIComponent(result.chain)}`
      : 'https://memecheck.pages.dev',
  };
}

/** Decode common ERC-20 approve/transfer selectors from raw tx data. */
export function decodeEvmTxNotes(transaction) {
  const notes = [];
  const to = String(transaction?.to || '').toLowerCase();
  const data = String(transaction?.data || '0x').toLowerCase();
  if (!to || !/^0x[0-9a-f]{40}$/.test(to)) return { token: null, notes };
  const sel = data.slice(0, 10);
  if (sel === '0x095ea7b3' && data.length >= 138) {
    const spender = '0x' + data.slice(34, 74);
    const amount = data.slice(74, 138);
    const unlimited = /^f+$/i.test(amount);
    notes.push({
      id: unlimited ? 'txUnlimitedApprove' : 'txApprove',
      status: unlimited ? 'fail' : 'warn',
      critical: unlimited,
      params: { spender, token: to },
    });
    return { token: to, notes };
  }
  if (sel === '0xa9059cbb' || sel === '0x23b872dd') {
    return { token: to, notes };
  }
  return { token: to, notes }; // treat `to` as the contract under review (router/token/unknown)
}

export const CHAIN_ID_MAP = {
  'eip155:1': 'ethereum',
  'eip155:56': 'bsc',
  'eip155:8453': 'base',
  'eip155:42161': 'arbitrum',
};
