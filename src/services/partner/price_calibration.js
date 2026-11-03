import { db } from '../../db/connection.js';

/**
 * Crowdsourced Price Calibration Pipeline
 * Ingests user post-service verification logs and recalibrates price benchmarks.
 */
export class PriceCalibrationService {
  static async submitActualPaymentLog({
    userId,
    cityId = 'nagpur',
    modelName,
    faultType,
    partGrade = 'aftermarket',
    amountPaid,
    source = 'user_survey',
    receiptProofUrl = null
  }) {
    const log = await db.addCalibrationLog({
      user_id: userId,
      city_id: cityId,
      model_name: modelName,
      fault_type: faultType,
      part_grade: partGrade,
      actual_amount_paid: Number(amountPaid),
      source,
      receipt_proof_url: receiptProofUrl
    });

    // Trigger recalibration of benchmark percentiles
    const updatedBenchmark = await this.recalibrateBenchmark(cityId, modelName, faultType, partGrade);

    return {
      log_recorded: log,
      benchmark_updated: updatedBenchmark
    };
  }

  static async recalibrateBenchmark(cityId, modelName, faultType, partGrade) {
    const logs = await db.getCalibrationLogs(modelName, faultType);
    if (!logs || logs.length < 3) {
      return null; // Not enough samples to change percentile distribution
    }

    const prices = logs.map(l => Number(l.actual_amount_paid)).sort((a, b) => a - b);

    // Filter outliers using 1.5 * IQR
    const q1Index = Math.floor(prices.length * 0.25);
    const q3Index = Math.floor(prices.length * 0.75);
    const q1 = prices[q1Index];
    const q3 = prices[q3Index];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const filtered = prices.filter(p => p >= lowerBound && p <= upperBound);
    if (filtered.length === 0) return null;

    const p25 = filtered[Math.floor(filtered.length * 0.25)];
    const p50 = filtered[Math.floor(filtered.length * 0.50)];
    const p75 = filtered[Math.floor(filtered.length * 0.75)];

    const updated = await db.addBenchmark({
      city_id: cityId,
      model_name: modelName,
      fault_type: faultType,
      part_grade: partGrade,
      p25_price: p25,
      p50_median_price: p50,
      p75_price: p75,
      sample_count: filtered.length
    });

    return updated;
  }
}
