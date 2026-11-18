// Rekart Partner Terminal & Auxiliary Controller (XSS-safe, httpOnly cookie sessions)
let currentItemId = 'item-demo-101';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getErrMsg(data, fallback = 'Request failed') {
  if (!data) return fallback;
  if (typeof data.error === 'string') return data.error;
  return data.error?.message || fallback;
}

async function apiJson(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(getErrMsg(data, `HTTP ${res.status}`));
  }
  return data.data;
}

function renderError(box, err) {
  const span = document.createElement('span');
  span.style.color = '#f87171';
  span.textContent = `Error: ${err?.message || 'Unknown error'}`;
  box.replaceChildren(span);
}

// Partner Login (session stored in httpOnly cookie by server; never in localStorage)
async function loginPartner() {
  const box = document.getElementById('loginStatus');
  if (!box) return;
  box.style.display = 'block';
  box.textContent = 'Logging in...';

  const email = document.getElementById('partnerEmail')?.value || '';
  const password = document.getElementById('partnerPassword')?.value || '';

  try {
    const data = await apiJson('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    box.innerHTML = `
      <span style="color:#34d399;"><strong>Authenticated: ${escapeHtml(data.user.full_name)}</strong></span><br>
      Role: <code>${escapeHtml(data.user.role)}</code> | Location: ${escapeHtml(data.user.city)}
    `;
  } catch (err) {
    renderError(box, err);
  }
}

// Partner Terminal Check-In
async function submitPhysicalCheckIn() {
  const box = document.getElementById('checkInResult');
  if (!box) return;
  box.style.display = 'block';
  box.textContent = 'Logging inspection...';

  const leadId = document.getElementById('checkInLeadId')?.value || '';
  const confirmedGrade = document.getElementById('confirmedGrade')?.value || 'B';
  const discrepancyReason = document.getElementById('discrepancyReason')?.value || '';
  const actualAmountAgreed = Number(document.getElementById('settledAmount')?.value || 0);

  try {
    const data = await apiJson('/api/v1/partner/terminal/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId,
        confirmedGrade,
        discrepancyReason,
        actualAmountAgreed
      })
    });

    const proofEl = document.getElementById('proofLeadId');
    if (proofEl) proofEl.value = leadId;

    box.innerHTML = `
      <span style="color:#34d399;"><strong>Inspection Confirmed</strong></span><br>
      Grade Confirmed: <span class="pill pill-green">${escapeHtml(data.confirmed_grade)}</span><br>
      Grade Amended: ${data.is_grade_amended ? 'Yes' : 'No'}<br>
      Settled Amount: ₹${escapeHtml(data.actual_amount_agreed)}
    `;
  } catch (err) {
    renderError(box, err);
  }
}

// Issue Proof
async function issueDigitalProof() {
  const box = document.getElementById('proofResult');
  if (!box) return;
  box.style.display = 'block';
  box.textContent = 'Issuing signed proof...';

  const leadId = document.getElementById('proofLeadId')?.value || '';
  const proofType = document.getElementById('proofType')?.value || 'partner_handoff_receipt';
  const documentUrl = document.getElementById('proofDocumentUrl')?.value || '';

  try {
    const p = await apiJson('/api/v1/partner/terminal/issue-proof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId,
        proofType,
        documentUrl,
        issuerName: 'Sitabuldi ProTech Device Hub'
      })
    });

    box.innerHTML = `
      <span style="color:#34d399;"><strong>Proof Issued</strong></span><br>
      Number: <strong>${escapeHtml(p.certificate_number)}</strong><br>
      Issuer: ${escapeHtml(p.issuer_name)}<br>
      Signature (${escapeHtml(p.signature_algorithm)}): <code>${escapeHtml(String(p.tamper_proof_signature).substring(0, 24))}...</code><br>
      <small>${escapeHtml(p.regulatory_disclaimer || '')}</small>
    `;
  } catch (err) {
    renderError(box, err);
  }
}

// Load Nagpur Demands
async function loadNagpurDemands() {
  const container = document.getElementById('demandsList');
  if (!container) return;
  container.textContent = 'Loading active demands...';

  try {
    const data = await apiJson('/api/v1/routing/nearby-partners?targetTrack=ngo_donation&category=apparel');
    const partners = data.partners || [];

    container.innerHTML = partners.map(p => `
      <div style="background:#0f172a; padding:0.75rem; border-radius:0.5rem; margin-bottom:0.5rem; border:1px solid #334155;">
        <strong>${escapeHtml(p.name)}</strong> (${escapeHtml(p.distance_km)} km)
        ${p.is_sample ? '<span class="pill pill-yellow">Sample</span>' : ''}<br>
        <span style="font-size:0.85rem; color:#94a3b8;">${escapeHtml(p.address)}</span>
        ${p.has_active_shortage ? `
          <div style="color:#fbbf24; font-size:0.85rem; margin-top:0.25rem;">
            Urgent Need: ${escapeHtml(p.shortage_description)} (${escapeHtml(p.shortage_urgency)} priority)
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    renderError(container, err);
  }
}

window.loginPartner = loginPartner;
window.submitPhysicalCheckIn = submitPhysicalCheckIn;
window.issueDigitalProof = issueDigitalProof;
window.loadNagpurDemands = loadNagpurDemands;
