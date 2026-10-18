// Visual Liquidity Flows map — interactive canvas (green = organic, red = wash-like).
// Listens for mc:render (Solana only). Data from /api/liquidity-flows.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const short = (a) => a && a.length > 12 ? a.slice(0, 4) + '…' + a.slice(-4) : (a || '');
const CHN = { en: { bsc: 'BNB Chain', ethereum: 'Ethereum', base: 'Base' }, ar: { bsc: 'سلسلة BNB', ethereum: 'إيثريوم', base: 'Base' } }; // EVM chain names for the 'not available yet' line
const L = {
  en: {
    title: 'Liquidity flows', arTitle: 'خريطة السيولة المتحركة',
    loading: 'Tracing money into the pool…',
    err: 'Liquidity flow data unavailable right now.',
    empty: 'Not enough recent pool trades to draw flows yet.',
    retry: 'Retry',
    notSol: 'Liquidity flows are mapped for Solana tokens only.', notEvm: (c) => `Not available on ${c} yet. Liquidity flows currently map Solana pools only.`,
    organic: 'Organic (real traders)',
    sus: 'Suspicious (wash-like)',
    hint: 'Tap a wallet or arrow · click again to clear',
    hintMouse: 'Hover for details · click to highlight connected flows',
    lp: 'Liquidity pool',
    in: 'into LP', out: 'out of LP',
    sol: 'SOL', trades: 'trades',
    why: 'Why flagged',
    creator: 'Creator',
    summary: (s) => s.suspicious
      ? `${s.suspicious} suspicious · ${s.organic} organic · ~${s.susSol} SOL flagged / ~${s.organicSol} SOL organic`
      : `${s.organic || s.wallets || 0} wallets · ~${s.organicSol || 0} SOL organic (no wash flags in sample)`,
    note: 'Demo v1: recent swaps around the pool. Red = round-trips, fast flips, creator, or burst trading — not proof of guilt. DYOR.',
    noPool: 'No Solana pool found for this mint.',
    timeout: 'Timed out loading flows. Try again.',
    rateLimited: 'RPC is busy right now — try again in a minute.',
    noSigs: 'Could not load recent pool transactions.',
    noFlows: 'Recent pool txs found, but no clear swap flows could be parsed yet.',
    explorer: 'Solscan ↗',
    clear: 'Clear selection',
    orgLbl: { organic: 'Organic volume', suspicious: 'Suspicious volume', wash: 'Wash-like volume' },
    orgSent: (o) => `${o.topShare}% of the last ${o.trades} swaps came from ${o.top} wallet${o.top === 1 ? '' : 's'} (${o.wallets} unique wallets).`,
  },
  ar: {
    title: 'تدفقات السيولة', arTitle: 'خريطة السيولة المتحركة',
    loading: 'جارٍ تتبع الأموال إلى المجمع…',
    err: 'بيانات التدفق غير متاحة حاليًا.',
    empty: 'لا توجد صفقات حديثة كافية لرسم التدفقات.',
    retry: 'إعادة المحاولة',
    notSol: 'خريطة تدفقات السيولة متاحة لعملات سولانا فقط.', notEvm: (c) => `غير متاح على ${c} بعد. خريطة تدفقات السيولة تدعم مجمعات سولانا فقط حاليًا.`,
    organic: 'طبيعي (متداولون حقيقيون)',
    sus: 'مشبوه (غسيل حجم)',
    hint: 'اضغط محفظة أو سهم · اضغط مرة ثانية للإلغاء',
    hintMouse: 'مرّر للتفاصيل · اضغط لإبراز التدفقات المرتبطة',
    lp: 'مجمع السيولة',
    in: 'إلى المجمع', out: 'من المجمع',
    sol: 'SOL', trades: 'صفقات',
    why: 'سبب الإشارة',
    creator: 'المنشئ',
    summary: (s) => s.suspicious
      ? `${s.suspicious} مشبوه · ${s.organic} طبيعي · ~${s.susSol} SOL معلّم / ~${s.organicSol} SOL طبيعي`
      : `${s.organic || s.wallets || 0} محفظة · ~${s.organicSol || 0} SOL طبيعي (لا إشارات غسيل في العينة)`,
    note: 'نسخة تجريبية: صفقات حديثة حول المجمع. الأحمر = ذهاب وإياب، قلب سريع، المنشئ، أو رشقات — ليس إثباتًا. ابحث بنفسك.',
    noPool: 'لا يوجد مجمع سولانا لهذه العملة.',
    timeout: 'انتهت مهلة التحميل. حاول مجددًا.',
    rateLimited: 'الشبكة مشغولة الآن — حاول بعد دقيقة.',
    noSigs: 'تعذر تحميل معاملات المجمع الأخيرة.',
    noFlows: 'وُجدت معاملات للمجمع، لكن لم تُستخرج تدفقات مبادلة واضحة بعد.',
    explorer: 'Solscan ↗',
    clear: 'إلغاء التحديد',
    orgLbl: { organic: 'حجم تداول طبيعي', suspicious: 'حجم تداول مشبوه', wash: 'حجم يشبه التداول الوهمي' },
    orgSent: (o) => `${o.topShare}% من آخر ${o.trades} صفقة جاءت من ${o.top} محافظ (${o.wallets} محفظة مختلفة).`,
  },
};
const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
const GREEN = '#3ee08f', RED = '#ff4d6a', ORANGE = '#ff8f3e', LP_COL = '#4f9dff', MUTED = '#6b7280';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const cache = new Map(), DELAY = 0;
let cur = null, anim = null, inst = null;

function layout(nodes, w, h) {
  const cx = w / 2, cy = h / 2;
  const lp = nodes.find(n => n.kind === 'lp');
  const wallets = nodes.filter(n => n.kind === 'wallet');
  const pos = new Map();
  if (lp) pos.set(lp.id, { x: cx, y: cy, r: 28, n: lp });
  const R = Math.min(w, h) * 0.36;
  wallets.forEach((n, i) => {
    const a = -Math.PI / 2 + (i / Math.max(wallets.length, 1)) * Math.PI * 2;
    const rr = n.sus ? 16 : 13;
    pos.set(n.id, { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, r: rr, n });
  });
  return pos;
}

function mapView(canvas, data, onPick) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let pos = new Map();
  let sel = null; // node id or edge id
  let hover = null;
  const particles = [];
  let raf = 0, alive = true, t0 = performance.now();

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(280, rect.width);
    H = Math.max(260, Math.min(420, rect.width * 0.75));
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pos = layout(data.nodes, W, H);
    // seed particles along edges
    particles.length = 0;
    for (const e of data.edges) {
      const n = Math.max(1, Math.min(4, Math.ceil(e.sol / 0.5) || 1));
      for (let i = 0; i < n; i++) {
        particles.push({ e, t: Math.random(), speed: 0.0015 + Math.random() * 0.0025 + Math.min(0.003, (e.sol || 0) * 0.0004) });
      }
    }
  }

  function dimmed(id) {
    if (!sel) return false;
    if (sel === id) return false;
    if (sel === 'LP') return id !== 'LP' && !data.edges.some(e => (e.from === id || e.to === id));
    // selected wallet: keep LP + that wallet + its edges
    if (data.nodes.some(n => n.id === sel)) {
      return id !== sel && id !== 'LP' && !data.edges.some(e => e.id === sel && (e.from === id || e.to === id) || ((e.from === sel || e.to === sel) && (id === e.from || id === e.to || id === e.id)));
    }
    // selected edge
    const edge = data.edges.find(e => e.id === sel);
    if (edge) return id !== edge.id && id !== edge.from && id !== edge.to;
    return false;
  }

  function edgeDim(e) {
    if (!sel) return false;
    if (sel === e.id) return false;
    if (sel === 'LP') return false;
    if (data.nodes.some(n => n.id === sel)) return e.from !== sel && e.to !== sel;
    return true;
  }

  function drawArrow(x1, y1, x2, y2, color, width, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    // slight curve
    const mx = (x1 + x2) / 2 + (y2 - y1) * 0.08;
    const my = (y1 + y2) / 2 - (x2 - x1) * 0.08;
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(mx, my, x2, y2);
    ctx.stroke();
    // arrow head near target
    const t = 0.88;
    const ax = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2;
    const ay = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2;
    const bx = 2 * (1 - t) * (mx - x1) + 2 * t * (x2 - mx);
    const by = 2 * (1 - t) * (my - y1) + 2 * t * (y2 - my);
    const ang = Math.atan2(by, bx);
    const ah = 7;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - ah * Math.cos(ang - 0.4), ay - ah * Math.sin(ang - 0.4));
    ctx.lineTo(ax - ah * Math.cos(ang + 0.4), ay - ah * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return { mx, my };
  }

  function quadPoint(x1, y1, mx, my, x2, y2, t) {
    const u = 1 - t;
    return { x: u * u * x1 + 2 * u * t * mx + t * t * x2, y: u * u * y1 + 2 * u * t * my + t * t * y2 };
  }

  function paint(now) {
    if (!alive) return;
    ctx.clearRect(0, 0, W, H);
    // soft vignette bg
    ctx.fillStyle = '#0e1320';
    ctx.fillRect(0, 0, W, H);

    const curves = new Map(); // edge id -> {x1,y1,mx,my,x2,y2,color}

    for (const e of data.edges) {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) continue;
      const col = e.sus ? RED : GREEN;
      const dim = edgeDim(e);
      const alpha = dim ? 0.12 : (sel === e.id || hover === e.id ? 1 : 0.55);
      const width = Math.max(1.5, Math.min(5, 1.2 + Math.log10(1 + (e.sol || 0)) * 2));
      // shorten to node rims
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const x1 = a.x + (dx / len) * (a.r + 2);
      const y1 = a.y + (dy / len) * (a.r + 2);
      const x2 = b.x - (dx / len) * (b.r + 2);
      const y2 = b.y - (dy / len) * (b.r + 2);
      const c = drawArrow(x1, y1, x2, y2, col, width, alpha);
      curves.set(e.id, { x1, y1, mx: c.mx, my: c.my, x2, y2, color: col, e });
    }

    // particles
    if (!reduce()) {
      const dt = Math.min(40, now - t0); t0 = now;
      for (const p of particles) {
        const c = curves.get(p.e.id);
        if (!c) continue;
        if (edgeDim(p.e)) continue;
        p.t += p.speed * (dt / 16);
        if (p.t > 1) p.t -= 1;
        const pt = quadPoint(c.x1, c.y1, c.mx, c.my, c.x2, c.y2, p.t);
        ctx.beginPath();
        ctx.fillStyle = c.color;
        ctx.globalAlpha = 0.85;
        ctx.arc(pt.x, pt.y, p.e.sus ? 3.2 : 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // nodes
    for (const [id, p] of pos) {
      const n = p.n;
      const isLp = n.kind === 'lp';
      const dim = dimmed(id) && !(sel && (id === 'LP' || id === sel));
      // fix dim logic for wallets when another wallet selected
      let alpha = 1;
      if (sel) {
        if (sel === id || id === 'LP') alpha = 1;
        else if (data.edges.some(e => e.id === sel && (e.from === id || e.to === id))) alpha = 1;
        else if (data.nodes.some(x => x.id === sel) && data.edges.some(e => (e.from === sel || e.to === sel) && (e.from === id || e.to === id))) alpha = 1;
        else alpha = 0.18;
      }
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      const col = isLp ? LP_COL : (n.sus ? RED : GREEN);
      ctx.fillStyle = col;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      if (sel === id || hover === id) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = '#0b0f17';
      ctx.font = `700 ${isLp ? 11 : 10}px system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isLp ? 'LP' : (n.sus ? '!' : '•'), p.x, p.y);
      // label under node
      ctx.fillStyle = '#e6e9ef';
      ctx.font = '600 10px ui-monospace,monospace';
      ctx.globalAlpha = alpha * 0.95;
      ctx.fillText(n.short || short(id), p.x, p.y + p.r + 11);
      ctx.globalAlpha = 1;
    }

    raf = requestAnimationFrame(paint);
  }

  function hit(x, y) {
    // nodes first
    let best = null, bestD = 1e9;
    for (const [id, p] of pos) {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d <= p.r + 6 && d < bestD) { bestD = d; best = { type: 'node', id }; }
    }
    if (best) return best;
    // edges: distance to curve midpoint approx
    for (const e of data.edges) {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.08;
      const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.08;
      // sample a few points
      for (let t = 0.2; t <= 0.8; t += 0.15) {
        const u = 1 - t;
        const px = u * u * a.x + 2 * u * t * mx + t * t * b.x;
        const py = u * u * a.y + 2 * u * t * my + t * t * b.y;
        if (Math.hypot(x - px, y - py) < 10) return { type: 'edge', id: e.id };
      }
    }
    return null;
  }

  function clientXY(ev) {
    const r = canvas.getBoundingClientRect();
    const t = ev.touches?.[0] || ev.changedTouches?.[0] || ev;
    return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) };
  }

  const onMove = (ev) => {
    const { x, y } = clientXY(ev);
    const h = hit(x, y);
    const id = h?.id || null;
    if (id !== hover) {
      hover = id;
      canvas.style.cursor = id ? 'pointer' : 'default';
      onPick?.({ hover: id, sel });
    }
  };
  const onLeave = () => { hover = null; onPick?.({ hover: null, sel }); };
  const onClick = (ev) => {
    const { x, y } = clientXY(ev);
    const h = hit(x, y);
    sel = h && sel === h.id ? null : (h?.id || null);
    onPick?.({ hover, sel });
  };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onClick);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(canvas.parentElement || canvas);
  resize();
  raf = requestAnimationFrame(paint);

  return {
    destroy() {
      alive = false; cancelAnimationFrame(raf);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onClick);
      ro?.disconnect();
    },
    clear() { sel = null; onPick?.({ hover, sel: null }); },
    getSel: () => sel,
  };
}

function detailHtml(data, id, t) {
  if (!id) return `<span class="muted" style="margin:0">${t.hint}</span>`;
  if (id === 'LP') {
    const p = data.pool || {};
    return `<div><span class="lf-dot" style="background:${LP_COL}"></span><b>${t.lp}</b> · ${esc(p.dexId || '')}</div>
      <div class="mono muted" dir="ltr">${esc(p.pair || '')}</div>
      <p style="margin:6px 0 0">Liq ${p.liqUsd != null ? '$' + Math.round(p.liqUsd).toLocaleString() : '—'} · 24h vol ${p.vol24 != null ? '$' + Math.round(p.vol24).toLocaleString() : '—'}</p>
      ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">DexScreener ↗</a>` : ''}`;
  }
  const edge = data.edges.find(e => e.id === id);
  if (edge) {
    const col = edge.sus ? RED : GREEN;
    return `<div><span class="lf-dot" style="background:${col}"></span><b>${edge.side === 'buy' ? t.in : t.out}</b>
      · <span class="${edge.sus ? 'dn' : 'up'}">${edge.sus ? t.sus : t.organic}</span></div>
      <p style="margin:6px 0"><b dir="ltr">${edge.sol}</b> ${t.sol} · ${edge.n} ${t.trades}
      · <span class="mono" dir="ltr">${esc(short(edge.side === 'buy' ? edge.from : edge.to))}</span></p>
      ${edge.reasons?.length ? `<p style="margin:4px 0"><span class="muted">${t.why}:</span> ${edge.reasons.map(esc).join(' · ')}</p>` : ''}
      ${edge.sigs?.[0] ? `<a href="https://solscan.io/tx/${esc(edge.sigs[0])}" target="_blank" rel="noopener">${t.explorer}</a>` : ''}`;
  }
  const n = data.nodes.find(x => x.id === id);
  if (!n) return '';
  const col = n.sus ? RED : GREEN;
  return `<div><span class="lf-dot" style="background:${col}"></span><b class="mono" dir="ltr">${esc(n.short)}</b>
    ${n.isCreator ? ` <span class="st warn">${t.creator}</span>` : ''}
    · <span class="${n.sus ? 'dn' : 'up'}">${n.sus ? t.sus : t.organic}</span></div>
    <div class="mono muted" dir="ltr" style="font-size:11px">${esc(n.id)}</div>
    <p style="margin:6px 0">↑ <b dir="ltr">${n.solIn}</b> ${t.sol} (${n.buys}) · ↓ <b dir="ltr">${n.solOut}</b> ${t.sol} (${n.sells})</p>
    ${n.reasons?.length ? `<p style="margin:4px 0"><span class="muted">${t.why}:</span> ${n.reasons.map(esc).join(' · ')}</p>` : ''}
    <div class="lf-acts"><a href="https://solscan.io/account/${esc(n.id)}" target="_blank" rel="noopener">${t.explorer}</a>
      <button type="button" class="ghost act" id="lf-clear">${t.clear}</button></div>`;
}

const ORG_CLS = { organic: 'pass', suspicious: 'warn', wash: 'fail' };
function orgBadge(o, t) { // nothing when the server could not judge (too few swaps)
  if (!o || !ORG_CLS[o.level] || !(o.trades > 0)) return '';
  return `<div class="lf-org"><span class="st ${ORG_CLS[o.level]}">${esc(t.orgLbl[o.level])}</span> <span class="muted">${esc(t.orgSent(o))}</span></div>`;
}
function draw(box, data) {
  const t = L[lang()];
  if (inst) { inst.destroy(); inst = null; }
  const sum = data.summary || {};
  box.innerHTML = `
    <div class="lf-head"><h3>${t.title} <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· ${t.arTitle}</span></h3></div>
    ${orgBadge(data.organic, t)}<p class="lf-sum">${esc(t.summary(sum))}</p>
    <div class="lflg"><span><i style="background:${GREEN}"></i>${t.organic}</span><span><i style="background:${RED}"></i>${t.sus}</span><span><i style="background:${LP_COL}"></i>${t.lp}</span></div>
    <div class="lf-stage"><canvas id="lf-cv" width="600" height="360" aria-label="${esc(t.title)}"></canvas></div>
    <div class="lf-panel" id="lf-panel"></div>
    <p class="muted lf-hint">${matchMedia('(pointer:fine)').matches ? t.hintMouse : t.hint}</p>
    <details class="fn"><summary title="info">ⓘ</summary><div>${t.note}${data.src ? ` · src: ${esc(data.src)}` : ''}${data.parsed != null ? ` · ${data.parsed} swaps` : ''}</div></details>`;
  const cv = box.querySelector('#lf-cv');
  const panel = box.querySelector('#lf-panel');
  const update = ({ sel, hover }) => {
    const id = sel || hover;
    panel.innerHTML = detailHtml(data, id, t);
    panel.querySelector('#lf-clear')?.addEventListener('click', () => inst?.clear());
  };
  panel.innerHTML = detailHtml(data, null, t);
  inst = mapView(cv, data, update);
}

function isBusy(j) {
  return !!(j && (j.soft || j.reason === 'rate_limited' || j.reason === 'timeout'));
}
async function fetchFlows(mint, retry = false) {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 22000);
  try {
    const r = await fetch('/api/liquidity-flows?mint=' + encodeURIComponent(mint) + (retry ? '&retry=1' : ''), { signal: ctl.signal });
    // Never surface raw HTTP 429/503 — bilingual soft degrade only
    if (r.status === 429 || r.status === 503) {
      return { ok: true, empty: true, soft: true, reason: 'rate_limited' };
    }
    if (!r.ok) throw new Error('unavailable');
    const j = await r.json();
    // Strip any accidental raw status text from message
    if (j && typeof j.message === 'string' && /\b429\b|HTTP\s*429/i.test(j.message)) {
      j.message = undefined;
      j.reason = j.reason || 'rate_limited';
      j.soft = true;
    }
    return j;
  } finally { clearTimeout(tm); }
}

function ensureBox() {
  let box = document.getElementById('lf-box');
  if (box) return box;
  const out = document.getElementById('out');
  if (!out) return null;
  box = document.createElement('div');
  box.id = 'lf-box';
  box.className = 'card';
  const bm = document.getElementById('bm-box');
  if (bm) bm.after(box); else out.appendChild(box);
  return box;
}

function paint() {
  if (!cur) return;
  const t = L[lang()];
  const box = ensureBox();
  if (!box) return;
  const d = cache.get(cur.addr);
  box.hidden = false; delete box.dataset.skel;
  if (d && d !== 'loading') document.dispatchEvent(new CustomEvent('mc:flows', { detail: { addr: cur.addr, data: d } })); // Buy / Sell pressure card reuses this sample
  if (!d || d === 'loading') {
    if (inst) { inst.destroy(); inst = null; }
    box.innerHTML = `<h3>${t.title}</h3><div><span class="spin"></span> ${t.loading}</div>`;
    return;
  }
  if (d.error) {
    if (inst) { inst.destroy(); inst = null; }
    box.innerHTML = `<h3>${t.title}</h3><span class="muted">${d.timeout ? t.timeout : t.err}</span>
      <button type="button" class="ghost act" id="lf-retry">${t.retry}</button>`;
    $('#lf-retry')?.addEventListener('click', () => { cache.delete(cur.addr); start(cur.addr, true); });
    return;
  }
  if (d.empty) {
    if (inst) { inst.destroy(); inst = null; }
    const byReason = { no_pool: t.noPool, rate_limited: t.rateLimited, no_sigs: t.noSigs, no_flows: t.noFlows, timeout: t.timeout };
    // Prefer localized soft copy; never render raw "429" / HTTP status strings
    let msg = byReason[d.reason] || (d.soft ? t.rateLimited : t.empty);
    if (/\b429\b|HTTP\s*\d+/i.test(String(msg))) msg = t.rateLimited;
    box.innerHTML = `<h3>${t.title}</h3><span class="muted">${esc(msg)}</span>
      <button type="button" class="ghost act" id="lf-retry">${t.retry}</button>
      <details class="fn"><summary title="info">ⓘ</summary><div>${t.note}</div></details>`;
    $('#lf-retry')?.addEventListener('click', () => { cache.delete(cur.addr); start(cur.addr, true); });
    return;
  }
  draw(box, d);
}

// Always ends in a painted state for the current token: data, a friendly empty/busy line + Retry, never an empty box.
// Busy / timeout / network errors are retried automatically (2 more tries, ~4 s and ~9 s later, bypassing a cached busy answer).
const inflight = new Set();
window.__mcFlowsRetry = (a) => { if (cur?.addr !== a) return; cache.delete(a); start(a, true); };
async function start(addr, manual = false) {
  if (inflight.has(addr)) { paint(); return; }
  inflight.add(addr); cache.set(addr, 'loading'); paint();
  const waits = [0, 4000, 9000]; let res = null;
  try {
    for (let i = 0; i < waits.length; i++) {
      if (waits[i]) await new Promise(r => setTimeout(r, waits[i] + Math.random() * 800));
      else if (!manual && DELAY) await new Promise(r => setTimeout(r, DELAY)); // stagger vs the other on-chain card
      if (cur?.addr !== addr) break; // user moved on; a later scan of this token restarts
      try {
        const j = await fetchFlows(addr, i > 0 || manual);
        if (!j || (j.ok === false && (j.error || !j.empty))) res = { error: true, timeout: !!j?.timeout };
        else res = j;
      } catch (e) { res = { error: true, timeout: /abort|timeout/i.test(String(e?.name || e?.message || '')) }; }
      if (!(res.error || isBusy(res))) break;
    }
  } finally {
    inflight.delete(addr);
    if (res) cache.set(addr, res); else cache.delete(addr);
  }
  if (cur?.addr === addr) paint();
}

document.addEventListener('mc:render', (e) => {
  const { r } = e.detail;
  cur = { addr: r.addr, chain: r.chain };
  const box = ensureBox(); if (!box) return;
  box.hidden = false; delete box.dataset.skel;
  if (r.chain !== 'solana') { // not applicable: say so instead of hiding the section
    if (inst) { inst.destroy(); inst = null; }
    const nm = CHN[lang()]?.[r.chain]; box.innerHTML = `<h3>${L[lang()].title}</h3><div class="muted evmna">ⓘ <span>${nm ? L[lang()].notEvm(nm) : L[lang()].notSol}</span></div>`;
    return;
  }
  const c = cache.get(r.addr);
  if (c && c !== 'loading' && !c.error && !isBusy(c)) { paint(); return; }
  start(r.addr);
});

document.getElementById('lang')?.addEventListener('click', () => { if (cur && cache.get(cur.addr) && cache.get(cur.addr) !== 'loading') setTimeout(paint, 0); });
