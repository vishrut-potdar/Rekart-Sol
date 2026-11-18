/* Rekart API Client: drives the real scan -> confirm -> questions -> POST /api/v1/decide spine.
   Loaded after index.html's script; shares globals (P, D, S, SAMPLE_PRESETS, renderProfile...). */
(() => {
  const API = '/api/v1';

  function errMsg(j, fallback = 'Request failed') {
    if (!j) return fallback;
    if (typeof j.error === 'string') return j.error;
    return j.error?.message || fallback;
  }

  async function req(path, opts = {}) {
    const res = await fetch(API + path, {
      credentials: 'same-origin',
      ...opts
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.success) {
      const err = new Error(errMsg(j, `HTTP ${res.status}`));
      err.code = j.error?.code;
      err.status = res.status;
      throw err;
    }
    return j.data;
  }

  const get = path => req(path);
  const post = (path, body) =>
    req(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

  let sessionReadyPromise = null;
  async function ensureSession() {
    if (!sessionReadyPromise) {
      sessionReadyPromise = (async () => {
        try {
          await get('/auth/me');
        } catch {
          await post('/auth/anonymous', {});
        }
      })().catch(() => {
        sessionReadyPromise = null;
      });
    }
    return sessionReadyPromise;
  }

  let loc = null;
  const locQS = () => (loc ? `&latitude=${loc.latitude}&longitude=${loc.longitude}` : '');

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function areaOf(address, city) {
    const parts = String(address || '').split(',').map(s => s.trim());
    const i = parts.findIndex(s => /^nagpur\b/i.test(s));
    return (i > 0 ? parts[i - 1] : parts[parts.length - 1]) || city || 'Nagpur';
  }

  function link(text, href, external) {
    const a = el('a', 'text-xs font-bold text-brand-800 hover:text-brand-950 whitespace-nowrap', text);
    a.href = href;
    if (external) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    return a;
  }

  function ngoRow(n) {
    const row = el('div', 'py-3.5');
    const top = el('div', 'flex items-baseline justify-between gap-3');
    const left = el('div', 'flex items-center gap-2 flex-wrap');
    left.append(el('b', 'block', n.name));
    if (n.is_sample) {
      left.append(el('span', 'text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded', 'Sample'));
    }
    top.append(left, el('span', 'text-xs font-semibold text-stone-600 shrink-0', `${n.coords_approx ? '≈ ' : ''}${n.distance_km} km`));
    const h = n.operational_hours;
    const hours = h && [h.days, `${h.open}–${h.close}`].filter(Boolean).join(' ');
    const meta = el(
      'div',
      'text-xs text-stone-500 mt-0.5',
      [areaOf(n.address, n.city), hours, t(n.pickup_available ? 'ngo_pickup' : 'ngo_drop'), n.is_verified && `✓ ${t('ngo_ver')}`]
        .filter(Boolean)
        .join(' · ')
    );
    row.append(top, meta);
    if (n.has_active_shortage && n.shortage_description) {
      const urgent = n.shortage_urgency === 'high';
      row.append(
        el(
          'div',
          `mt-2 text-xs rounded-lg px-2.5 py-1.5 ${urgent ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-brand-50 text-brand-900'}`,
          `${t('ngo_needs')}: ${n.shortage_description}`
        )
      );
    }
    if (n.notes) row.append(el('div', 'text-xs text-stone-600 mt-2 leading-relaxed', n.notes));
    if (n.accepted_categories?.length) {
      row.append(el('div', 'text-[11px] text-stone-400 mt-1.5', `${t('ngo_acc')}: ${n.accepted_categories.join(', ')}`));
    }
    const foot = el('div', 'flex flex-wrap items-center gap-x-4 gap-y-1 mt-2');
    foot.append(link(`${t('ngo_dir')} ↗`, `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(n.address)}`, true));
    if (n.phone) foot.append(link(`${t('ngo_call')} ${n.phone}`, `tel:${n.phone.replace(/[^\d+]/g, '')}`));
    if (n.source) {
      const src = link(`${t('ngo_src')}: ${n.source.label} ↗`, n.source.url, true);
      src.className = 'text-[11px] text-stone-400 hover:text-stone-700 underline decoration-dotted';
      foot.append(src, el('span', 'text-[11px] text-stone-400', `${t('ngo_asof')} ${n.source.as_of}`));
    }
    row.append(foot);
    return row;
  }

  Object.assign(I18N.en, {
    ngo_loc: 'Use my location', ngo_locating: 'Locating…', ngo_from_city: 'Distances from Nagpur city centre', ngo_from_you: 'Distances from your location',
    ngo_loc_err: 'Couldn’t get your location — showing distances from the city centre.', ngo_none: 'We haven’t found a Nagpur NGO that takes this kind of item yet. Try the Sell or Recycle route, or ask the assistant.',
    ngo_needs: 'Needs now', ngo_pickup: 'Free pickup', ngo_drop: 'Drop-off only', ngo_open: 'Open', ngo_acc: 'Accepts', ngo_grade: 'condition {g} or better', ngo_dir: 'Directions', ngo_ver: 'Verified', ngo_call: 'Call', ngo_src: 'Source', ngo_asof: 'as of'
  });
  Object.assign(I18N.hi, {
    ngo_loc: 'मेरी लोकेशन', ngo_locating: 'ढूँढ रहे हैं…', ngo_from_city: 'नागपुर शहर के केंद्र से दूरी', ngo_from_you: 'आपकी लोकेशन से दूरी',
    ngo_loc_err: 'आपकी लोकेशन नहीं मिली — शहर के केंद्र से दूरी दिखा रहे हैं।', ngo_none: 'नागपुर में यह चीज़ लेने वाली कोई संस्था अभी नहीं मिली। बेचने या रीसायकल का रास्ता देखें, या सहायक से पूछें।',
    ngo_needs: 'अभी ज़रूरत', ngo_pickup: 'मुफ़्त पिकअप', ngo_drop: 'सिर्फ़ ड्रॉप-ऑफ़', ngo_open: 'खुला', ngo_acc: 'लेते हैं', ngo_grade: 'हालत {g} या बेहतर', ngo_dir: 'रास्ता', ngo_ver: 'सत्यापित', ngo_call: 'कॉल', ngo_src: 'स्रोत', ngo_asof: 'तारीख़'
  });
  Object.assign(I18N.hg, {
    ngo_loc: 'Meri location', ngo_locating: 'Dhoondh rahe hain…', ngo_from_city: 'Nagpur city centre se doori', ngo_from_you: 'Aapki location se doori',
    ngo_loc_err: 'Location nahin mili — city centre se doori dikha rahe hain.', ngo_none: 'Nagpur mein yeh cheez lene wali koi NGO abhi nahin mili. Sell ya Recycle ka raasta dekho, ya assistant se poocho.',
    ngo_needs: 'Abhi zaroorat', ngo_pickup: 'Free pickup', ngo_drop: 'Sirf drop-off', ngo_open: 'Khula', ngo_acc: 'Lete hain', ngo_grade: 'condition {g} ya behtar', ngo_dir: 'Raasta', ngo_ver: 'Verified', ngo_call: 'Call', ngo_src: 'Source', ngo_asof: 'as of'
  });

  function applyNgos() {
    const fromEl = document.getElementById('ngoFrom');
    if (fromEl) fromEl.textContent = t(loc ? 'ngo_from_you' : 'ngo_from_city');
    const list = document.getElementById('ngoList');
    if (!list) return;
    if (!P.ngos) return list.replaceChildren();
    list.replaceChildren(...(P.ngos.length ? P.ngos.map(ngoRow) : [el('p', 'py-3.5 text-xs text-stone-500', t('ngo_none'))]));
  }

  function applyShops() {
    const shops = P.shops || [];
    shops.slice(0, 2).forEach((s, i) => {
      const n = document.getElementById(i ? 'shopBn' : 'shopAn');
      if (!n) return;
      n.textContent = s.name;
      n.nextElementSibling.textContent = [areaOf(s.address, s.city), s.is_sample ? 'Sample directory entry' : null].filter(Boolean).join(' · ');
      n.closest('button').lastElementChild.textContent = `${s.distance_km} km`;
    });
  }

  function applyProvenance() {
    const pr = P.prov;
    if (!pr) return;
    const quotes = D.qc ? `${D.qc} Nagpur quotes + ` : '';
    const fpsMeta = document.getElementById('fpsMeta');
    if (fpsMeta) fpsMeta.textContent = pr.is_estimate ? `ESTIMATE · ${pr.as_of}` : `${quotes}PUBLIC RATES · ${pr.as_of}`;
    const lbl = document.getElementById('provLbl');
    if (lbl) {
      lbl.textContent = `${quotes}${pr.source} · as of ${pr.as_of}`;
      lbl.title = [pr.source_url, pr.resale_source && `Resale: ${pr.resale_source} ${pr.resale_source_url || ''}`].filter(Boolean).join('\n');
    }
  }

  function renderDecisionSummary(decision) {
    if (!decision) return;
    const rec = decision.recommended_path;
    const sum = decision.item_summary;
    const samplePill = document.getElementById('decSamplePill');
    if (samplePill) samplePill.classList.toggle('hidden', !sum.is_sample);

    const confPill = document.getElementById('decConfidencePill');
    if (confPill) confPill.textContent = `Score ${rec.score}/100`;

    const safetyBox = document.getElementById('safetyOverrideBox');
    if (safetyBox) {
      if (decision.safety_override?.active) {
        safetyBox.classList.remove('hidden');
        safetyBox.textContent = `${decision.safety_override.headline}. ${(decision.safety_override.precautions || []).join(' ')}`;
      } else {
        safetyBox.classList.add('hidden');
      }
    }

    const regBox = document.getElementById('regulatoryRuleBox');
    if (regBox) {
      if (decision.regulatory_rule?.authorised_recycler_only) {
        regBox.classList.remove('hidden');
        regBox.textContent = `${decision.regulatory_rule.rule}: ${decision.regulatory_rule.message}`;
      } else {
        regBox.classList.add('hidden');
      }
    }

    const topTitle = document.getElementById('decTopTitle');
    if (topTitle) topTitle.textContent = rec.label;

    const topRange = document.getElementById('decTopRange');
    if (topRange) {
      const [lo, hi] = rec.net_value_range_inr || [0, 0];
      topRange.textContent = hi > 0 ? `Est. net ₹${f(lo)}–₹${f(hi)}` : rec.path === 'donate' ? 'Social value · ₹0 cost' : 'Safe disposal';
    }

    const topBasis = document.getElementById('decTopBasis');
    if (topBasis) topBasis.textContent = rec.basis;

    const altList = document.getElementById('rankedAlternativesList');
    if (altList) {
      altList.replaceChildren(...(decision.ranked_paths || []).map((p, idx) => {
        const card = el('button', `text-left rounded-2xl p-3 border transition-all ${idx === 0 ? 'border-brand-500 bg-brand-50/60' : p.eligible ? 'border-stone-200 bg-white hover:border-stone-400' : 'border-stone-200 bg-stone-50 opacity-60'}`);
        card.type = 'button';
        card.onclick = () => setRoute(p.path);
        const top = el('div', 'flex items-center justify-between gap-2');
        top.append(el('b', 'text-xs text-stone-900', `${idx + 1}. ${p.label}`), el('span', 'text-[11px] font-mono font-bold text-brand-800', `${p.score}/100`));
        const [lo, hi] = p.net_value_range_inr || [0, 0];
        const subTxt = p.eligible
          ? (hi > 0 ? `Net ₹${f(lo)}–₹${f(hi)} · ${p.effort_level} effort` : `${p.effort_level} effort · ${p.turnaround_days?.join('–')}d`)
          : `Ineligible: ${p.ineligible_reason}`;
        card.append(top, el('div', 'text-[11px] text-stone-500 mt-1', subTxt));
        return card;
      }));
    }

    const cfList = document.getElementById('counterfactualList');
    if (cfList) {
      cfList.replaceChildren(...(decision.what_would_change_this || []).map(txt => el('li', '', txt)));
    }

    const recycleList = document.getElementById('recycleList');
    if (recycleList) {
      const recs = decision.nearby_partners?.authorised_recyclers || [];
      if (!recs.length) {
        recycleList.replaceChildren(el('div', 'px-6 py-4 text-xs text-stone-500', 'No authorised e-waste collection point matched within 25 km. Check MPCB / brand take-back locator.'));
      } else {
        recycleList.replaceChildren(...recs.map(r => {
          const row = el('div', 'flex items-center gap-3 px-6 py-3.5');
          const dot = el('span', 'w-2.5 h-2.5 rounded-full bg-brand-900 shrink-0');
          const info = el('div', 'flex-grow min-w-0');
          info.append(el('div', 'font-semibold truncate', r.name), el('div', 'text-xs text-stone-500 truncate', r.address));
          const badge = el('span', `text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${r.is_sample ? 'text-amber-800 bg-amber-100' : 'text-brand-800 bg-brand-50'}`, r.is_sample ? 'Sample CPCB/Drop' : 'CPCB Authorised');
          const dist = el('span', 'text-xs text-stone-500 shrink-0', `${r.distance_km} km`);
          row.append(dot, info, badge, dist);
          return row;
        }));
      }
    }

    const kabadiCard = document.getElementById('kabadiSplitCard');
    if (kabadiCard) {
      kabadiCard.classList.toggle('hidden', Boolean(decision.regulatory_rule?.kabadiwala_blocked));
    }
  }

  function applyDecisionToState(decision, { isSample = false } = {}) {
    const sum = decision.item_summary;
    const fps = decision.fair_price_shield;
    const ch = Object.fromEntries((decision.channel_comparison?.channels || []).map(c => [c.channel_id, c.net_yield_inr]));
    const mid = fps.band_high + 1.5 * Math.max(100, fps.band_high - fps.band_low);
    const quote = fps.quoted_amount != null ? fps.quoted_amount : fps.band_median;
    const asIsMid = Math.round((sum.as_is_resale_range_inr[0] + sum.as_is_resale_range_inr[1]) / 2);
    const workingMed = sum.working_resale_median_inr;

    D = {
      cert: decision.recommended_path.score,
      quote,
      bandLo: fps.band_low,
      bandHi: fps.band_high,
      mid,
      gmax: Math.max(2000, Math.ceil(mid * 1.25), Math.ceil(quote * 1.2)),
      working: workingMed,
      asis: asIsMid,
      scrap: ch.kabadiwala_scrap ?? 0,
      be: Math.max(100, workingMed - asIsMid),
      rule: sum.repair_ceiling_60pct_inr,
      decay: Math.max(20, Math.round(workingMed * 0.025)),
      qc: decision.provenance.nagpur_quotes_count || 0,
      pr1v: `₹${f(fps.band_low)}–${f(fps.band_high)}`,
      pr2v: 'Included in band'
    };

    P = {
      id: decision.item_id,
      profileKey: isSample ? S.profileKey : null,
      name: sum.model_name,
      cat: sum.category,
      fault: sum.fault_type,
      route: decision.recommended_path.path,
      safety: decision.safety_override?.active ? 'red' : decision.safety_override?.level === 'NEEDS_SPECIALIZED_TOOLS' ? 'amber' : 'green',
      sell: [ch.peer_to_peer ?? null, ch.instant_buyback ?? null, ch.offline_refurbisher ?? null, null, ch.kabadiwala_scrap ?? null],
      presets: [fps.band_low, fps.band_median, Math.round(fps.band_high * 1.6)],
      decision,
      prov: decision.provenance,
      shops: (decision.nearby_partners?.repair_shops || []).slice(0, 2),
      ngos: [...(decision.nearby_partners?.ngos || [])].sort((a, b) => a.distance_meters - b.distance_meters),
      nearLoc: loc
    };

    S.item = decision.item_id;
    S.route = decision.recommended_path.path;
    S.quote = quote;
    S.verified = false;
    S.alertOff = false;
    S.ringDrawn = false;
  }

  async function runDecisionForForm({ isSample = false, jump = false } = {}) {
    await ensureSession();
    const modelName = (document.getElementById('confirmModelName')?.value || '').trim() || 'Household Item';
    const category = document.getElementById('confirmCategory')?.value || 'other';
    const quotedVal = document.getElementById('confirmQuote')?.value;
    const origPriceVal = document.getElementById('itemOriginalPrice')?.value;

    const payload = {
      category,
      modelName,
      working: document.getElementById('stepWorking')?.value || 'partly',
      condition: document.getElementById('stepCondition')?.value || 'good',
      ageBracket: document.getElementById('stepAge')?.value || '1-2',
      priority: document.getElementById('stepPriority')?.value || 'balanced',
      isSwollenBattery: Boolean(document.getElementById('stepHazard')?.checked),
      note: (document.getElementById('itemCustomNote')?.value || '').trim(),
      quotedRepairCost: quotedVal !== '' && quotedVal != null ? Number(quotedVal) : undefined,
      originalPrice: origPriceVal !== '' && origPriceVal != null ? Number(origPriceVal) : undefined,
      imageUrl: S.uploadedUrl || undefined,
      isSample: Boolean(isSample),
      ...(loc || {})
    };

    const decision = await post('/decide', payload);
    applyDecisionToState(decision, { isSample });
    renderProfile();
    if (jump) navigateTo('results');
    return decision;
  }
  window.runDecisionForForm = runDecisionForForm;

  window.useMyLocation = () => {
    const label = document.querySelector('#ngoLocBtn span');
    const fail = () => {
      label.textContent = t('ngo_loc');
      toast(t('ngo_loc_err'));
    };
    if (!navigator.geolocation) return fail();
    label.textContent = t('ngo_locating');
    navigator.geolocation.getCurrentPosition(
      pos => {
        loc = { latitude: +pos.coords.latitude.toFixed(3), longitude: +pos.coords.longitude.toFixed(3) };
        get(`/routing/nearby-partners?targetTrack=ngo_donation&category=${P.cat}${locQS()}`)
          .then(ngos => {
            P.ngos = [...ngos.partners].sort((a, b) => a.distance_meters - b.distance_meters);
            P.nearLoc = loc;
            label.textContent = t('ngo_loc');
            renderProfile();
          })
          .catch(fail);
      },
      fail,
      { timeout: 10000, maximumAge: 600000 }
    );
  };

  const baseDonate = window.donateGateClick;
  window.donateGateClick = () => {
    if (!P.ngos || $$('.ckrow.done').length < 3) return baseDonate();
    const n = P.ngos[0];
    toast(n ? `${n.name} · ${t(n.pickup_available ? 'ngo_pickup' : 'ngo_drop')} · ${n.distance_km} km` : t('ngo_none'));
  };

  const baseRender = window.renderProfile;
  window.renderProfile = function () {
    baseRender();
    if (P) {
      if (P.decision) renderDecisionSummary(P.decision);
      applyShops();
      applyProvenance();
      applyNgos();
    }
  };

  function showDetectBanner(text, isWarning = false) {
    const b = document.getElementById('aiDetectBanner');
    if (!b) return;
    b.className = `mt-5 rounded-2xl px-4 py-3 text-xs font-medium border ${
      isWarning ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-brand-50 border-brand-200 text-brand-900'
    }`;
    b.textContent = text;
    b.classList.remove('hidden');
  }

  // Real photo upload -> EXIF stripped server-side -> AI classify (with honest unknown fallback) -> confirm/decide
  const baseScan = window.startAIAnalysis;
  window.startAIAnalysis = async function () {
    const file = document.getElementById('fileInput')?.files?.[0] || document.getElementById('cameraInput')?.files?.[0];
    const modelInput = document.getElementById('confirmModelName');

    if (file && S.hasItem) {
      try {
        await ensureSession();
        const fd = new FormData();
        fd.append('file', file);
        const up = await req('/vision/upload-media', { method: 'POST', body: fd });
        S.uploadedUrl = up.url;
        showPreview(up.url);

        const note = document.getElementById('itemCustomNote')?.value || '';
        const cls = await post('/vision/classify-single', { imageUrl: up.url, userHint: note });

        if (cls.simulated || cls.category === 'unknown' || cls.confidence == null) {
          showDetectBanner(
            'AI vision is unavailable or unsure — please confirm the category and item name below, then click Analyze.',
            true
          );
          if (!modelInput.value.trim()) {
            modelInput.focus();
            toast('Please confirm the category and item name below');
            return;
          }
        } else {
          document.getElementById('confirmCategory').value = cls.category;
          const label = [cls.brand, cls.model_name].filter(Boolean).join(' ') || cls.sub_category || cls.category;
          if (!modelInput.value.trim()) modelInput.value = label;
          showDetectBanner(`Identified ${label} (${Math.round(cls.confidence * 100)}%). Confirm the 4 taps below if needed.`, false);
        }
      } catch (err) {
        toast(err.message || 'Upload or classification failed');
        return;
      }
    }

    try {
      await runDecisionForForm({ isSample: S.isSample, jump: false });
      baseScan();
    } catch (err) {
      toast(err.message || 'Could not compute recommendation');
    }
  };

  // Crowdsourced calibration -> requires session
  const PAID = [850, 1000, 1400];
  window.calibrated = async function () {
    const i = [...document.querySelectorAll('[onclick="calibrated()"]')].indexOf(event.currentTarget);
    if (PAID[i]) {
      try {
        await ensureSession();
        await post('/partner/calibrate-price', { modelName: P.name, faultType: P.fault, amountPaid: PAID[i] });
      } catch (err) {
        console.error(err);
      }
    }
    toast(t('t_cal'));
  };

  // DPDP Act 2023: Export & Delete My Data
  window.exportMyData = async () => {
    try {
      await ensureSession();
      const data = await get('/auth/my-data');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rekart-my-data.json';
      a.click();
      URL.revokeObjectURL(url);
      toast('Data exported');
    } catch (err) {
      toast(err.message || 'Export failed');
    }
  };

  window.deleteMyData = async () => {
    if (!window.confirm('Delete all your saved items, decisions, and uploaded photos from Rekart?')) return;
    try {
      await ensureSession();
      await req('/auth/me', { method: 'DELETE' });
      sessionReadyPromise = null;
      S.uploadedUrl = null;
      resetUpload();
      toast('All your personal data and photos were deleted');
      navigateTo('home');
    } catch (err) {
      toast(err.message || 'Could not delete data');
    }
  };

  /* ---------- top nav ---------- */
  function markNav(key) {
    $$('.nav-btn').forEach(b => {
      const on = b.dataset.target === key;
      b.classList.toggle('bg-white', on);
      b.classList.toggle('shadow-sm', on);
      b.classList.toggle('text-brand-900', on);
      b.classList.toggle('font-semibold', on);
      b.classList.toggle('text-stone-600', !on);
    });
  }
  const onResults = () => !document.getElementById('screen-results').classList.contains('hidden');
  const baseNav = window.navigateTo;
  window.navigateTo = function (id) {
    baseNav(id);
    hideList();
    if (id === 'results') markNav(S.route);
  };
  const baseRoute = window.setRoute;
  window.setRoute = function (r) {
    baseRoute(r);
    if (onResults()) markNav(r);
  };
  window.goTab = k => {
    if (k === 'donate' || k === 'repair') {
      navigateTo('results');
      setRoute(k);
    } else navigateTo(k);
  };

  /* ---------- search ---------- */
  const srch = document.getElementById('srch'), list = document.getElementById('srchList');
  let rows = [], active = -1, lookupTimer, lookupSeq = 0;

  function localCorpus() {
    const pages = [['home', 'nav_home'], ['donate', 'nav_don'], ['repair', 'nav_rep'], ['reuse-gallery', 'nav_reu'], ['analyze', 'nav_analyze'], ['compare', 'nav_compare'], ['my-items', 'nav_items'], ['impact', 'nav_impact'], ['dashboard', 'nav_dash']]
      .map(([k, key]) => ({ icon: 'arrow-right', label: t(key), sub: 'Page', run: () => goTab(k) }));
    const items = Object.values(SAMPLE_PRESETS).map(sp => ({
      icon: 'package',
      label: sp.modelName,
      sub: `Sample preset · ${sp.category} · ${sp.faultType}`,
      run: () => loadProfile(sp.id, { jump: true })
    }));
    const guides = Object.entries(GUIDES).map(([k, g]) => ({ icon: 'recycle', label: g.t, sub: 'Reuse guide', run: () => openReuseModal(k) }));
    return [...items, ...guides, ...pages];
  }

  function renderList(q, remote = []) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const local = localCorpus().filter(r => words.every(w => (r.label + ' ' + r.sub).toLowerCase().includes(w))).slice(0, 6);
    rows = [...local, ...remote, { icon: 'sparkles', label: `${t('ask_ai')}: “${q}”`, sub: 'Opens the assistant panel', run: () => askAi(q) }];
    active = -1;
    list.replaceChildren(
      ...rows.map((r, i) => {
        const opt = document.createElement('div');
        opt.id = 'srch-opt-' + i;
        opt.setAttribute('role', 'option');
        opt.className = 'srch-opt flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-stone-100';
        const ic = document.createElement('i');
        ic.setAttribute('data-lucide', r.icon);
        ic.className = 'w-4 h-4 text-stone-400 shrink-0';
        const wrap = el('span', 'min-w-0');
        wrap.append(el('b', 'block text-sm truncate', r.label), el('span', 'block text-xs text-stone-500 truncate', r.sub));
        opt.append(ic, wrap);
        opt.addEventListener('mousedown', e => {
          e.preventDefault();
          choose(i);
        });
        return opt;
      })
    );
    list.classList.remove('hidden');
    srch.setAttribute('aria-expanded', 'true');
    icons();
  }
  function hideList() {
    list.classList.add('hidden');
    srch.setAttribute('aria-expanded', 'false');
    srch.removeAttribute('aria-activedescendant');
    active = -1;
  }
  function setActive(i) {
    active = (i + rows.length) % rows.length;
    $$('.srch-opt').forEach((elNode, j) => elNode.classList.toggle('bg-stone-100', j === active));
    srch.setAttribute('aria-activedescendant', 'srch-opt-' + active);
    document.getElementById('srch-opt-' + active).scrollIntoView({ block: 'nearest' });
  }
  function choose(i) {
    const r = rows[i];
    srch.value = '';
    hideList();
    srch.blur();
    r.run();
  }

  srch.addEventListener('input', () => {
    const q = srch.value.trim();
    clearTimeout(lookupTimer);
    if (!q) return hideList();
    renderList(q);
    const seq = ++lookupSeq;
    lookupTimer = setTimeout(
      () =>
        get(`/recycling/where-does-this-go?query=${encodeURIComponent(q)}`)
          .then(d => {
            if (seq !== lookupSeq || srch.value.trim() !== q) return;
            renderList(
              q,
              (d?.matches || [])
                .filter(m => m.keywords)
                .slice(0, 3)
                .map(m => ({
                  icon: 'trash-2',
                  label: m.item_name,
                  sub: `Disposal · ${m.authorised_only ? 'Authorised e-waste only' : m.can_put_in_regular_bin ? 'regular bin OK' : 'not for regular bin'}`,
                  run: () => showDisposal(m)
                }))
            );
          })
          .catch(() => {}),
      250
    );
  });
  srch.addEventListener('keydown', e => {
    if (list.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(active - 1);
    } else if (e.key === 'Escape') hideList();
  });
  srch.addEventListener('focus', () => srch.value.trim() && renderList(srch.value.trim()));
  document.addEventListener('click', e => {
    if (!e.target.closest('#srchWrap')) hideList();
  });
  window.searchSubmit = e => {
    e.preventDefault();
    const q = srch.value.trim();
    if (!q) return false;
    if (active >= 0) choose(active);
    else {
      srch.value = '';
      hideList();
      srch.blur();
      askAi(q);
    }
    return false;
  };

  /* ---------- AI assistant panel ---------- */
  const panel = document.getElementById('aiPanel'), log = document.getElementById('aiLog');
  const chat = [];
  let lastLookup = null;

  function openAi() {
    panel.classList.remove('translate-x-full');
    panel.setAttribute('aria-hidden', 'false');
  }
  window.closeAi = () => {
    panel.classList.add('translate-x-full');
    panel.setAttribute('aria-hidden', 'true');
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') window.closeAi();
  });

  function addMsg(role, text) {
    const msgEl = document.createElement('div');
    msgEl.className =
      role === 'user'
        ? 'ml-auto max-w-[85%] w-fit bg-brand-900 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm whitespace-pre-wrap'
        : 'max-w-[92%] w-fit bg-stone-100 text-stone-800 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap';
    msgEl.textContent = text;
    log.appendChild(msgEl);
    log.scrollTop = log.scrollHeight;
    return msgEl;
  }

  function aiContext() {
    const screen = $$('.screen-view').find(s => !s.classList.contains('hidden'))?.id.replace('screen-', '');
    return {
      city: 'Nagpur',
      screen,
      language: { en: 'English', hi: 'Hindi', hg: 'Hinglish' }[LANG],
      current_item: P && {
        name: P.name,
        category: P.cat,
        likely_fault: P.fault,
        recommended_route: P.route,
        fair_repair_band_inr: [D.bandLo, D.bandHi],
        working_resale_inr: D.working,
        sell_as_is_inr: D.asis,
        repair_ceiling_60pct_inr: D.rule,
        price_source: P.prov?.source,
        price_is_estimate: P.prov?.is_estimate,
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
      await ensureSession();
      const data = await post('/ai/ask', { messages: chat, context: aiContext() });
      pending.textContent = data.reply;
      chat.push({ role: 'assistant', content: data.reply });
    } catch (err) {
      chat.pop();
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
    if (q) {
      inp.value = '';
      askAi(q);
    }
    return false;
  };

  function showDisposal(m) {
    lastLookup = m;
    openAi();
    addMsg(
      'assistant',
      [
        m.item_name,
        `Danger: ${m.danger_level}`,
        m.can_put_in_regular_bin ? 'Regular bin: OK' : 'Regular bin: NO',
        m.regulatory_basis && `Rule: ${m.regulatory_basis}`,
        m.disposal_instructions,
        m.nearest_nagpur_facility && `Nearest: ${m.nearest_nagpur_facility}`,
        m.doorstep_pickup_available && 'Doorstep pickup available'
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  const baseLang = window.applyLang;
  window.applyLang = l => {
    baseLang(l);
    srch.placeholder = t('srch_ph');
    document.getElementById('aiInput').placeholder = t('ai_ph');
    if (onResults()) markNav(S.route);
  };

  applyLang(LANG);
  // Boot initial preview state via real Decision Engine (marked Sample Data)
  runDecisionForForm({ isSample: true, jump: false }).catch(err => console.error('Initial decision load failed:', err));
})();
