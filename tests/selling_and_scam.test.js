import test from 'node:test';
import assert from 'node:assert/strict';
import { ScamShieldService } from '../src/services/selling/scam_shield_service.js';
import { ListingGeneratorService } from '../src/services/selling/listing_generator.js';

test('ScamShieldService flags UPI QR code receive scams as critical fraud', () => {
  const analysis = ScamShieldService.analyzeScamRisk({
    message: 'Hello, I am sending you a QR code. Please scan QR and enter UPI PIN to receive ₹15000 in your bank.',
    paymentMethod: 'UPI'
  });

  assert.equal(analysis.is_suspicious, true);
  assert.equal(analysis.risk_verdict, 'CRITICAL_RISK');
  assert.ok(analysis.flagged_indicators.some(f => f.type === 'UPI_QR_RECEIVE_SCAM'));
});

test('ScamShieldService flags Army / Defence personnel advance buyer scam', () => {
  const analysis = ScamShieldService.analyzeScamRisk({
    message: 'I am an Indian Army officer posted at Kamptee Cantonment Nagpur. My military transport will pick up the item.',
    deliveryRequested: true
  });

  assert.equal(analysis.is_suspicious, true);
  assert.ok(analysis.flagged_indicators.some(f => f.type === 'DEFENCE_PERSONNEL_IMPERSONATION'));
  assert.ok(analysis.safe_meetup_guidelines.length >= 2);
});

test('ListingGeneratorService generates structured markdown listing with anti-lowball safeguards', () => {
  const listing = ListingGeneratorService.generateListing({
    brand: 'Samsung',
    modelName: 'Galaxy S21',
    storage: '256GB',
    color: 'Phantom Gray',
    conditionGrade: 'A',
    testedFunctions: ['OLED Display', 'Wireless Charging', '5G Modem'],
    knownFlaws: [],
    suggestedPrice: 28000
  });

  assert.ok(listing.title.includes('Galaxy S21'));
  assert.match(listing.markdown_description, /Condition.*Grade A/i);
  assert.ok(listing.suggested_pricing.listing_price_inr > listing.suggested_pricing.quick_sale_price_inr);
  assert.ok(listing.search_tags.length >= 3);
});
