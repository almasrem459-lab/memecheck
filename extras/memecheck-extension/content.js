// Detects the token address from the page URL and shows a small MemeCheckShield badge. All text via textContent (no HTML injection).
(() => {
  const SOL = /[1-9A-HJ-NP-Za-km-z]{32,44}/, EVM = /0x[0-9a-fA-F]{40}/;
  const LBL = { low: 'No major red flags', medium: 'Medium risk', high: 'High risk', extreme: 'EXTREME risk', unknown: 'Unknown' };
  const COL = { low: '#1f9d6b', medium: '#b8860b', high: '#d43c3c', extreme: '#8b0000', unknown: '#555' };
  const DS_CH = { solana: 'solana', ethereum: 'ethereum', bsc: 'bsc', base: 'base', arbitrum: 'arbitrum' };
  function detect() {
    const u = new URL(location.href), p = u.pathname;
    if (location.host === 'pump.fun') { const m = /^\/(?:coin\/)?([1-9A-HJ-NP-Za-km-z]{32,44})/.exec(p); return m ? { ca: m[1], chain: 'solana' } : null; }
    if (location.host === 'dexscreener.com') { // /solana/<pair> — the token mint is in the page's token links
      const ch = p.split('/')[1]; if (!DS_CH[ch]) return null;
      const a = [...document.querySelectorAll('a[href*="solscan.io/token/"],a[href*="etherscan.io/token/"],a[href*="bscscan.com/token/"],a[href*="basescan.org/token/"],a[href*="arbiscan.io/token/"]')][0];
      const m = a && (ch === 'solana' ? SOL : EVM).exec(a.href.split('/token/')[1] || ''); return m ? { ca: m[0], chain: ch } : null; }
    if (location.host.endsWith('tinyastro.io')) { const m = SOL.exec(u.searchParams.get('tokenAddress') || ''); if (m) return { ca: m[0], chain: 'solana' };
      const a = document.querySelector('a[href*="solscan.io/token/"]'); const n = a && SOL.exec(a.href.split('/token/')[1] || ''); return n ? { ca: n[0], chain: 'solana' } : null; }
    return null;
  }
  let shown = '', box = null;
  function badge(t, col, href) {
    if (!box) { box = document.createElement('a'); box.target = '_blank'; box.rel = 'noopener';
      Object.assign(box.style, { position: 'fixed', right: '14px', bottom: '14px', zIndex: 2147483647, padding: '8px 12px', borderRadius: '10px', font: '600 13px system-ui,sans-serif', color: '#fff', textDecoration: 'none', boxShadow: '0 4px 16px rgba(0,0,0,.35)' });
      document.documentElement.appendChild(box); }
    box.textContent = t; box.style.background = col; box.href = href;
  }
  async function tick() {
    const d = detect(); if (!d) return; const k = d.chain + ':' + d.ca; if (k === shown) return; shown = k;
    const href = `https://memecheck.pages.dev/token/${d.ca}`;
    badge('🛡 MemeCheckShield: checking…', '#333', href);
    const v = await chrome.runtime.sendMessage({ type: 'mc-verdict', ca: d.ca, chain: d.chain }).catch(() => null);
    if (shown !== k) return;
    if (!v) { badge('🛡 MemeCheckShield: open full check', '#333', `https://memecheck.pages.dev/?ca=${d.ca}`); return; }
    badge(`🛡 ${LBL[v.level] || v.level} · ${v.points} pts`, COL[v.level] || '#555', href);
  }
  tick(); setInterval(tick, 2000); // SPA navigation
})();
