import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'crypto';
import { createApp } from '../src/app.js';
import { db } from '../src/db/connection.js';
import { ENV } from '../src/config/env.js';
import { DecisionEngine } from '../src/services/decision/decision_engine.js';
import { AuthService } from '../src/services/auth/auth_service.js';
import { WhereDoesThisGoService } from '../src/services/recycling/where_does_this_go.js';
import { ChannelComparisonEngine } from '../src/services/calculation/channel_comparison.js';
import { stripExifMetadata } from '../src/utils/exif_stripper.js';

async function withServer(fn) {
  const app = await createApp();
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('C2: Repository persists items and decisions to disk across reloadFromDisk()', async () => {
  await db.createItem({
    id: 'persist-item-1',
    user_id: 'u-donor-001',
    category: 'electronics',
    model_name: 'Pixel 7a'
  });
  await db.saveDecision({
    decision_id: 'persist-dec-1',
    item_id: 'persist-item-1',
    user_id: 'u-donor-001',
    recommended_path: { path: 'repair', score: 82 }
  });

  // Wipe in-memory maps then reload from disk
  db.items.clear();
  db.decisions.clear();
  const status = db.reloadFromDisk();
  assert.equal(status.is_persistent, true);
  assert.ok(status.persisted_rows > 0);
  assert.equal((await db.getItem('persist-item-1')).model_name, 'Pixel 7a');
  assert.equal((await db.getDecisionByItemId('persist-item-1')).decision_id, 'persist-dec-1');
});

test('C3: Payout enforces item ownership, server valuation cap, strict VPA, and blocks duplicate payouts', async () => {
  await withServer(async baseUrl => {
    const ownerToken = AuthService.generateToken({ id: 'payout-owner', email: 'own@test.in', role: 'donor' });
    const thiefToken = AuthService.generateToken({ id: 'payout-thief', email: 'thief@test.in', role: 'donor' });

    const item = await db.createItem({
      user_id: 'payout-owner',
      category: 'electronics',
      model_name: 'iPhone 13',
      server_valuation_inr: 22000
    });

    // Thief tries to claim payout on owner's item -> 403
    const thiefRes = await fetch(`${baseUrl}/api/v1/payment/instant-payout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${thiefToken}` },
      body: JSON.stringify({ itemId: item.id, amount: 5000, vpaAddress: 'thief@okaxis' })
    });
    assert.equal(thiefRes.status, 403);

    // Owner requests ₹99,999 above ₹22,000 valuation -> 400
    const overRes = await fetch(`${baseUrl}/api/v1/payment/instant-payout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ itemId: item.id, amount: 99999, vpaAddress: 'owner@okaxis' })
    });
    assert.equal(overRes.status, 400);

    // Weak VPA rejected
    const badVpaRes = await fetch(`${baseUrl}/api/v1/payment/instant-payout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ itemId: item.id, amount: 15000, vpaAddress: 'bad@vpa@here' })
    });
    assert.equal(badVpaRes.status, 400);

    // Valid payout queues as pending_gateway_confirmation
    const okRes = await fetch(`${baseUrl}/api/v1/payment/instant-payout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}`, 'Idempotency-Key': 'k-1' },
      body: JSON.stringify({ itemId: item.id, amount: 15000, vpaAddress: 'owner@okaxis' })
    });
    assert.equal(okRes.status, 200);
    const okJson = await okRes.json();
    assert.equal(okJson.data.status, 'pending_gateway_confirmation');

    // Second payout without same idempotency key -> 409 Conflict
    const dupRes = await fetch(`${baseUrl}/api/v1/payment/instant-payout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ itemId: item.id, amount: 15000, vpaAddress: 'owner@okaxis' })
    });
    assert.equal(dupRes.status, 409);
  });
});

test('C4: Rewards block anonymous minting, deduplicate claims, and store verifiable vouchers', async () => {
  await withServer(async baseUrl => {
    const anonRes = await fetch(`${baseUrl}/api/v1/rewards/award`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'victim-123', actionType: 'ngo_donation_apparel', referenceId: 'ref-1' })
    });
    assert.equal(anonRes.status, 401);

    const token = AuthService.generateToken({ id: 'rew-user-1', email: 'rew@test.in', role: 'donor' });

    const r1 = await fetch(`${baseUrl}/api/v1/rewards/award`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId: 'victim-123', actionType: 'formal_recycle_electronics', referenceId: 'ewaste-item-1' })
    });
    assert.equal(r1.status, 201);
    const j1 = await r1.json();
    assert.equal(j1.data.user_id, 'rew-user-1');
    assert.equal(j1.data.points_earned, 250);

    // Duplicate referenceId blocked with 409
    const dup = await fetch(`${baseUrl}/api/v1/rewards/award`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ actionType: 'formal_recycle_electronics', referenceId: 'ewaste-item-1' })
    });
    assert.equal(dup.status, 409);

    // Redeem 200 points -> stored voucher
    const red = await fetch(`${baseUrl}/api/v1/rewards/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pointsToRedeem: 200, partnerId: 'p-rep-001' })
    });
    assert.equal(red.status, 200);
    const redJson = await red.json();
    const storedVoucher = await db.getVoucher(redJson.data.voucher_code);
    assert.ok(storedVoucher);
    assert.equal(storedVoucher.status, 'active');
  });
});

test('C5: Partner IDOR prevention — Partner B cannot access or act on Partner A leads or invoices', async () => {
  await withServer(async baseUrl => {
    const partnerAToken = AuthService.generateToken({ id: 'tech-a', email: 'a@partner.in', role: 'partner_technician', partner_id: 'p-rep-001' });
    const partnerBToken = AuthService.generateToken({ id: 'tech-b', email: 'b@partner.in', role: 'partner_technician', partner_id: 'p-rep-002' });

    const item = await db.createItem({ user_id: 'u-donor-001', category: 'electronics', provisional_grade: 'B' });

    const leadRes = await fetch(`${baseUrl}/api/v1/partner/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${partnerAToken}` },
      body: JSON.stringify({ itemId: item.id, partnerId: 'p-rep-001', quotedPrice: 1000 })
    });
    assert.equal(leadRes.status, 201);
    const leadId = (await leadRes.json()).data.lead_id;

    // Partner B tries settlement, check-in, and proof issuance on Partner A's lead -> all 403
    const settleB = await fetch(`${baseUrl}/api/v1/partner/leads/${leadId}/settlement`, {
      headers: { Authorization: `Bearer ${partnerBToken}` }
    });
    assert.equal(settleB.status, 403);

    const checkInB = await fetch(`${baseUrl}/api/v1/partner/terminal/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${partnerBToken}` },
      body: JSON.stringify({ leadId, confirmedGrade: 'C' })
    });
    assert.equal(checkInB.status, 403);

    const proofB = await fetch(`${baseUrl}/api/v1/partner/terminal/issue-proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${partnerBToken}` },
      body: JSON.stringify({ leadId, documentUrl: 'https://cdn.rekart.in/proof.pdf' })
    });
    assert.equal(proofB.status, 403);

    // Partner B tries to invoice Partner A -> 403
    const invB = await fetch(`${baseUrl}/api/v1/payment/partner-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${partnerBToken}` },
      body: JSON.stringify({ partnerId: 'p-rep-001', billingPeriod: '2026-11' })
    });
    assert.equal(invB.status, 403);
  });
});

test('C6: Payment webhook validates real raw-byte HMAC signature before JSON parsing', async () => {
  await withServer(async baseUrl => {
    const rawPayload = '{"event":"order.paid","payload":{"amount":1000}}';
    const validSig = crypto.createHmac('sha256', ENV.RAZORPAY_KEY_SECRET).update(rawPayload).digest('hex');

    const okRes = await fetch(`${baseUrl}/api/v1/payment/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': validSig },
      body: rawPayload
    });
    assert.equal(okRes.status, 200);

    const badRes = await fetch(`${baseUrl}/api/v1/payment/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': '0'.repeat(64) },
      body: rawPayload
    });
    assert.equal(badRes.status, 400);
  });
});

test('C8: E-waste cables and electronics never route to kabadiwalas or repair shops', () => {
  const cable = WhereDoesThisGoService.lookup('usb cable');
  assert.equal(cable.matches[0].authorised_only, true);
  assert.doesNotMatch(cable.matches[0].nearest_nagpur_facility, /kabadiwala|protech/i);
  assert.match(cable.matches[0].disposal_instructions, /CPCB|MPCB|authorised/i);

  const channels = ChannelComparisonEngine.compareChannels({
    category: 'electronics',
    modelName: 'Old Phone',
    functionalMarketValue: 5000
  });
  assert.equal(channels.ewaste_authorised_only, true);
  assert.equal(channels.channels.some(c => c.channel_id === 'kabadiwala_scrap'), false);
});

test('Privacy & Auth: EXIF stripped on upload, x-guest-user-id rejected, cookie auth + DELETE /me works, uniform typed errors', async () => {
  // Verify JPEG APP1 EXIF removal preserves SOI/EOI and strips GPS/Exif bytes
  const fakeExifPayload = Buffer.from('Exif\0\0GPS_LAT_21_1458_LON_79_0882');
  const app1Len = Buffer.alloc(2);
  app1Len.writeUInt16BE(2 + fakeExifPayload.length, 0);
  const jpegWithExif = Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe1]), app1Len, fakeExifPayload, // APP1 EXIF
    Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x11, 0x22, 0xff, 0xd9]) // SOS + EOI
  ]);
  const stripped = stripExifMetadata(jpegWithExif, 'image/jpeg');
  assert.equal(stripped.includes(Buffer.from('Exif')), false);
  assert.equal(stripped.includes(Buffer.from('GPS_LAT')), false);
  assert.equal(stripped[0], 0xff);
  assert.equal(stripped[1], 0xd8);

  await withServer(async baseUrl => {
    // x-guest-user-id backdoor is rejected with 401
    const guestRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { 'x-guest-user-id': 'admin-impersonate' }
    });
    assert.equal(guestRes.status, 401);

    // Typed error sanitization (no <img...> HTML echoed, no 500 on unknown route)
    const notFoundRes = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    assert.equal(notFoundRes.status, 404);
    const nfJson = await notFoundRes.json();
    assert.equal(nfJson.success, false);
    assert.ok(nfJson.error.code);
    assert.ok(nfJson.error.message);

    // Register -> receives httpOnly Set-Cookie -> upload EXIF JPEG -> create decision -> export -> delete-my-data -> logout
    const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dpdp.user@example.test', password: 'StrongPassword123!', full_name: 'DPDP Tester' })
    });
    assert.equal(regRes.status, 201);
    const setCookie = regRes.headers.get('set-cookie') || '';
    assert.match(setCookie, /rekart_session=/);
    assert.match(setCookie, /HttpOnly/i);
    const cookiePair = setCookie.split(';')[0];

    const form = new FormData();
    form.append('file', new Blob([jpegWithExif], { type: 'image/jpeg' }), 'home.jpg');
    const upRes = await fetch(`${baseUrl}/api/v1/vision/upload-media`, {
      method: 'POST',
      headers: { Cookie: cookiePair },
      body: form
    });
    assert.equal(upRes.status, 201);
    const upJson = await upRes.json();
    assert.equal(upJson.data.exif_stripped, true);

    const decRes = await fetch(`${baseUrl}/api/v1/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookiePair },
      body: JSON.stringify({ category: 'apparel', modelName: 'Cotton Kurta', working: 'yes', condition: 'good', ageBracket: '1-2' })
    });
    assert.equal(decRes.status, 200);

    const expRes = await fetch(`${baseUrl}/api/v1/auth/my-data`, {
      headers: { Cookie: cookiePair }
    });
    assert.equal(expRes.status, 200);
    const expJson = await expRes.json();
    assert.equal(expJson.data.items.length, 1);
    assert.equal(expJson.data.decisions.length, 1);

    // Delete all user data
    const delRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      method: 'DELETE',
      headers: { Cookie: cookiePair }
    });
    assert.equal(delRes.status, 200);
    const delJson = await delRes.json();
    assert.equal(delJson.data.summary.items_removed, 1);

    // Token is revoked after delete/logout
    const afterRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Cookie: cookiePair }
    });
    assert.equal(afterRes.status, 401);
  });
});

test('Publish-ready upgrades: Community hubs API, Phone Grade A + quote provenance, and SPA routing fallback', async () => {
  // Pricing calculator Grade A fix & safety_override schema
  const gradeAEval = DecisionEngine.evaluate({
    category: 'electronics',
    modelName: 'Xiaomi Redmi Note 10',
    working: 'yes',
    condition: 'like_new',
    ageYears: 1,
    originalPrice: 14999
  });
  assert.equal(gradeAEval.item_summary.condition_grade, 'A');
  assert.equal(gradeAEval.item_summary.original_price_inr, 14999);
  assert.equal(gradeAEval.item_summary.repair_cost_range_inr, null);

  const hazardEval = DecisionEngine.evaluate({
    category: 'electronics',
    modelName: 'Power bank',
    working: 'no',
    condition: 'poor',
    isSwollenBattery: true
  });
  assert.equal(hazardEval.safety_override.active, true);
  assert.ok(hazardEval.safety_override.hazard_flag);
  assert.ok(hazardEval.safety_override.reason);

  await withServer(async baseUrl => {
    // 1. Community hubs API serves NGOs, demands, and gatherings/drives
    const hubsRes = await fetch(`${baseUrl}/api/v1/routing/community-hubs?type=ngo`);
    assert.equal(hubsRes.status, 200);
    const hubsJson = await hubsRes.json();
    assert.equal(hubsJson.success, true);
    assert.ok(hubsJson.data.partners.some(p => /goonj/i.test(p.name)));
    assert.ok(Array.isArray(hubsJson.data.active_demands) && hubsJson.data.active_demands.length >= 1);
    assert.ok(Array.isArray(hubsJson.data.gatherings_and_drives) && hubsJson.data.gatherings_and_drives.length >= 1);
    assert.ok(Array.isArray(hubsJson.data.general_ngo_rules) && hubsJson.data.general_ngo_rules.length >= 3);

    // 2. A submitted repair quote is displayed without an unsupported fairness benchmark.
    const decRes = await fetch(`${baseUrl}/api/v1/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'electronics',
        modelName: 'Xiaomi Redmi Note 10',
        working: 'partly',
        condition: 'fair',
        ageBracket: '3-5',
        faultType: 'Screen Replacement',
        quotedRepairCost: 1900,
        originalPrice: 14999
      })
    });
    assert.equal(decRes.status, 200);
    const decJson = await decRes.json();
    assert.equal(decJson.data.fair_price_shield, null);
    assert.equal(decJson.data.phone_pricing.repair_cost_inr, 1900);
    assert.equal(decJson.data.item_summary.original_price_inr, 14999);

    // 3. SPA HTML fallback serves index.html on client-side routes (/community, /saves)
    const spaRes = await fetch(`${baseUrl}/community`, {
      headers: { Accept: 'text/html' }
    });
    assert.equal(spaRes.status, 200);
    const spaHtml = await spaRes.text();
    assert.ok(spaHtml.includes('<div id="root"></div>'));
  });
});
