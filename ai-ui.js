// AI summary + "Ask AI" card (POST /api/ai, Cloudflare Workers AI). Loads only after the main scan has finished
// (app.js exposes the final, dev-history-adjusted result via window.__mcLast) and never blocks or breaks the scan:
// any error shows a calm "unavailable" line. Answers are grounded in the compact scan below; nothing else is sent.
import { T, usd } from './i18n.js?v=1793201025';
const L = {
  en: { title: 'AI summary', beta: 'beta', reading: 'Reading the scan…', na: 'AI summary unavailable right now.', busy: 'AI is busy right now. Try again in a few minutes.', retry: 'Retry',
    bl: 'Bottom line', nfa: 'Not financial advice. AI can make mistakes; check the findings below.', ask: 'Ask AI about this token', ph: 'Ask about this token…', send: 'Ask',
    sugg: ['Can I sell?', 'What do the flags mean?', 'If I hold 1% what is it worth?'], left: (n) => n === 1 ? '1 question left for this token' : `${n} questions left for this token`, none: 'Question limit reached for this token in this session.',
    thinking: 'Thinking…', err: 'AI could not answer right now. Your question was not counted.', you: 'You', ai: 'AI', grounded: 'Answers use only this scan’s data. Asks about risk, holders, liquidity, taxes, mint/freeze, socials, flags, and bag math. Never asks for keys or money.' },
  ar: { title: 'ملخص الذكاء الاصطناعي', beta: 'تجريبي', reading: 'جارٍ قراءة الفحص…', na: 'ملخص الذكاء الاصطناعي غير متاح حاليًا.', busy: 'الذكاء الاصطناعي مشغول حاليًا. حاول بعد دقائق.', retry: 'إعادة المحاولة',
    bl: 'الخلاصة', nfa: 'ليست نصيحة مالية. قد يخطئ الذكاء الاصطناعي؛ راجع النتائج أدناه.', ask: 'اسأل الذكاء الاصطناعي عن هذه العملة', ph: 'اسأل عن هذه العملة…', send: 'اسأل',
    sugg: ['هل أستطيع البيع؟', 'ماذا تعني الأعلام؟', 'إذا ملكت 1٪ كم تساوي؟'], left: (n) => n === 1 ? 'بقي سؤال واحد لهذه العملة' : n === 2 ? 'بقي سؤالان لهذه العملة' : `بقي ${n} أسئلة لهذه العملة`, none: 'وصلت إلى حد الأسئلة لهذه العملة في هذه الجلسة.',
    thinking: 'جارٍ التفكير…', err: 'تعذّر على الذكاء الاصطناعي الإجابة الآن. لم يُحتسب سؤالك.', you: 'أنت', ai: 'AI', grounded: 'الإجابات من بيانات هذا الفحص فقط (المخاطر، الحاملين، السيولة، الضرائب، السك/التجميد، الروابط، الأعلام، وحساب الحقيبة). لا يطلب مفاتيح أو أموالاً.' }
};
const MAXQ = 10, MAXLEN = 200;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// keep $1.2K / ~35.6% / 20 / 3 left-to-right inside Arabic text (same idea as the share card)
const NUM = /[~≈]?[-+]?[$]?\d[\d.,]*(?:\s?[%KMBk$])?(?:\s?\/\s?[$]?\d[\d.,]*%?)?/g;
const fmt = (s) => esc(s).replace(NUM, (m) => `<bdi dir="ltr">${m}</bdi>`);
const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
const ga = (n, p) => { try { window.__mcGa?.(n, p); } catch {} };
const pct = (v) => v == null || !isFinite(v) ? '' : `${v > 0 ? '+' : ''}${(+v).toFixed(1)}%`;
// compact, English, pre-formatted scan (the model copies numbers instead of computing them)
function compact(r) {
  const m = r.meta || {}, en = T.en, ageH = m.created ? (Date.now() - m.created) / 3.6e6 : null;
  const say = (f) => { try { return String(en.r[f.id] ? en.r[f.id](f.params || {}, f.status) : f.id); } catch { return f.id; } };
  const out = { chain: r.chain, ca: r.addr, symbol: m.symbol || '', name: m.name || '', level: r.verdict?.level, score: r.verdict?.points, partial: !!r.partial,
    market: { price: m.priceUsd != null ? usd(m.priceUsd) : '', mcap: m.mcap != null ? usd(m.mcap) : '', fdv: m.fdv != null ? usd(m.fdv) : '', liq: m.liquidity > 0 ? usd(m.liquidity) : m.launch?.curve ? 'bonding curve (no DEX pool yet)' : '',
      vol: m.vol24 != null ? usd(m.vol24) : '', txns: m.buys24 != null ? `${m.buys24} buys / ${m.sells24} sells` : '', ch1h: pct(m.ch?.h1), ch24: pct(m.ch?.h24),
      age: ageH == null ? '' : ageH < 48 ? `${ageH.toFixed(1)} hours` : `${(ageH / 24).toFixed(0)} days`, holders: m.totalHolders ?? '', drop: m.dropFromHigh >= 50 ? `about ${Math.round(m.dropFromHigh)}%` : '',
      launch: m.launch?.four ? (m.launch.curve ? `Four.meme bonding curve, ${Math.round(m.launch.progress || 0)}% to graduation` : 'graduated from Four.meme') : '' },
    findings: (r.findings || []).map(f => ({ s: f.status, t: say(f).replace(/\$0\.0{6,}(?!\d*[1-9])\d*/g, '$0') })),
    holders: (r.extra?.holders || []).slice(0, 5).map(h => ({ w: String(h.owner || '').length > 12 ? h.owner.slice(0, 4) + '…' + h.owner.slice(-4) : h.owner, p: (+h.pct).toFixed(2) + '%' })),
    flags: (r.flags || []).slice(0, 8).map(x => {
      const head = `${x.name || ''}${x.level ? ` (${x.level})` : ''}`;
      const desc = String(x.desc || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      return desc ? `${head}: ${desc}` : head;
    }),
    socials: (m.socials || []).slice(0, 6).map(s => ({ t: String(s.t || 'social').slice(0, 24), u: String(s.u || '').slice(0, 140) })).filter(s => /^https?:\/\//i.test(s.u)) };
  if (m.priceUsd != null && isFinite(+m.priceUsd) && +m.priceUsd > 0) out.priceUsd = +m.priceUsd;
  if (m.mcap != null && isFinite(+m.mcap) && +m.mcap > 0) out.mcapUsd = +m.mcap;
  if (m.liquidity > 0 && isFinite(+m.liquidity)) out.liqUsd = +m.liquidity;
  return out;
}


// Hard refuse: seed phrases / private keys / "send money" scam prompts (never forward to the model).
function localRefuse(q) {
  const ql = String(q || '').toLowerCase(), ar = lang() === 'ar';
  if (/\b(seed\s*phrase|recovery\s*phrase|mnemonic|private\s*key|secret\s*key|مفتاح\s*خاص|عبارة\s*الاسترداد)\b/i.test(ql)
    || /\b(send|transfer|wire)\s+(me\s+)?(your\s+)?(sol|eth|bnb|btc|usdt|usdc|crypto|money|funds|coins?)\b/i.test(ql)
    || /\b(أرسل|حول|حوّل).{0,20}(أموالك|محفظتك|عملات|USDT|SOL)\b/i.test(ql)
    || /\b(how to (scam|phish|drain)|rug (them|holders)|steal (wallets?|keys?))\b/i.test(ql)) {
    return ar
      ? 'لن أطلب أبدًا عبارة الاسترداد أو المفاتيح الخاصة أو تحويل أموال. لا تشاركها مع أحد. أشرح فقط بيانات هذا الفحص.'
      : 'I never ask for seed phrases, private keys, or for anyone to send money. Do not share those with anyone. I only explain this scan\'s data.';
  }
  return null;
}

// Client-side valuation for clear holdings/price questions (fraction of supply × mcap, or tokens × price).
// Keeps Ask AI on-topic when the model would otherwise refuse "math" as a prediction.
function localWorth(q, scan) {
  const price = +scan.priceUsd, mcap = +scan.mcapUsd, ar = lang() === 'ar';
  const raw = String(q || ''), ql = raw.toLowerCase();
  if (/\b(will|predict|prediction|target|moon|pump to|reach|tomorrow|next week|غدا|توقع|هدف)\b/i.test(ql)) return null;
  const wantsWorth = /\b(worth|value|valuat|how much|bag|holding|holdings|priced?|if i (have|hold|own|buy)|كم|قيمة|يساوي|تساوي|سعر)\b/i.test(ql);
  let pct = null, fracLabel = '';
  const frac = raw.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (frac) { const a = +frac[1], b = +frac[2]; if (b > 0 && a >= 0 && a / b <= 1.0001) { pct = (a / b) * 100; fracLabel = `${frac[1]}/${frac[2]}`; } }
  if (pct == null) { const pm = raw.match(/(\d+(?:\.\d+)?)\s*%/); if (pm) { pct = +pm[1]; fracLabel = `${pm[1]}%`; } }
  let tokens = null;
  const tm = raw.match(/(\d+(?:\.\d+)?)\s*(k|m|b)?\s*(tokens?|coins?|توكن|عملة)\b/i);
  if (tm) { const mul = ({ k: 1e3, m: 1e6, b: 1e9 }[(tm[2] || '').toLowerCase()] || 1); tokens = +tm[1] * mul; }
  const shortFrac = !!(frac && raw.length < 100);
  if (pct != null && pct > 0 && pct <= 100 && (wantsWorth || shortFrac)) {
    if (!(mcap > 0)) return ar
      ? `هذا الفحص لا يعرض القيمة السوقية، فلا أستطيع تحويل ${fracLabel || (pct + '%')} من المعروض إلى دولار${price > 0 ? ` (السعر الحالي ${usd(price)})` : ''}.`
      : `This scan has no market cap, so I can't convert ${fracLabel || (pct + '%')} of supply to USD${price > 0 ? ` (current price ${usd(price)})` : ''}.`;
    const val = mcap * (pct / 100);
    return ar
      ? `إذا كانت حصتك ${fracLabel || (pct + '%')} من المعروض، فبحدود ${usd(val)} اليوم (≈ ${pct}% من القيمة السوقية ${usd(mcap)}). من أرقام هذا الفحص فقط — ليس توقعاً للسعر.`
      : `If you hold ${fracLabel || (pct + '%')} of supply, that is about ${usd(val)} at today's market cap (${usd(mcap)} × ${pct}%). From this scan's current figures only — not a price prediction.`;
  }
  if (tokens != null && tokens > 0 && price > 0 && (wantsWorth || /\b(tokens?|coins?|توكن)\b/i.test(ql))) {
    const val = tokens * price;
    return ar
      ? `${tokens} توكن ≈ ${usd(val)} بسعر ${usd(price)} من هذا الفحص (رقم حالي، ليس توقعاً).`
      : `${tokens} tokens ≈ ${usd(val)} at this scan's price of ${usd(price)} (current figure only — not a prediction).`;
  }
  if (/^(what('?s| is)|how much is|current)?\s*(the\s+)?(token\s+)?price\b/i.test(ql.trim()) || /^(كم(?:\s+هو)?\s+السعر|ما(?:\s+هو)?\s+السعر)\b/i.test(ql.trim())) {
    if (price > 0) return ar
      ? `السعر الحالي في هذا الفحص: ${usd(price)}${mcap > 0 ? `، والقيمة السوقية ${usd(mcap)}.` : '.'}`
      : `This scan's current price is ${usd(price)}${mcap > 0 ? `; market cap ${usd(mcap)}.` : '.'}`;
  }
  return null;
}

const st = { key: '', tok: '', sum: null, sumLang: '', loading: false, err: '', chats: new Map(), busy: false, req: 0 };
const cnt = (tok) => { try { return +sessionStorage.getItem('mc_ai_q:' + tok) || 0; } catch { return 0; } };
const bump = (tok) => { try { sessionStorage.setItem('mc_ai_q:' + tok, cnt(tok) + 1); } catch {} };
async function post(body, ms = 25000) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal }); const j = await r.json().catch(() => null); return j && j.ok ? j : { ok: false, error: j?.error || (r.status === 429 ? 'rate_limited' : 'unavailable') }; }
  catch { return { ok: false, error: 'unavailable' }; } finally { clearTimeout(tm); }
}
function paint(full) {
  const box = document.getElementById('ai-box'); if (!box || !st.tok) return;
  const t = L[lang()], lv = st.scan?.level || 'unknown';
  let card = box.querySelector('#ai-card');
  if (!card || full) {
    box.innerHTML = `<div class="card ai-card" id="ai-card" aria-live="polite"><div class="ai-h"><span class="ai-spark" aria-hidden="true">✦</span><h3>${t.title}</h3><span class="ai-beta">${t.beta}</span></div><div class="ai-body"></div><p class="ai-nfa">${t.nfa}</p>
      <div class="ai-chat"><div class="ai-ch">${t.ask}</div><div class="ai-msgs"></div><div class="ai-sugg"></div>
      <form class="ai-ask" autocomplete="off"><input type="text" maxlength="${MAXLEN}" placeholder="${esc(t.ph)}" aria-label="${esc(t.ph)}" dir="auto" enterkeyhint="send"><button type="submit">${t.send}</button></form>
      <div class="ai-meta"><span class="ai-left"></span><span class="ai-gr">${t.grounded}</span></div></div></div>`;
    card = box.querySelector('#ai-card');
    card.querySelector('form').onsubmit = (e) => { e.preventDefault(); const i = e.currentTarget.querySelector('input'); ask(i.value); };
    card.querySelector('.ai-sugg').onclick = (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent); };
  }
  const body = card.querySelector('.ai-body');
  if (st.loading) body.innerHTML = `<div class="ai-skel" aria-label="${t.reading}"><i></i><i></i><i></i></div><div class="ai-wait"><span class="spin sm"></span> ${t.reading}</div>`;
  else if (st.sum) body.innerHTML = `<p class="ai-sum" dir="auto">${fmt(st.sum.summary)}</p>${st.sum.bottom ? `<div class="ai-bl ${esc(lv)}"><b>${t.bl}:</b> <span dir="auto">${fmt(st.sum.bottom)}</span></div>` : ''}`;
  else body.innerHTML = `<div class="ai-na"><span>${st.err === 'rate_limited' ? t.busy : t.na}</span> <button type="button" class="ghost act ai-retry">${t.retry}</button></div>`;
  body.querySelector('.ai-retry')?.addEventListener('click', () => { st.key = ''; sync(true); });
  // chat
  const chat = st.chats.get(st.tok) || [], used = cnt(st.tok), left = Math.max(0, MAXQ - used);
  card.querySelector('.ai-msgs').innerHTML = chat.map(c => `<div class="ai-q" dir="auto">${fmt(c.q)}</div><div class="ai-a ${c.err ? 'err' : ''}" dir="auto">${c.pending ? `<span class="spin sm"></span> ${t.thinking}` : fmt(c.a)}</div>`).join('');
  const asked = new Set(chat.map(c => c.q));
  card.querySelector('.ai-sugg').innerHTML = left && !st.busy ? t.sugg.filter(s => !asked.has(s)).map(s => `<button type="button" class="ai-chip">${esc(s)}</button>`).join('') : '';
  const inp = card.querySelector('input'), btn = card.querySelector('.ai-ask button');
  inp.disabled = btn.disabled = !left || st.busy; inp.placeholder = left ? t.ph : t.none;
  card.querySelector('.ai-left').textContent = left ? t.left(left) : t.none;
}
async function ask(q0) {
  const q = String(q0 || '').replace(/\s+/g, ' ').trim().slice(0, MAXLEN), tok = st.tok, scan = st.scan;
  if (q.length < 2 || st.busy || !scan || cnt(tok) >= MAXQ) return;
  const chat = st.chats.get(tok) || []; st.chats.set(tok, chat);
  const item = { q, a: '', pending: true }; chat.push(item); st.busy = true;
  const inp = document.querySelector('#ai-card input'); if (inp) inp.value = '';
  paint(); ga('ai_ask', { ca: scan.ca, chain: scan.chain, lang: lang() });
  const refused = localRefuse(q);
  if (refused) {
    item.pending = false; item.a = refused; st.busy = false; bump(tok);
    if (st.tok === tok) paint();
    document.querySelector('#ai-card .ai-msgs')?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  const local = localWorth(q, scan);
  if (local) {
    item.pending = false; item.a = local; st.busy = false; bump(tok);
    if (st.tok === tok) paint();
    document.querySelector('#ai-card .ai-msgs')?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  const hist = chat.filter(c => c !== item && !c.err && c.a).slice(-2).map(c => ({ q: c.q, a: c.a }));
  const j = await post({ mode: 'ask', lang: lang(), scan, question: q, history: hist });
  item.pending = false; st.busy = false;
  if (j.ok && j.answer) { item.a = j.answer; bump(tok); } else { item.a = j.error === 'rate_limited' ? L[lang()].busy : L[lang()].err; item.err = true; }
  if (st.tok === tok) paint();
  if (!item.err) document.querySelector('#ai-card .ai-msgs')?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
let tm = 0;
function sync(now) {
  const r = window.__mcLast?.(), box = document.getElementById('ai-box');
  if (!r || !box || r.verdict?.level === 'unknown' && !(r.findings || []).length) { if (box && !r) box.innerHTML = ''; return; }
  const lg = lang(), tok = `${r.chain}:${r.addr}`;
  const key = `${tok}|${lg}|${r.verdict?.level}|${r.verdict?.points}`;
  if (key === st.key) { if (st.waitDev && window.__mcDevHist?.has(r.addr)) { st.waitDev = false; clearTimeout(tm); tm = setTimeout(() => load(key), 50); } // dev history landed: no need to wait longer
    if (!box.querySelector('#ai-card')) paint(true); else if (st.sumLang !== lg) paint(true); return; }
  const tokChanged = tok !== st.tok;
  st.key = key; st.tok = tok; st.scan = compact(r); st.loading = true; st.sum = tokChanged ? null : st.sum; st.err = '';
  paint(true);
  clearTimeout(tm);
  // Solana: give the developer-history check (score nudge) a moment so the summary matches the final score
  const dh = window.__mcDevHist, waitDev = r.chain === 'solana' && dh && !dh.has(r.addr);
  st.waitDev = !now && waitDev;
  tm = setTimeout(() => { st.waitDev = false; load(key); }, now ? 0 : waitDev ? 3500 : 300);
}
async function load(key) {
  if (key !== st.key) return;
  const r = window.__mcLast?.(); if (r) { const k2 = `${r.chain}:${r.addr}|${lang()}|${r.verdict?.level}|${r.verdict?.points}`; if (k2 !== key) return sync(); }
  const my = ++st.req, lg = lang();
  const j = await post({ mode: 'summary', lang: lg, scan: st.scan });
  if (my !== st.req || key !== st.key) return;
  st.loading = false; st.sumLang = lg;
  if (j.ok && j.summary) { st.sum = j; ga('ai_summary', { ca: st.scan.ca, chain: st.scan.chain, lang: lg, cached: !!j.cached }); } else { st.sum = null; st.err = j.error || 'unavailable'; }
  paint(true);
}
const later = () => setTimeout(() => { try { sync(); } catch {} }, 0);
document.addEventListener('mc:final', later); document.addEventListener('mc:render', later); document.addEventListener('mc:devhist', later);
