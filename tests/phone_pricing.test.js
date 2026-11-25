import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePhonePricing, isPhone } from '../src/services/calculation/phone_pricing.js';
import { currentSavedPricing, DecisionEngine } from '../src/services/decision/decision_engine.js';

const now = Date.parse('2026-11-25');
const phone = {
  category: 'electronics', brand: 'Example', modelName: 'Example Phone',
  subCategory: 'smartphone', storageGb: 128, working: 'partly',
  condition: 'good', faultType: 'Screen Replacement'
};
const common = { brand: 'Example', model: 'Example Phone', storageGb: 128, asOf: '2026-11-17', permissionReference: 'synthetic test approval' };
const retail = { ...common, source: 'Example retailer', sourceUrl: 'https://example.test/item', superbInr: 40000, baseVariant: true };
const sell = [20000, 21000, 22000, 23000, 24000, 200000].map((amountInr, index) => ({
  ...common, source: 'Synthetic shop ' + index, sourceType: 'nagpur_shop', condition: 'good', fullyWorking: true, amountInr
}));

test('retail needs approval and its threshold can only yield release or borderline', () => {
  assert.equal(calculatePhonePricing(phone, { retail: [{ ...retail, permissionReference: '' }] }, now).retail, null);
  const get = quotedRepairCost => calculatePhonePricing({ ...phone, quotedRepairCost }, { retail: [retail] }, now);
  assert.deepEqual(get(5000).retail.range_inr, [37120, 38520]);
  assert.equal(get(5000).verdict, 'borderline');
  assert.equal(get(23112).verdict, 'release');
  const unsupportedVariant = calculatePhonePricing({ ...phone, storageGb: 256, quotedRepairCost: 40000 }, { retail: [retail], sell }, now);
  assert.equal(unsupportedVariant.retail.base_variant_only, true);
  assert.equal(unsupportedVariant.sell, null);
  assert.equal(unsupportedVariant.verdict, 'borderline');
  assert.equal(calculatePhonePricing(phone, { retail: [{ ...retail, asOf: '2026-01-01' }] }, now).retail.stale, true);
});

test('five recent comparable local offers remain after outlier removal', () => {
  const get = quotedRepairCost => calculatePhonePricing({ ...phone, quotedRepairCost }, { sell }, now);
  assert.deepEqual(get(10000).sell.range_inr, [21000, 23000]);
  assert.equal(get(10000).verdict, 'repair');
  assert.equal(get(12600).verdict, 'borderline');
  assert.equal(get(13800).verdict, 'release');
  assert.equal(calculatePhonePricing(phone, { sell: sell.slice(0, 4) }, now).sell, null);
  assert.equal(calculatePhonePricing(phone, { sell: sell.map(row => ({ ...row, asOf: '2026-01-01' })) }, now).sell, null);
  const decision = DecisionEngine.evaluate({ ...phone, quotedRepairCost: 10000 }, { phonePricingData: { sell }, now });
  assert.equal(decision.recommended_path.path, 'repair');
  assert.equal(DecisionEngine.evaluate({ ...phone, isSwollenBattery: true, quotedRepairCost: 10000 }, { phonePricingData: { sell }, now }).recommended_path.path, 'recycle');
});

test('battery service is deducted if the phone works and an all-in quote exists', () => {
  const repair = { ...common, fault: 'Battery Replacement', source: 'Synthetic repair shop', sourceType: 'nagpur_shop', allIn: true, amountInr: 3000 };
  const result = calculatePhonePricing({ ...phone, faultType: null, working: 'yes', batteryHealthPercent: 79 }, { retail: [retail], repair: [repair] }, now);
  assert.equal(result.repair_cost_inr, 3000);
  assert.equal(result.estimated_after_repair_deduction_inr, 35520);
});


test('purchase cost, a model mentioned in notes and nearby model names do not create a resale price', () => {
  const input = { category: 'electronics', modelName: 'Sony WH-1000XM5', working: 'yes', condition: 'good' };
  const data = { sell: sell.map(row => ({ ...row, category: 'electronics', storageGb: undefined, model: 'Sony WH-1000XM4' })) };
  const quote = details => DecisionEngine.evaluate({ ...input, ...details }, { phonePricingData: data, now });
  assert.equal(quote({ originalPrice: 23000, note: 'Like my XM4' }).item_summary.server_valuation_inr, null);
  const exact = quote({ modelName: 'Sony WH-1000XM4' });
  assert.deepEqual(exact.item_summary.as_is_resale_range_inr, [21000, 23000]);
  assert.equal(exact.item_summary.server_valuation_inr, 22000);
  assert.equal(currentSavedPricing(exact, Date.parse('2027-04-01')).item_summary.server_valuation_inr, null);
  const legacy = currentSavedPricing({ ...exact, resale_pricing: undefined });
  assert.equal(legacy.recommended_path.net_value_range_inr, null);
});


test('Galaxy Book uses exact laptop quotes even when vision labels it a phone', () => {
  const laptop = { category: 'electronics', subCategory: 'smartphone', brand: 'Samsung',
    modelName: 'Samsung Galaxy Book4 512 GB', working: 'yes', condition: 'good' };
  assert.equal(isPhone(laptop), false);
  assert.equal(isPhone({ category: 'electronics', modelName: 'Samsung Galaxy S23' }), true);
  assert.equal(isPhone({ category: 'electronics', modelName: 'OnePlus 12' }), true);
  assert.equal(isPhone({ category: 'electronics', modelName: 'Samsung Galaxy Tab S9', subCategory: 'mobile' }), false);
  const laptopOffers = sell.map(row => ({ ...row, category: 'electronics', storageGb: undefined,
    brand: 'Samsung', model: 'Galaxy Book4 512 GB' }));
  const mobileOffers = sell.map(row => ({ ...row, category: 'electronics', brand: 'Samsung', model: 'Galaxy S23' }));
  const data = { sell: [...mobileOffers, ...laptopOffers] };
  const get = modelName => DecisionEngine.evaluate({ ...laptop, modelName }, { now, phonePricingData: data });
  const result = get(laptop.modelName);
  assert.equal(result.item_summary.sub_category, 'laptop');
  assert.equal(result.phone_pricing, null);
  assert.deepEqual(result.item_summary.as_is_resale_range_inr, [21000, 23000]);
  assert.equal(get('Samsung Galaxy Book4 256 GB').item_summary.as_is_resale_range_inr, null);
  assert.equal(get('Samsung Book').item_summary.as_is_resale_range_inr, null);
});
