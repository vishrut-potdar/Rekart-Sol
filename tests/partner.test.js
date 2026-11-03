import test from 'node:test';
import assert from 'node:assert/strict';
import { LeadManagerService } from '../src/services/partner/lead_manager.js';
import { PartnerTerminalService } from '../src/services/partner/partner_terminal.js';
import { PriceCalibrationService } from '../src/services/partner/price_calibration.js';
import { db } from '../src/db/connection.js';
import { seedNagpurData } from '../src/db/seed_data.js';

test('LeadManagerService enforces neutral pricing isolation', async () => {
  await seedNagpurData();

  const item = await db.createItem({
    category: 'electronics',
    brand: 'Samsung',
    model_name: 'Galaxy S21',
    status: 'priced'
  });

  const lead = await LeadManagerService.createAttributedLead({
    itemId: item.id,
    partnerId: 'p-rep-001',
    quotedPrice: 1800
  });

  assert.ok(lead.lead_id);
  assert.equal(lead.status, 'referred');
  // Client facing lead does not leak partner_fee
  assert.equal(lead.partner_fee, undefined);

  // Settlement internal API reveals the fee
  const settlement = await LeadManagerService.getInternalSettlementSummary(lead.lead_id);
  assert.equal(settlement.partner_fee, 180); // 10% of 1800
});

test('PartnerTerminalService enables technician grade check-in and issues digital proof', async () => {
  const item = await db.createItem({
    category: 'electronics',
    provisional_grade: 'B'
  });

  const lead = await LeadManagerService.createAttributedLead({
    itemId: item.id,
    partnerId: 'p-cpcb-001'
  });

  // Physical inspection amendments
  const checkIn = await PartnerTerminalService.physicalCheckIn({
    leadId: lead.lead_id,
    partnerId: 'p-cpcb-001',
    inspectorId: 'auditor_nagpur_midc',
    confirmedGrade: 'BER',
    discrepancyReason: 'Water corrosion on motherboard under battery',
    actualAmountAgreed: 350
  });

  assert.equal(checkIn.confirmed_grade, 'BER');
  assert.equal(checkIn.is_grade_amended, true);

  // Issue digital proof certificate
  const proof = await PartnerTerminalService.issueDigitalProof({
    leadId: lead.lead_id,
    proofType: 'formal_recycling_certificate',
    documentUrl: 'https://cdn.rekart.in/certs/nagpur-midc-0091.pdf',
    issuerName: 'Vidarbha Clean-Earth CPCB Recycler'
  });

  assert.ok(proof.certificate_number);
  assert.ok(proof.tamper_proof_signature);
});

test('PriceCalibrationService collects post-service payment logs and updates benchmarks', async () => {
  await seedNagpurData();

  const result = await PriceCalibrationService.submitActualPaymentLog({
    userId: 'user-pilot-44',
    cityId: 'nagpur',
    modelName: 'Galaxy S21',
    faultType: 'Battery Replacement',
    partGrade: 'aftermarket',
    amountPaid: 1700
  });

  assert.ok(result.log_recorded);
  assert.equal(result.log_recorded.actual_amount_paid, 1700);
});
