/* Glue: replaces the design's sample numbers with live results from the Rekart backend (/api/v1).
   Loaded after the design's main script, so it shares its globals (P, D, S, loadProfile, renderProfile...). */
(() => {
  const API = '/api/v1';
  const post = (path, body) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).then(j => j.data);
  const get = path => fetch(API + path).then(r => r.json()).then(j => j.data);
  const CAT_TO_PROFILE = { electronics: 'headphones', apparel: 'jacket', appliance: 'blender', furniture: 'chair' };

  // Fetch backend numbers for a profile once, writing them into P.d / P.sell so later loads and language switches reuse them.
  async function sync(p) {
    if (p.synced) return;
    const d = p.d;
    // Benchmark first: its sourced resale value feeds the repair/channel maths below.
    const fps = await post('/calc/fair-price-shield', { modelName: p.name, faultType: p.fault, quotedAmount: d.quote });
    p.prov = fps.provenance;
    if (p.prov?.resale_working_inr) d.working = p.prov.resale_working_inr;
    const [ror, cc] = await Promise.all([
      post('/calc/repair-or-release', { category: p.cat, modelName: p.name, functionalResaleValue: d.working, estimatedRepairCost: d.quote, asIsScrapValue: d.scrap }),
      post('/calc/channel-comparison', { category: p.cat, modelName: p.name, functionalMarketValue: d.working, estimatedRepairCost: d.quote }),
      loadNearby(p)
    ]);
    const b = fps.local_benchmark;
    // Bands mirror the backend's verdict thresholds: fair <= P75, high <= P75 + 1.5*IQR, very high beyond.
    Object.assign(d, { bandLo: b.p25, bandHi: b.p75, mid: b.p75 + 1.5 * b.interquartile_range, qc: b.sample_count, pr1v: `₹${f(b.p25)}–${f(b.p75)}`, rule: Math.round(ror.repair_threshold_ceiling_inr) });
    d.gmax = Math.max(d.gmax, Math.ceil(d.mid * 1.25));
    const ch = Object.fromEntries(cc.channels.map(c => [c.channel_id, c.net_yield_inr]));
    // Channels the design marks unavailable (null) stay unavailable; brand exchange isn't modelled by the backend.
    const live = [ch.peer_to_peer, ch.instant_buyback, ch.offline_refurbisher, p.sell[3], ch.kabadiwala_scrap];
    p.sell = p.sell.map((v, i) => (v == null ? null : live[i]));
    p.synced = true;
  }

  /* ---------- nearby repair shops + NGOs ---------- */
  let loc = null; // set once the user shares their location; null = distances from Nagpur city centre
  const locQS = () => (loc ? `&latitude=${loc.latitude}&longitude=${loc.longitude}` : '');

  async function loadNearby(p) {
    const [shops, ngos] = await Promise.all([
      get(`/routing/nearby-partners?targetTrack=repair&category=${p.cat}${locQS()}`),
      get(`/routing/nearby-partners?targetTrack=ngo_donation&category=${p.cat}${locQS()}`)
    ]);
    p.shops = shops.partners.slice(0, 2);
    p.ngos = ngos.partners;
    p.nearLoc = loc;
  }

  Object.assign(I18N.en, {
    ngo_loc: 'Use my location', ngo_locating: 'Locating…', ngo_from_city: 'Distances from Nagpur city centre', ngo_from_you: 'Distances from your location',
    ngo_loc_err: 'Couldn’t get your location — showing distances from the city centre.', ngo_none: 'No partner NGO nearby accepts this kind of item yet. Try the Sell or Recycle route.',
    ngo_needs: 'Needs now', ngo_pickup: 'Free pickup', ngo_drop: 'Drop-off only', ngo_open: 'Open', ngo_acc: 'Accepts', ngo_grade: 'condition {g} or better', ngo_dir: 'Directions', ngo_ver: 'Verified'
  });
  Object.assign(I18N.hi, {
    ngo_loc: 'मेरी लोकेशन', ngo_locating: 'ढूँढ रहे हैं…', ngo_from_city: 'नागपुर शहर के केंद्र से दूरी', ngo_from_you: 'आपकी लोकेशन से दूरी',
    ngo_loc_err: 'आपकी लोकेशन नहीं मिली — शहर के केंद्र से दूरी दिखा रहे हैं।', ngo_none: 'पास की कोई पार्टनर संस्था अभी यह चीज़ नहीं लेती। बेचने या रीसायकल का रास्ता देखें।',
    ngo_needs: 'अभी ज़रूरत', ngo_pickup: 'मुफ़्त पिकअप', ngo_drop: 'सिर्फ़ ड्रॉप-ऑफ़', ngo_open: 'खुला', ngo_acc: 'लेते हैं', ngo_grade: 'हालत {g} या बेहतर', ngo_dir: 'रास्ता', ngo_ver: 'सत्यापित'
  });
  Object.assign(I18N.hg, {
    ngo_loc: 'Meri location', ngo_locating: 'Dhoondh rahe hain…', ngo_from_city: 'Nagpur city centre se doori', ngo_from_you: 'Aapki location se doori',
    ngo_loc_err: 'Location nahin mili — city centre se doori dikha rahe hain.', ngo_none: 'Paas ki koi partner NGO abhi yeh cheez nahin leti. Sell ya Recycle ka raasta dekho.',
    ngo_needs: 'Abhi zaroorat', ngo_pickup: 'Free pickup', ngo_drop: 'Sirf drop-off', ngo_open: 'Khula', ngo_acc: 'Lete hain', ngo_grade: 'condition {g} ya behtar', ngo_dir: 'Raasta', ngo_ver: 'Verified'
  });

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function ngoRow(n) {
    const row = el('div', 'py-3.5');
    const top = el('div', 'flex items-baseline justify-between gap-3');
    top.append(el('b', 'block', n.name), el('span', 'text-xs font-semibold text-stone-600 shrink-0', `${n.distance_km} km`));
    const area = n.address.split(',').slice(-3, -2)[0]?.trim() || n.city;
    const hours = n.operational_hours ? `${t('ngo_open')} ${n.operational_hours.open}–${n.operational_hours.close}` : null;
    const meta = el('div', 'text-xs text-stone-500 mt-0.5', [area, hours, t(n.pickup_available ? 'ngo_pickup' : 'ngo_drop'), n.is_verified && `✓ ${t('ngo_ver')}`].filter(Boolean).join(' · '));
    row.append(top, meta);
    if (n.has_active_shortage && n.shortage_description) {
      const urgent = n.shortage_urgency === 'high';
      row.append(el('div', `mt-2 text-xs rounded-lg px-2.5 py-1.5 ${urgent ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-brand-50 text-brand-900'}`, `${t('ngo_needs')}: ${n.shortage_description}`));
    }
    const acc = [n.accepted_categories?.length && `${t('ngo_acc')}: ${n.accepted_categories.join(', ')}`, n.min_acceptance_grade && t('ngo_grade').replace('{g}', n.min_acceptance_grade)].filter(Boolean).join(' · ');
    const foot = el('div', 'flex items-center justify-between gap-3 mt-2');
    foot.append(el('span', 'text-[11px] text-stone-400', acc));
    const dir = el('a', 'text-xs font-bold text-brand-800 hover:text-brand-950 shrink-0', `${t('ngo_dir')} ↗`);
    dir.href = `https://www.google.com/maps/dir/?api=1&destination=${n.latitude},${n.longitude}`;
    dir.target = '_blank'; dir.rel = 'noopener';
    foot.append(dir);
    row.append(foot);
    return row;
  }

  function applyNgos() {
    document.getElementById('ngoFrom').textContent = t(loc ? 'ngo_from_you' : 'ngo_from_city');
    const list = document.getElementById('ngoList');
    if (!P.ngos) return list.replaceChildren(); // still loading
    list.replaceChildren(...(P.ngos.length ? P.ngos.map(ngoRow) : [el('p', 'py-3.5 text-xs text-stone-500', t('ngo_none'))]));
  }

  window.useMyLocation = () => {
    const label = document.querySelector('#ngoLocBtn span');
    const fail = () => { label.textContent = t('ngo_loc'); toast(t('ngo_loc_err')); };
    if (!navigator.geolocation) return fail();
    label.textContent = t('ngo_locating');
    navigator.geolocation.getCurrentPosition(pos => {
      // ~100 m precision is plenty for "nearest" and avoids sending an exact home position.
      loc = { latitude: +pos.coords.latitude.toFixed(3), longitude: +pos.coords.longitude.toFixed(3) };
      const p = P;
      loadNearby(p).then(() => { label.textContent = t('ngo_loc'); if (P === p) renderProfile(); }).catch(fail);
    }, fail, { timeout: 10000, maximumAge: 600000 });
  };

  // Once the donation checklist is complete, point to the nearest matching NGO instead of the design's sample school.
  const baseDonate = window.donateGateClick;
  window.donateGateClick = () => {
    if (!P.ngos || $$('.ckrow.done').length < 3) return baseDonate();
    const n = P.ngos[0];
    toast(n ? `${n.name} · ${t(n.pickup_available ? 'ngo_pickup' : 'ngo_drop')} · ${n.distance_km} km` : t('ngo_none'));
  };

  function applyShops() {
    (P.shops || []).forEach((s, i) => {
      const n = document.getElementById(i ? 'shopBn' : 'shopAn');
      n.textContent = s.name;
      n.nextElementSibling.textContent = s.address.split(',').slice(-3, -2)[0]?.trim() || s.city;
      n.closest('button').lastElementChild.textContent = s.distance_km + ' km';
    });
  }

  // Replace the design's "N quotes · calibrated 2 weeks ago" with where the band actually came from.
  function applyProvenance() {
    const pr = P.prov;
    if (!pr) return;
    const quotes = D.qc ? `${D.qc} Nagpur quotes + ` : '';
    document.getElementById('fpsMeta').textContent = pr.is_estimate ? 'ESTIMATE · UNVERIFIED' : `${quotes}PUBLIC RATES · ${pr.as_of}`;
    const lbl = document.getElementById('provLbl');
    lbl.textContent = `${quotes}${pr.source} · as of ${pr.as_of}`;
    lbl.title = [pr.source_url, pr.resale_source && `Resale: ${pr.resale_source} ${pr.resale_source_url || ''}`].filter(Boolean).join('\n');
  }

  const baseRender = window.renderProfile;
  window.renderProfile = function () { baseRender(); if (P) { applyShops(); applyProvenance(); applyNgos(); } };

  const baseLoad = window.loadProfile;
  window.loadProfile = function (id, opts) {
    baseLoad(id, opts);
    const p = P;
    if (p.synced && p.nearLoc === loc) return;
    (p.synced ? loadNearby(p) : sync(p)).then(() => { // nearby lists refresh if the location changed since
      if (P !== p) return; // user moved on to another item
      D = { ...p.d };
      renderProfile();
    }).catch(err => console.error('Rekart API sync failed', err));
  };

  // Real photo upload → backend media store + classifier, then load the matching Nagpur profile.
  const baseScan = window.startAIAnalysis;
  window.startAIAnalysis = async function () {
    const file = document.getElementById('fileInput').files[0];
    if (file && S.hasItem) {
      try {
        const fd = new FormData(); fd.append('file', file);
        const up = await fetch(API + '/vision/upload-media', { method: 'POST', body: fd }).then(r => r.json());
        const note = document.getElementById('itemCustomNote').value;
        const cls = await post('/vision/classify-single', { imageUrl: up.data.url, userHint: note });
        const match = CAT_TO_PROFILE[cls.category];
        if (match) {
          loadProfile(match);
          showPreview(up.data.url); // keep the user's photo + note instead of the sample's
          document.getElementById('itemCustomNote').value = note;
        }
        toast(`Detected: ${[cls.brand, cls.model_name].filter(Boolean).join(' ') || cls.category} (${Math.round(cls.confidence * 100)}%)`);
      } catch (err) { console.error('Rekart upload/classify failed', err); }
    }
    baseScan();
  };

  // Dashboard "what did you actually pay?" buttons → crowdsourced calibration.
  const PAID = [850, 1000, 1400]; // midpoint of each button's range
  window.calibrated = function () {
    const i = [...document.querySelectorAll('[onclick="calibrated()"]')].indexOf(event.currentTarget);
    if (PAID[i]) post('/partner/calibrate-price', { modelName: P.name, faultType: P.fault, amountPaid: PAID[i] }).catch(console.error);
    toast(t('t_cal'));
  };

  /* ---------- top nav: Home · Donations · Repairs · Reuse ---------- */
  // Donations/Repairs are route panels on the results screen, so their highlight follows S.route.
  function markNav(key) {
    $$('.nav-btn').forEach(b => {
      const on = b.dataset.target === key;
      b.classList.toggle('bg-white', on); b.classList.toggle('shadow-sm', on);
      b.classList.toggle('text-brand-900', on); b.classList.toggle('font-semibold', on);
      b.classList.toggle('text-stone-600', !on);
    });
  }
  const onResults = () => !document.getElementById('screen-results').classList.contains('hidden');
  const baseNav = window.navigateTo;
  window.navigateTo = function (id) { baseNav(id); hideList(); if (id === 'results') markNav(S.route); };
  const baseRoute = window.setRoute;
  window.setRoute = function (r) { baseRoute(r); if (onResults()) markNav(r); };
  window.goTab = k => {
    if (k === 'donate' || k === 'repair') { navigateTo('results'); setRoute(k); }
    else navigateTo(k);
  };

  /* ---------- search: instant matches, Enter asks the AI ---------- */
  const srch = document.getElementById('srch'), list = document.getElementById('srchList');
  let rows = [], active = -1, lookupTimer, lookupSeq = 0;

  function localCorpus() {
    const pages = [['home', 'nav_home'], ['donate', 'nav_don'], ['repair', 'nav_rep'], ['reuse-gallery', 'nav_reu'], ['analyze', 'nav_analyze'], ['compare', 'nav_compare'], ['my-items', 'nav_items'], ['impact', 'nav_impact'], ['dashboard', 'nav_dash']]
      .map(([k, key]) => ({ icon: 'arrow-right', label: t(key), sub: 'Page', run: () => goTab(k) }));
    const items = Object.values(PROFILES).map(p => ({ icon: 'package', label: p.name, sub: `Sample item · ${p.cat} · ${p.fault}`, run: () => loadProfile(p.id, { jump: true }) }));
    const guides = Object.entries(GUIDES).map(([k, g]) => ({ icon: 'recycle', label: g.t, sub: 'Reuse guide', run: () => openReuseModal(k) }));
    return [...items, ...guides, ...pages];
  }

  function renderList(q, remote = []) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const local = localCorpus().filter(r => words.every(w => (r.label + ' ' + r.sub).toLowerCase().includes(w))).slice(0, 6);
    rows = [...local, ...remote, { icon: 'sparkles', label: `${t('ask_ai')}: “${q}”`, sub: 'Opens the assistant panel', run: () => askAi(q) }];
    active = -1;
    list.replaceChildren(...rows.map((r, i) => {
      const el = document.createElement('div');
      el.id = 'srch-opt-' + i; el.setAttribute('role', 'option');
      el.className = 'srch-opt flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-stone-100';
      el.innerHTML = `<i data-lucide="${r.icon}" class="w-4 h-4 text-stone-400 shrink-0"></i><span class="min-w-0"><b class="block text-sm truncate"></b><span class="block text-xs text-stone-500 truncate"></span></span>`;
      el.querySelector('b').textContent = r.label;
      el.querySelector('b + span').textContent = r.sub;
      el.addEventListener('mousedown', e => { e.preventDefault(); choose(i); });
      return el;
    }));
    list.classList.remove('hidden'); srch.setAttribute('aria-expanded', 'true');
    icons();
  }
  function hideList() { list.classList.add('hidden'); srch.setAttribute('aria-expanded', 'false'); srch.removeAttribute('aria-activedescendant'); active = -1; }
  function setActive(i) {
    active = (i + rows.length) % rows.length;
    $$('.srch-opt').forEach((el, j) => el.classList.toggle('bg-stone-100', j === active));
    srch.setAttribute('aria-activedescendant', 'srch-opt-' + active);
    document.getElementById('srch-opt-' + active).scrollIntoView({ block: 'nearest' });
  }
  function choose(i) { const r = rows[i]; srch.value = ''; hideList(); srch.blur(); r.run(); }

  srch.addEventListener('input', () => {
    const q = srch.value.trim();
    clearTimeout(lookupTimer);
    if (!q) return hideList();
    renderList(q);
    // Backend disposal lookup ("where does this go?") joins the list once it answers.
    const seq = ++lookupSeq;
    lookupTimer = setTimeout(() => get(`/recycling/where-does-this-go?query=${encodeURIComponent(q)}`).then(d => {
      if (seq !== lookupSeq || srch.value.trim() !== q) return;
      // Unknown queries get a generic "General Household Item" fallback without keywords; skip it.
      renderList(q, (d?.matches || []).filter(m => m.keywords).slice(0, 3).map(m => ({ icon: 'trash-2', label: m.item_name, sub: `Disposal · ${m.can_put_in_regular_bin ? 'regular bin OK' : 'not for regular bin'}`, run: () => showDisposal(m) })));
    }).catch(() => {}), 250);
  });
  srch.addEventListener('keydown', e => {
    if (list.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Escape') hideList();
  });
  srch.addEventListener('focus', () => srch.value.trim() && renderList(srch.value.trim()));
  document.addEventListener('click', e => { if (!e.target.closest('#srchWrap')) hideList(); });
  window.searchSubmit = e => {
    e.preventDefault();
    const q = srch.value.trim();
    if (!q) return false;
    if (active >= 0) choose(active);
    else { srch.value = ''; hideList(); srch.blur(); askAi(q); }
    return false;
  };

  /* ---------- AI assistant panel (in-page, no new window) ---------- */
  const panel = document.getElementById('aiPanel'), log = document.getElementById('aiLog');
  const chat = [];
  let lastLookup = null;

  function openAi() { panel.classList.remove('translate-x-full'); panel.setAttribute('aria-hidden', 'false'); }
  window.closeAi = () => { panel.classList.add('translate-x-full'); panel.setAttribute('aria-hidden', 'true'); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeAi(); });

  function addMsg(role, text) {
    const el = document.createElement('div');
    el.className = role === 'user'
      ? 'ml-auto max-w-[85%] w-fit bg-brand-900 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm whitespace-pre-wrap'
      : 'max-w-[92%] w-fit bg-stone-100 text-stone-800 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap';
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  // What the assistant knows about the screen: the current item and the backend figures (with their sources).
  function aiContext() {
    const screen = $$('.screen-view').find(s => !s.classList.contains('hidden'))?.id.replace('screen-', '');
    return {
      city: 'Nagpur', screen, language: { en: 'English', hi: 'Hindi', hg: 'Hinglish' }[LANG],
      current_item: P && {
        name: P.name, category: P.cat, likely_fault: P.fault, recommended_route: P.route, age: P.age,
        shop_quote_inr: S.quote, fair_repair_band_inr: [D.bandLo, D.bandHi], working_resale_inr: D.working,
        sell_as_is_inr: D.asis, repair_ceiling_60pct_inr: D.rule,
        payouts_inr: { p2p: P.sell[0], instant_buyback: P.sell[1], offline_store: P.sell[2], kabadiwala: P.sell[4] },
        price_source: P.prov?.source, price_is_estimate: P.prov?.is_estimate,
        nearby_shops: (P.shops || []).map(s => `${s.name} (${s.distance_km} km)`),
        nearby_ngos: (P.ngos || []).map(n => ({ name: n.name, distance_km: n.distance_km, accepts: n.accepted_categories, pickup: n.pickup_available, needs_now: n.shortage_description }))
      },
      last_disposal_lookup: lastLookup
    };
  }

  async function askAi(q) {
    openAi();
    addMsg('user', q);
    chat.push({ role: 'user', content: q });
    const pending = addMsg('assistant', t('ai_think'));
    pending.classList.add('animate-pulse');
    try {
      const res = await fetch(API + '/ai/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: chat, context: aiContext() }) });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'Assistant unavailable');
      pending.textContent = j.data.reply;
      chat.push({ role: 'assistant', content: j.data.reply });
    } catch (err) {
      chat.pop(); // drop the unanswered question so a retry isn't sent twice
      pending.textContent = err.message;
      pending.classList.replace('bg-stone-100', 'bg-amber-50');
      pending.classList.replace('text-stone-800', 'text-amber-900');
    } finally {
      pending.classList.remove('animate-pulse');
      log.scrollTop = log.scrollHeight;
    }
  }
  window.askAi = askAi;
  window.aiFollowUp = e => {
    e.preventDefault();
    const inp = document.getElementById('aiInput'), q = inp.value.trim();
    if (q) { inp.value = ''; askAi(q); }
    return false;
  };

  function showDisposal(m) {
    lastLookup = m;
    openAi();
    addMsg('assistant', [
      m.item_name,
      `Danger: ${m.danger_level}`,
      m.can_put_in_regular_bin ? 'Regular bin: OK' : 'Regular bin: NO',
      m.disposal_instructions,
      m.nearest_nagpur_facility && `Nearest: ${m.nearest_nagpur_facility}`,
      m.doorstep_pickup_available && 'Doorstep pickup available'
    ].filter(Boolean).join('\n'));
  }

  // Placeholders aren't covered by data-i18n, so set them on every language switch.
  const baseLang = window.applyLang;
  window.applyLang = l => {
    baseLang(l);
    srch.placeholder = t('srch_ph');
    document.getElementById('aiInput').placeholder = t('ai_ph');
    if (onResults()) markNav(S.route);
  };

  applyLang(LANG);
  loadProfile(S.item); // re-run the initial load through the API
})();
