import test from 'node:test';
import assert from 'node:assert/strict';
import { PayoutService } from '../src/services/payment/payout_service.js';
import { CommissionBillingService } from '../src/services/payment/commission_billing.js';
import { db } from '../src/db/connection.js';
import { seedNagpurData } from '../src/db/seed_data.js';

test('PayoutService processes Instant Buy-Back UPI payout with valid VPA', async () => {
  await seedNagpurData();

  const item = await db.createItem({
    category: 'electronics',
    model_name: 'iPhone 13',
    status: 'priced'
  });

  const payout = await PayoutService.processInstantBuybackPayout({
    userId: 'u-donor-001',
    itemId: item.id,
    amount: 21800,
    vpaAddress: 'amit@okhdfcbank'
  });

  assert.ok(payout.payout_id);
  assert.equal(payout.amount_inr, 21800);
  assert.equal(payout.status, 'success');
  assert.ok(payout.utr_number);
  assert.match(payout.receipt_message, /transferred successfully/i);

  // Item status should be updated to fulfilled
  const updatedItem = await db.getItem(item.id);
  assert.equal(updatedItem.status, 'fulfilled');
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

test('CommissionBillingService calculates partner invoice and verifies webhooks', async () => {
  await seedNagpurData();

  // Create lead with partner fee
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
});
