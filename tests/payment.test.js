import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { PayoutService } from '../src/services/payment/payout_service.js';
import { CommissionBillingService } from '../src/services/payment/commission_billing.js';
import { db } from '../src/db/connection.js';
import { seedNagpurData } from '../src/db/seed_data.js';
import { ENV } from '../src/config/env.js';

test('PayoutService queues Instant Buy-Back UPI payout for item owner within valuation cap', async () => {
  await seedNagpurData();

  const item = await db.createItem({
    user_id: 'u-donor-001',
    category: 'electronics',
    model_name: 'iPhone 13',
    status: 'priced',
    server_valuation_inr: 25000
  });

  const payout = await PayoutService.processInstantBuybackPayout({
    userId: 'u-donor-001',
    itemId: item.id,
    amount: 21800,
    vpaAddress: 'amit@okhdfcbank',
    idempotencyKey: `idem-${item.id}`
  });

  assert.ok(payout.payout_id);
  assert.equal(payout.amount_inr, 21800);
  assert.equal(payout.status, 'pending_gateway_confirmation');
  assert.equal(payout.utr_number, null);
  assert.match(payout.receipt_message, /pending_gateway_confirmation/i);

  const updatedItem = await db.getItem(item.id);
  assert.equal(updatedItem.status, 'payout_pending');

  // Re-submitting with the same idempotencyKey returns the same payout record
  const replay = await PayoutService.processInstantBuybackPayout({
    userId: 'u-donor-001',
    itemId: item.id,
    amount: 21800,
    vpaAddress: 'amit@okhdfcbank',
    idempotencyKey: `idem-${item.id}`
  });
  assert.equal(replay.payout_id, payout.payout_id);
});

test('PayoutService rejects invalid UPI VPA format', async () => {
  await assert.rejects(
    async () => {
      await PayoutService.processInstantBuybackPayout({
        userId: 'u-donor-001',
        itemId: 'item-random',
        amount: 5000,
        vpaAddress: 'invalid_vpa_without_at_symbol'
      });
    },
    { message: /invalid upi vpa/i }
  );
});

test('CommissionBillingService calculates partner invoice and verifies raw webhook HMAC', async () => {
  await seedNagpurData();

  await db.createLead({
    item_id: 'item-demo-bill',
    partner_id: 'p-rep-001',
    quoted_price: 3500,
    partner_fee: 350
  });

  const invoice = await CommissionBillingService.generatePartnerInvoice('p-rep-001', '2026-11');
  assert.ok(invoice.invoice_id);
  assert.equal(invoice.partner_id, 'p-rep-001');
  assert.ok(invoice.total_commission_due >= 350);
  assert.ok(invoice.total_leads_count >= 1);

  const rawBody = Buffer.from('{"event":"order.paid","amount":35000}', 'utf8');
  const sig = crypto.createHmac('sha256', ENV.RAZORPAY_KEY_SECRET).update(rawBody).digest('hex');
  assert.equal(CommissionBillingService.verifyWebhookSignature(rawBody, sig), true);
  assert.equal(CommissionBillingService.verifyWebhookSignature(rawBody, 'wrong-sig'), false);
});
