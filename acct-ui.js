// Shared client for wallet sign-in + USDC payments (Pro, API keys, Boost). Used by /pro, /account, /api-docs, /projects, /project.
// Sign-in = the wallet signs a plain text message (no transaction, no fees). Payments = normal USDC transfer, then paste the signature.
export const lang = () => ((localStorage.getItem('mc_lang') || 'en') === 'ar' ? 'ar' : 'en');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const T = {
  en: { login: 'Sign in with Solana wallet', logout: 'Sign out', signed: 'Signed in as', pro: 'Pro', until: 'until', free: 'Free', noWallet: 'No Solana wallet found. Install Phantom, Solflare or Backpack, or open this page in your wallet app browser.', openPhantom: 'Open in Phantom', openSolflare: 'Open in Solflare', signing: 'Check your wallet to sign…', loginErr: 'Sign-in failed', loginNote: 'You sign a short text message only — no transaction, no fees, no email.',
    payTitle: 'Pay with USDC (Solana)', payStep1: 'Send', payStep1b: 'USDC on Solana to', payOpen: 'Open in wallet (Solana Pay)', copy: 'Copy address', copied: 'Copied', payStep2: 'Then paste the transaction signature:', verify: 'Verify payment', verifying: 'Checking on-chain…', payOk: 'Payment confirmed', payTip: 'Pay from the signed-in wallet (or keep the memo mc:<your wallet>). Payments are final; paid features never change any risk score.',
    errs: { bad_tx: 'That is not a valid transaction signature.', tx_already_used: 'This transaction was already used.', tx_not_found: 'Transaction not found yet — wait ~30 s and retry.', tx_failed: 'That transaction failed on-chain.', tx_too_old: 'Transaction older than 7 days.', amount_low: 'Amount too low.', not_your_tx: 'Not sent from your signed-in wallet (and no memo with your wallet).', login_required: 'Please sign in first.', rpc: 'Solana RPC busy — retry in a minute.', limit: 'Limit reached.', max_keys: 'Max 3 active keys.', boost_required: 'Only the wallet that paid a Boost for this token can edit it.', db_not_bound: 'Accounts are not available on this deployment yet.' } },
  ar: { login: 'تسجيل الدخول بمحفظة سولانا', logout: 'تسجيل الخروج', signed: 'مسجّل باسم', pro: 'Pro', until: 'حتى', free: 'مجاني', noWallet: 'لم نجد محفظة سولانا. ثبّت Phantom أو Solflare أو Backpack، أو افتح الصفحة داخل متصفح تطبيق المحفظة.', openPhantom: 'افتح في Phantom', openSolflare: 'افتح في Solflare', signing: 'وقّع الرسالة في محفظتك…', loginErr: 'فشل تسجيل الدخول', loginNote: 'توقّع رسالة نصية قصيرة فقط — بدون معاملة، بدون رسوم، بدون بريد.',
    payTitle: 'الدفع بـ USDC (سولانا)', payStep1: 'أرسل', payStep1b: 'USDC على سولانا إلى', payOpen: 'افتح في المحفظة (Solana Pay)', copy: 'نسخ العنوان', copied: 'تم النسخ', payStep2: 'ثم الصق توقيع المعاملة:', verify: 'تحقّق من الدفع', verifying: 'جارٍ التحقق على السلسلة…', payOk: 'تم تأكيد الدفع', payTip: 'ادفع من المحفظة المسجّلة (أو أبقِ المذكرة mc:<محفظتك>). المدفوعات نهائية؛ الميزات المدفوعة لا تغيّر أي درجة مخاطر أبدًا.',
    errs: { bad_tx: 'هذا ليس توقيع معاملة صالحًا.', tx_already_used: 'تم استخدام هذه المعاملة مسبقًا.', tx_not_found: 'لم نجد المعاملة بعد — انتظر ٣٠ ثانية وأعد المحاولة.', tx_failed: 'فشلت المعاملة على السلسلة.', tx_too_old: 'المعاملة أقدم من ٧ أيام.', amount_low: 'المبلغ أقل من المطلوب.', not_your_tx: 'لم تُرسل من محفظتك المسجّلة (ولا توجد مذكرة بمحفظتك).', login_required: 'سجّل الدخول أولًا.', rpc: 'شبكة سولانا مشغولة — أعد المحاولة بعد دقيقة.', limit: 'تم بلوغ الحد.', max_keys: 'الحد ٣ مفاتيح نشطة.', boost_required: 'فقط المحفظة التي دفعت Boost لهذا التوكن يمكنها التعديل.', db_not_bound: 'الحسابات غير متاحة على هذا النشر بعد.' } },
};
export const t = (k) => T[lang()][k] ?? T.en[k];
export const errText = (j) => (T[lang()].errs[j?.err] || T.en.errs[j?.err] || j?.err || 'Error') + (j?.need ? ` (${j.need} USDC)` : '') + (j?.received != null ? ` — ${j.received} USDC` : '');
export async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' } : { credentials: 'same-origin' });
  const j = await r.json().catch(() => ({})); j._status = r.status; return j;
}
let meP = null;
export const me = (fresh) => (fresh || !meP ? (meP = api('/api/auth')) : meP);
const prov = () => window.phantom?.solana || window.solflare || window.backpack?.solana || window.solana || null;
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (u8) => btoa(String.fromCharCode(...u8));
export async function login() {
  const p = prov(); if (!p) { const e = new Error('no_wallet'); e.code = 'no_wallet'; throw e; }
  const c = await p.connect(); const wallet = (c?.publicKey || p.publicKey).toString();
  const msg = `${location.host} wants you to sign in with your Solana account:\n${wallet}\n\nSign in to MemeCheckShield. This only proves you own this wallet: no transaction, no fees.\n\nURI: ${location.origin}\nIssued At: ${new Date().toISOString()}\nNonce: ${hex(16)}`;
  const r = await p.signMessage(new TextEncoder().encode(msg), 'utf8'); const sig = r?.signature || r;
  const j = await api('/api/auth', { action: 'login', wallet, message: msg, signature: b64(new Uint8Array(sig)) });
  if (!j.ok) throw new Error(j.err || 'login'); me(true); return j;
}
export async function logout() { await api('/api/auth', { action: 'logout' }); me(true); }
const short = (w) => w ? w.slice(0, 4) + '…' + w.slice(-4) : '';
const css = `.mc-ac{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.mc-ac .muted{margin:0}.mc-in{width:100%;box-sizing:border-box;background:#0e1320;border:1px solid #273046;border-radius:10px;color:#e6e9ef;padding:9px 10px;font:inherit;margin:4px 0 8px}
.mc-lab{display:block;font-size:13px;color:#9aa4b8;margin-top:6px}.mc-pay{background:#0e1320;border:1px solid #1c2333;border-radius:12px;padding:12px;margin-top:10px}.mc-pay code{word-break:break-all;font-size:12px}
.mc-main{background:#2563eb!important;border-color:#2563eb!important;color:#fff!important}.mc-ok{color:#3ee08f}.mc-bad{color:#ff6b81}.mc-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid #273046}
.mc-tier{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.mc-tier .card{margin:0}.mc-tier h3{margin:0 0 4px}.mc-tier .p{font-size:22px;font-weight:800}
.mc-tbl{width:100%;border-collapse:collapse;font-size:13px}.mc-tbl td,.mc-tbl th{padding:6px;border-top:1px solid #1a2130;text-align:start}pre.mc-code{background:#0e1320;border:1px solid #1c2333;border-radius:10px;padding:10px;overflow:auto;font-size:12px;direction:ltr;text-align:left}
.lv-low{color:#3ee08f;border-color:#3ee08f55}.lv-medium{color:#ffd447;border-color:#ffd44755}.lv-high{color:#ff9f43;border-color:#ff9f4355}.lv-extreme{color:#ff4d6a;border-color:#ff4d6a55}.lv-unknown{color:#9aa4b8}`;
export function style() { if (document.getElementById('mc-ac-css')) return; const s = document.createElement('style'); s.id = 'mc-ac-css'; s.textContent = css; document.head.appendChild(s); }
// Renders the sign-in / signed-in bar into el. onChange(user|null) after load and after login/logout.
export async function authBar(el, onChange) {
  style();
  const draw = async (fresh) => {
    const u = await me(fresh);
    if (u.wallet) {
      el.innerHTML = `<div class="mc-ac"><span class="muted">${esc(t('signed'))} <b dir="ltr">${esc(short(u.wallet))}</b> · <span class="mc-pill ${u.pro ? 'lv-low' : ''}">${u.pro ? esc(t('pro')) + ' ' + esc(t('until')) + ' ' + new Date(u.proUntil).toLocaleDateString() : esc(t('free'))}</span></span><button class="act" type="button" data-x="out">${esc(t('logout'))}</button></div>`;
      el.querySelector('[data-x=out]').onclick = async () => { await logout(); draw(true); };
    } else {
      el.innerHTML = `<div class="mc-ac"><button class="act mc-main" type="button" data-x="in">${esc(t('login'))}</button><span class="muted" data-x="msg">${esc(t('loginNote'))}</span></div>`;
      el.querySelector('[data-x=in]').onclick = async () => {
        const m = el.querySelector('[data-x=msg]'); m.textContent = t('signing');
        try { await login(); draw(true); }
        catch (e) {
          if (e.code === 'no_wallet') { const u2 = encodeURIComponent(location.href); m.innerHTML = `${esc(t('noWallet'))} <a href="https://phantom.app/ul/browse/${u2}?ref=${encodeURIComponent(location.origin)}">${esc(t('openPhantom'))}</a> · <a href="https://solflare.com/ul/v1/browse/${u2}?ref=${encodeURIComponent(location.origin)}">${esc(t('openSolflare'))}</a>`; }
          else m.textContent = t('loginErr') + ': ' + (T[lang()].errs[e.message] || e.message || '');
        }
      };
    }
    onChange && onChange(u.wallet ? u : null);
  };
  await draw(false);
  return { refresh: () => draw(true) };
}
// Payment box: amount, Solana Pay link, copy address, paste signature, submit(tx) -> server json.
export function payBox(el, { usdc, payTo, link, label, submit, onOk }) {
  style();
  el.innerHTML = `<div class="mc-pay"><b>${esc(t('payTitle'))}${label ? ' — ' + esc(label) : ''}</b>
<p class="muted">1. ${esc(t('payStep1'))} <b>${usdc} USDC</b> ${esc(t('payStep1b'))}<br><code dir="ltr">${esc(payTo)}</code></p>
<div class="mc-ac">${link ? `<a class="act mc-main" href="${esc(link)}">${esc(t('payOpen'))}</a>` : ''}<button class="act" type="button" data-x="cp">${esc(t('copy'))}</button></div>
<label class="mc-lab">2. ${esc(t('payStep2'))}<input class="mc-in" data-x="tx" dir="ltr" autocomplete="off" spellcheck="false" placeholder="5Sx…" maxlength="100"></label>
<button class="act" type="button" data-x="go">${esc(t('verify'))}</button> <span class="muted" data-x="st" role="status"></span>
<p class="muted">${esc(t('payTip'))}</p></div>`;
  el.querySelector('[data-x=cp]').onclick = async (e) => { try { await navigator.clipboard.writeText(payTo); e.target.textContent = t('copied'); } catch {} };
  el.querySelector('[data-x=go]').onclick = async () => {
    const st = el.querySelector('[data-x=st]'), tx = el.querySelector('[data-x=tx]').value.trim(); st.className = 'muted'; st.textContent = t('verifying');
    const j = await submit(tx).catch(() => ({ err: 'rpc' }));
    if (j.ok) { st.className = 'mc-ok'; st.textContent = t('payOk'); onOk && onOk(j); } else { st.className = 'mc-bad'; st.textContent = errText(j); }
  };
}
export const lvl = (l) => { const ar = lang() === 'ar'; const m = { low: ['Low risk', 'خطر منخفض'], medium: ['Medium risk', 'خطر متوسط'], high: ['High risk', 'خطر مرتفع'], extreme: ['Extreme risk', 'خطر شديد'], unknown: ['Not scanned yet', 'لم يُفحص بعد'] }[l] || ['Not scanned yet', 'لم يُفحص بعد']; return `<span class="mc-pill lv-${esc(l || 'unknown')}">${esc(ar ? m[1] : m[0])}</span>`; };
export function applyAR(AR) {
  const ar = lang() === 'ar'; document.documentElement.lang = ar ? 'ar' : 'en'; document.documentElement.dir = ar ? 'rtl' : 'ltr';
  if (ar) document.querySelectorAll('[data-s]').forEach((e) => { const k = e.getAttribute('data-s'); if (AR[k]) e.innerHTML = AR[k]; });
}
