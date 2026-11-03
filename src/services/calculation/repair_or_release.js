import { REPAIR_THRESHOLD_RATIO, OUTCOME_TRACKS } from '../../config/constants.js';

/**
 * Repair-or-Release Logic Engine
 * Computes economic feasibility:
 * Repair Threshold = 60% * Repaired Resale Value
 */
export class RepairOrReleaseEngine {
  static evaluate({
    category = 'electronics',
    modelName,
    functionalResaleValue,
    estimatedRepairCost,
    asIsScrapValue = 0,
    brandExchangeValue = 0,
    deviceAgeMonths = 24,
    safetyLevel = 'BEGINNER_SAFE'
  }) {
    const vFunctional = Number(functionalResaleValue);
    const cRepair = Number(estimatedRepairCost);
    const vScrap = Number(asIsScrapValue);
    const vExchange = Number(brandExchangeValue);

    // Economic Ceiling: Repair is non-viable if repair cost exceeds 60% of repaired resale
    const repairThresholdCeiling = parseFloat((REPAIR_THRESHOLD_RATIO * vFunctional).toFixed(2));
    const netYieldIfRepaired = parseFloat((vFunctional - cRepair).toFixed(2));

    // Calculate annual depreciation impact (assume 2.5% monthly decay for older electronics)
    const monthlyDepreciationRate = 0.025;
    const projectedValueIn6Months = parseFloat((vFunctional * Math.pow(1 - monthlyDepreciationRate, 6)).toFixed(2));

    // Decision Logic
    let isRepairEconomicallyViable = cRepair <= repairThresholdCeiling && netYieldIfRepaired > vScrap;
    let primaryOutcome = OUTCOME_TRACKS.REPAIR;
    let rationalization = '';

    if (safetyLevel === 'DO_NOT_ATTEMPT') {
      isRepairEconomicallyViable = false;
      primaryOutcome = OUTCOME_TRACKS.FORMAL_RECYCLE;
      rationalization = 'Safety hazard detected. Commercial repair or CPCB certified recycling required.';
    } else if (isRepairEconomicallyViable) {
      if (vExchange > netYieldIfRepaired) {
        primaryOutcome = OUTCOME_TRACKS.INSTANT_BUYBACK;
        rationalization = `Brand exchange value (₹${vExchange}) yields higher net return than repairing and selling peer-to-peer (₹${netYieldIfRepaired}).`;
      } else {
        primaryOutcome = OUTCOME_TRACKS.REPAIR;
        rationalization = `Repair is economically sensible: Estimated cost of ₹${cRepair} is below the 60% threshold (₹${repairThresholdCeiling}).`;
      }
    } else {
      // Repair not viable
      if (vExchange > vScrap && vExchange > 0) {
        primaryOutcome = OUTCOME_TRACKS.INSTANT_BUYBACK;
        rationalization = `Repair cost exceeds 60% of resale value. Trade in via brand exchange for highest recovery (₹${vExchange}).`;
      } else if (vScrap > 300) {
        primaryOutcome = OUTCOME_TRACKS.KABADIWALA_SCRAP;
        rationalization = `Repair is beyond economical limit. Sell as-is for parts or scrap weight recovery (₹${vScrap}).`;
      } else {
        primaryOutcome = OUTCOME_TRACKS.FORMAL_RECYCLE;
        rationalization = `Item has low residual market value. Route to CPCB authorized recycler for zero-landfill recovery.`;
      }
    }

    return {
      model_name: modelName,
      is_repair_economically_viable: isRepairEconomicallyViable,
      repair_threshold_ratio: REPAIR_THRESHOLD_RATIO,
      repair_threshold_ceiling_inr: repairThresholdCeiling,
      net_yield_if_repaired: netYieldIfRepaired,
      functional_resale_value: vFunctional,
      estimated_repair_cost: cRepair,
      as_is_scrap_value: vScrap,
      brand_exchange_value: vExchange,
      projected_value_in_6_months: projectedValueIn6Months,
      recommended_outcome: primaryOutcome,
      rationalization
    };
  }
}
