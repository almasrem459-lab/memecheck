// Fetches the verdict from MemeCheckShield (server-side computed; cached result first, then /api/deep). No other hosts.
const ORIGIN = 'https://memecheck.pages.dev';
const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, EVM = /^0x[0-9a-fA-F]{40}$/;
const memo = new Map();
async function verdict(ca, chain) {
  const k = chain + ':' + ca, m = memo.get(k); if (m && Date.now() - m.at < 5 * 60e3) return m.v;
  let v = null;
  for (let i = 0; i < 6 && !v; i++) {
    const r = await fetch(`${ORIGIN}/api/deep?ca=${encodeURIComponent(ca)}&chain=${chain}&kind=core`);
    if (r.status === 200) { const j = await r.json(); const d = j?.data; v = d?.verdict ? { level: d.verdict.level, points: d.verdict.points, sym: d.meta?.symbol || '', at: j.at } : null; break; }
    if (r.status === 202) await new Promise(ok => setTimeout(ok, 2500)); else break;
  }
  memo.set(k, { at: Date.now(), v }); return v;
}
chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg?.type !== 'mc-verdict') return;
  const ca = String(msg.ca || ''), chain = String(msg.chain || 'solana');
  if (!(SOL.test(ca) || EVM.test(ca)) || !/^(solana|ethereum|bsc|base|arbitrum)$/.test(chain)) { send(null); return; }
  verdict(ca, chain).then(send, () => send(null)); return true;
});
