/**
 * Symptom & Fault Ranker
 * Correlates tap questions, user complaints, and sensor telemetry.
 * Assigns ranked fault probabilities and prioritizes non-invasive remediation steps.
 */
export class SymptomAndFaultRanker {
  static rank({ category, answers = {}, telemetrySummary = {} }) {
    const faultCandidates = [];
    const nonInvasiveRemediationSteps = [];

    // 1. Evaluate Port vs Battery vs Motherboard
    if (answers.q2_charging === 'charge_loose' || telemetrySummary.subsystem_issues?.some(i => i.subsystem === 'charging_port')) {
      faultCandidates.push({
        fault: 'charging_port_clogged_or_worn',
        component: 'Charging Port & Flex Ribbon',
        confidence: 0.88,
        estimated_hardware_severity: 'low_to_medium'
      });

      nonInvasiveRemediationSteps.push({
        priority: 1,
        title: 'Non-Invasive Port De-Linting',
        estimated_cost_inr: 0,
        instructions: 'Power off device. Use a clean wooden toothpick or dry compressed air to gently remove pocket lint packed inside the charging connector.'
      });
      nonInvasiveRemediationSteps.push({
        priority: 2,
        title: 'Cable & Power Brick Swap',
        estimated_cost_inr: 0,
        instructions: 'Test with a known genuine cable and adapter to isolate whether the issue is internal or accessory-related.'
      });
    }

    if (answers.q3_battery_health === 'bat_few_hours' || telemetrySummary.battery_health_percentage < 75) {
      faultCandidates.push({
        fault: 'battery_chemical_aging',
        component: 'Lithium-Ion Battery Cell',
        confidence: 0.92,
        estimated_hardware_severity: 'medium'
      });
    }

    if (answers.q3_battery_health === 'bat_swollen' || telemetrySummary.is_hazard_flagged) {
      faultCandidates.push({
        fault: 'battery_physical_swelling',
        component: 'Lithium-Ion Battery Cell',
        confidence: 0.99,
        estimated_hardware_severity: 'critical_hazard'
      });
    }

    if (answers.q1_power === 'power_dead') {
      faultCandidates.push({
        fault: 'motherboard_pmic_or_short_circuit',
        component: 'Power Management IC / Mainboard',
        confidence: 0.74,
        estimated_hardware_severity: 'high'
      });

      nonInvasiveRemediationSteps.push({
        priority: 3,
        title: 'Hard Reset / Battery Pull Key Combination',
        estimated_cost_inr: 0,
        instructions: 'Perform a force restart: hold Power + Volume Down keys simultaneously for 15 seconds to clear unresponsive bootloader state.'
      });
    }

    if (answers.q4_touch_and_audio === 'touch_ghost_clicks' || telemetrySummary.touch_coverage_percentage < 95) {
      faultCandidates.push({
        fault: 'digitizer_panel_failure',
        component: 'Display Glass & Touch Layer',
        confidence: 0.89,
        estimated_hardware_severity: 'medium_to_high'
      });
    }

    // Default fallback if no faults triggered
    if (faultCandidates.length === 0) {
      faultCandidates.push({
        fault: 'nominal_operational_wear',
        component: 'System Overall',
        confidence: 0.95,
        estimated_hardware_severity: 'minimal'
      });
    }

    // Sort faults by confidence desc
    faultCandidates.sort((a, b) => b.confidence - a.confidence);

    return {
      primary_fault: faultCandidates[0],
      secondary_faults: faultCandidates.slice(1),
      non_invasive_remediation_steps: nonInvasiveRemediationSteps,
      can_attempt_home_remediation: nonInvasiveRemediationSteps.length > 0 && !telemetrySummary.is_hazard_flagged
    };
  }
}
