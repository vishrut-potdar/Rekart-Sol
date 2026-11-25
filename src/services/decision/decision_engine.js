import { ENV } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { calculatePhonePricing, isPhone, readPhonePricingData } from '../calculation/phone_pricing.js';
import crypto from 'crypto';
import { db } from '../../db/connection.js';
import { NAGPUR_GEO_ANCHOR, REPAIR_THRESHOLD_RATIO, SAFETY_LEVELS } from '../../config/constants.js';
import { SafetyScorerEngine } from '../calculation/safety_scorer.js';
import { HyperlocalMatcherService } from '../routing/hyperlocal_matcher.js';

const phonePricingData = readPhonePricingData(ENV.PHONE_PRICING_DATA_JSON);
if (!ENV.ALLOW_RETAIL_PRICE_PUBLICATION) delete phonePricingData.retail;

const CATEGORY_DEFAULTS = {
  electronics: {
    fault_type: 'Battery / Hardware Service',
    co2_kg: 18,
  },
  apparel: {
    fault_type: 'Stitching / Zip Alteration',
    co2_kg: 12,
  },
  appliance: {
    fault_type: 'Motor / Electrical Servicing',
    co2_kg: 26,
  },
  furniture: {
    fault_type: 'Carpentry / Joint Repair',
    co2_kg: 34,
  },
  other: {
    fault_type: 'General Repair',
    co2_kg: 8,
  }
};

const SEVERE_HAZARD_REGEX = /swollen|bulg|puff|mercury|cfl|tube\s*light|acid|leaking\s*battery|lithium\s*puncture|smoke|sparks|burning\s*smell/i;
const MAINS_HAZARD_REGEX = /microwave|magnetron|high\s*voltage\s*capacitor|crt\s*flyback|exposed\s*mains/i;
const EWASTE_ITEM_REGEX = /phone|iphone|samsung|laptop|headphone|earphone|charger|cable|wire|battery|power\s*bank|tablet|monitor|tv|printer|router|electronics|cfl|tube\s*light|fluorescent/i;

function parseAgeYears(input) {
  if (typeof input.ageYears === 'number' && !Number.isNaN(input.ageYears)) {
    return Math.max(0, Math.min(25, input.ageYears));
  }
  const map = { '<1': 0.5, '1-2': 1.5, '3-5': 4, '5+': 7 };
  return map[input.ageBracket] ?? 2.5;
}

function mapConditionToGrade(condition, working) {
  if (working === 'no' && condition === 'poor') return 'BER';
  if (condition === 'like_new' && (working === 'yes' || working === 'working')) return 'A';
  if (condition === 'good' || (condition === 'like_new' && working !== 'no')) return 'B';
  if (condition === 'fair') return 'C';
  return 'BER';
}

export class DecisionEngine {
  /**
   * Pure 3-stage deterministic decision engine:
   *   1) Hard Rules (safety override, E-Waste Rules 2022, donation readiness gate)
   *   2) Sourced Value & Cost Ranges (working resale, repair range, 60% threshold, channel net yields)
   *   3) Priority Weights & Counterfactuals ("what would change this")
   */
  static evaluate(rawInput = {}, context = {}) {
    const category = ['electronics', 'apparel', 'appliance', 'furniture', 'other'].includes(rawInput.category)
      ? rawInput.category
      : 'other';
    const working = ['yes', 'partly', 'no', 'working', 'not_working'].includes(rawInput.working)
      ? (rawInput.working === 'working' ? 'yes' : rawInput.working === 'not_working' ? 'no' : rawInput.working)
      : 'partly';
    const condition = ['like_new', 'good', 'fair', 'poor'].includes(rawInput.condition)
      ? rawInput.condition
      : 'good';
    const priority = ['balanced', 'max_cash', 'lowest_effort', 'fastest', 'eco_social'].includes(rawInput.priority)
      ? rawInput.priority
      : 'balanced';

    const ageYears = parseAgeYears(rawInput);
    const modelName = (rawInput.modelName || rawInput.itemName || `${rawInput.brand || ''} ${rawInput.subCategory || category}`).trim();
    const noteText = [rawInput.note, rawInput.faultType, ...(Array.isArray(rawInput.symptoms) ? rawInput.symptoms : [])]
      .filter(Boolean)
      .join(' ');
    const catCfg = CATEGORY_DEFAULTS[category] || CATEGORY_DEFAULTS.other;
    const faultType = rawInput.faultType || catCfg.fault_type;

    // --- Stage 1: Hard Rules ---
    const isSwollenBattery = Boolean(rawInput.isSwollenBattery) || SEVERE_HAZARD_REGEX.test(noteText);
    const isMainsHazard = MAINS_HAZARD_REGEX.test(`${modelName} ${noteText} ${rawInput.applianceType || ''}`);
    const isEwasteItem = category === 'electronics' || EWASTE_ITEM_REGEX.test(`${modelName} ${noteText}`);

    const safety = SafetyScorerEngine.evaluateRisk({
      category,
      faultType,
      symptoms: [noteText],
      isSwollenBattery,
      applianceType: isMainsHazard ? 'microwave' : (rawInput.applianceType || '')
    });

    const severeHazard = isSwollenBattery || safety.hazard_type === 'THERMAL_RUNAWAY_LITHIUM_HAZARD' || safety.hazard_type === 'TOXIC_MERCURY_OR_ACID_HAZARD';
    const effectiveSafetyLevel = severeHazard ? SAFETY_LEVELS.DO_NOT_ATTEMPT : safety.safety_level;
    const blockedPaths = [];
    if (severeHazard) {
      blockedPaths.push('repair', 'sell', 'donate', 'reuse');
    } else if (effectiveSafetyLevel === SAFETY_LEVELS.DO_NOT_ATTEMPT) {
      // High-voltage mains fault: block DIY reuse and unsafe self-repair; commercial repair or recycling permitted.
      blockedPaths.push('reuse');
    }

    const safetyOverride = {
      active: effectiveSafetyLevel === SAFETY_LEVELS.DO_NOT_ATTEMPT,
      level: effectiveSafetyLevel,
      safety_level: effectiveSafetyLevel,
      hazard_type: safety.hazard_type,
      hazard_flag: safety.hazard_type,
      allow_diy_guide: severeHazard ? false : safety.allow_diy_guide,
      blocked_paths: blockedPaths,
      force_recycle: severeHazard,
      headline: severeHazard
        ? 'Safety hazard — do not repair, sell, or place in regular bins'
        : effectiveSafetyLevel === SAFETY_LEVELS.DO_NOT_ATTEMPT
          ? 'High-voltage hazard — do not open or DIY at home'
          : null,
      reason: severeHazard
        ? 'Active lithium thermal or toxic hazard — handle carefully and take only to a CPCB/MPCB authorised recycler.'
        : effectiveSafetyLevel === SAFETY_LEVELS.DO_NOT_ATTEMPT
          ? 'High-voltage mains hazard — do not open or repair at home without a qualified technician.'
          : null,
      precautions: safety.required_precautions || [],
      handling_steps: safety.required_precautions || []
    };

    const regulatoryRule = isEwasteItem
      ? {
          rule: 'E-Waste (Management) Rules, 2022',
          authorised_recycler_only: true,
          kabadiwala_blocked: true,
          message: 'Electronics, cables, and batteries must go only to CPCB/MPCB authorised recyclers or brand take-back bins — never informal kabadiwalas.'
        }
      : {
          rule: null,
          authorised_recycler_only: false,
          kabadiwala_blocked: false,
          message: null
        };

    const donationDisqualifiers = [];
    if (severeHazard) donationDisqualifiers.push('Active safety hazard makes item unsafe for donation.');
    if (working === 'no') donationDisqualifiers.push('Non-working items are rejected at NGO intake.');
    if (condition === 'poor') donationDisqualifiers.push('Poor/damaged items do not pass NGO hygiene and readiness checks.');
    const donateEligible = donationDisqualifiers.length === 0;

    const conditionGrade = mapConditionToGrade(condition, working);

    // Build all 5 path candidates
    const pathDefinitions = {
      repair: {
        path: 'repair',
        label: 'Repair & Keep / Restore Value',
        eligible: !blockedPaths.includes('repair') && working !== 'yes',
        ineligible_reason: blockedPaths.includes('repair')
          ? 'Blocked due to active safety hazard.'
          : working === 'yes'
            ? 'Item is already working — no repair needed.'
            : null,
        effort_level: safety.safety_level === SAFETY_LEVELS.BEGINNER_SAFE ? 'low' : 'medium',
        turnaround_days: [1, 3],
        co2_saved_kg: catCfg.co2_kg,
        basis: 'Confirm condition and get a direct local quote.'
      },
      sell: {
        path: 'sell',
        label: working === 'yes' ? 'Sell Working Item' : 'Sell As-Is (Disclosing Faults)',
        eligible: false,
        effort_level: 'medium',
        turnaround_days: [2, 10],
        co2_saved_kg: Math.round(catCfg.co2_kg * 0.85),
        basis: 'Confirm condition and get a direct local quote.'
      },
      donate: {
        path: 'donate',
        label: 'Donate to Local Nagpur NGO',
        eligible: donateEligible,
        ineligible_reason: donationDisqualifiers[0] || null,
        effort_level: 'low',
        turnaround_days: [1, 4],
        co2_saved_kg: Math.round(catCfg.co2_kg * 0.9),
        basis: donateEligible
          ? `Working & ${condition.replace('_', ' ')} condition passes NGO intake readiness gate.`
          : donationDisqualifiers.join(' ')
      },
      reuse: {
        path: 'reuse',
        label: 'Reuse / Upcycle at Home',
        eligible: !blockedPaths.includes('reuse'),
        ineligible_reason: blockedPaths.includes('reuse')
          ? 'Blocked by safety rules (cannot DIY or disassemble).'
          : null,
        effort_level: category === 'furniture' ? 'high' : 'medium',
        turnaround_days: [1, 2],
        co2_saved_kg: Math.round(catCfg.co2_kg * 0.95),
        basis: 'Confirm condition and get a direct local quote.'
      },
      recycle: {
        path: 'recycle',
        label: isEwasteItem ? 'Authorised E-Waste Drop-Off (CPCB)' : 'Material & Scrap Recovery',
        eligible: true,
        ineligible_reason: null,
        authorised_only: isEwasteItem,
        regulatory_basis: isEwasteItem ? 'E-Waste (Management) Rules, 2022' : null,
        effort_level: 'low',
        turnaround_days: [1, 3],
        co2_saved_kg: Math.round(catCfg.co2_kg * 0.45),
        basis: isEwasteItem
          ? 'Route strictly to a CPCB/MPCB authorised e-waste collection point or brand drop-box (E-Waste Management Rules, 2022).'
          : 'Safe material/scrap recovery when repair, resale, or donation are not viable.'
      }
    };

    const phone = isPhone({ ...rawInput, category, modelName });
    const pricing = calculatePhonePricing(
      { ...rawInput, category, modelName, condition, working, isHazard: severeHazard },
      context.phonePricingData || phonePricingData, context.now, { phone }
    );
    {
      for (const path of Object.values(pathDefinitions)) {
        path.net_value_range_inr = null;
        path.net_value_median_inr = null;
        path.cost_range_inr = null;
      }
      const { repair, sell, donate } = pathDefinitions;
      repair.eligible = repair.eligible || (pricing.verdict === 'repair' && !blockedPaths.includes('repair'));
      repair.eligible = repair.eligible && pricing.verdict === 'repair';
      repair.economically_viable = repair.eligible;
      repair.ineligible_reason = repair.eligible ? null : pricing.verdict === 'borderline'
        ? 'Get a repair quote and recent offers from local buyers.' : 'Repair did not qualify under the 60% rule.';
      if (!blockedPaths.includes('repair') && pricing.repair_cost_inr != null) {
        repair.cost_range_inr = [pricing.repair_cost_inr, pricing.repair_cost_inr];
      }
      sell.eligible = !blockedPaths.includes('sell') && working !== 'no';
      sell.ineligible_reason = sell.eligible ? null : 'Confirm safety and functionality before listing.';
      if (sell.eligible && pricing.sell && pricing.verdict === 'not_needed') {
        sell.net_value_range_inr = pricing.sell.range_inr;
        sell.net_value_median_inr = pricing.sell.median_inr;
      }
      if (working !== 'yes' || rawInput.faultType || rawInput.batteryNeedsService || rawInput.batteryHealthPercent < 80) {
        donate.eligible = false;
        donate.ineligible_reason = 'Donation requires a fully working phone.';
      }
    }

    const rankedPaths = Object.values(pathDefinitions)
      .map(p => ({ ...p, score: !p.eligible ? 0 : (
        p.path === 'repair' ? 95 : p.path === 'sell' ? (priority === 'eco_social' ? 65 : 85)
          : p.path === 'donate' ? (priority === 'eco_social' ? 90 : 70)
          : p.path === 'reuse' ? (working === 'no' ? 30 : 55) : 50
      ) }))
      .sort((a, b) => {
        if (severeHazard) return (b.path === 'recycle' ? 1 : 0) - (a.path === 'recycle' ? 1 : 0);
        if (a.eligible !== b.eligible) return Number(b.eligible) - Number(a.eligible);
        return b.score - a.score;
      });

    const recommendedPath = rankedPaths[0];
    const alternatives = rankedPaths.slice(1);

    // Counterfactuals: "What would change this?"
    const whatWouldChangeThis = [];
    if (severeHazard) {
      whatWouldChangeThis.push('Nothing — swollen batteries, leaking cells, or mercury lamps always override to authorised hazardous/e-waste recycling for safety.');
    } else {
      whatWouldChangeThis.push('Compare a written repair quote with recent offers from Nagpur shops or direct buyers.');
      if (!donateEligible) whatWouldChangeThis.push('Donation requires a clean, working item.');
    }

    return {
      item_summary: {
        category,
        sub_category: rawInput.subCategory || null,
        brand: rawInput.brand || null,
        model_name: modelName || category,
        age_years: ageYears,
        working,
        condition,
        condition_grade: conditionGrade,
        priority,
        fault_type: faultType,
        is_sample: Boolean(rawInput.isSample),
        original_price_inr: rawInput.originalPrice ?? null,
        repair_cost_range_inr: pathDefinitions.repair.cost_range_inr,
        working_resale_range_inr: pricing.sell?.range_inr ?? null,
        working_resale_median_inr: pricing.sell?.median_inr ?? null,
        as_is_resale_range_inr: pathDefinitions.sell.net_value_range_inr,
        repair_ceiling_60pct_inr: pricing.ceiling_low_inr,
        server_valuation_inr: pathDefinitions.sell.net_value_median_inr
      },
      recommended_path: recommendedPath,
      alternatives,
      ranked_paths: rankedPaths,
      what_would_change_this: whatWouldChangeThis.slice(0, 3),
      safety_override: safetyOverride,
      regulatory_rule: regulatoryRule,
      fair_price_shield: null,
      repair_or_release: {
        verdict: pricing.verdict, repair_threshold_ratio: REPAIR_THRESHOLD_RATIO,
        is_repair_economically_viable: pathDefinitions.repair.eligible
      },
      channel_comparison: { channels: [] },
      resale_pricing: pricing,
      phone_pricing: phone ? pricing : null,
      provenance: pricing.sell ?? pricing.retail ?? { source: 'Local quote needed', as_of: null }
    };
  }

  /**
   * Runs evaluation and partner lookup, then persists item and decision.
   */
  static async decideAndPersist(input, { userId, latitude = NAGPUR_GEO_ANCHOR.latitude, longitude = NAGPUR_GEO_ANCHOR.longitude } = {}) {
    const modelName = (input.modelName || input.itemName || `${input.brand || ''} ${input.subCategory || input.category || ''}`).trim();
    const decisionCore = this.evaluate({ ...input, modelName });

    const [repairShops, ngos, recyclers] = await Promise.all([
      HyperlocalMatcherService.findOptimalMatches({ latitude, longitude, category: decisionCore.item_summary.category, targetTrack: 'repair' }),
      HyperlocalMatcherService.findOptimalMatches({ latitude, longitude, category: decisionCore.item_summary.category, targetTrack: 'ngo_donation' }),
      HyperlocalMatcherService.findOptimalMatches({ latitude, longitude, category: decisionCore.item_summary.category, targetTrack: 'formal_recycle' })
    ]);

    const decisionId = crypto.randomUUID();
    const existingItem = input.itemId ? await db.getItem(input.itemId) : null;
    if (existingItem && (!userId || userId === 'anon_session' || existingItem.user_id !== userId)) {
      throw AppError.forbidden('You do not have permission to update this item');
    }
    const itemRecord = existingItem
      ? await db.updateItem(input.itemId, {
          category: decisionCore.item_summary.category,
          brand: decisionCore.item_summary.brand,
          model_name: decisionCore.item_summary.model_name,
          provisional_grade: decisionCore.item_summary.condition_grade,
          recommended_track: decisionCore.recommended_path.path,
          server_valuation_inr: decisionCore.item_summary.server_valuation_inr,
          status: 'priced'
        })
      : await db.createItem({
          id: undefined,
          user_id: userId,
          category: decisionCore.item_summary.category,
          brand: decisionCore.item_summary.brand,
          model_name: decisionCore.item_summary.model_name,
          provisional_grade: decisionCore.item_summary.condition_grade,
          raw_media_urls: input.imageUrl ? [input.imageUrl] : [],
          recommended_track: decisionCore.recommended_path.path,
          server_valuation_inr: decisionCore.item_summary.server_valuation_inr,
          metadata: {
            priority: decisionCore.item_summary.priority,
            working: decisionCore.item_summary.working,
            condition: decisionCore.item_summary.condition,
            is_sample: decisionCore.item_summary.is_sample
          },
          status: 'priced'
        });

    // Keep licensed retail data out of durable user history. The current response can show it
    // while publication is enabled. A later revocation takes effect without a data migration.
    const historyDecision = decisionCore.phone_pricing?.retail
      ? this.evaluate(input, { phonePricingData: { sell: phonePricingData.sell, repair: phonePricingData.repair } })
      : decisionCore;
    const fullDecision = await db.saveDecision({
      decision_id: decisionId,
      item_id: itemRecord.id,
      user_id: userId,
      ...historyDecision,
      nearby_partners: {
        repair_shops: repairShops.partners.slice(0, 3),
        ngos: ngos.partners.slice(0, 4),
        authorised_recyclers: recyclers.partners.slice(0, 3)
      }
    });

    return { ...fullDecision, ...decisionCore };
  }
}

// Older decisions may contain estimates generated without comparable quotes.
export function currentSavedPricing(decision, now = Date.now()) {
  const pricing = decision.resale_pricing;
  const sell = pricing?.sell;
  if (pricing && (!sell || Date.parse(sell.expires_at) >= now)) return decision;
  const summary = { ...decision.item_summary };
  for (const key of Object.keys(summary)) {
    if (key.endsWith('_inr') && key !== 'original_price_inr') summary[key] = null;
  }
  const stripPath = path => path && ({
    ...path, net_value_range_inr: null, net_value_median_inr: null, cost_range_inr: null,
    ...(path.path !== 'recycle' && { basis: 'Reassess this item for current local quotes.' }),
    ...(path.path === 'repair' && { economically_viable: false, eligible: false })
  });
  const paths = (decision.ranked_paths || []).map(stripPath).sort((a, b) => Number(b.eligible) - Number(a.eligible));
  const missing = { verdict: decision.safety_override?.active ? 'release' : 'borderline' };
  return {
    ...decision, item_summary: summary, ranked_paths: paths,
    recommended_path: paths[0] || stripPath(decision.recommended_path), alternatives: paths.slice(1),
    what_would_change_this: ['Reassess this item for current local quotes.'],
    resale_pricing: missing, phone_pricing: decision.phone_pricing ? missing : null,
    repair_or_release: { verdict: missing.verdict, is_repair_economically_viable: false },
    fair_price_shield: null, channel_comparison: { channels: [] }, provenance: { source: 'Local quote needed', as_of: null }
  };
}
