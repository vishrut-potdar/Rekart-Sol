import { PileDecompositionService } from './services/vision/pile_decomposition.js';
import { SingleItemClassifierService } from './services/vision/single_item_classifier.js';
import { DecisionTreeEngine } from './services/triage/decision_tree.js';
import { HardwareTelemetryParser } from './services/triage/telemetry_parser.js';
import { SymptomAndFaultRanker } from './services/triage/fault_ranker.js';
import { FairPriceShieldEngine } from './services/calculation/fair_price_shield.js';
import { RepairOrReleaseEngine } from './services/calculation/repair_or_release.js';
import { ChannelComparisonEngine } from './services/calculation/channel_comparison.js';
import { SafetyScorerEngine } from './services/calculation/safety_scorer.js';
import { ReadinessGatekeeperService } from './services/routing/readiness_gatekeeper.js';
import { HyperlocalMatcherService } from './services/routing/hyperlocal_matcher.js';
import { LeadManagerService } from './services/partner/lead_manager.js';
import { PartnerTerminalService } from './services/partner/partner_terminal.js';
import { seedNagpurData } from './db/seed_data.js';

async function runLiveLifecycleSimulation() {
  console.log('===============================================================');
  console.log('       REKART: END-TO-END SYSTEM LIFECYCLE SIMULATION          ');
  console.log('                 Nagpur Pilot Territory                        ');
  console.log('===============================================================\n');

  // Step 0: Seed Nagpur ecosystem
  console.log('-> [0] Seeding Nagpur pilot ecosystem (CPCB, NGOs, shops)...');
  await seedNagpurData();
  console.log('   ✓ Seeded partners, benchmarks, active shortages & drives.\n');

  // Step 1: Pile-Mode Ingestion
  console.log('-> [1] Ingesting bulk photograph in Pile Mode...');
  const pileResult = await PileDecompositionService.decomposePhoto({
    batchPhotoUrl: 'https://cdn.rekart.in/mock/apparel_pile_nagpur.jpg',
    userId: 'user-77',
    assumedCategory: 'apparel'
  });
  console.log(`   ✓ Identified ${pileResult.items_detected_count} distinct items from single photo.`);
  pileResult.items.forEach(item => {
    console.log(`     - [${item.id.substring(0, 8)}] ${item.model_name} (Grade: ${item.provisional_grade})`);
  });
  console.log();

  // Step 2: Single-Item Classification
  console.log('-> [2] Running Single-Item Classification on damaged phone...');
  const classification = await SingleItemClassifierService.classifyImage({
    imageUrl: 'https://cdn.rekart.in/mock/iphone13_front.jpg',
    userHint: 'iPhone 13 screen cracked but turns on'
  });
  console.log(`   ✓ Identified: ${classification.brand} ${classification.model_name}`);
  console.log(`   ✓ Features: ${classification.detected_features.join(', ')}\n`);

  // Step 3: Multi-Language Triage & Telemetry
  console.log('-> [3] Generating Hinglish Triage Questions & Telemetry parsing...');
  const questions = DecisionTreeEngine.getQuestionTree('electronics', 'hinglish');
  console.log(`   ✓ First Question: "${questions.steps[0].question}"`);

  const telemetry = HardwareTelemetryParser.parse({
    touchscreen_grid: { total_blocks: 100, passed_blocks: 88, dead_zones: ['top_left', 'top_right'] },
    battery: { design_capacity_mah: 3227, current_capacity_mah: 2750, cycle_count: 510, is_swollen: false },
    charging: { port_wobble: false, temp_celsius: 33 }
  });
  console.log(`   ✓ Telemetry Health Score: ${telemetry.composite_health_score}/100, Grade: ${telemetry.provisional_hardware_grade}`);

  const faultRanking = SymptomAndFaultRanker.rank({
    category: 'electronics',
    answers: { q1_power: 'power_flicker', q4_touch_and_audio: 'touch_ghost_clicks' },
    telemetrySummary: telemetry
  });
  console.log(`   ✓ Primary Ranked Fault: ${faultRanking.primary_fault.fault} (Confidence: ${faultRanking.primary_fault.confidence * 100}%)\n`);

  // Step 4: Fair Price Shield Evaluation
  console.log('-> [4] Evaluating technician quote against Nagpur Fair Price Shield...');
  const userQuote = 4300; // Screen repair quote
  const shield = await FairPriceShieldEngine.evaluateQuote({
    cityId: 'nagpur',
    modelName: 'iPhone 13',
    faultType: 'Screen Replacement',
    partGrade: 'aftermarket',
    quotedAmount: userQuote
  });
  console.log(`   ✓ User Quoted: ₹${userQuote} | Nagpur Median (P50): ₹${shield.local_benchmark.median_p50}`);
  console.log(`   ✓ Verdict: ${shield.verdict} [${shield.rating_code}] - ${shield.advisory_message}\n`);

  // Step 5: Repair-or-Release Logic (60% Threshold)
  console.log('-> [5] Computing Repair-or-Release Decision Matrix...');
  const repairCalc = RepairOrReleaseEngine.evaluate({
    modelName: 'iPhone 13',
    functionalResaleValue: 36000,
    estimatedRepairCost: 4500,
    asIsScrapValue: 8000,
    brandExchangeValue: 14000
  });
  console.log(`   ✓ Functional Resale: ₹${repairCalc.functional_resale_value}`);
  console.log(`   ✓ Repair Ceiling (60%): ₹${repairCalc.repair_threshold_ceiling_inr}`);
  console.log(`   ✓ Estimated Repair Cost: ₹${repairCalc.estimated_repair_cost}`);
  console.log(`   ✓ Is Repair Economical? ${repairCalc.is_repair_economically_viable ? 'YES' : 'NO'}`);
  console.log(`   ✓ Outcome: ${repairCalc.recommended_outcome.toUpperCase()} -> ${repairCalc.rationalization}\n`);

  // Step 6: Channel Comparison
  console.log('-> [6] Computing Net Yield across 4 Resale/Recycle Channels...');
  const channels = ChannelComparisonEngine.compareChannels({
    category: 'electronics',
    modelName: 'iPhone 13',
    functionalMarketValue: 36000,
    estimatedRepairCost: 4500,
    weightKg: 0.174,
    conditionGrade: 'B'
  });
  channels.channels.forEach(ch => {
    console.log(`   - ${ch.channel_name.padEnd(38)}: Net Yield ₹${String(ch.net_yield_inr).padStart(5)} (${ch.turnaround_time})`);
  });
  console.log();

  // Step 7: Hyperlocal Matching
  console.log('-> [7] Hyperlocal PostGIS match for nearest verified Nagpur repair partner...');
  const nearby = await HyperlocalMatcherService.findOptimalMatches({
    latitude: 21.1458,
    longitude: 79.0882, // Sitabuldi
    category: 'electronics',
    targetTrack: 'repair',
    maxRadiusMeters: 10000
  });
  const partner = nearby.partners[0];
  console.log(`   ✓ Matched: ${partner.name}`);
  console.log(`   ✓ Distance: ${partner.distance_km} km | Address: ${partner.address}\n`);

  // Step 8: Neutral Lead Creation
  console.log('-> [8] Creating attributed lead with isolated pricing neutrality...');
  const lead = await LeadManagerService.createAttributedLead({
    itemId: pileResult.items[0].id,
    partnerId: partner.id,
    quotedPrice: 4200
  });
  console.log(`   ✓ Lead generated: ${lead.lead_id}`);
  console.log(`   ✓ Status: ${lead.status} (Client view has ZERO pricing commission leak)\n`);

  // Step 9: Partner Terminal Check-In & Digital Proof
  console.log('-> [9] Partner technician checks in item & issues proof...');
  const checkIn = await PartnerTerminalService.physicalCheckIn({
    leadId: lead.lead_id,
    partnerId: partner.id,
    inspectorId: 'technician_rakesh_sitabuldi',
    confirmedGrade: 'B',
    actualAmountAgreed: 4200
  });
  console.log(`   ✓ Physical Grade Confirmed: ${checkIn.confirmed_grade}`);

  const proof = await PartnerTerminalService.issueDigitalProof({
    leadId: lead.lead_id,
    proofType: 'formal_repair_warranty_certificate',
    documentUrl: 'https://cdn.rekart.in/certs/nagpur-repair-9912.pdf',
    issuerName: partner.name
  });
  console.log(`   ✓ Digital Proof Issued: ${proof.certificate_number}`);
  console.log(`   ✓ Tamper-Proof Signature: ${proof.tamper_proof_signature.substring(0, 24)}...\n`);

  console.log('===============================================================');
  console.log('   ALL REKART BACKEND MODULES OPERATIONAL & INTEGRATED!       ');
  console.log('===============================================================');
}

runLiveLifecycleSimulation().catch(console.error);
