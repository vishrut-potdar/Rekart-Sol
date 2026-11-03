import test from 'node:test';
import assert from 'node:assert/strict';
import { FairPriceShieldEngine } from '../src/services/calculation/fair_price_shield.js';
import { RepairOrReleaseEngine } from '../src/services/calculation/repair_or_release.js';
import { ChannelComparisonEngine } from '../src/services/calculation/channel_comparison.js';
import { SafetyScorerEngine } from '../src/services/calculation/safety_scorer.js';
import { seedNagpurData } from '../src/db/seed_data.js';

test('FairPriceShieldEngine evaluates quote against historic percentiles', async () => {
  await seedNagpurData();

  // Nagpur iPhone 13 Screen Replacement benchmark: P25: 3800, P50: 4500, P75: 5200
  const fairQuote = await FairPriceShieldEngine.evaluateQuote({
    cityId: 'nagpur',
    modelName: 'iPhone 13',
    faultType: 'Screen Replacement',
    partGrade: 'aftermarket',
    quotedAmount: 4200
  });
  assert.equal(fairQuote.verdict, 'Fair');
  assert.equal(fairQuote.rating_code, 'GREEN');

  // Outlier gouging quote
  const predatoryQuote = await FairPriceShieldEngine.evaluateQuote({
    cityId: 'nagpur',
    modelName: 'iPhone 13',
    faultType: 'Screen Replacement',
    partGrade: 'aftermarket',
    quotedAmount: 8500
  });
  assert.equal(predatoryQuote.verdict, 'Very High');
  assert.equal(predatoryQuote.rating_code, 'RED');
  assert.ok(predatoryQuote.delta_from_median > 3000);
});

test('RepairOrReleaseEngine validates the 60% threshold formula', () => {
  // Case A: Economically viable repair (Repair cost ₹3,000 < 60% of ₹10,000 = ₹6,000)
  const viable = RepairOrReleaseEngine.evaluate({
    modelName: 'Galaxy S21',
    functionalResaleValue: 10000,
    estimatedRepairCost: 3000,
    asIsScrapValue: 1200
  });
  assert.equal(viable.is_repair_economically_viable, true);
  assert.equal(viable.recommended_outcome, 'repair');
  assert.equal(viable.repair_threshold_ceiling_inr, 6000);

  // Case B: Economically unviable repair (Repair cost ₹7,000 > 60% of ₹10,000 = ₹6,000)
  const unviable = RepairOrReleaseEngine.evaluate({
    modelName: 'Galaxy S21',
    functionalResaleValue: 10000,
    estimatedRepairCost: 7500,
    asIsScrapValue: 1500,
    brandExchangeValue: 2200
  });
  assert.equal(unviable.is_repair_economically_viable, false);
  assert.equal(unviable.recommended_outcome, 'instant_buyback');
});

test('ChannelComparisonEngine computes accurate net yield spreads', () => {
  const comparison = ChannelComparisonEngine.compareChannels({
    category: 'electronics',
    modelName: 'iPhone 13',
    functionalMarketValue: 35000,
    estimatedRepairCost: 4000,
    weightKg: 0.2,
    conditionGrade: 'B'
  });

  assert.ok(comparison.channels.length >= 4);
  const p2p = comparison.channels.find(c => c.channel_id === 'peer_to_peer');
  const instant = comparison.channels.find(c => c.channel_id === 'instant_buyback');
  assert.ok(p2p.net_yield_inr > 0);
  assert.ok(instant.net_yield_inr > 0);
  assert.ok(comparison.spread_inr > 0);
});

test('SafetyScorerEngine triggers DO_NOT_ATTEMPT for swollen batteries and high-voltage hazards', () => {
  const swollenCheck = SafetyScorerEngine.evaluateRisk({
    category: 'electronics',
    faultType: 'Battery Replacement',
    isSwollenBattery: true
  });
  assert.equal(swollenCheck.safety_level, 'DO_NOT_ATTEMPT');
  assert.equal(swollenCheck.allow_diy_guide, false);

  const microwaveCheck = SafetyScorerEngine.evaluateRisk({
    category: 'appliance',
    faultType: 'Magnetron spark',
    applianceType: 'microwave_oven'
  });
  assert.equal(microwaveCheck.safety_level, 'DO_NOT_ATTEMPT');
});
