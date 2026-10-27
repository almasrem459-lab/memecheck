/* Telegram / calls channel win-rate checker — paste CAs the channel called; score with DexScreener + heuristics.
   Honest about Telegram scrape limits. Stores nothing sensitive. EN+AR. */
const L = {
  en: {
    title: 'Calls channel win-rate checker',
    sub: 'Paste contract addresses a Telegram calls channel promoted (one per line). Optional: CA then timestamp. We cannot freely scrape Telegram — paste the list yourself.',
    ph: 'CA or CA timestamp\nSo1111…\n…',
    channel: 'Channel username / invite (optional note, not scraped)',
    channelPh: '@some_calls_channel or t.me/…',
    run: 'Score these calls',
    clear: 'Clear',
    scoring: 'Scoring…',
    need: 'Paste at least one Solana or 0x contract address.',
    summary: 'Best-effort outcomes',
    rugged: 'Rugged / gone',
    dead: 'Near-zero / dead',
    live: 'Still tradeable',
    risky: 'High risk now',
    unknown: 'Unknown',
    win: 'Still-tradeable rate',
    limit: 'Limits: we do not scrape Telegram. Outcomes use live DexScreener liquidity/mcap + MemeCheck risk when available. “Rugged” ≈ no pair or liquidity vanished. “Dead” ≈ mcap under $10K or −90% from ATH when detectable. Not financial advice; past ≠ future.',
    open: 'Open scan',
    n: 'Calls scored',
  },
  ar: {
    title: 'فاحص نسبة فوز قنوات الاستدعاء',
    sub: 'الصق عناوين العقود اللي قناة تيليغرام نادَت عليها (سطر لكل عنوان). اختياري: العنوان بعدين وقت. ما فينا نسحح تيليغرام بحرية — الصق القائمة بنفسك.',
    ph: 'CA أو CA وقت\nSo1111…\n…',
    channel: 'يوزرنيم / دعوة القناة (ملاحظة اختيارية، ما منسححها)',
    channelPh: '@some_calls_channel أو t.me/…',
    run: 'قيّم هالاستدعاءات',
    clear: 'مسح',
    scoring: 'عم نقيّم…',
    need: 'الصق على الأقل عنوان سولانا أو 0x.',
    summary: 'نتائج تقريبية',
    rugged: 'مسحوب / اختفى',
    dead: 'شبه صفر / ميت',
    live: 'لسا بيتداول',
    risky: 'خطر عالي هلق',
    unknown: 'مجهول',
    win: 'نسبة اللي لسا بيتداول',
    limit: 'حدود: ما منسحح تيليغرام. النتائج من سيولة/قيمة DexScreener + خطر MemeCheck لما يتوفر. “مسحوب” ≈ ما في زوج أو السيولة اختفت. “ميت” ≈ قيمة تحت 10 آلاف$ أو هبوط ~90%. مو نصيحة مالية.',
    open: 'افتح الفحص',
    n: 'استدعاءات مُقيَّمة',
  },
};
const t = () => L[document.documentElement.lang === 'ar' ? 'ar' : 'en'] || L.en;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CA_RE = /(?:^|\s)([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40})(?:\s|$)/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

function parseLines(text) {
  const out = [], seen = new Set();
  for (const raw of String(text || '').split(/\n+/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const m = line.match(CA_RE); if (!m) continue;
    const ca = m[1];
    if (!SOL_RE.test(ca) && !EVM_RE.test(ca)) continue;
    const key = ca.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
    out.push({ ca, chain: EVM_RE.test(ca) ? 'evm' : 'solana' });
    if (out.length >= 40) break;
  }
  return out;
}

async function scoreOne(item) {
  const ca = item.ca;
  let pairs = [];
  try {
    const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + encodeURIComponent(ca), { headers: { accept: 'application/json' } });
    if (r.ok) {
      const j = await r.json();
      pairs = (j.pairs || []).filter((p) => {
        if (item.chain === 'solana') return (p.chainId || '').toLowerCase() === 'solana';
        return /^0x/i.test(ca);
      });
    }
  } catch {}
  pairs.sort((a, b) => (+b.liquidity?.usd || 0) - (+a.liquidity?.usd || 0));
  const p = pairs[0];
  const liq = p?.liquidity?.usd != null ? +p.liquidity.usd : null;
  const mcap = p?.marketCap != null ? +p.marketCap : (p?.fdv != null ? +p.fdv : null);
  const ch = p?.priceChange?.h24 != null ? +p.priceChange.h24 : null;
  const sym = p?.baseToken?.symbol || '?';
  let status = 'unknown', level = null;
  if (!p || (liq == null && mcap == null)) status = 'rugged';
  else if (liq != null && liq < 100) status = 'rugged';
  else if ((mcap != null && mcap < 10000) || (ch != null && ch <= -90)) status = 'dead';
  else if (liq != null && liq >= 2000) status = 'live';
  else status = 'dead';
  // Optional: snap-insight risk for live ones
  if (status === 'live' && item.chain === 'solana') {
    try {
      const r = await fetch(`/api/snap-insight?chain=solana&ca=${encodeURIComponent(ca)}`);
      if (r.ok) {
        const j = await r.json();
        level = j?.insight?.level || null;
        if (level === 'extreme' || level === 'high') status = 'risky';
      }
    } catch {}
  }
  return { ca, sym, status, level, liq, mcap, ch, url: p?.url || `/?ca=${encodeURIComponent(ca)}` };
}

function paintSummary(rows) {
  const T = t();
  const counts = { rugged: 0, dead: 0, live: 0, risky: 0, unknown: 0 };
  rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const n = rows.length || 1;
  const tradeable = counts.live + counts.risky;
  const win = Math.round(100 * tradeable / n);
  const host = document.getElementById('calls-summary');
  host.innerHTML = `
    <div class="stat"><div class="stat-n">${rows.length}</div><div class="stat-l">${esc(T.n)}</div></div>
    <div class="stat"><div class="stat-n">${win}%</div><div class="stat-l">${esc(T.win)}</div></div>
    <div class="stat"><div class="stat-n" style="color:#ff6b81">${counts.rugged}</div><div class="stat-l">${esc(T.rugged)}</div></div>
    <div class="stat"><div class="stat-n" style="color:#ffd447">${counts.dead}</div><div class="stat-l">${esc(T.dead)}</div></div>
    <div class="stat"><div class="stat-n" style="color:#3ee08f">${counts.live}</div><div class="stat-l">${esc(T.live)}</div></div>
    <div class="stat"><div class="stat-n" style="color:#ff8fa0">${counts.risky}</div><div class="stat-l">${esc(T.risky)}</div></div>`;
  const list = document.getElementById('calls-list');
  const label = { rugged: T.rugged, dead: T.dead, live: T.live, risky: T.risky, unknown: T.unknown };
  const st = { rugged: 'fail', dead: 'warn', live: 'pass', risky: 'fail', unknown: 'na' };
  list.innerHTML = rows.map((r) => `<div class="calls-row">
    <span class="st ${st[r.status]}">${esc(label[r.status])}</span>
    <span><b>$${esc(r.sym)}</b> <span class="mono muted" dir="ltr">${esc(r.ca.slice(0, 4))}…${esc(r.ca.slice(-4))}</span>
      ${r.mcap != null ? ` · mcap $${Math.round(r.mcap).toLocaleString()}` : ''}${r.liq != null ? ` · liq $${Math.round(r.liq).toLocaleString()}` : ''}${r.level ? ` · ${esc(r.level)}` : ''}</span>
    <a class="ghost act" href="/?ca=${encodeURIComponent(r.ca)}" style="margin-inline-start:auto">${esc(T.open)}</a>
  </div>`).join('');
}

function applyLabels() {
  const T = t();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('calls-title', T.title);
  set('calls-sub', T.sub);
  set('calls-limit', T.limit);
  set('calls-channel-label', T.channel);
  set('calls-run', T.run);
  set('calls-clear', T.clear);
  const ta = document.getElementById('calls-input'); if (ta) ta.placeholder = T.ph;
  const ch = document.getElementById('calls-channel'); if (ch) ch.placeholder = T.channelPh;
}

async function run() {
  const T = t();
  const items = parseLines(document.getElementById('calls-input')?.value || '');
  const status = document.getElementById('calls-status');
  if (!items.length) { status.textContent = T.need; return; }
  status.textContent = T.scoring;
  document.getElementById('calls-run').disabled = true;
  const rows = [];
  for (const it of items) {
    rows.push(await scoreOne(it));
    paintSummary(rows);
    status.textContent = `${T.scoring} ${rows.length}/${items.length}`;
  }
  status.textContent = '';
  document.getElementById('calls-run').disabled = false;
}

document.getElementById('calls-run')?.addEventListener('click', run);
document.getElementById('calls-clear')?.addEventListener('click', () => {
  const ta = document.getElementById('calls-input'); if (ta) ta.value = '';
  document.getElementById('calls-summary').innerHTML = '';
  document.getElementById('calls-list').innerHTML = '';
  document.getElementById('calls-status').textContent = '';
});
applyLabels();
new MutationObserver(applyLabels).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
export {};
