import test from 'node:test';
import assert from 'node:assert/strict';
import { RepairNetworkService } from '../src/services/repair/repair_network_service.js';
import { KnownDefectsService } from '../src/services/repair/known_defects_service.js';
import { DataWipeChecklistService } from '../src/services/repair/data_wipe_checklist.js';

test('RepairNetworkService routes low-risk repairs to student technicians with 40% discount', async () => {
  // Low-risk battery replacement
  const eligible = await RepairNetworkService.findStudentTechnicians({
    faultType: 'Battery Replacement',
    cityId: 'nagpur'
  });

  assert.equal(eligible.is_eligible_for_student_tech, true);
  assert.ok(eligible.available_student_technicians.length >= 2);
  assert.equal(eligible.available_student_technicians[0].institution.includes('Nagpur'), true);
  assert.ok(eligible.available_student_technicians[0].labour_discount_percentage >= 40);

  // High-risk motherboard repair (should not route to students)
  const nonEligible = await RepairNetworkService.findStudentTechnicians({
    faultType: 'Motherboard PMIC BGA Reballing'
  });
  assert.equal(nonEligible.is_eligible_for_student_tech, false);
});

test('RepairNetworkService broadcasts repair request and compares multi-shop bids', async () => {
  const broadcast = await RepairNetworkService.broadcastRepairRequest({
    itemId: 'item-screen-repair-01',
    modelName: 'iPhone 13',
    faultDescription: 'Digitizer cracked'
  });

  assert.ok(broadcast.broadcast_id);
  assert.ok(broadcast.bids.length >= 3);
  assert.ok(broadcast.lowest_quote_inr <= broadcast.highest_quote_inr);
  assert.ok(broadcast.bids[0].returns_old_parts);
});

test('KnownDefectsService identifies active manufacturer free replacement programs', () => {
  // OnePlus Green line defect
  const onePlusCheck = KnownDefectsService.checkDefectsAndWarranty({
    brand: 'OnePlus',
    modelName: 'OnePlus 9 Pro',
    symptoms: 'Green line on screen after update'
  });

  assert.equal(onePlusCheck.has_known_defect, true);
  assert.equal(onePlusCheck.is_free_replacement_program_active, true);
  assert.match(onePlusCheck.consumer_rights_action, /authorized/i);
  assert.ok(onePlusCheck.consumer_protection_act_note);
});

test('DataWipeChecklistService returns FRP and Find-My prevention steps', () => {
  const androidChecklist = DataWipeChecklistService.getChecklist({ platform: 'android' });
  assert.ok(androidChecklist.steps.length >= 5);
  const accountStep = androidChecklist.steps.find(s => s.title.includes('Remove Google Account'));
  assert.ok(accountStep, 'Must include account removal to prevent FRP lock');

  const appleChecklist = DataWipeChecklistService.getChecklist({ platform: 'ios' });
  const findMyStep = appleChecklist.steps.find(s => s.title.includes('Find My'));
  assert.ok(findMyStep, 'Must include Find My disablement');
});
