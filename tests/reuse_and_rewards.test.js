import test from 'node:test';
import assert from 'node:assert/strict';
import { ReuseService } from '../src/services/reuse/reuse_service.js';
import { RewardsService } from '../src/services/rewards/rewards_service.js';
import { seedNagpurData } from '../src/db/seed_data.js';

test('ReuseService returns item-matched repurposing cards for old smartphones and apparel', () => {
  const phoneIdeas = ReuseService.getRepurposingIdeas({
    category: 'electronics',
    subType: 'smartphone'
  });

  assert.ok(phoneIdeas.repurposing_cards.length >= 3);
  assert.ok(phoneIdeas.repurposing_cards.some(c => c.title.includes('Security CCTV')));

  const fabricIdeas = ReuseService.getRepurposingIdeas({
    category: 'apparel',
    subType: 'denim jeans'
  });
  assert.ok(fabricIdeas.repurposing_cards.some(c => c.title.includes('Tote Bag')));
});

test('ReuseService saves sentimental item in Memory Vault with future review reminder', () => {
  const vault = ReuseService.saveToMemoryVault({
    userId: 'u-donor-001',
    title: 'Grandmother Hand-Knitted Sweater',
    emotionalStory: 'Knitted for my 10th birthday in 2004. Too small now, but emotionally cherished.',
    reviewReminderMonths: 6
  });

  assert.ok(vault.id);
  assert.equal(vault.status, 'cherished_memory');
  assert.ok(vault.review_reminder_date);
});

test('RewardsService awards circular points and generates discount voucher', async () => {
  await seedNagpurData();

  // Award points for donation
  const award = await RewardsService.awardPoints({
    userId: 'u-donor-001',
    actionType: 'ngo_donation_apparel',
    referenceId: 'donation-batch-99'
  });

  assert.ok(award.points_earned >= 100);
  assert.ok(award.new_points_balance >= 100);

  // Over-redeeming must be refused (balance is 100 here)
  await assert.rejects(
    RewardsService.redeemPoints({ userId: 'u-donor-001', pointsToRedeem: 1000, partnerId: 'p-rep-001' }),
    /Not enough points/
  );

  // Earn enough for the 300-point voucher below
  await RewardsService.awardPoints({ userId: 'u-donor-001', actionType: 'formal_recycle_electronics', referenceId: 'recycle-1' });

  // Redeem points for repair discount voucher
  const voucher = await RewardsService.redeemPoints({
    userId: 'u-donor-001',
    pointsToRedeem: 300,
    partnerId: 'p-rep-001'
  });

  assert.ok(voucher.voucher_code.startsWith('REKART-SAVE'));
  assert.equal(voucher.discount_amount_inr, 150); // 300 points = 150 INR
  assert.equal(voucher.new_points_balance, award.new_points_balance + 250 - 300); // deducted
});
