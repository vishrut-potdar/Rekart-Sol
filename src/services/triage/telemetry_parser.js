/**
 * Hardware Telemetry Parser
 * Ingests and processes client-side sensor payloads:
 * - Touchscreen grid coverage (dead-zones)
 * - Battery wear & cycle count
 * - Charging power & temperature metrics
 * - Microphone audio frequency & SNR
 * - Storage SMART / wear indicators
 */
export class HardwareTelemetryParser {
  static parse(telemetryPayload = {}) {
    const {
      touchscreen_grid,
      battery,
      charging,
      audio,
      storage
    } = telemetryPayload;

    const issuesDetected = [];
    let healthScore = 100;

    // 1. Touchscreen Response Grid
    // Expected: { total_blocks: 100, passed_blocks: 98, dead_zones: ['x3_y7', 'x3_y8'] }
    let touchHealth = 100;
    if (touchscreen_grid) {
      const { total_blocks = 100, passed_blocks = 100, dead_zones = [] } = touchscreen_grid;
      const coverageRatio = passed_blocks / (total_blocks || 1);
      touchHealth = Math.round(coverageRatio * 100);

      if (dead_zones.length > 0 || coverageRatio < 0.95) {
        issuesDetected.push({
          subsystem: 'digitizer_touchscreen',
          severity: coverageRatio < 0.80 ? 'critical' : 'moderate',
          details: `Detected ${dead_zones.length} non-responsive grid sectors (${coverageRatio * 100}% operational)`
        });
        healthScore -= (1.0 - coverageRatio) * 40;
      }
    }

    // 2. Battery Wear & Health
    // Expected: { design_capacity_mah: 4000, current_capacity_mah: 3200, cycle_count: 650, is_swollen: false }
    let batteryHealthPct = 100;
    let batteryHazard = false;
    if (battery) {
      const { design_capacity_mah = 4000, current_capacity_mah = 4000, cycle_count = 200, is_swollen = false } = battery;
      batteryHealthPct = Math.min(100, Math.round((current_capacity_mah / (design_capacity_mah || 1)) * 100));

      if (is_swollen) {
        batteryHazard = true;
        issuesDetected.push({
          subsystem: 'battery',
          severity: 'hazard_fatal',
          details: 'Physical battery swelling detected. Immediate hazard.'
        });
        healthScore -= 60;
      } else if (batteryHealthPct < 75 || cycle_count > 800) {
        issuesDetected.push({
          subsystem: 'battery',
          severity: 'moderate',
          details: `Battery capacity degraded to ${batteryHealthPct}% (${cycle_count} cycles recorded)`
        });
        healthScore -= 20;
      }
    }

    // 3. Charging Status & Port
    // Expected: { status: 'charging', current_ma: 1800, port_wobble: true, temp_celsius: 38 }
    if (charging) {
      const { port_wobble = false, temp_celsius = 32 } = charging;
      if (port_wobble) {
        issuesDetected.push({
          subsystem: 'charging_port',
          severity: 'minor',
          details: 'Micro-disconnects registered upon cable wiggle. Port wear / debris.'
        });
        healthScore -= 10;
      }
      if (temp_celsius > 45) {
        issuesDetected.push({
          subsystem: 'thermal_management',
          severity: 'critical',
          details: `Abnormal thermal throttling detected: ${temp_celsius}°C during charging`
        });
        healthScore -= 25;
      }
    }

    // 4. Audio Diagnostics (Microphone & Speaker)
    if (audio) {
      const { snr_db = 45, frequency_response_cut_hz = 0 } = audio;
      if (snr_db < 20) {
        issuesDetected.push({
          subsystem: 'microphone',
          severity: 'minor',
          details: `Low signal-to-noise ratio: ${snr_db} dB (muffled input)`
        });
        healthScore -= 10;
      }
    }

    // 5. Storage Wear
    if (storage) {
      const { wear_level_percentage = 10 } = storage;
      if (wear_level_percentage > 80) {
        issuesDetected.push({
          subsystem: 'nand_storage',
          severity: 'critical',
          details: `NAND storage wear at ${wear_level_percentage}%. Imminent eMMC failure risk.`
        });
        healthScore -= 30;
      }
    }

    healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

    let grade = 'A';
    if (batteryHazard || healthScore < 30) {
      grade = 'BER'; // Beyond Economical Repair
    } else if (healthScore < 60) {
      grade = 'C';
    } else if (healthScore < 85) {
      grade = 'B';
    }

    return {
      composite_health_score: healthScore,
      provisional_hardware_grade: grade,
      battery_health_percentage: batteryHealthPct,
      touch_coverage_percentage: touchHealth,
      is_hazard_flagged: batteryHazard,
      subsystem_issues: issuesDetected,
      telemetry_analyzed_at: new Date().toISOString()
    };
  }
}
