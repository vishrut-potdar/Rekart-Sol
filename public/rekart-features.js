/* Feature cards for backend endpoints the design had no UI for: quick checks, defects/warranty, data wipe,
   student technicians, shop quotes, Circular Points, scam checker, donation readiness, reuse ideas,
   Memory Vault, festive clean-out and Pile Mode. Loaded after rekart-api.js and shares the design's globals. */
(() => {
  const API = '/api/v1';
  async function req(path, opts) {
    const r = await fetch(API + path, opts);
    const j = await r.json().catch(() => ({}));
    if (!j.success) throw new Error(j.error?.message || j.error || t('fx_err'));
    return j.data;
  }
  const get = path => req(path);
  const post = (path, body) => req(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const enc = encodeURIComponent;

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function card(titleKey, badge) {
    const c = el('div', 'bg-white rounded-3xl p-6 sm:p-7 border border-stone-200/80 shadow-subtle');
    const head = el('div', 'flex items-center justify-between gap-3 mb-1');
    head.append(el('div', 'font-bold text-brand-950', t(titleKey)));
    if (badge) head.append(badge);
    c.append(head);
    return c;
  }
  const demoBadge = () => el('span', 'text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md shrink-0', t('fx_demo'));
  const sub = text => el('p', 'text-xs text-stone-500 mb-3', text);
  const muted = text => el('p', 'text-xs text-stone-500 py-2', text);
  function btn(text, onClick, primary = true) {
    const b = el('button', primary
      ? 'px-5 py-2.5 rounded-full bg-brand-900 hover:bg-brand-800 text-white font-bold text-sm disabled:opacity-50 transition-all'
      : 'px-4 py-2 rounded-full bg-white border border-stone-300 hover:bg-stone-50 text-stone-800 font-semibold text-xs transition-all', text);
    b.type = 'button';
    b.onclick = onClick;
    return b;
  }
  const chip = (text, on, onClick) => {
    const b = el('button', `px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${on ? 'bg-brand-900 text-white border-brand-900' : 'bg-white text-stone-700 border-stone-300 hover:border-stone-500'}`, text);
    b.type = 'button'; b.onclick = onClick; b.setAttribute('aria-pressed', String(on));
    return b;
  };
  const errorLine = err => el('p', 'text-xs text-amber-900 bg-amber-50 rounded-lg px-3 py-2', err.message || t('fx_err'));
  const humanize = id => (id || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  const apiLang = () => ({ en: 'en', hi: 'hi', hg: 'hinglish' })[LANG] || 'en';
  const brandOf = p => p.name.split(' ')[0];

  // Per-viewer guest id + last known points (browser storage is only a convenience; the server holds the balance).
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }
  };
  let uid = store.get('rekart_uid', null);
  if (!uid) { uid = 'guest_' + Math.random().toString(36).slice(2, 10); store.set('rekart_uid', uid); }

  // State that should survive re-renders (language switch, item reload), keyed by item id.
  const state = {};
  const st = () => (state[P.id] ||= { answers: {} });
  const cache = new Map();
  const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn().catch(e => { cache.delete(key); throw e; })); return cache.get(key); };

  /* ---------- strings ---------- */
  Object.assign(I18N.en, {
    fx_demo: 'Demo data', fx_err: 'Couldn’t load this — try again.', fx_again: 'Start over',
    fx_qc_t: 'Quick checks', fx_qc_s: 'A few taps — we rank the cheapest fixes first.', fx_likely: 'Most likely', fx_homefix: 'Try at home first', fx_nohome: 'No safe home fix for this one — take it to a shop.',
    fx_def_t: 'Known defects & warranty',
    fx_wipe_t: 'Handing over a phone or laptop?', fx_wipe_s: 'Back up and wipe it before anyone else touches it.', fx_android: 'Android', fx_ios: 'iPhone / iPad', fx_critical: 'Don’t skip',
    fx_tech_t: 'Student technicians', fx_tech_s: 'Low-risk repairs by ITI/engineering students at lower labour rates.', fx_tech_off: 'This fault needs a shop, not a student technician.', fx_off: 'off labour', fx_hr: '/hr',
    fx_bc_t: 'Get quotes from nearby shops', fx_bc_s: 'Send this repair to shops near you and compare what they offer.', fx_bc_btn: 'Send request', fx_bc_note: 'Simulated bids — no shops are registered on Rekart yet, so these offers aren’t real.',
    fx_video: 'video proof', fx_oldparts: 'old parts back', fx_warr: '{d}-day warranty', fx_hrs: '{h} h',
    fx_pts_t: 'Circular Points', fx_pts_earned: '🎉 +{n} Circular Points for donating — balance {b}', fx_pts_s: 'Earn points when you donate. 200 points = ₹100 off a repair.', fx_pts_bal: 'Your balance', fx_redeem: 'Redeem 200 for ₹100 off', fx_pts_need: 'Earn {n} more to redeem.', fx_voucher: 'Voucher', fx_valid: 'valid {d} days',
    fx_scam_t: 'Check a buyer’s message', fx_scam_ph: 'Paste what the buyer sent you…', fx_deliv: 'They want me to ship or courier it', fx_check: 'Check message', fx_v_LOW_RISK: 'Looks normal', fx_v_MEDIUM_RISK: 'Be careful', fx_v_HIGH_RISK: 'High risk', fx_v_CRITICAL_RISK: 'Scam pattern', fx_meet: 'Safe hand-over',
    fx_rd_t: 'Will an NGO accept it?', fx_rd1: 'No large tears', fx_rd2: 'No permanent stains', fx_rd3: 'Washed and clean', fx_rd_ok: 'Ready to donate.', fx_rd_no: 'NGOs will turn this down:', fx_rd_go: 'See recycling options',
    fx_ideas_t: 'More ideas for this item', fx_save_inr: 'saves about ₹{n}',
    fx_vault_t: 'Save it to your Memory Vault', fx_vault_s: 'Keep the story, let go of the clutter. We’ll remind you to look again.', fx_vault_story: 'Why it matters to you…', fx_vault_rev: 'Remind me in', fx_months: '{n} months', fx_vault_save: 'Save to Vault', fx_vault_saved: 'Saved. Reminder on {d}.', fx_vault_mine: 'In your Vault',
    fx_fest_t: 'Festive clean-out', fx_fest_s: 'A room-by-room sweep that sorts everything into keep, pass on, donate, sell and recycle.',
    fx_pile_t: 'Your pile, sorted', fx_pile_busy: 'Splitting your pile into items…', fx_pile_demo: 'Demo result: no AI model is connected, so these are sample garments, not what’s in your photo.', fx_rag: 'Rag / textile recovery', fx_closeup: 'Needs a close-up', fx_pile_found: '{n} items found'
  });
  Object.assign(I18N.hi, {
    fx_demo: 'डेमो डेटा', fx_err: 'लोड नहीं हुआ — फिर कोशिश करें।', fx_again: 'फिर से',
    fx_qc_t: 'झटपट जाँच', fx_qc_s: 'कुछ टैप — सबसे सस्ते उपाय पहले।', fx_likely: 'सबसे संभावित', fx_homefix: 'पहले घर पर आज़माएँ', fx_nohome: 'इसका घर पर सुरक्षित उपाय नहीं — दुकान ले जाएँ।',
    fx_def_t: 'ज्ञात ख़राबी और वारंटी',
    fx_wipe_t: 'फ़ोन या लैपटॉप दे रहे हैं?', fx_wipe_s: 'किसी को देने से पहले बैकअप लें और डेटा मिटाएँ।', fx_android: 'एंड्रॉइड', fx_ios: 'आईफ़ोन / आईपैड', fx_critical: 'ज़रूरी',
    fx_tech_t: 'छात्र तकनीशियन', fx_tech_s: 'आसान मरम्मत, ITI/इंजीनियरिंग छात्रों से, कम मज़दूरी में।', fx_tech_off: 'इस ख़राबी के लिए दुकान चाहिए, छात्र नहीं।', fx_off: 'मज़दूरी में छूट', fx_hr: '/घंटा',
    fx_bc_t: 'पास की दुकानों से भाव लें', fx_bc_s: 'यह मरम्मत पास की दुकानों को भेजें और उनके भाव मिलाएँ।', fx_bc_btn: 'भेजें', fx_bc_note: 'नकली भाव — रेकार्ट पर अभी कोई दुकान रजिस्टर नहीं है, ये असली नहीं हैं।',
    fx_video: 'वीडियो सबूत', fx_oldparts: 'पुराना पुर्ज़ा वापस', fx_warr: '{d} दिन वारंटी', fx_hrs: '{h} घंटे',
    fx_pts_t: 'सर्कुलर पॉइंट्स', fx_pts_earned: '🎉 दान के लिए +{n} सर्कुलर पॉइंट्स — कुल {b}', fx_pts_s: 'दान करने पर पॉइंट्स। 200 पॉइंट्स = मरम्मत पर ₹100 छूट।', fx_pts_bal: 'आपके पॉइंट्स', fx_redeem: '200 पॉइंट्स से ₹100 छूट', fx_pts_need: 'रिडीम के लिए {n} और चाहिए।', fx_voucher: 'वाउचर', fx_valid: '{d} दिन मान्य',
    fx_scam_t: 'ख़रीदार का मैसेज जाँचें', fx_scam_ph: 'ख़रीदार ने जो भेजा, यहाँ डालें…', fx_deliv: 'वो कूरियर से भेजने को कह रहे हैं', fx_check: 'जाँचें', fx_v_LOW_RISK: 'सामान्य लगता है', fx_v_MEDIUM_RISK: 'सावधान रहें', fx_v_HIGH_RISK: 'ज़्यादा ख़तरा', fx_v_CRITICAL_RISK: 'धोखे का पैटर्न', fx_meet: 'सुरक्षित लेन-देन',
    fx_rd_t: 'क्या संस्था इसे लेगी?', fx_rd1: 'बड़ा फटा नहीं', fx_rd2: 'पक्के दाग नहीं', fx_rd3: 'धुला और साफ़', fx_rd_ok: 'दान के लिए तैयार।', fx_rd_no: 'संस्थाएँ इसे नहीं लेंगी:', fx_rd_go: 'रीसायकल के विकल्प देखें',
    fx_ideas_t: 'इस चीज़ के और आइडिया', fx_save_inr: 'लगभग ₹{n} की बचत',
    fx_vault_t: 'मेमोरी वॉल्ट में सहेजें', fx_vault_s: 'याद रखें, बोझ छोड़ें। हम दोबारा देखने की याद दिलाएँगे।', fx_vault_story: 'यह आपके लिए क्यों ख़ास है…', fx_vault_rev: 'याद दिलाएँ', fx_months: '{n} महीने में', fx_vault_save: 'सहेजें', fx_vault_saved: 'सहेजा गया। {d} को याद दिलाएँगे।', fx_vault_mine: 'आपके वॉल्ट में',
    fx_fest_t: 'त्योहार की सफ़ाई', fx_fest_s: 'कमरा-दर-कमरा: रखें, आगे दें, दान, बेचें और रीसायकल।',
    fx_pile_t: 'आपका ढेर, छँटा हुआ', fx_pile_busy: 'ढेर को चीज़ों में बाँट रहे हैं…', fx_pile_demo: 'डेमो नतीजा: कोई AI मॉडल नहीं जुड़ा, ये नमूने के कपड़े हैं, आपकी फ़ोटो के नहीं।', fx_rag: 'चिंदी / कपड़ा रीसायकल', fx_closeup: 'क़रीब से फ़ोटो चाहिए', fx_pile_found: '{n} चीज़ें मिलीं'
  });
  Object.assign(I18N.hg, {
    fx_demo: 'Demo data', fx_err: 'Load nahin hua — phir try karo.', fx_again: 'Phir se',
    fx_qc_t: 'Jhatpat jaanch', fx_qc_s: 'Kuch tap — sabse saste upaay pehle.', fx_likely: 'Sabse sambhavit', fx_homefix: 'Pehle ghar par try karo', fx_nohome: 'Iska ghar par safe upaay nahin — dukaan le jao.',
    fx_def_t: 'Known defects aur warranty',
    fx_wipe_t: 'Phone ya laptop de rahe ho?', fx_wipe_s: 'Kisi ko dene se pehle backup lo aur data mitao.', fx_android: 'Android', fx_ios: 'iPhone / iPad', fx_critical: 'Zaroori',
    fx_tech_t: 'Student technicians', fx_tech_s: 'Aasaan repair, ITI/engineering students se, kam mazdoori mein.', fx_tech_off: 'Is kharabi ke liye dukaan chahiye, student nahin.', fx_off: 'mazdoori mein chhoot', fx_hr: '/ghanta',
    fx_bc_t: 'Paas ki dukaanon se bhaav lo', fx_bc_s: 'Yeh repair paas ki dukaanon ko bhejo aur bhaav compare karo.', fx_bc_btn: 'Bhejo', fx_bc_note: 'Nakli bhaav — Rekart par abhi koi dukaan registered nahin, yeh asli nahin hain.',
    fx_video: 'video proof', fx_oldparts: 'purana part wapas', fx_warr: '{d} din warranty', fx_hrs: '{h} ghante',
    fx_pts_t: 'Circular Points', fx_pts_earned: '🎉 Daan ke liye +{n} Circular Points — total {b}', fx_pts_s: 'Daan karne par points. 200 points = repair par ₹100 chhoot.', fx_pts_bal: 'Aapke points', fx_redeem: '200 points se ₹100 chhoot', fx_pts_need: 'Redeem ke liye {n} aur chahiye.', fx_voucher: 'Voucher', fx_valid: '{d} din valid',
    fx_scam_t: 'Buyer ka message check karo', fx_scam_ph: 'Buyer ne jo bheja, yahan paste karo…', fx_deliv: 'Woh courier se bhejne ko keh rahe hain', fx_check: 'Check karo', fx_v_LOW_RISK: 'Normal lagta hai', fx_v_MEDIUM_RISK: 'Saavdhaan raho', fx_v_HIGH_RISK: 'Zyada khatra', fx_v_CRITICAL_RISK: 'Dhokhe ka pattern', fx_meet: 'Safe len-den',
    fx_rd_t: 'Kya NGO ise legi?', fx_rd1: 'Bada phata nahin', fx_rd2: 'Pakke daag nahin', fx_rd3: 'Dhula aur saaf', fx_rd_ok: 'Daan ke liye taiyar.', fx_rd_no: 'NGO ise nahin legi:', fx_rd_go: 'Recycle options dekho',
    fx_ideas_t: 'Is cheez ke aur ideas', fx_save_inr: 'kareeb ₹{n} ki bachat',
    fx_vault_t: 'Memory Vault mein save karo', fx_vault_s: 'Kahaani rakho, bojh chhodo. Hum dobara dekhne ki yaad dilayenge.', fx_vault_story: 'Yeh aapke liye kyun khaas hai…', fx_vault_rev: 'Yaad dilao', fx_months: '{n} mahine mein', fx_vault_save: 'Vault mein save', fx_vault_saved: 'Save ho gaya. {d} ko yaad dilayenge.', fx_vault_mine: 'Aapke Vault mein',
    fx_fest_t: 'Tyohaar ki safai', fx_fest_s: 'Kamra-dar-kamra: rakho, aage do, daan, becho aur recycle.',
    fx_pile_t: 'Aapka dher, chhanta hua', fx_pile_busy: 'Dher ko cheezon mein baant rahe hain…', fx_pile_demo: 'Demo result: koi AI model connected nahin, yeh sample kapde hain, aapki photo ke nahin.', fx_rag: 'Chindi / textile recycle', fx_closeup: 'Close-up photo chahiye', fx_pile_found: '{n} cheezein mili'
  });
  const tf = (k, vars) => Object.entries(vars).reduce((s, [a, b]) => s.replace(`{${a}}`, b), t(k));
  const fmtDate = iso => new Date(iso).toLocaleDateString(LANG === 'en' ? 'en-IN' : 'hi-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  // One container per route panel, placed before the panel's trailing "keep it" link if it has one.
  function slot(panelId) {
    const id = panelId + '-fx';
    let s = document.getElementById(id);
    if (!s) {
      s = el('div', 'space-y-5 mt-5'); s.id = id;
      const panel = document.getElementById(panelId);
      const tail = panel.querySelector(':scope > button[data-i18n="keep_cta"]');
      tail ? panel.insertBefore(s, tail) : panel.append(s);
    }
    return s;
  }

  /* ---------- REPAIR ---------- */
  function quickChecks() {
    const c = card('fx_qc_t');
    c.append(sub(t('fx_qc_s')));
    const body = el('div', 'space-y-4'); c.append(body);
    const s = st();
    once(`tree:${P.cat}:${apiLang()}`, () => get(`/triage/questions?category=${P.cat}&language=${apiLang()}`)).then(tree => {
      // The backend only has question sets for some categories; it falls back to another set otherwise.
      if (!tree.flow_id.startsWith(P.cat)) return c.remove();
      if (s.result) return showResult(body, s);
      tree.steps.forEach(step => {
        const q = el('div');
        q.append(el('div', 'text-sm font-semibold text-stone-800 mb-2', step.question));
        const opts = el('div', 'flex flex-wrap gap-2');
        step.options.forEach(o => opts.append(chip(o.label, s.answers[step.step_id] === o.id, () => {
          s.answers[step.step_id] = o.id;
          if (tree.steps.every(x => s.answers[x.step_id])) {
            post('/triage/session', { category: P.cat, language: apiLang(), answers: s.answers })
              .then(r => { s.result = r; renderFeatures(); }).catch(e => body.append(errorLine(e)));
          } else renderFeatures();
        })));
        q.append(opts); body.append(q);
      });
    }).catch(e => body.append(errorLine(e)));
    return c;
  }
  function showResult(body, s) {
    const f = s.result.fault_analysis;
    const pf = f.primary_fault;
    if (pf) {
      const box = el('div', 'rounded-2xl bg-brand-50 px-4 py-3');
      box.append(el('div', 'text-[11px] font-bold uppercase tracking-wide text-brand-700', t('fx_likely')),
        el('div', 'font-bold text-brand-950', `${humanize(pf.fault)} · ${Math.round(pf.confidence * 100)}%`),
        el('div', 'text-xs text-stone-600', pf.component));
      body.append(box);
    }
    if (f.non_invasive_remediation_steps?.length) {
      body.append(el('div', 'text-xs font-bold text-stone-700', t('fx_homefix')));
      f.non_invasive_remediation_steps.forEach(x => {
        const r = el('div', 'text-[13px] text-stone-600');
        r.append(el('b', 'text-stone-800', `${x.title} · ₹${x.estimated_cost_inr}`), el('div', '', x.instructions));
        body.append(r);
      });
    } else body.append(muted(t('fx_nohome')));
    const again = btn(t('fx_again'), () => { s.answers = {}; s.result = null; renderFeatures(); }, false);
    body.append(again);
  }

  function knownDefects() {
    const c = card('fx_def_t');
    const body = el('div', 'text-[13px] text-stone-600 space-y-1.5'); c.append(body);
    once(`def:${P.id}`, () => get(`/repair/known-defects?brand=${enc(brandOf(P))}&modelName=${enc(P.name)}&symptoms=${enc(P.fault)}`)).then(d => {
      body.append(el('p', d.has_known_defect ? 'font-semibold text-amber-900' : '', d.message || d.defect_summary || ''));
      if (d.standard_warranty_guidance) body.append(el('p', 'text-xs text-stone-500', d.standard_warranty_guidance));
      if (d.consumer_rights_note) body.append(el('p', 'text-xs text-stone-500', d.consumer_rights_note));
    }).catch(e => body.append(errorLine(e)));
    return c;
  }

  function dataWipe() {
    const c = card('fx_wipe_t');
    c.append(sub(t('fx_wipe_s')));
    const s = st();
    s.platform ||= 'android';
    const tabs = el('div', 'flex gap-2 mb-3');
    [['android', 'fx_android'], ['ios', 'fx_ios']].forEach(([p, k]) => tabs.append(chip(t(k), s.platform === p, () => { s.platform = p; renderFeatures(); })));
    const list = el('ol', 'space-y-2.5 text-[13px] text-stone-600');
    c.append(tabs, list);
    once(`wipe:${s.platform}`, () => get(`/repair/data-wipe-checklist?platform=${s.platform}`)).then(d => {
      d.steps.forEach(x => {
        const li = el('li', 'flex gap-2.5');
        const txt = el('div');
        const title = el('b', 'text-stone-800', x.title);
        txt.append(title);
        if (x.critical) txt.append(el('span', 'ml-2 text-[10px] font-bold uppercase text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded', t('fx_critical')));
        txt.append(el('div', '', x.instructions));
        li.append(el('b', 'text-stone-400', String(x.step_number)), txt);
        list.append(li);
      });
    }).catch(e => list.append(errorLine(e)));
    return c;
  }

  function studentTechs() {
    const c = card('fx_tech_t', demoBadge());
    c.append(sub(t('fx_tech_s')));
    const body = el('div', 'divide-y divide-stone-100'); c.append(body);
    once(`tech:${P.cat}:${P.fault}`, () => get(`/repair/student-technicians?category=${P.cat}&faultType=${enc(P.fault)}`)).then(d => {
      if (!d.is_eligible_for_student_tech) return body.append(muted(t('fx_tech_off')));
      d.available_student_technicians.forEach(x => {
        const r = el('div', 'py-3 text-sm');
        const top = el('div', 'flex justify-between gap-3');
        top.append(el('b', '', x.full_name), el('span', 'text-xs font-semibold text-stone-600 shrink-0', `₹${x.hourly_rate_inr}${t('fx_hr')}`));
        r.append(top, el('div', 'text-xs text-stone-500', `${x.institution} · ${x.location}`),
          el('div', 'text-xs text-brand-800 mt-0.5', `${x.labour_discount_percentage}% ${t('fx_off')} · ★ ${x.rating}`));
        body.append(r);
      });
    }).catch(e => body.append(errorLine(e)));
    return c;
  }

  function shopQuotes() {
    const c = card('fx_bc_t', demoBadge());
    c.append(sub(t('fx_bc_s')));
    const s = st();
    const body = el('div', 'space-y-3'); c.append(body);
    if (!s.bids) {
      const b = btn(t('fx_bc_btn'), () => {
        b.disabled = true;
        const note = document.getElementById('itemCustomNote')?.value;
        post('/repair/broadcast-request', { itemId: P.id, modelName: P.name, faultDescription: note || P.fault })
          .then(d => { s.bids = d; renderFeatures(); })
          .catch(e => { b.disabled = false; body.append(errorLine(e)); });
      });
      body.append(b);
      return c;
    }
    body.append(el('p', 'text-xs text-amber-900 bg-amber-50 rounded-lg px-3 py-2', t('fx_bc_note')));
    s.bids.bids.forEach(x => {
      const r = el('div', 'rounded-2xl border border-stone-200 px-4 py-3');
      const top = el('div', 'flex justify-between gap-3');
      top.append(el('b', 'text-sm', x.shop_name), el('b', 'text-sm', `₹${f(x.total_quoted_inr)}`));
      const perks = [`${x.distance_km} km`, tf('fx_hrs', { h: x.estimated_turnaround_hours }), tf('fx_warr', { d: x.warranty_days }),
        x.provides_video_proof && t('fx_video'), x.returns_old_parts && t('fx_oldparts')].filter(Boolean).join(' · ');
      r.append(top, el('div', 'text-xs text-stone-600 mt-0.5', x.proposed_solution), el('div', 'text-[11px] text-stone-400 mt-1', perks));
      body.append(r);
    });
    return c;
  }

  function points() {
    const c = card('fx_pts_t', demoBadge()); // points are tracked for real; no shop honours the vouchers yet
    c.append(sub(t('fx_pts_s')));
    const row = el('div', 'flex flex-wrap items-center justify-between gap-3');
    const bal = el('div', 'text-sm');
    c.append(row);
    row.append(bal);
    get(`/rewards/balance?userId=${enc(uid)}`).then(d => {
      bal.replaceChildren(el('span', 'text-stone-500', `${t('fx_pts_bal')}: `), el('b', 'text-brand-900', String(d.points_balance)));
      if (d.points_balance >= 200) {
        const b = btn(t('fx_redeem'), () => {
          b.disabled = true;
          post('/rewards/redeem', { userId: uid, pointsToRedeem: 200 }).then(v => {
            const box = el('div', 'mt-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm');
            box.append(el('div', 'font-mono font-bold text-brand-950', `${t('fx_voucher')}: ${v.voucher_code}`),
              el('div', 'text-xs text-stone-600', `₹${v.discount_amount_inr} · ${tf('fx_valid', { d: v.validity_days })}`),
              el('div', 'text-xs text-stone-500 mt-1', v.redemption_terms));
            c.append(box);
            bal.lastChild.textContent = String(v.new_points_balance);
            b.remove();
          }).catch(e => { b.disabled = false; c.append(errorLine(e)); });
        });
        row.append(b);
      } else row.append(el('span', 'text-xs text-stone-500', tf('fx_pts_need', { n: 200 - d.points_balance })));
    }).catch(e => c.append(errorLine(e)));
    return c;
  }

  /* ---------- SELL ---------- */
  function scamChecker() {
    const c = card('fx_scam_t');
    const s = st();
    const ta = el('textarea', 'w-full mt-2 px-4 py-3 rounded-2xl bg-stone-100 focus:bg-white border border-transparent focus:border-brand-500 outline-none text-sm');
    ta.rows = 3; ta.placeholder = t('fx_scam_ph'); ta.value = s.scamMsg || '';
    ta.oninput = () => { s.scamMsg = ta.value; };
    const lab = el('label', 'flex items-center gap-2 text-xs text-stone-600 mt-2 cursor-pointer');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = Boolean(s.scamShip); cb.onchange = () => { s.scamShip = cb.checked; };
    lab.append(cb, el('span', '', t('fx_deliv')));
    const out = el('div', 'mt-3 space-y-2');
    const b = btn(t('fx_check'), () => {
      if (!ta.value.trim()) return ta.focus();
      b.disabled = true;
      post('/selling/scam-shield', { message: ta.value, deliveryRequested: cb.checked })
        .then(d => { s.scam = d; b.disabled = false; drawScam(out, d); })
        .catch(e => { b.disabled = false; out.replaceChildren(errorLine(e)); });
    });
    const actions = el('div', 'mt-3'); actions.append(b);
    c.append(ta, lab, actions, out);
    if (s.scam) drawScam(out, s.scam);
    return c;
  }
  function drawScam(out, d) {
    const tone = d.is_suspicious ? 'bg-red-50 text-red-800 border-red-200' : 'bg-brand-50 text-brand-900 border-brand-200';
    const head = el('div', `rounded-2xl border px-4 py-3 ${tone}`);
    const verdict = I18N.en['fx_v_' + d.risk_verdict] ? t('fx_v_' + d.risk_verdict) : d.risk_verdict;
    head.append(el('b', 'text-sm', `${verdict} · ${d.risk_score}/100`));
    (d.flagged_indicators || []).forEach(x => head.append(el('div', 'text-xs mt-1.5', `${x.warning} ${x.explanation || ''}`)));
    out.replaceChildren(head);
    if (d.safe_meetup_guidelines?.length) {
      out.append(el('div', 'text-xs font-bold text-stone-700 mt-2', t('fx_meet')));
      const ul = el('ul', 'list-disc pl-5 text-xs text-stone-600 space-y-1');
      d.safe_meetup_guidelines.forEach(g => ul.append(el('li', '', g)));
      out.append(ul);
    }
  }

  /* ---------- DONATE ---------- */
  function readiness() {
    const c = card('fx_rd_t');
    const s = st();
    s.rd ||= { tears: false, stains: false, washed: true };
    const opts = el('div', 'flex flex-wrap gap-2 mt-2');
    const flip = k => () => { s.rd[k] = !s.rd[k]; s.rdResult = null; renderFeatures(); };
    opts.append(chip(t('fx_rd1'), !s.rd.tears, flip('tears')), chip(t('fx_rd2'), !s.rd.stains, flip('stains')), chip(t('fx_rd3'), s.rd.washed, flip('washed')));
    const out = el('div', 'mt-3');
    c.append(opts, out);
    const draw = r => {
      if (r.is_eligible_for_ngo_donation) return out.replaceChildren(el('p', 'text-sm font-semibold text-brand-800', `✓ ${t('fx_rd_ok')}`));
      const box = el('div', 'rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-900');
      box.append(el('b', 'text-sm', t('fx_rd_no')));
      r.rejection_reasons.forEach(x => box.append(el('div', 'text-xs mt-1', `• ${x}`)));
      if (r.fallback_action_description) box.append(el('div', 'text-xs mt-2', r.fallback_action_description));
      const go = btn(t('fx_rd_go'), () => setRoute('recycle'), false); go.classList.add('mt-3');
      box.append(go);
      out.replaceChildren(box);
    };
    if (s.rdResult) draw(s.rdResult);
    else post('/routing/readiness-check', {
      category: P.cat,
      conditionAttributes: { has_major_tears: s.rd.tears, has_permanent_stains: s.rd.stains, is_washed_and_hygienic: s.rd.washed }
    }).then(r => { s.rdResult = r; draw(r); }).catch(e => out.replaceChildren(errorLine(e)));
    return c;
  }

  // Completing the donation checklist with a matching NGO earns Circular Points (once per item).
  const awarded = new Set(store.get('rekart_awarded', []));
  const baseDonate = window.donateGateClick;
  window.donateGateClick = () => {
    baseDonate();
    if (!P.ngos?.length || $$('.ckrow.done').length < 3 || awarded.has(P.id)) return;
    const action = { apparel: 'ngo_donation_apparel', books: 'ngo_donation_books' }[P.cat] || 'ngo_donation';
    post('/rewards/award', { userId: uid, actionType: action, referenceId: `${P.id}:${P.ngos[0].id}` }).then(r => {
      awarded.add(P.id); store.set('rekart_awarded', [...awarded]);
      renderFeatures(); // refresh the points balance
      setTimeout(() => toast(tf('fx_pts_earned', { n: r.points_earned, b: r.new_points_balance })), 2600); // after the NGO toast
    }).catch(console.error);
  };

  /* ---------- REUSE ---------- */
  function reuseIdeas() {
    const c = card('fx_ideas_t');
    const body = el('div', 'space-y-3 mt-2'); c.append(body);
    once(`ideas:${P.id}`, () => get(`/reuse/repurposing-ideas?category=${P.cat}&subType=${enc(P.id + ' ' + P.name)}`)).then(d => {
      // "Household Item" is the backend's generic fallback; only show item-specific ideas.
      if (d.item === 'Household Item' || !d.repurposing_cards?.length) return c.remove();
      d.repurposing_cards.forEach(x => {
        const r = el('div', 'border-b border-stone-100 pb-3 last:border-0');
        r.append(el('b', 'block text-sm', x.title),
          el('span', 'text-xs text-stone-400', [x.difficulty, x.estimated_savings_inr && tf('fx_save_inr', { n: f(x.estimated_savings_inr) })].filter(Boolean).join(' · ')),
          el('p', 'text-[13px] text-stone-600 mt-1', x.instructions));
        body.append(r);
      });
    }).catch(() => c.remove());
    return c;
  }

  function vault() {
    const c = card('fx_vault_t');
    c.append(sub(t('fx_vault_s')));
    const s = st();
    const title = el('input', 'w-full px-4 py-2.5 rounded-full bg-stone-100 focus:bg-white border border-transparent focus:border-brand-500 outline-none text-sm');
    title.value = s.vaultTitle ?? P.name; title.oninput = () => { s.vaultTitle = title.value; };
    const story = el('textarea', 'w-full mt-2 px-4 py-3 rounded-2xl bg-stone-100 focus:bg-white border border-transparent focus:border-brand-500 outline-none text-sm');
    story.rows = 2; story.placeholder = t('fx_vault_story'); story.value = s.vaultStory || ''; story.oninput = () => { s.vaultStory = story.value; };
    s.months ||= 6;
    const months = el('div', 'flex flex-wrap items-center gap-2 mt-3');
    months.append(el('span', 'text-xs text-stone-500', t('fx_vault_rev')));
    [3, 6, 12].forEach(m => months.append(chip(tf('fx_months', { n: m }), s.months === m, () => { s.months = m; renderFeatures(); })));
    const out = el('div', 'mt-3');
    const b = btn(t('fx_vault_save'), () => {
      if (!title.value.trim()) return title.focus();
      if (!story.value.trim()) return story.focus();
      b.disabled = true;
      post('/reuse/memory-vault', { userId: uid, title: title.value.trim(), emotionalStory: story.value.trim(), reviewReminderMonths: s.months }).then(v => {
        const list = store.get('rekart_vault', []);
        list.unshift({ title: v.title, remind: v.review_reminder_date });
        store.set('rekart_vault', list.slice(0, 20));
        s.vaultStory = ''; b.disabled = false;
        out.replaceChildren(el('p', 'text-sm font-semibold text-brand-800', `✓ ${tf('fx_vault_saved', { d: fmtDate(v.review_reminder_date) })}`));
        story.value = '';
        drawMine();
      }).catch(e => { b.disabled = false; out.replaceChildren(errorLine(e)); });
    });
    const actions = el('div', 'mt-3'); actions.append(b);
    const mine = el('div', 'mt-4');
    const drawMine = () => {
      const list = store.get('rekart_vault', []);
      if (!list.length) return mine.replaceChildren();
      mine.replaceChildren(el('div', 'text-xs font-bold text-stone-700 mb-1', t('fx_vault_mine')),
        ...list.slice(0, 5).map(x => el('div', 'text-xs text-stone-600 py-1 border-b border-stone-100', `${x.title} · ${fmtDate(x.remind)}`)));
    };
    drawMine();
    c.append(title, story, months, actions, out, mine);
    return c;
  }

  /* ---------- Reuse Studio page: festive clean-out ---------- */
  function festive() {
    const page = document.getElementById('screen-reuse-gallery');
    if (!page || document.getElementById('fx-festive')) return;
    const sec = el('div', 'mt-10'); sec.id = 'fx-festive';
    page.append(sec);
    get('/reuse/festive-cleanout').then(d => {
      sec.append(el('h2', 'text-xl font-extrabold text-stone-900', `${t('fx_fest_t')} — ${d.campaign_name}`), el('p', 'text-sm text-stone-600 mt-1 mb-4', t('fx_fest_s')));
      const grid = el('div', 'grid sm:grid-cols-2 gap-4');
      d.stages.forEach(x => {
        const c = el('div', 'bg-white rounded-3xl p-5 border border-stone-200/80 shadow-subtle');
        c.append(el('div', 'text-[11px] font-bold uppercase tracking-wide text-brand-700', `${x.stage_number}`),
          el('b', 'block text-sm mt-0.5', x.zone_name),
          el('div', 'text-xs text-stone-500 mt-1', x.target_items.join(' · ')),
          el('p', 'text-[13px] text-stone-600 mt-2', x.action_prompt));
        grid.append(c);
      });
      sec.append(grid);
    }).catch(() => sec.remove());
  }

  /* ---------- Pile Mode ---------- */
  const PILE_ROUTE = { A: 'r_sell', B: 'r_donate', C: 'r_reuse', BER: 'fx_rag' };
  function setupPile() {
    const pileBtn = document.querySelector('[onclick="toast(t(\'t_pile\'))"]');
    if (!pileBtn) return;
    const input = el('input'); input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
    document.body.append(input);
    pileBtn.removeAttribute('onclick');
    pileBtn.addEventListener('click', () => input.click());

    const modal = el('div', 'modal'); modal.id = 'm-pile';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    const head = el('div', 'flex items-center justify-between mb-3');
    const close = el('button', 'p-1 text-stone-400 hover:text-stone-800', '✕'); close.type = 'button'; close.onclick = () => closeModal(); close.setAttribute('aria-label', 'Close');
    const title = el('b', 'text-lg');
    head.append(title, close);
    const body = el('div', 'space-y-3 max-h-[65vh] overflow-y-auto');
    modal.append(head, body);
    document.getElementById('mlayer').append(modal);

    input.onchange = async () => {
      const file = input.files[0]; input.value = '';
      if (!file) return;
      title.textContent = t('fx_pile_t');
      body.replaceChildren(el('p', 'text-sm text-stone-500 animate-pulse', t('fx_pile_busy')));
      openModal('m-pile');
      try {
        const fd = new FormData(); fd.append('file', file);
        const up = await req('/vision/upload-media', { method: 'POST', body: fd });
        const d = await post('/vision/decompose-pile', { batchPhotoUrl: up.url, userId: uid, assumedCategory: 'apparel' });
        const rows = [el('p', 'text-xs text-stone-500', tf('fx_pile_found', { n: d.items_detected_count }))];
        if (d.items.some(x => x.metadata?.simulated)) rows.unshift(el('p', 'text-xs text-amber-900 bg-amber-50 rounded-lg px-3 py-2', t('fx_pile_demo')));
        d.items.forEach(x => {
          const r = el('div', 'rounded-2xl border border-stone-200 px-4 py-3');
          const top = el('div', 'flex justify-between gap-3');
          const grade = x.provisional_grade;
          top.append(el('b', 'text-sm', x.model_name), el('span', 'text-xs font-bold text-brand-800 bg-brand-50 px-2 py-0.5 rounded-md shrink-0', t(PILE_ROUTE[grade] || 'r_donate')));
          const meta = [x.metadata?.color, `Grade ${grade}`, ...(x.metadata?.visual_defects || []).map(humanize)].filter(Boolean).join(' · ');
          r.append(top, el('div', 'text-xs text-stone-500 mt-0.5', meta));
          if (x.metadata?.requires_exception_closeup) r.append(el('div', 'text-xs text-amber-800 mt-1', `${t('fx_closeup')}: ${x.metadata.exception_reason}`));
          rows.push(r);
        });
        body.replaceChildren(...rows);
      } catch (e) {
        body.replaceChildren(errorLine(e));
      }
    };
  }

  /* ---------- render ---------- */
  function renderFeatures() {
    if (!P) return;
    const electronics = P.cat === 'electronics';
    slot('pnl-repair').replaceChildren(...[
      quickChecks(),
      (electronics || P.cat === 'appliance') && knownDefects(),
      electronics && dataWipe(),
      electronics && studentTechs(),
      shopQuotes(),
      points()
    ].filter(Boolean));
    slot('pnl-sell').replaceChildren(scamChecker());
    // Readiness rules exist for clothes, books and utensils; other categories always pass, so the card would say nothing.
    slot('pnl-donate').replaceChildren(...[['apparel', 'books', 'kitchenware'].includes(P.cat) && readiness()].filter(Boolean));
    slot('pnl-reuse').replaceChildren(reuseIdeas(), vault());
  }

  const baseRender = window.renderProfile;
  window.renderProfile = function () { baseRender(); renderFeatures(); };

  setupPile();
  festive();
  renderFeatures();
})();
