import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadinessGatekeeperService } from '../src/services/routing/readiness_gatekeeper.js';
import { HyperlocalMatcherService } from '../src/services/routing/hyperlocal_matcher.js';
import { SocietyDrivesService } from '../src/services/routing/society_drives.js';
import { seedNagpurData } from '../src/db/seed_data.js';

test('ReadinessGatekeeperService enforces strict NGO rules and routes rejected apparel to textile shredders', () => {
  // Case A: Passed item
  const valid = ReadinessGatekeeperService.evaluateDonationReadiness({
    category: 'apparel',
    conditionAttributes: {
      has_major_tears: false,
      has_permanent_stains: false,
      is_washed_and_hygienic: true
    }
  });
  assert.equal(valid.is_eligible_for_ngo_donation, true);

  // Case B: Stained/torn garment
  const rejected = ReadinessGatekeeperService.evaluateDonationReadiness({
    category: 'apparel',
    conditionAttributes: {
      has_major_tears: true,
      has_permanent_stains: true,
      is_washed_and_hygienic: false
    }
  });
  assert.equal(rejected.is_eligible_for_ngo_donation, false);
  assert.equal(rejected.fallback_track, 'textile_recovery_shredder');
});

test('HyperlocalMatcherService maps items to verified Nagpur partners and prioritizes active NGO shortages', async () => {
  await seedNagpurData();

  const matches = await HyperlocalMatcherService.findOptimalMatches({
    latitude: 21.1458,
    longitude: 79.0882,
    category: 'apparel',
    targetTrack: 'ngo_donation',
    maxRadiusMeters: 20000
  });

  assert.ok(matches.partners.length > 0);
  // Verify Goonj or Rotary has been prioritized with active shortage
  const topPartner = matches.partners[0];
  assert.equal(topPartner.has_active_shortage, true);
  assert.ok(topPartner.shortage_description);
});

test('SocietyDrivesService returns scheduled community collection drives', async () => {
  await seedNagpurData();

  const response = await SocietyDrivesService.getUpcomingDrives({
    latitude: 21.1458,
    longitude: 79.0882,
    radiusMeters: 15000
  });

  assert.ok(response.active_drives.length >= 1);
  assert.ok(response.active_drives[0].society_name);
});
