// Buy/Sell: Solana via the Jupiter Plugin; BNB Chain / Ethereum / Base as plain links to PancakeSwap / Uniswap (Four.meme
// page while the token is still on its bonding curve) with the token prefilled. Trades are signed in the user's own wallet; this site never sees keys.
// FEE: set REFERRAL_ACCOUNT to the owner's Jupiter Ultra referral account (created at https://referral.jup.ag).
// While empty, swaps work normally WITHOUT any fee and the fee note is hidden. If the referral token account for the
// order's fee mint is missing, Jupiter still executes the swap, just without the fee (never fails the swap).
export const REFERRAL_ACCOUNT = '';
export const REFERRAL_FEE_BPS = 50; // 0.5%
const SOL = 'So11111111111111111111111111111111111111112';
const FEE_ON = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(REFERRAL_ACCOUNT);
const L = {
  en: { buy: 'Buy', sell: 'Sell', fee: 'Includes 0.5% MemeCheck fee', via: 'Swap via Jupiter · signed in your own wallet',
    wT: '⚠️ High-risk token', wB: (lvl) => `MemeCheck rated this token ${lvl} risk. You could lose everything: rug pulls, frozen wallets or blocked sells are common with tokens like this.`,
    wC: 'I understand the risk, continue', wX: 'Cancel', load: 'Loading swap…', err: 'Swap widget failed to load. Try again later.',
    evia: (d) => `Opens ${d} in a new tab · trade in your own wallet`, curve: 'Still on the Four.meme bonding curve: trades happen on four.meme' },
  ar: { buy: 'شراء', sell: 'بيع', fee: 'يشمل رسوم MemeCheck بنسبة 0.5%', via: 'التبادل عبر Jupiter · التوقيع في محفظتك الخاصة',
    wT: '⚠️ عملة عالية الخطورة', wB: (lvl) => `صنّف MemeCheck هذه العملة بخطورة ${lvl}. قد تخسر كل شيء: سحب السيولة أو تجميد المحفظة أو منع البيع شائع في مثل هذه العملات.`,
    wC: 'أفهم المخاطرة، متابعة', wX: 'إلغاء', load: 'جارٍ تحميل التبادل…', err: 'تعذّر تحميل أداة التبادل. حاول لاحقًا.',
    evia: (d) => `يفتح ${d} في نافذة جديدة · التداول من محفظتك الخاصة`, curve: 'ما زالت على منحنى الترابط في Four.meme: التداول يتم على four.meme' } };
const LVL = { en: { high: 'HIGH', extreme: 'EXTREME' }, ar: { high: 'عالية', extreme: 'شديدة' } };
let plugin = null;
function loadPlugin() {
  if (window.Jupiter?.init) return Promise.resolve();
  return plugin ||= new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://plugin.jup.ag/plugin-v1.js'; s.async = true; s.onload = ok; s.onerror = () => { plugin = null; no(); }; document.head.appendChild(s); });
}
// Safety: Jupiter rejects orders whose referralAccount is not initialized, so probe once and fall back to no-fee swaps.
let feeProbe = null;
const feeOk = () => feeProbe ||= fetch(`https://ultra-api.jup.ag/order?inputMint=${SOL}&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=10000000&swapMode=ExactIn&referralAccount=${REFERRAL_ACCOUNT}&referralFee=${REFERRAL_FEE_BPS}`)
  .then(r => r.json()).then(d => !d.error && !!d.outAmount).catch(() => false);
const blocked = (r) => r.findings.some(f => f.status === 'fail' && ['honeypot', 'cannotBuy', 'gpHoneypot', 'hpIs', 'rugged'].includes(f.id))
  || r.flags.some(x => /honeypot|cannot sell|can'?t sell/i.test(x.name || '') && /danger|high/i.test(x.level || ''));
const risky = (r) => ['high', 'extreme'].includes(r.verdict.level);
async function open(r, side, t) {
  const out = side === 'buy' ? r.addr : SOL, inp = side === 'buy' ? SOL : r.addr;
  try { await loadPlugin(); } catch { alert(t.err); return; }
  const formProps = { initialInputMint: inp, initialOutputMint: out, fixedMint: r.addr, ...(side === 'buy' ? { initialAmount: '100000000' } : {}) };
  if (FEE_ON && await feeOk()) Object.assign(formProps, { referralAccount: REFERRAL_ACCOUNT, referralFee: REFERRAL_FEE_BPS });
  window.Jupiter.init({ displayMode: 'modal', formProps, branding: { name: 'MemeCheck', logoUri: location.origin + '/icon-192.png' } });
}
function warn(r, t, lang, go) {
  const d = document.createElement('div'); d.className = 'mc-modal'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = `<div class="mc-mbox"><h3>${t.wT}</h3><p>${t.wB((LVL[lang] || LVL.en)[r.verdict.level] || r.verdict.level)}</p><div class="mc-mact"><button type="button" class="ghost act" data-x>${t.wX}</button><button type="button" class="act danger" data-c>${t.wC}</button></div></div>`;
  const close = () => d.remove();
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-x]')) close(); else if (e.target.closest('[data-c]')) { close(); go(); } });
  document.body.appendChild(d); d.querySelector('[data-x]').focus();
}
let cur = null;
function mount() {
  if (!cur) return; const { r, lang } = cur; document.getElementById('swapbar')?.remove();
  if (document.getElementById('out')?.dataset.addr !== r.addr) return;
  if (blocked(r)) return; // confirmed honeypot / can't buy / rugged: no trade buttons
  if (EVM_DEX[r.chain]) return mountEvm(r, lang);
  if (r.chain !== 'solana') return;
  const t = L[lang] || L.en, acts = document.querySelector('#vcard .acts'); if (!acts) return;
  const bar = document.createElement('div'); bar.id = 'swapbar'; bar.className = 'swapbar';
  bar.innerHTML = `<button type="button" class="act buy" data-s="buy">${t.buy}</button><button type="button" class="act sell" data-s="sell">${t.sell}</button><span class="muted swn"><span class="swfee"></span>${t.via}</span>`;
  bar.addEventListener('click', (ev) => { const b = ev.target.closest('[data-s]'); if (!b) return;
    try { if (typeof gtag === 'function') gtag('event', 'trade_click', { action: b.dataset.s, provider: 'jupiter', risk_level: r.verdict?.level, chain: r.chain, ca: r.addr }); } catch {}
    const go = () => open(r, b.dataset.s, t); risky(r) ? warn(r, t, lang, go) : go(); });
  acts.before(bar);
  if (FEE_ON) feeOk().then(ok => { const n = bar.querySelector('.swfee'); if (ok && n) n.textContent = t.fee + ' · '; });
}
// EVM: no embedded widget, just deep links (BNB Chain -> PancakeSwap, Ethereum / Base / Arbitrum -> Uniswap)
const EVM_DEX = {
  bsc: { name: 'PancakeSwap', buy: (a) => `https://pancakeswap.finance/swap?chain=bsc&inputCurrency=BNB&outputCurrency=${a}`, sell: (a) => `https://pancakeswap.finance/swap?chain=bsc&inputCurrency=${a}&outputCurrency=BNB` },
  ethereum: { name: 'Uniswap', buy: (a) => `https://app.uniswap.org/swap?chain=mainnet&inputCurrency=ETH&outputCurrency=${a}`, sell: (a) => `https://app.uniswap.org/swap?chain=mainnet&inputCurrency=${a}&outputCurrency=ETH` },
  arbitrum: { name: 'Uniswap', buy: (a) => `https://app.uniswap.org/swap?chain=arbitrum&inputCurrency=ETH&outputCurrency=${a}`, sell: (a) => `https://app.uniswap.org/swap?chain=arbitrum&inputCurrency=${a}&outputCurrency=ETH` },
  base: { name: 'Uniswap', buy: (a) => `https://app.uniswap.org/swap?chain=base&inputCurrency=ETH&outputCurrency=${a}`, sell: (a) => `https://app.uniswap.org/swap?chain=base&inputCurrency=${a}&outputCurrency=ETH` },
};
function mountEvm(r, lang) {
  const t = L[lang] || L.en, acts = document.querySelector('#vcard .acts'); if (!acts) return;
  if (!r.meta?.pairAddr && !r.meta?.launch?.four) return; // no market found: nothing sensible to link
  const a = r.addr.toLowerCase(), curve = r.chain === 'bsc' && r.meta?.launch?.curve, d = EVM_DEX[r.chain];
  const name = curve ? 'four.meme' : d.name, buy = curve ? `https://four.meme/token/${a}` : d.buy(a), sell = curve ? buy : d.sell(a);
  const bar = document.createElement('div'); bar.id = 'swapbar'; bar.className = 'swapbar';
  bar.innerHTML = `<a class="act buy" data-s="buy" data-action="buy" data-provider="${curve ? 'fourmeme' : d.name.toLowerCase()}" href="${buy}" target="_blank" rel="noopener">${t.buy}</a><a class="act sell" data-s="sell" data-action="sell" data-provider="${curve ? 'fourmeme' : d.name.toLowerCase()}" href="${sell}" target="_blank" rel="noopener">${t.sell}</a><span class="muted swn">${t.evia(name)}</span>`;
  bar.addEventListener('click', (ev) => { const b = ev.target.closest('a[data-s]'); if (!b || !risky(r)) return; ev.preventDefault(); warn(r, t, lang, () => window.open(b.href, '_blank', 'noopener')); });
  acts.before(bar);
}
document.addEventListener('mc:render', (e) => { cur = e.detail; mount(); });
const outEl = document.getElementById('out');
if (outEl) new MutationObserver(() => { if (cur && document.getElementById('vcard') && !document.getElementById('swapbar')) mount(); }).observe(outEl, { childList: true });
