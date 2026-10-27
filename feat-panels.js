/* Feature panels: louder insider/bundle, Dex boost/fake-vol chips, freeze→fake-support callout, before-you-sign.
   Free basic scan — never gates on payment. Listens to document mc:render / mc:signal. EN+AR. */
const L = {
    en: {
      insiderTitle: 'Insider / bundle concentration',
      insiderHigh: 'High insider risk',
      insiderMed: 'Elevated insider risk',
      insiderLow: 'Low linked-supply signal',
      insiderNone: 'No strong linked-supply signal yet',
      insiderExplain: 'Same-block / funding-linked early buyers still hold a large share of supply. That often means insiders can dump on you.',
      confHigh: 'Higher confidence (on-chain cluster / RugCheck)',
      confMed: 'Medium confidence (same-slot + holders)',
      confLow: 'Best-effort (limited clustering data)',
      linkedPct: 'Linked supply still held',
      sameSlot: 'Same-slot early buyers',
      clusterWallets: 'Clustered wallets',
      boostChip: 'DexScreener boost (paid promo)',
      boostHigh: 'Heavy DexScreener boost',
      washChip: 'Possible fake / wash volume',
      promoExplain: 'Boosts are paid DexScreener promotion — marketing, not safety. Fake volume can lure buyers before a dump.',
      freezeTitle: 'Soft-rug → freeze → fake “support” drain',
      freezeBody: 'Mint or freeze authority is still enabled (or sells look blocked). A common scam: freeze transfers, then fake Telegram “support” asks you to unlock / send SOL / approve a drain site.',
      freezeCheck1: 'Never click “unlock” / “support” links from DMs or Telegram',
      freezeCheck2: 'Never send SOL to anyone claiming to be support',
      freezeCheck3: 'Revoke unknown site approvals (Phantom → Settings → Connected Apps)',
      freezeCheck4: 'Do not sign mystery transactions “to unfreeze”',
      freezeCheck5: 'If frozen: leave the chat, document, report — do not pay',
      preTitle: 'Before you sign',
      preEmpty: 'No hard blockers flagged from this scan — still DYOR.',
      preMint: 'Mint authority still enabled — supply can be inflated',
      preFreeze: 'Freeze authority still enabled — transfers can be locked',
      preSell: 'Sell / transfer check failed — may be a honeypot',
      preInsider: 'High linked / insider supply concentration',
      preBoost: 'Paid DexScreener boosts present (promo, not safety)',
      preWash: 'Volume heuristics look washed / fake',
      preLp: 'LP not burned / not locked',
      preDev: 'Developer has prior dead / rugged coins',
      callsCta: 'Check a Telegram calls channel win-rate →',
    },
    ar: {
      insiderTitle: 'تركّز الحيتان / الباقة (Insider)',
      insiderHigh: 'خطر حيتان مرتفع',
      insiderMed: 'خطر حيتان مرتفع نسبياً',
      insiderLow: 'إشارة تركّز ضعيفة',
      insiderNone: 'ما في إشارة تركّز قوية حالياً',
      insiderExplain: 'مشترين أوائل من نفس البلوك / نفس مصدر التمويل لسا ماسكين نسبة كبيرة من العرض — غالباً يقدروا يرموا عليك.',
      confHigh: 'ثقة أعلى (تجميع على السلسلة / RugCheck)',
      confMed: 'ثقة متوسطة (نفس السلوت + الحاملين)',
      confLow: 'أفضل جهد (بيانات التجميع محدودة)',
      linkedPct: 'العرض المربوط لسا ممسوك',
      sameSlot: 'مشترين أوائل بنفس السلوت',
      clusterWallets: 'محافظ متجمّعة',
      boostChip: 'تعزيز DexScreener (إعلان مدفوع)',
      boostHigh: 'تعزيز DexScreener ثقيل',
      washChip: 'حجم تداول وهمي محتمل',
      promoExplain: 'التعزيزات إعلان مدفوع على DexScreener — تسويق مو أمان. الحجم الوهمي يجذب مشترين قبل الضخّة.',
      freezeTitle: 'سحب ناعم → تجميد → دعم تيليغرام مزيّف',
      freezeBody: 'صلاحية السكّ أو التجميد لسا شغّالة (أو البيع يبدو مقفول). سيناريو شائع: بجمّدوا التحويل، بعدين “دعم” تيليغرام مزيف يطلب فك القفل / إرسال SOL / موافقة على موقع يسرق.',
      freezeCheck1: 'أبداً ما تضغط روابط “unlock” / “support” من الخاص أو تيليغرام',
      freezeCheck2: 'أبداً ما تبعت SOL لحدا بيقول إنه الدعم',
      freezeCheck3: 'ألغي موافقات المواقع المجهولة (Phantom → Settings → Connected Apps)',
      freezeCheck4: 'لا توقّع معاملات غريبة “لفك التجميد”',
      freezeCheck5: 'إذا انتجمّد: اترك الشات، وثّق، بلّغ — لا تدفع',
      preTitle: 'قبل ما توقّع',
      preEmpty: 'ما في حواجز قوية بهالفحص — بس لازم تدقّق بنفسك.',
      preMint: 'صلاحية السكّ لسا مفعّلة — العرض ممكن يزيد',
      preFreeze: 'صلاحية التجميد لسا مفعّلة — التحويل ممكن ينقفل',
      preSell: 'فحص البيع/التحويل فشل — ممكن يكون مصيدة',
      preInsider: 'تركّز عرض مربوط / حيتان مرتفع',
      preBoost: 'في تعزيزات DexScreener مدفوعة (إعلان مو أمان)',
      preWash: 'إشارات الحجم تبدو مغسولة / وهمية',
      preLp: 'السيولة مش محروقة / مش مقفولة',
      preDev: 'المطوّر عنده عملات سابقة ميتة / مسحوبة',
      callsCta: 'افحص نسبة فوز قناة استدعاءات تيليغرام ←',
    },
  };
  const t = (k) => (L[document.documentElement.lang === 'ar' ? 'ar' : 'en'] || L.en)[k] || L.en[k] || k;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (n) => (n == null || !Number.isFinite(+n) ? '—' : (+n).toFixed(+n >= 10 ? 0 : 1) + '%');
  const sig = (addr) => {
    try { return window.__mcSig?.get?.(addr) || null; } catch { return null; }
  };

  function ensureSlots() {
    const host = document.getElementById('out') || document.getElementById('vcard');
    if (!host) return null;
    const vcard = document.getElementById('vcard') || host;
    let chips = document.getElementById('risk-chips');
    if (!chips) {
      chips = document.createElement('div');
      chips.id = 'risk-chips';
      chips.className = 'risk-chips';
      const badge = vcard.querySelector('.badge');
      if (badge && badge.parentNode) badge.parentNode.insertBefore(chips, badge.nextSibling);
      else vcard.appendChild(chips);
    }
    const mk = (id, cls) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.className = cls;
        el.hidden = true;
      }
      return el;
    };
    const freeze = mk('freeze-box', 'exv freeze-callout');
    const pre = mk('presign-box', 'exv presign-panel');
    const insider = mk('insider-box', 'exv insider-panel');
    // Place panels just after the verdict card so they sit above market/findings
    if (vcard.parentNode) {
      let anchor = vcard;
      for (const el of [chips, freeze, pre, insider]) {
        if (el === chips && chips.parentNode === vcard) continue; // chips stay inside verdict
        if (el.parentNode !== vcard.parentNode || el.previousSibling !== anchor) {
          if (el === chips) continue;
          vcard.parentNode.insertBefore(el, anchor.nextSibling);
          anchor = el;
        } else {
          anchor = el;
        }
      }
      // Ensure freeze/pre/insider follow vcard in order
      let next = vcard.nextSibling;
      for (const el of [freeze, pre, insider]) {
        if (next !== el) vcard.parentNode.insertBefore(el, next);
        next = el.nextSibling;
      }
    }
    return { chips, freeze, pre, insider };
  }

  function collect(r) {
    const find = (id) => (r.findings || []).find((f) => f.id === id);
    // findings use status in core score path; some UI maps level — accept both
    const st = (f) => (f && (f.level || f.status)) || null;
    const mint = find('mintAuth');
    const freeze = find('freezeAuth');
    const lp = find('lpLocked');
    const ins = find('insiders');
    const m = r.meta || {};
    const wash = m.washHint || {};
    const S = sig(r.addr) || {};
    const bubble = S.bubble || null;
    const bundle = S.bundle || null;
    const sell = S.sellProof || null;
    const dh = S.devhist || (window.__mcDevHist && window.__mcDevHist.get && window.__mcDevHist.get(r.addr)) || null;

    let linkedPct = null, source = null, conf = 'low', sameSlot = null, clusterN = null;
    if (ins && ins.params && ins.params.pct != null) {
      linkedPct = +ins.params.pct; source = 'rugcheck'; conf = 'high';
    } else if (r.extra && r.extra.insiderPct != null) {
      linkedPct = +r.extra.insiderPct; source = 'rugcheck'; conf = 'high';
    }
    if (bubble && bubble.pct != null && (linkedPct == null || +bubble.pct > linkedPct)) {
      linkedPct = +bubble.pct; source = 'bubble'; conf = (bubble.n || 0) >= 3 ? 'high' : 'med'; clusterN = bubble.n;
    }
    if (bundle) {
      if (bundle.heldPct != null && (linkedPct == null || +bundle.heldPct > linkedPct)) {
        linkedPct = +bundle.heldPct; source = 'bundle'; conf = (bundle.sameSlot || 0) >= 3 ? 'med' : 'low';
      }
      if (bundle.sameSlot != null) sameSlot = bundle.sameSlot;
      if (bundle.clusterN != null) clusterN = bundle.clusterN;
      if (bundle.linkedHeldPct != null && (linkedPct == null || +bundle.linkedHeldPct > linkedPct)) {
        linkedPct = +bundle.linkedHeldPct; source = 'funding-link'; conf = 'med';
      }
    }
    if (ins && (st(ins) === 'fail' || st(ins) === 'warn') && linkedPct == null) {
      linkedPct = st(ins) === 'fail' ? 40 : 20;
      source = 'rugcheck-flag'; conf = 'low';
    }

    // Also fold wash from flows signal
    let washLevel = wash.level || 'none';
    if (S.flows && (S.flows.level === 'wash' || S.flows.level === 'suspicious')) {
      washLevel = S.flows.level === 'wash' ? 'fail' : (washLevel === 'fail' ? 'fail' : 'warn');
    }

    const risks = [];
    if (st(mint) === 'fail') risks.push({ id: 'mint', text: t('preMint'), level: 'fail' });
    if (st(freeze) === 'fail') risks.push({ id: 'freeze', text: t('preFreeze'), level: 'fail' });
    if (sell && sell.fail) risks.push({ id: 'sell', text: t('preSell'), level: 'fail' });
    if (linkedPct != null && linkedPct >= 25) risks.push({ id: 'insider', text: t('preInsider') + ` (${pct(linkedPct)})`, level: linkedPct >= 40 ? 'fail' : 'warn' });
    if ((m.boostsActive || 0) > 0) risks.push({ id: 'boost', text: t('preBoost') + ` (${m.boostsActive})`, level: m.boostsActive >= 50 ? 'fail' : 'warn' });
    if (washLevel === 'fail' || washLevel === 'warn') risks.push({ id: 'wash', text: t('preWash'), level: washLevel });
    if (st(lp) === 'fail' || st(lp) === 'warn') risks.push({ id: 'lp', text: t('preLp'), level: st(lp) });
    if (dh && dh.ok && ((dh.bad || 0) >= 2)) risks.push({ id: 'dev', text: t('preDev') + ` (${dh.bad})`, level: dh.flag === 'fail' ? 'fail' : 'warn' });

    return {
      mint, freeze, sell, linkedPct, source, conf, sameSlot, clusterN,
      wash: { level: washLevel, reasons: wash.reasons || [] },
      boosts: m.boostsActive || 0, risks, r,
    };
  }

  function renderChips(slots, d) {
    const bits = [];
    if (d.boosts > 0) {
      bits.push(`<span class="chip chip-boost" title="${esc(t('promoExplain'))}">⚠ ${esc(d.boosts >= 50 ? t('boostHigh') : t('boostChip'))}: ${d.boosts}</span>`);
    }
    if (d.wash.level === 'fail' || d.wash.level === 'warn') {
      bits.push(`<span class="chip chip-wash">⚠ ${esc(t('washChip'))}</span>`);
    }
    if (d.linkedPct != null && d.linkedPct >= 15) {
      bits.push(`<span class="chip chip-insider">⚠ ${esc(d.linkedPct >= 40 ? t('insiderHigh') : t('insiderMed'))}: ${esc(pct(d.linkedPct))}</span>`);
    }
    slots.chips.innerHTML = bits.join(' ');
    slots.chips.hidden = !bits.length;
  }

  function renderFreeze(slots, d) {
    const trip = (d.mint && (d.mint.level || d.mint.status) === 'fail')
      || (d.freeze && (d.freeze.level || d.freeze.status) === 'fail')
      || (d.sell && d.sell.fail);
    if (!trip) { slots.freeze.hidden = true; slots.freeze.innerHTML = ''; return; }
    slots.freeze.hidden = false;
    slots.freeze.innerHTML = `<div class="hd fail">${esc(t('freezeTitle'))}</div>
      <p class="muted freeze-body">${esc(t('freezeBody'))}</p>
      <ul class="freeze-check">
        <li>${esc(t('freezeCheck1'))}</li>
        <li>${esc(t('freezeCheck2'))}</li>
        <li>${esc(t('freezeCheck3'))}</li>
        <li>${esc(t('freezeCheck4'))}</li>
        <li>${esc(t('freezeCheck5'))}</li>
      </ul>`;
  }

  function renderPre(slots, d) {
    slots.pre.hidden = false;
    const items = d.risks.length
      ? d.risks.map((x) => `<li class="${esc(x.level || 'warn')}">${esc(x.text)}</li>`).join('')
      : `<li class="ok">${esc(t('preEmpty'))}</li>`;
    slots.pre.innerHTML = `<div class="hd">${esc(t('preTitle'))}</div><ul class="presign-list">${items}</ul>
      <p class="muted" style="margin:.5rem 0 0"><a href="/calls">${esc(t('callsCta'))}</a></p>`;
  }

  function renderInsider(slots, d) {
    if (d.linkedPct == null && d.sameSlot == null && d.clusterN == null) {
      slots.insider.hidden = true; slots.insider.innerHTML = ''; return;
    }
    const level = d.linkedPct == null ? 'info' : d.linkedPct >= 40 ? 'fail' : d.linkedPct >= 20 ? 'warn' : 'ok';
    const badge = d.linkedPct == null ? t('insiderNone')
      : d.linkedPct >= 40 ? t('insiderHigh') : d.linkedPct >= 20 ? t('insiderMed') : t('insiderLow');
    const confLabel = d.conf === 'high' ? t('confHigh') : d.conf === 'med' ? t('confMed') : t('confLow');
    slots.insider.hidden = false;
    slots.insider.innerHTML = `<div class="hd ${level}">${esc(t('insiderTitle'))}
      <span class="badge ${level}" style="font-size:.75rem;margin-inline-start:.5rem">${esc(badge)}</span></div>
      <div class="insider-stats">
        <div class="stat"><div class="stat-n">${esc(pct(d.linkedPct))}</div><div class="stat-l">${esc(t('linkedPct'))}</div></div>
        ${d.sameSlot != null ? `<div class="stat"><div class="stat-n">${esc(d.sameSlot)}</div><div class="stat-l">${esc(t('sameSlot'))}</div></div>` : ''}
        ${d.clusterN != null ? `<div class="stat"><div class="stat-n">${esc(d.clusterN)}</div><div class="stat-l">${esc(t('clusterWallets'))}</div></div>` : ''}
      </div>
      <p class="muted" style="margin:.55rem 0 0">${esc(t('insiderExplain'))}</p>
      <p class="muted" style="margin:.25rem 0 0;font-size:.8rem">${esc(confLabel)}${d.source ? ` · ${esc(d.source)}` : ''}</p>`;
  }

  function paint(r) {
    if (!r || !document.getElementById('out') || !document.getElementById('vcard')) return;
    const slots = ensureSlots();
    if (!slots) return;
    const d = collect(r);
    renderChips(slots, d);
    renderFreeze(slots, d);
    renderPre(slots, d);
    renderInsider(slots, d);
  }

  document.addEventListener('mc:render', (e) => {
    const r = e.detail?.r || e.detail;
    window.__mcLastResult = r;
    paint(r);
  });
  document.addEventListener('mc:panels', (e) => {
    const r = e.detail?.r || window.__mcLastResult;
    if (r) { window.__mcLastResult = r; paint(r); }
  });
  document.addEventListener('mc:signal', () => {
    // app.js re-renders ~150ms later and wipes DOM — repaint after that
    setTimeout(() => { if (window.__mcLastResult) paint(window.__mcLastResult); }, 220);
  });
  // Re-paint after lang toggle (app.js re-renders; this covers partial cases)
  const mo = new MutationObserver(() => { if (window.__mcLastResult) paint(window.__mcLastResult); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

export {};
