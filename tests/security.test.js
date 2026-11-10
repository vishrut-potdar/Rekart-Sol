import test from 'node:test';
import assert from 'node:assert';
import { requireSecret } from '../src/config/env.js';
import { rateLimit } from '../src/middleware/rate_limit.js';
import { MediaStorageService, sniffImageType } from '../src/services/vision/media_storage.js';
import { RewardsService } from '../src/services/rewards/rewards_service.js';
import authRoutes from '../src/routes/auth_routes.js';
import paymentRoutes from '../src/routes/payment_routes.js';
import partnerRoutes from '../src/routes/partner_routes.js';
import { AuthService } from '../src/services/auth/auth_service.js';

// Runs a router's handlers for one request without opening a port; resolves with { status, body }.
function call(router, { method = 'POST', url, body = {}, headers = {} }) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      set() { return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); }
    };
    router.handle({ method, url, body, headers, query: {}, ip: '127.0.0.1' }, res, err => (err ? reject(err) : resolve({ status: 404, body: null })));
  });
}

test('requireSecret refuses the published dev default in production', () => {
  assert.equal(requireSecret('X', 'dev', { env: {}, production: false }), 'dev');
  assert.equal(requireSecret('X', 'dev', { env: { X: 'real' }, production: true }), 'real');
  assert.throws(() => requireSecret('X', 'dev', { env: {}, production: true }), /must be set in production/);
});

test('public sign-up cannot choose its own role or partner', async () => {
  const { status, body } = await call(authRoutes, {
    url: '/register',
    body: { email: 'mallory@example.test', password: 'long-enough-pw', full_name: 'Mallory', role: 'admin', partner_id: 'p-rep-001' }
  });
  assert.equal(status, 201);
  assert.equal(body.data.user.role, 'donor');
  assert.equal(body.data.user.partner_id, null);
});

test('payout, invoice and partner terminal routes reject callers without a token', async () => {
  for (const [router, url] of [
    [paymentRoutes, '/instant-payout'],
    [paymentRoutes, '/partner-invoice'],
    [partnerRoutes, '/leads'],
    [partnerRoutes, '/terminal/check-in'],
    [partnerRoutes, '/terminal/issue-proof']
  ]) {
    const { status } = await call(router, { url, body: { userId: 'victim', itemId: 'i', amount: 1, vpaAddress: 'a@b', partnerId: 'p' } });
    assert.equal(status, 401, `${url} should require login`);
  }
});

test('partner routes reject a logged-in donor', async () => {
  const token = AuthService.generateToken({ id: 'u-x', email: 'd@example.test', role: 'donor', partner_id: null });
  const { status } = await call(partnerRoutes, { url: '/leads', headers: { authorization: `Bearer ${token}` }, body: { itemId: 'i', partnerId: 'p' } });
  assert.equal(status, 403);
});

test('payment webhook rejects a bad signature in every environment', async () => {
  const { status } = await call(paymentRoutes, { url: '/webhook', headers: { 'x-razorpay-signature': 'bad' } });
  assert.equal(status, 400);
});

test('rewards route ignores a points value sent by the client', async () => {
  const rewardsRoutes = (await import('../src/routes/rewards_routes.js')).default;
  const { body } = await call(rewardsRoutes, { url: '/award', body: { userId: 'sec-test-user', actionType: 'ngo_donation_apparel', pointsAwarded: 999999 } });
  assert.equal(body.data.points_earned, 100);
  // The service itself still accepts an explicit value for trusted server-side callers.
  assert.equal((await RewardsService.awardPoints({ userId: 'sec-test-user-2', actionType: 'x', pointsAwarded: 5 })).points_earned, 5);
});

test('uploads are accepted by content, not by claimed name or type', async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
  assert.deepEqual(sniffImageType(png), { ext: 'png', mime: 'image/png' });
  assert.equal(sniffImageType(Buffer.from('<script>alert(1)</script>')), null);
  await assert.rejects(
    () => MediaStorageService.uploadMedia({ filename: 'photo.jpg', mediaType: 'image/jpeg', buffer: Buffer.from('<html><script>alert(1)</script></html>') }),
    { status: 415 }
  );
});

test('rateLimit blocks the request after the limit and reports when to retry', () => {
  const limiter = rateLimit({ windowMs: 60000, max: 2 });
  const run = () => {
    const out = { passed: false, status: 200 };
    limiter({ ip: '9.9.9.9' }, { set() {}, status(c) { out.status = c; return this; }, json() {} }, () => { out.passed = true; });
    return out;
  };
  assert.ok(run().passed);
  assert.ok(run().passed);
  const third = run();
  assert.equal(third.passed, false);
  assert.equal(third.status, 429);
});
