// Rekart Frontend Controller
let activeAuthToken = localStorage.getItem('rekart_auth_token') || '';
let currentItemId = 'item-demo-101';

// Tab Switcher
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
  const targetPane = document.getElementById(tabId);
  if (targetPane) targetPane.classList.add('active');

  const clickedBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabId));
  if (clickedBtn) clickedBtn.classList.add('active');
}

// Toggle vision mode
function toggleVisionMode() {
  const mode = document.getElementById('visionMode').value;
  document.getElementById('pileSection').style.display = mode === 'pile' ? 'block' : 'none';
  document.getElementById('singleSection').style.display = mode === 'single' ? 'block' : 'none';
}

// 1. Pile Decomposition
async function runPileDecomposition() {
  const box = document.getElementById('visionResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Decomposing pile via CV & AI vision model...';

  const batchPhotoUrl = document.getElementById('pileImageUrl').value;
  try {
    const res = await fetch('/api/v1/vision/decompose-pile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchPhotoUrl, userId: 'user_nagpur_web' })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Decomposition failed');

    const items = data.data.items;
    if (items.length > 0) currentItemId = items[0].id;

    box.innerHTML = `<strong>✅ Detected ${data.data.items_detected_count} garments from photo:</strong><br><br>` +
      items.map(i => `
        <div style="background:#1e293b; padding:0.6rem; border-radius:0.4rem; margin-bottom:0.5rem;">
          <strong>${i.model_name}</strong> - Grade: <span class="pill pill-green">${i.provisional_grade}</span><br>
          <small style="color:#94a3b8;">Box: (${i.bounding_box.width}x${i.bounding_box.height}) | Color: ${i.metadata.color} | ID: ${i.id}</small>
          ${i.metadata.requires_exception_closeup ? `<br><span style="color:#fbbf24; font-size:0.8rem;">⚠️ ${i.metadata.exception_reason}</span>` : ''}
        </div>
      `).join('');
  } catch (err) {
    box.innerHTML = `<span style="color:#f87171;">Error: ${err.message}</span>`;
  }
}

// Single Item Classification
async function runSingleClassification() {
  const box = document.getElementById('visionResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Classifying item...';

  const imageUrl = document.getElementById('singleImageUrl').value;
  const userHint = document.getElementById('userHint').value;

  try {
    const res = await fetch('/api/v1/vision/classify-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl, userHint })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Classification failed');

    const d = data.data;
    box.innerHTML = `
      <strong>✅ AI Item Identification:</strong><br>
      • Category: <strong>${d.category}</strong> (${d.sub_category})<br>
      • Model: <strong>${d.brand} ${d.model_name}</strong> (${Math.round(d.confidence * 100)}% match)<br>
      • Features: ${d.detected_features.join(', ')}<br>
      • Visible Defects: ${d.visual_defects.length ? d.visual_defects.join(', ') : 'None'}
    `;
    document.getElementById('shieldModel').value = d.model_name;
  } catch (err) {
    box.innerHTML = `<span style="color:#f87171;">Error: ${err.message}</span>`;
  }
}

// 2. Load Diagnostic Questions
async function loadQuestions() {
  const container = document.getElementById('questionsContainer');
  if (!container) return;
  const lang = document.getElementById('triageLanguage').value;

  try {
    const res = await fetch(`/api/v1/triage/questions?category=electronics&language=${lang}`);
    const data = await res.json();
    const tree = data.data;

    container.innerHTML = tree.steps.map((s, idx) => `
      <div style="margin-bottom:1rem; padding:0.75rem; background:#0f172a; border-radius:0.5rem;">
        <label style="color:#fff;">${idx + 1}. ${s.question}</label>
        <select id="${s.step_id}">
          ${s.options.map(o => `<option value="${o.id}">${o.label}</option>`).join('')}
        </select>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = 'Error loading questions';
  }
}

// Submit Diagnostic Answers
async function submitTriageAnswers() {
  const box = document.getElementById('triageResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Correlating symptoms & telemetry...';

  const answers = {
    q1_power: document.getElementById('q1_power')?.value || 'power_ok',
    q2_charging: document.getElementById('q2_charging')?.value || 'charge_normal',
    q3_battery_health: document.getElementById('q3_battery_health')?.value || 'bat_few_hours',
    q4_touch_and_audio: document.getElementById('q4_touch_and_audio')?.value || 'touch_all_good'
  };

  try {
    const res = await fetch('/api/v1/triage/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: currentItemId,
        category: 'electronics',
        answers,
        telemetry: {
          touchscreen_grid: { total_blocks: 100, passed_blocks: 94 },
          battery: { design_capacity_mah: 4000, current_capacity_mah: 3100, cycle_count: 520 }
        }
      })
    });
    const data = await res.json();
    const d = data.data;

    box.innerHTML = `
      <strong>🩺 Triage Diagnostic Assessment:</strong><br>
      • Health Grade: <span class="pill pill-green">${d.telemetry.provisional_hardware_grade}</span> (${d.telemetry.composite_health_score}/100)<br>
      • Primary Fault: <strong>${d.fault_analysis.primary_fault.fault}</strong> (${Math.round(d.fault_analysis.primary_fault.confidence * 100)}%)<br>
      • Safety Rating: <strong>${d.safety_assessment.safety_level}</strong><br>
      ${d.fault_analysis.non_invasive_remediation_steps.length > 0 ? `
        <div style="margin-top:0.5rem; color:#34d399; font-size:0.85rem;">
          💡 <strong>Zero-Cost Remediation:</strong> ${d.fault_analysis.non_invasive_remediation_steps[0].title}
        </div>
      ` : ''}
    `;
  } catch (err) {
    box.innerHTML = `<span style="color:#f87171;">Error: ${err.message}</span>`;
  }
}

// 3. Fair Price Shield Evaluation
async function evaluateQuote() {
  const box = document.getElementById('shieldResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Evaluating quote against Nagpur price shield...';

  const modelName = document.getElementById('shieldModel').value;
  const faultType = document.getElementById('shieldFault').value;
  const quotedAmount = document.getElementById('shieldQuote').value;

  try {
    const res = await fetch('/api/v1/calc/fair-price-shield', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cityId: 'nagpur',
        modelName,
        faultType,
        partGrade: 'aftermarket',
        quotedAmount
      })
    });
    const data = await res.json();
    const s = data.data;

    const pillClass = s.rating_code === 'GREEN' || s.rating_code === 'LIGHT_GREEN' ? 'pill-green' : s.rating_code === 'AMBER' ? 'pill-yellow' : 'pill-red';

    box.innerHTML = `
      Verdict: <span class="pill ${pillClass}">${s.verdict}</span><br>
      • Quoted: ₹${s.quoted_amount} vs Nagpur Median: <strong>₹${s.local_benchmark.median_p50}</strong><br>
      • Expected Range: ₹${s.local_benchmark.p25} - ₹${s.local_benchmark.p75}<br>
      • Advisory: ${s.advisory_message}
    `;
  } catch (err) {
    box.innerHTML = `<span style="color:#f87171;">Error: ${err.message}</span>`;
  }
}

// 4. Repair-or-Release & Channels
async function calculateMatrixAndChannels() {
  const box = document.getElementById('matrixResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Computing decision matrix & channel net yields...';

  const modelName = document.getElementById('shieldModel').value;
  const functionalResaleValue = Number(document.getElementById('marketResale').value);
  const estimatedRepairCost = Number(document.getElementById('repairCost').value);

  try {
    const resMatrix = await fetch('/api/v1/calc/repair-or-release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelName,
        functionalResaleValue,
        estimatedRepairCost,
        asIsScrapValue: 5000,
        brandExchangeValue: 12000
      })
    });
    const dataMatrix = (await resMatrix.json()).data;

    const resChannels = await fetch('/api/v1/calc/channel-comparison', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelName,
        functionalMarketValue: functionalResaleValue,
        estimatedRepairCost
      })
    });
    const dataChannels = (await resChannels.json()).data;

    box.innerHTML = `
      <strong>Decision:</strong> <span class="pill pill-green">${dataMatrix.recommended_outcome.toUpperCase()}</span><br>
      • 60% Repair Threshold Ceiling: <strong>₹${dataMatrix.repair_threshold_ceiling_inr}</strong> (Actual: ₹${estimatedRepairCost})<br>
      • ${dataMatrix.rationalization}<br><br>
      <strong>📊 Net Resale Yields Across Channels:</strong><br>
      ${dataChannels.channels.map(c => `
        <div class="channel-card">
          <div>
            <div class="channel-title">${c.channel_name}</div>
            <div class="channel-subtitle">${c.turnaround_time} | ${c.effort_level}</div>
          </div>
          <div class="channel-payout">₹${c.net_yield_inr}</div>
        </div>
      `).join('')}
    `;
  } catch (err) {
    box.innerHTML = `<span style="color:#f87171;">Error: ${err.message}</span>`;
  }
}

// 5. Instant Payout
async function triggerInstantPayout() {
  const box = document.getElementById('payoutResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Processing UPI transfer...';

  const amount = document.getElementById('payoutAmount').value;
  const vpaAddress = document.getElementById('payoutVpa').value;

  try {
    const res = await fetch('/api/v1/payment/instant-payout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: currentItemId, amount, vpaAddress })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || data.error);

    box.innerHTML = `
      <span style="color:#34d399;"><strong>✅ UPI Payout Dispatched!</strong></span><br>
      • Amount: <strong>₹${data.data.amount_inr}</strong> to <code>${data.data.vpa_address}</code><br>
      • Gateway Ref: ${data.data.gateway_reference}<br>
      • UTR: <strong>${data.data.utr_number}</strong>
    `;
  } catch (err) {
    box.innerHTML = `<span style="color:#f87171;">Error: ${err.message}</span>`;
  }
}

// TAB 2: Student Techs
async function checkStudentTechs() {
  const box = document.getElementById('studentTechResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Checking student technician roster...';

  const faultType = document.getElementById('studentFaultType').value;
  try {
    const res = await fetch(`/api/v1/repair/student-technicians?faultType=${encodeURIComponent(faultType)}&cityId=nagpur`);
    const data = await res.json();
    const d = data.data;

    if (!d.is_eligible_for_student_tech) {
      box.innerHTML = `⚠️ ${d.student_eligibility_reason}`;
      return;
    }

    box.innerHTML = `
      <strong>✅ ${d.student_eligibility_reason}</strong><br><br>
      ${d.available_student_technicians.map(t => `
        <div style="background:#1e293b; padding:0.6rem; border-radius:0.4rem; margin-bottom:0.5rem;">
          <strong>${t.full_name}</strong> (${t.institution})<br>
          <small style="color:#94a3b8;">Rating: ${t.rating}★ (${t.completed_repairs_count} jobs) | Rate: ₹${t.hourly_rate_inr}/hr (${t.labour_discount_percentage}% discount)</small>
        </div>
      `).join('')}
    `;
  } catch (err) {
    box.innerHTML = `Error: ${err.message}`;
  }
}

// Broadcast Repair
async function broadcastRepair() {
  const box = document.getElementById('broadcastResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Broadcasting to nearby Sitabuldi & Dharampeth shops...';

  try {
    const res = await fetch('/api/v1/repair/broadcast-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelName: 'iPhone 13', faultDescription: 'Screen cracked' })
    });
    const data = await res.json();
    const b = data.data;

    box.innerHTML = `
      <strong>📡 Received ${b.total_bids_received} Bids from Local Shops:</strong><br><br>
      ${b.bids.map(bid => `
        <div class="channel-card">
          <div>
            <div class="channel-title">${bid.shop_name} (${bid.distance_km} km)</div>
            <div class="channel-subtitle">${bid.proposed_solution} | Warranty: ${bid.warranty_days} days</div>
          </div>
          <div class="channel-payout">₹${bid.total_quoted_inr}</div>
        </div>
      `).join('')}
    `;
  } catch (err) {
    box.innerHTML = `Error: ${err.message}`;
  }
}

// Known Defects
async function checkKnownDefects() {
  const box = document.getElementById('defectResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Querying defect bulletin & recall database...';

  const brand = document.getElementById('defectBrand').value;
  const modelName = document.getElementById('defectModel').value;
  const symptoms = document.getElementById('defectSymptoms').value;

  try {
    const res = await fetch(`/api/v1/repair/known-defects?brand=${encodeURIComponent(brand)}&modelName=${encodeURIComponent(modelName)}&symptoms=${encodeURIComponent(symptoms)}`);
    const data = await res.json();
    const d = data.data;

    if (d.has_known_defect) {
      box.innerHTML = `
        <span style="color:#fbbf24;"><strong>⚠️ Known Defect Identified: ${d.defect_name}</strong></span><br>
        • Description: ${d.description}<br>
        • Free Replacement Active: <span class="pill pill-green">${d.is_free_replacement_program_active ? 'YES' : 'NO'}</span><br>
        • Action: <strong>${d.consumer_rights_action}</strong><br>
        <small style="color:#94a3b8; margin-top:0.5rem; display:block;">⚖️ ${d.consumer_protection_act_note}</small>
      `;
    } else {
      box.innerHTML = `✅ ${d.message}<br><small>${d.standard_warranty_guidance}</small>`;
    }
  } catch (err) {
    box.innerHTML = `Error: ${err.message}`;
  }
}

// Data Wipe Checklist
async function loadWipeChecklist() {
  const box = document.getElementById('wipeResult');
  box.style.display = 'block';
  const platform = document.getElementById('wipePlatform').value;

  try {
    const res = await fetch(`/api/v1/repair/data-wipe-checklist?platform=${platform}`);
    const data = await res.json();
    const c = data.data;

    box.innerHTML = `
      <strong>🔒 ${c.platform} Data Security Protocol:</strong><br><br>
      ${c.steps.map(s => `
        <div style="margin-bottom:0.6rem;">
          <strong>Step ${s.step_number}: ${s.title}</strong><br>
          <small style="color:#94a3b8;">${s.instructions}</small>
        </div>
      `).join('')}
    `;
  } catch (err) {
    box.innerHTML = `Error: ${err.message}`;
  }
}

// TAB 3: Scam Shield
async function analyzeScam() {
  const box = document.getElementById('scamResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Scanning message against fraud vectors...';

  const message = document.getElementById('scamMessage').value;
  try {
    const res = await fetch('/api/v1/selling/scam-shield', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, paymentMethod: 'UPI' })
    });
    const data = await res.json();
    const s = data.data;

    const pillClass = s.risk_verdict === 'CRITICAL_RISK' ? 'pill-red' : s.risk_verdict === 'HIGH_RISK' ? 'pill-yellow' : 'pill-green';

    box.innerHTML = `
      Risk Verdict: <span class="pill ${pillClass}">${s.risk_verdict} (${s.risk_score}/100)</span><br><br>
      ${s.flagged_indicators.map(f => `
        <div style="background:#450a0a; border:1px solid #7f1d1d; padding:0.6rem; border-radius:0.4rem; margin-bottom:0.5rem;">
          <strong style="color:#f87171;">${f.warning}</strong><br>
          <small style="color:#fca5a5;">${f.explanation}</small>
        </div>
      `).join('')}
      <div style="margin-top:0.5rem; font-size:0.85rem; color:#94a3b8;">
        <strong>Safety Rules:</strong><br>
        ${s.safe_meetup_guidelines.map(g => `• ${g}`).join('<br>')}
      </div>
    `;
  } catch (err) {
    box.innerHTML = `Error: ${err.message}`;
  }
}

// Generate P2P Listing
async function generateListing() {
  const box = document.getElementById('listingResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Generating formatted listing...';

  const modelName = document.getElementById('listingModel').value;
  const storage = document.getElementById('listingStorage').value;
  const suggestedPrice = document.getElementById('listingPrice').value;

  try {
    const res = await fetch('/api/v1/selling/generate-listing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelName, storage, suggestedPrice: Number(suggestedPrice) })
    });
    const data = await res.json();
    const l = data.data;

    box.innerHTML = `
      <strong>Title:</strong> <code>${l.title}</code><br><br>
      <strong>Suggested Pricing:</strong><br>
      • Fair Median: <strong>₹${l.suggested_pricing.fair_median_inr}</strong> | Quick Sale: <strong>₹${l.suggested_pricing.quick_sale_price_inr}</strong><br><br>
      <strong>Listing Description (Ready to Copy):</strong>
      <textarea rows="8" style="font-size:0.85rem; margin-top:0.5rem;">${l.markdown_description}</textarea>
    `;
  } catch (err) {
    box.innerHTML = `Error: ${err.message}`;
  }
}

// TAB 4: Reuse Ideas
async function loadRepurposingIdeas() {
  const box = document.getElementById('repurposeResult');
  box.style.display = 'block';
  const subType = document.getElementById('repurposeType').value;

  try {
    const res = await fetch(`/api/v1/reuse/repurposing-ideas?subType=${encodeURIComponent(subType)}`);
    const data = await res.json();
    const r = data.data;

    box.innerHTML = `
      <strong>💡 ${r.item} Creative Second-Life Guides:</strong><br><br>
      ${r.repurposing_cards.map(c => `
        <div style="background:#0f172a; border:1px solid #334155; padding:0.75rem; border-radius:0.5rem; margin-bottom:0.6rem;">
          <strong style="color:#34d399;">${c.title}</strong> <span style="font-size:0.75rem; color:#94a3b8;">(${c.difficulty})</span><br>
          <small style="color:#e2e8f0;">${c.instructions}</small><br>
          <span style="font-size:0.8rem; color:#fbbf24;">Estimated Value Saved: ₹${c.estimated_savings_inr || 500}</span>
        </div>
      `).join('')}
    `;
  } catch (err) {
    box.innerHTML = `Error: ${err.message}`;
  }
}

// Memory Vault
async function saveMemoryVault() {
  const box = document.getElementById('vaultResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Archiving memory...';

  const title = document.getElementById('vaultTitle').value;
  const emotionalStory = document.getElementById('vaultStory').value;

  try {
    const res = await fetch('/api/v1/reuse/memory-vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, emotionalStory, reviewReminderMonths: 6 })
    });
    const data = await res.json();
    const v = data.data;

    box.innerHTML = `
      <span style="color:#34d399;"><strong>💖 Memory Successfully Preserved!</strong></span><br>
      • Vault ID: <code>${v.id}</code><br>
      • Title: <strong>${v.title}</strong><br>
      • Reminder Review Scheduled: ${new Date(v.review_reminder_date).toLocaleDateString()}<br>
      <small style="color:#94a3b8; display:block; margin-top:0.4rem;">${v.message}</small>
    `;
  } catch (err) {
    box.innerHTML = `Error: ${err.message}`;
  }
}

// Festive Clean-Out
async function loadFestiveWorkflow() {
  const box = document.getElementById('festiveResult');
  box.style.display = 'block';

  try {
    const res = await fetch('/api/v1/reuse/festive-cleanout?campaignName=Diwali+Safai');
    const data = await res.json();
    const c = data.data;

    box.innerHTML = `
      <strong>🪔 ${c.campaign_name}:</strong><br>
      <small style="color:#94a3b8;">${c.purpose}</small><br><br>
      ${c.stages.map(s => `
        <div style="background:#1e293b; padding:0.6rem; border-radius:0.4rem; margin-bottom:0.5rem;">
          <strong>Stage ${s.stage_number}: ${s.zone_name}</strong><br>
          <small style="color:#cbd5e1;">Target: ${s.target_items.join(', ')}</small><br>
          <small style="color:#34d399;">Action: ${s.action_prompt}</small>
        </div>
      `).join('')}
    `;
  } catch (err) {
    box.innerHTML = `Error: ${err.message}`;
  }
}

// Redeem Reward
async function redeemRewardVoucher() {
  const box = document.getElementById('rewardResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Generating discount voucher...';

  try {
    const res = await fetch('/api/v1/rewards/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pointsToRedeem: 300, partnerId: 'p-rep-001' })
    });
    const data = await res.json();
    const v = data.data;

    box.innerHTML = `
      <span style="color:#34d399;"><strong>🎉 Voucher Code Minted:</strong></span> <code>${v.voucher_code}</code><br>
      • Discount Amount: <strong>₹${v.discount_amount_inr}</strong> (Valid 90 days)<br>
      • Terms: ${v.redemption_terms}
    `;
  } catch (err) {
    box.innerHTML = `Error: ${err.message}`;
  }
}

// TAB 5: "Where Does This Go?"
async function searchDisposal() {
  const box = document.getElementById('disposalResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Looking up disposal stream & drop points...';

  const query = document.getElementById('disposalSearch').value;
  try {
    const res = await fetch(`/api/v1/recycling/where-does-this-go?query=${encodeURIComponent(query)}`);
    const data = await res.json();
    const matches = data.data.matches;

    box.innerHTML = `
      <strong>Disposal Guidance (${matches.length} matches):</strong><br><br>
      ${matches.map(m => `
        <div style="background:#0f172a; border:1px solid #334155; padding:1rem; border-radius:0.5rem; margin-bottom:0.75rem;">
          <h4 style="color:#fff;">${m.item_name}</h4>
          • Stream: <span class="pill pill-green">${m.stream}</span><br>
          • Danger Level: <strong style="color:#f87171;">${m.danger_level}</strong><br>
          • Safe in regular trash? <strong>${m.can_put_in_regular_bin ? 'Yes' : 'NO - Hazardous'}</strong><br>
          • Instructions: ${m.disposal_instructions}<br>
          • Nearest Drop-Off: <strong>${m.nearest_nagpur_facility}</strong><br>
          • Doorstep Pickup: ${m.doorstep_pickup_available ? 'Available' : 'Drop-off required'} | Estimated Scrap Value: ₹${m.scrap_payout_inr}
        </div>
      `).join('')}
    `;
  } catch (err) {
    box.innerHTML = `Error: ${err.message}`;
  }
}

// Partner Login
async function loginPartner() {
  const box = document.getElementById('loginStatus');
  box.style.display = 'block';
  box.innerHTML = '⏳ Logging in...';

  const email = document.getElementById('partnerEmail').value;
  const password = document.getElementById('partnerPassword').value;

  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Login failed');

    activeAuthToken = data.data.token;
    localStorage.setItem('rekart_auth_token', activeAuthToken);

    box.innerHTML = `
      <span style="color:#34d399;"><strong>✅ Authenticated: ${data.data.user.full_name}</strong></span><br>
      • Role: <code>${data.data.user.role}</code> | Location: ${data.data.user.city}
    `;
  } catch (err) {
    box.innerHTML = `<span style="color:#f87171;">Error: ${err.message}</span>`;
  }
}

// Partner Terminal Check-In
async function submitPhysicalCheckIn() {
  const box = document.getElementById('checkInResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Logging inspection...';

  const leadId = document.getElementById('checkInLeadId').value || 'lead_demo_01';
  const confirmedGrade = document.getElementById('confirmedGrade').value;
  const discrepancyReason = document.getElementById('discrepancyReason').value;
  const actualAmountAgreed = document.getElementById('settledAmount').value;

  try {
    const res = await fetch('/api/v1/partner/terminal/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': activeAuthToken ? `Bearer ${activeAuthToken}` : ''
      },
      body: JSON.stringify({
        leadId,
        partnerId: 'p-rep-001',
        confirmedGrade,
        discrepancyReason,
        actualAmountAgreed
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Check-in failed');

    document.getElementById('proofLeadId').value = leadId;

    box.innerHTML = `
      <span style="color:#34d399;"><strong>✅ Inspection Confirmed!</strong></span><br>
      • Grade Confirmed: <span class="pill pill-green">${data.data.confirmed_grade}</span><br>
      • Is Grade Amended: ${data.data.is_grade_amended ? 'Yes' : 'No'}<br>
      • Settled Amount: ₹${data.data.actual_amount_agreed}
    `;
  } catch (err) {
    box.innerHTML = `<span style="color:#f87171;">Error: ${err.message}</span>`;
  }
}

// Issue Proof
async function issueDigitalProof() {
  const box = document.getElementById('proofResult');
  box.style.display = 'block';
  box.innerHTML = '⏳ Minting signed certificate...';

  const leadId = document.getElementById('proofLeadId').value || 'lead_demo_01';
  const proofType = document.getElementById('proofType').value;
  const documentUrl = document.getElementById('proofDocumentUrl').value;

  try {
    const res = await fetch('/api/v1/partner/terminal/issue-proof', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': activeAuthToken ? `Bearer ${activeAuthToken}` : ''
      },
      body: JSON.stringify({
        leadId,
        proofType,
        documentUrl,
        issuerName: 'Sitabuldi ProTech Device Hub'
      })
    });
    const data = await res.json();
    const p = data.data;

    box.innerHTML = `
      <span style="color:#34d399;"><strong>📜 Certificate Issued!</strong></span><br>
      • Number: <strong>${p.certificate_number}</strong><br>
      • Issuer: ${p.issuer_name}<br>
      • Signature: <code>${p.tamper_proof_signature.substring(0, 24)}...</code>
    `;
  } catch (err) {
    box.innerHTML = `<span style="color:#f87171;">Error: ${err.message}</span>`;
  }
}

// Load Nagpur Demands
async function loadNagpurDemands() {
  const container = document.getElementById('demandsList');
  if (!container) return;
  container.innerHTML = '⏳ Loading active demands...';

  try {
    const res = await fetch('/api/v1/routing/nearby-partners?targetTrack=ngo_donation&category=apparel');
    const data = await res.json();
    const partners = data.data.partners;

    container.innerHTML = partners.map(p => `
      <div style="background:#0f172a; padding:0.75rem; border-radius:0.5rem; margin-bottom:0.5rem; border:1px solid #334155;">
        <strong>${p.name}</strong> (${p.distance_km} km)<br>
        <span style="font-size:0.85rem; color:#94a3b8;">${p.address}</span>
        ${p.has_active_shortage ? `
          <div style="color:#fbbf24; font-size:0.85rem; margin-top:0.25rem;">
            ⚡ Urgent Need: ${p.shortage_description} (${p.shortage_urgency} priority)
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = 'Error loading demands';
  }
}

// Init
window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('questionsContainer')) {
    loadQuestions();
  }
});
