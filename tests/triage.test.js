import test from 'node:test';
import assert from 'node:assert/strict';
import { DecisionTreeEngine } from '../src/services/triage/decision_tree.js';
import { HardwareTelemetryParser } from '../src/services/triage/telemetry_parser.js';
import { SymptomAndFaultRanker } from '../src/services/triage/fault_ranker.js';

test('DecisionTreeEngine returns 3-5 tap questions in English, Hindi, and Hinglish', () => {
  const enTree = DecisionTreeEngine.getQuestionTree('electronics', 'en');
  assert.ok(enTree.steps.length >= 3);
  assert.match(enTree.steps[0].question, /turn on/i);

  const hiTree = DecisionTreeEngine.getQuestionTree('electronics', 'hi');
  assert.match(hiTree.steps[0].question, /चालू होता है/);

  const hinglishTree = DecisionTreeEngine.getQuestionTree('electronics', 'hinglish');
  assert.match(hinglishTree.steps[0].question, /switch on/i);
});

test('HardwareTelemetryParser correctly parses touchscreen dead zones, battery wear, and hazard flags', () => {
  // Test healthy device
  const healthy = HardwareTelemetryParser.parse({
    touchscreen_grid: { total_blocks: 100, passed_blocks: 100, dead_zones: [] },
    battery: { design_capacity_mah: 4000, current_capacity_mah: 3800, cycle_count: 150, is_swollen: false },
    charging: { port_wobble: false, temp_celsius: 31 }
  });
  assert.equal(healthy.provisional_hardware_grade, 'A');
  assert.equal(healthy.is_hazard_flagged, false);

  // Test swollen battery hazard
  const swollen = HardwareTelemetryParser.parse({
    battery: { design_capacity_mah: 4000, current_capacity_mah: 2000, cycle_count: 900, is_swollen: true }
  });
  assert.equal(swollen.is_hazard_flagged, true);
  assert.equal(swollen.provisional_hardware_grade, 'BER');
});

test('SymptomAndFaultRanker prioritizes non-invasive remediation before hardware replacements', () => {
  const analysis = SymptomAndFaultRanker.rank({
    category: 'electronics',
    answers: {
      q2_charging: 'charge_loose'
    },
    telemetrySummary: {
      subsystem_issues: [{ subsystem: 'charging_port' }]
    }
  });

  assert.equal(analysis.primary_fault.fault, 'charging_port_clogged_or_worn');
  assert.ok(analysis.can_attempt_home_remediation);
  assert.ok(analysis.non_invasive_remediation_steps.length >= 2);
  assert.match(analysis.non_invasive_remediation_steps[0].title, /Port De-Linting/i);
});
