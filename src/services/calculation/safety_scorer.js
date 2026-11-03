import { SAFETY_LEVELS } from '../../config/constants.js';

/**
 * Self-Repair Safety & Feasibility Scorer
 * Safeguards users by classifying repair risk and isolating hazardous operations.
 */
export class SafetyScorerEngine {
  static evaluateRisk({
    category = 'electronics',
    faultType = '',
    symptoms = [],
    isSwollenBattery = false,
    applianceType = ''
  }) {
    const faultLower = faultType.toLowerCase();
    const symptomsStr = symptoms.join(' ').toLowerCase();

    // 1. Critical Hazard Triggers -> DO_NOT_ATTEMPT
    if (
      isSwollenBattery ||
      symptomsStr.includes('swollen') ||
      faultLower.includes('swollen')
    ) {
      return {
        safety_level: SAFETY_LEVELS.DO_NOT_ATTEMPT,
        hazard_type: 'THERMAL_RUNAWAY_LITHIUM_HAZARD',
        risk_score: 95,
        required_precautions: [
          'Do NOT puncture, squeeze, or apply heat to the battery casing',
          'Disconnect charger immediately and place device on a non-flammable surface',
          'Must be serviced inside a fire-safe containment booth by a certified technician'
        ],
        allow_diy_guide: false
      };
    }

    if (
      applianceType.includes('microwave') ||
      faultLower.includes('magnetron') ||
      faultLower.includes('high_voltage_capacitor')
    ) {
      return {
        safety_level: SAFETY_LEVELS.DO_NOT_ATTEMPT,
        hazard_type: 'LETHAL_HIGH_VOLTAGE_STORED_CHARGE',
        risk_score: 99,
        required_precautions: [
          'Microwave high-voltage capacitors can hold 2,000+ Volts even when unplugged for days',
          'Severe risk of fatal electric shock. DIY disassembly strictly prohibited'
        ],
        allow_diy_guide: false
      };
    }

    // 2. Specialized Tools Required
    if (
      faultLower.includes('screen') ||
      faultLower.includes('display') ||
      faultLower.includes('soldering') ||
      faultLower.includes('motherboard') ||
      faultLower.includes('bearing')
    ) {
      return {
        safety_level: SAFETY_LEVELS.NEEDS_SPECIALIZED_TOOLS,
        hazard_type: 'TOOL_AND_DELICATE_FLEX_CABLE_RISK',
        risk_score: 55,
        required_tools: [
          'Heat gun / Heating pad (80°C controlled)',
          'Suction handle & plastic pry spudgers',
          'Pentalobe / Torx precision screwdrivers',
          'ESD anti-static wrist strap'
        ],
        required_precautions: [
          'Work under adequate magnification and illumination',
          'Disconnect battery flex before touching any display connector'
        ],
        allow_diy_guide: true
      };
    }

    // 3. Beginner Safe
    return {
      safety_level: SAFETY_LEVELS.BEGINNER_SAFE,
      hazard_type: 'MINIMAL_LOW_VOLTAGE',
      risk_score: 15,
      required_tools: ['Dry lint-free micro-fiber cloth', 'Wooden toothpicks / SIM ejector tool', 'Rubbing alcohol (>90% IPA)'],
      required_precautions: ['Keep liquid away from openings', 'Power off unit before cleaning contacts'],
      allow_diy_guide: true
    };
  }
}
