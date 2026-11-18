import crypto from 'crypto';
import { db } from '../../db/connection.js';
import { NAGPUR_GEO_ANCHOR, REPAIR_THRESHOLD_RATIO, SAFETY_LEVELS } from '../../config/constants.js';
import { SafetyScorerEngine } from '../calculation/safety_scorer.js';
import { FairPriceShieldEngine } from '../calculation/fair_price_shield.js';
import { RepairOrReleaseEngine } from '../calculation/repair_or_release.js';
import { ChannelComparisonEngine } from '../calculation/channel_comparison.js';
import { HyperlocalMatcherService } from '../routing/hyperlocal_matcher.js';

const CATEGORY_DEFAULTS = {
  electronics: {
    default_price_inr: 15000,
    repair_band_inr: [900, 1800, 2800],
    fault_type: 'Battery / Hardware Service',
    annual_decay: 0.22,
    weight_kg: 0.35,
    co2_kg: 18,
    source: 'Rekart Nagpur electronics baseline estimate (no model-specific benchmark matched)',
    as_of: '2026-11-03'
  },
  apparel: {
    default_price_inr: 1800,
    repair_band_inr: [120, 220, 350],
    fault_type: 'Stitching / Zip Alteration',
    annual_decay: 0.25,
    weight_kg: 0.7,
    co2_kg: 12,
    source: 'Rekart Nagpur tailor & resale baseline estimate',
    as_of: '2026-11-03'
  },
  appliance: {
    default_price_inr: 4000,
    repair_band_inr: [300, 500, 850],
    fault_type: 'Motor / Electrical Servicing',
    annual_decay: 0.18,
    weight_kg: 2.8,
    co2_kg: 26,
    source: 'Urban Company & Nagpur appliance service baseline range',
    as_of: '2026-11-03'
  },
  furniture: {
    default_price_inr: 4500,
    repair_band_inr: [150, 350, 650],
    fault_type: 'Carpentry / Joint Repair',
    annual_decay: 0.12,
    weight_kg: 7.5,
    co2_kg: 34,
    source: 'Urban Company carpentry baseline range',
    as_of: '2026-11-03'
  },
  other: {
    default_price_inr: 1500,
    repair_band_inr: [150, 300, 500],
    fault_type: 'General Repair',
    annual_decay: 0.20,
    weight_kg: 1.2,
    co2_kg: 8,
    source: 'Rekart general household baseline estimate',
    as_of: '2026-11-03'
  }
};

const MODEL_RESALE_HINTS = [
  { match: /iphone\s*13/i, original_inr: 49900, resale_working_inr: 29500, repair_band: [3800, 4500, 5200], fault: 'Screen Replacement', source: 'India refurbished market reference (iPhone 13)', as_of: '2026-11-03' },
  { match: /galaxy\s*s21/i, original_inr: 44999, resale_working_inr: 18500, repair_band: [4200, 4800, 5600], fault: 'Screen Replacement', source: 'India refurbished market reference (Galaxy S21)', as_of: '2026-11-03' },
  { match: /redmi\s*note\s*11/i, original_inr: 13499, resale_working_inr: 6500, repair_band: [450, 600, 800], fault: 'Charging Port Replacement', source: 'India refurbished market reference (Redmi Note 11)', as_of: '2026-11-03' },
  { match: /inspiron\s*15|laptop/i, original_inr: 45000, resale_working_inr: 21000, repair_band: [1100, 1400, 1750], fault: 'Keyboard Replacement', source: 'India refurbished laptop reference', as_of: '2026-11-03' },
  { match: /wh-1000xm4|sony.*headphone/i, original_inr: 22990, resale_working_inr: 11489, repair_band: [650, 850, 1050], fault: 'Battery Replacement', source: 'Amazon Renewed all-time low (30-day avg ₹15,883)', as_of: '2026-11-03' },
  { match: /mixer|bajaj/i, original_inr: 3499, resale_working_inr: 1800, repair_band: [300, 450, 700], fault: 'Motor Capacitor / Bearing', source: 'Bajaj Rex 750W Smartprix & Urban Company reference', as_of: '2026-11-03' },
  { match: /top\s*load|washing\s*machine/i, original_inr: 18500, resale_working_inr: 8200, repair_band: [1200, 1600, 2100], fault: 'Motor Capacitor / Bearing', source: 'India refurbished appliance baseline', as_of: '2026-11-03' },
  { match: /jacket|denim|jeans/i, original_inr: 2200, resale_working_inr: 900, repair_band: [150, 250, 350], fault: 'Zip & Lining Repair', source: 'Rekart apparel resale & tailoring estimate', as_of: '2026-11-03' },
  { match: /chair|desk|table/i, original_inr: 4500, resale_working_inr: 2400, repair_band: [100, 300, 600], fault: 'Joint Re-gluing', source: 'Urban Company wooden furniture reference', as_of: '2026-11-03' }
];

const SEVERE_HAZARD_REGEX = /swollen|bulg|puff|mercury|cfl|tube\s*light|acid|leaking\s*battery|lithium\s*puncture|smoke|sparks|burning\s*smell/i;
const MAINS_HAZARD_REGEX = /microwave|magnetron|high\s*voltage\s*capacitor|crt\s*flyback|exposed\s*mains/i;
const EWASTE_ITEM_REGEX = /phone|iphone|samsung|laptop|headphone|earphone|charger|cable|wire|battery|power\s*bank|tablet|monitor|tv|printer|router|electronics|cfl|tube\s*light|fluorescent/i;

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function round50(n) {
  return Math.max(0, Math.round(n / 50) * 50);
}

function parseAgeYears(input) {
  if (typeof input.ageYears === 'number' && !Number.isNaN(input.ageYears)) {
    return Math.max(0, Math.min(25, input.ageYears));
  }
  const map = { '<1': 0.5, '1-2': 1.5, '3-5': 4, '5+': 7 };
  return map[input.ageBracket] ?? 2.5;
}

function mapConditionToGrade(condition, working) {
  if (working === 'no' && condition === 'poor') return 'BER';
  if (condition === 'like_new' && working === 'working') return 'A';
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
    const modelHint = MODEL_RESALE_HINTS.find(h => h.match.test(modelName) || h.match.test(noteText));
    const faultType = rawInput.faultType || modelHint?.fault || catCfg.fault_type;

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
      hazard_type: safety.hazard_type,
      allow_diy_guide: severeHazard ? false : safety.allow_diy_guide,
      blocked_paths: blockedPaths,
      force_recycle: severeHazard,
      headline: severeHazard
        ? 'Safety hazard — do not repair, sell, or place in regular bins'
        : effectiveSafetyLevel === SAFETY_LEVELS.DO_NOT_ATTEMPT
          ? 'High-voltage hazard — do not open or DIY at home'
          : null,
      precautions: safety.required_precautions || []
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

    // --- Stage 2: Sourced Value & Cost Ranges ---
    const benchmark = context.benchmark || null;
    const repairBand = modelHint?.repair_band || catCfg.repair_band_inr;
    const repairLo = benchmark ? Number(benchmark.p25_price) : repairBand[0];
    const repairMid = benchmark ? Number(benchmark.p50_median_price) : repairBand[1];
    const repairHi = benchmark ? Number(benchmark.p75_price) : repairBand[2];
    const userQuotedCost = rawInput.quotedRepairCost != null && rawInput.quotedRepairCost !== ''
      ? Number(rawInput.quotedRepairCost)
      : null;
    const effectiveRepairMid = userQuotedCost != null && userQuotedCost >= 0 ? userQuotedCost : repairMid;

    const baseOriginal = rawInput.originalPrice && Number(rawInput.originalPrice) > 0
      ? Number(rawInput.originalPrice)
      : (modelHint?.original_inr || catCfg.default_price_inr);

    const conditionFactor = { like_new: 1.08, good: 0.94, fair: 0.76, poor: 0.48 }[condition];
    const workingAsIsFactor = working === 'yes' ? 0.92 : working === 'partly' ? 0.56 : 0.22;

    let workingMedian;
    if (benchmark?.provenance?.resale_working_inr) {
      workingMedian = Math.round(benchmark.provenance.resale_working_inr * (condition === 'like_new' ? 1.05 : condition === 'poor' ? 0.75 : 0.95));
    } else if (modelHint?.resale_working_inr && (!rawInput.originalPrice || Number(rawInput.originalPrice) === modelHint.original_inr)) {
      workingMedian = Math.round(modelHint.resale_working_inr * clamp(Math.pow(0.88, Math.max(0, ageYears - 1)), 0.4, 1.05) * conditionFactor);
    } else {
      workingMedian = Math.max(250, round50(baseOriginal * Math.pow(1 - catCfg.annual_decay, ageYears) * conditionFactor));
    }

    const workingLo = Math.max(200, round50(workingMedian * 0.85));
    const workingHi = Math.max(workingLo + 100, round50(workingMedian * 1.15));

    const asIsMedian = working === 'yes'
      ? workingMedian
      : Math.max(100, round50(workingMedian * workingAsIsFactor));
    const asIsLo = Math.max(50, round50(asIsMedian * 0.8));
    const asIsHi = Math.max(asIsLo + 50, round50(asIsMedian * 1.15));

    const repairCeilingInr = Math.round(workingMedian * REPAIR_THRESHOLD_RATIO);
    const repairCostLo = working === 'yes' && !rawInput.faultType && !userQuotedCost ? 0 : repairLo;
    const repairCostHi = working === 'yes' && !rawInput.faultType && !userQuotedCost ? repairLo : repairHi;
    const repairNetLo = Math.round(workingLo - (userQuotedCost ?? repairCostHi));
    const repairNetHi = Math.round(workingHi - (userQuotedCost ?? repairCostLo));
    const repairNetMedian = Math.round((repairNetLo + repairNetHi) / 2);

    const conditionGrade = mapConditionToGrade(condition, working);
    const ror = RepairOrReleaseEngine.evaluate({
      category,
      modelName,
      functionalResaleValue: workingMedian,
      estimatedRepairCost: working === 'yes' && !userQuotedCost && !rawInput.faultType ? 0 : effectiveRepairMid,
      asIsScrapValue: isEwasteItem ? 0 : Math.round(catCfg.weight_kg * (category === 'apparel' ? 18 : 50)),
      deviceAgeMonths: Math.round(ageYears * 12),
      safetyLevel: safety.safety_level
    });

    const channelComparison = ChannelComparisonEngine.compareChannels({
      category,
      modelName,
      functionalMarketValue: working === 'yes' ? workingMedian : asIsMedian,
      estimatedRepairCost: 0,
      weightKg: catCfg.weight_kg,
      conditionGrade
    });

    const bestSellChannel = channelComparison.channels.find(c => c.channel_id !== 'authorized_ewaste_recycler' && c.channel_id !== 'kabadiwala_scrap')
      || channelComparison.channels[0];

    const provenance = {
      is_estimate: benchmark?.provenance ? Boolean(benchmark.provenance.is_estimate) : true,
      is_sample: Boolean(rawInput.isSample),
      source: benchmark?.provenance?.source || modelHint?.source || catCfg.source,
      source_url: benchmark?.provenance?.source_url || null,
      resale_source: benchmark?.provenance?.resale_source || modelHint?.source || 'Age-depreciated resale baseline',
      resale_source_url: benchmark?.provenance?.resale_source_url || null,
      as_of: benchmark?.provenance?.as_of || modelHint?.as_of || catCfg.as_of,
      nagpur_quotes_count: benchmark?.sample_count ?? 0
    };

    const scrapRange = isEwasteItem
      ? [0, 0]
      : [Math.max(20, round50(catCfg.weight_kg * 15)), Math.max(50, round50(catCfg.weight_kg * 50))];

    const reuseValueRange = [round50(baseOriginal * 0.12), round50(baseOriginal * 0.25)];

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
        cost_range_inr: [userQuotedCost ?? repairCostLo, userQuotedCost ?? repairCostHi],
        net_value_range_inr: [repairNetLo, repairNetHi],
        net_value_median_inr: repairNetMedian,
        effort_level: safety.safety_level === SAFETY_LEVELS.BEGINNER_SAFE ? 'low' : 'medium',
        turnaround_days: [1, 3],
        co2_saved_kg: catCfg.co2_kg,
        economically_viable: ror.is_repair_economically_viable,
        basis: `Repair quote (~₹${effectiveRepairMid}) vs 60% threshold (₹${repairCeilingInr} of ₹${workingMedian} working value). Source: ${provenance.source} (${provenance.as_of}).`
      },
      sell: {
        path: 'sell',
        label: working === 'yes' ? 'Sell Working Item' : 'Sell As-Is (Disclosing Faults)',
        eligible: !blockedPaths.includes('sell') && asIsMedian >= 250,
        ineligible_reason: blockedPaths.includes('sell')
          ? 'Blocked due to active safety hazard.'
          : asIsMedian < 250
            ? 'Residual resale value is too low (< ₹250) for buyer pickup/listing.'
            : null,
        cost_range_inr: [0, 150],
        net_value_range_inr: [asIsLo, asIsHi],
        net_value_median_inr: bestSellChannel ? Math.max(asIsMedian, bestSellChannel.net_yield_inr) : asIsMedian,
        effort_level: 'medium',
        turnaround_days: [2, 10],
        co2_saved_kg: Math.round(catCfg.co2_kg * 0.85),
        recommended_channel: bestSellChannel?.channel_name || 'Peer-to-Peer Resale',
        basis: `Estimated ${working === 'yes' ? 'working' : 'as-is'} resale range ₹${asIsLo}–₹${asIsHi} via ${bestSellChannel?.channel_name || 'P2P / Buy-Back'}.`
      },
      donate: {
        path: 'donate',
        label: 'Donate to Local Nagpur NGO',
        eligible: donateEligible,
        ineligible_reason: donationDisqualifiers[0] || null,
        cost_range_inr: [0, 0],
        net_value_range_inr: [0, 0],
        net_value_median_inr: 0,
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
        cost_range_inr: [0, 150],
        net_value_range_inr: reuseValueRange,
        net_value_median_inr: Math.round((reuseValueRange[0] + reuseValueRange[1]) / 2),
        effort_level: category === 'furniture' ? 'high' : 'medium',
        turnaround_days: [1, 2],
        co2_saved_kg: Math.round(catCfg.co2_kg * 0.95),
        basis: `Zero-logistics home repurposing saves an estimated ₹${reuseValueRange[0]}–₹${reuseValueRange[1]} on buying a replacement.`
      },
      recycle: {
        path: 'recycle',
        label: isEwasteItem ? 'Authorised E-Waste Drop-Off (CPCB)' : 'Material & Scrap Recovery',
        eligible: true,
        ineligible_reason: null,
        authorised_only: isEwasteItem,
        regulatory_basis: isEwasteItem ? 'E-Waste (Management) Rules, 2022' : null,
        cost_range_inr: [0, 0],
        net_value_range_inr: scrapRange,
        net_value_median_inr: Math.round((scrapRange[0] + scrapRange[1]) / 2),
        effort_level: 'low',
        turnaround_days: [1, 3],
        co2_saved_kg: Math.round(catCfg.co2_kg * 0.45),
        basis: isEwasteItem
          ? 'Route strictly to a CPCB/MPCB authorised e-waste collection point or brand drop-box (E-Waste Management Rules, 2022).'
          : 'Safe material/scrap recovery when repair, resale, or donation are not viable.'
      }
    };

    // --- Stage 3: Priority Weights & Scoring ---
    const weights = {
      balanced: { value: 0.35, effort: 0.20, speed: 0.15, eco: 0.30 },
      max_cash: { value: 0.65, effort: 0.10, speed: 0.10, eco: 0.15 },
      lowest_effort: { value: 0.20, effort: 0.45, speed: 0.25, eco: 0.10 },
      fastest: { value: 0.20, effort: 0.25, speed: 0.45, eco: 0.10 },
      eco_social: { value: 0.15, effort: 0.15, speed: 0.10, eco: 0.60 }
    }[priority];

    const effortScoreMap = { low: 90, medium: 60, high: 30 };
    const maxCash = Math.max(500, workingMedian, repairNetMedian, asIsMedian);

    const scorePath = (p) => {
      if (severeHazard) {
        return p.path === 'recycle' ? 99 : 5;
      }
      if (!p.eligible) return 10;

      const valueNorm = clamp((Math.max(0, p.net_value_median_inr) / maxCash) * 100, 0, 100);
      const effortNorm = effortScoreMap[p.effort_level] ?? 60;
      const avgDays = (p.turnaround_days[0] + p.turnaround_days[1]) / 2;
      const speedNorm = clamp(100 - avgDays * 7, 20, 95);
      const ecoNorm = clamp((p.co2_saved_kg / 35) * 100, 30, 95);

      let raw = valueNorm * weights.value + effortNorm * weights.effort + speedNorm * weights.speed + ecoNorm * weights.eco;

      // Domain suitability adjustments
      if (p.path === 'repair') {
        if (ror.is_repair_economically_viable && effectiveRepairMid <= repairCeilingInr) raw += 26;
        else raw -= 25;
      }
      if (p.path === 'sell') {
        if (working === 'yes' && priority !== 'eco_social') raw += 18;
        if (!ror.is_repair_economically_viable && asIsMedian >= 500) raw += 14;
      }
      if (p.path === 'donate') {
        if (category === 'apparel' && working !== 'no' && condition !== 'poor') raw += 24;
        if (working === 'yes' && asIsMedian < 1200) raw += 15;
        if (priority === 'eco_social') raw += 24;
      }
      if (p.path === 'reuse') {
        if (category === 'apparel' || category === 'furniture') raw += 10;
        if (working === 'no' && !isEwasteItem) raw += 12;
        if (priority === 'eco_social') raw += 8;
      }
      if (p.path === 'recycle') {
        if (working === 'no' && !ror.is_repair_economically_viable && asIsMedian < 400) raw += 30;
        else raw -= 15;
      }

      return clamp(Math.round(raw), 12, 97);
    };

    const rankedPaths = Object.values(pathDefinitions)
      .map(p => ({ ...p, score: scorePath(p) }))
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
      if (recommendedPath.path === 'repair') {
        whatWouldChangeThis.push(`If a shop quotes above ₹${repairCeilingInr.toLocaleString('en-IN')} (60% of ₹${workingMedian.toLocaleString('en-IN')} working resale), switching to Sell as-is or Recycle avoids over-investing.`);
      } else if (working !== 'yes') {
        whatWouldChangeThis.push(`If you find a repair quote at or below ₹${Math.min(repairCeilingInr, effectiveRepairMid).toLocaleString('en-IN')} with warranty, Repair preserves ₹${workingMedian.toLocaleString('en-IN')} of working value.`);
      }
      if (donateEligible && recommendedPath.path !== 'donate') {
        whatWouldChangeThis.push('Selecting "Eco & Social Impact" priority or skipping buyer coordination shifts this directly to Donate.');
      } else if (!donateEligible) {
        whatWouldChangeThis.push('NGOs only take working, clean items at intake — restoring function or cleaning would unlock Donate.');
      }
      if (isEwasteItem) {
        whatWouldChangeThis.push('Any sign of battery swelling, smoke, or liquid damage immediately triggers a safety override to CPCB-authorised e-waste recycling.');
      } else {
        whatWouldChangeThis.push(`If resale offers drop below ₹${Math.max(250, scrapRange[1]).toLocaleString('en-IN')}, Reuse or Material Recovery becomes the sensible fallback.`);
      }
    }

    const fairPriceShield = userQuotedCost != null
      ? {
          quoted_amount: userQuotedCost,
          band_low: repairLo,
          band_median: repairMid,
          band_high: repairHi,
          verdict: userQuotedCost <= repairHi ? 'Fair' : userQuotedCost <= repairHi + 1.5 * (repairHi - repairLo) ? 'High' : 'Very High',
          rating_code: userQuotedCost <= repairMid ? 'GREEN' : userQuotedCost <= repairHi ? 'LIGHT_GREEN' : userQuotedCost <= repairHi + 1.5 * (repairHi - repairLo) ? 'AMBER' : 'RED',
          nagpur_quotes_count: provenance.nagpur_quotes_count
        }
      : {
          quoted_amount: null,
          band_low: repairLo,
          band_median: repairMid,
          band_high: repairHi,
          verdict: null,
          rating_code: null,
          nagpur_quotes_count: provenance.nagpur_quotes_count
        };

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
        working_resale_range_inr: [workingLo, workingHi],
        working_resale_median_inr: workingMedian,
        as_is_resale_range_inr: [asIsLo, asIsHi],
        repair_ceiling_60pct_inr: repairCeilingInr,
        server_valuation_inr: working === 'yes' ? workingMedian : asIsMedian
      },
      recommended_path: recommendedPath,
      alternatives,
      ranked_paths: rankedPaths,
      what_would_change_this: whatWouldChangeThis.slice(0, 3),
      safety_override: safetyOverride,
      regulatory_rule: regulatoryRule,
      fair_price_shield: fairPriceShield,
      repair_or_release: ror,
      channel_comparison: channelComparison,
      provenance
    };
  }

  /**
   * Runs evaluation with live DB benchmarks & partner lookup, then persists item + decision.
   */
  static async decideAndPersist(input, { userId, latitude = NAGPUR_GEO_ANCHOR.latitude, longitude = NAGPUR_GEO_ANCHOR.longitude } = {}) {
    const modelName = (input.modelName || input.itemName || `${input.brand || ''} ${input.subCategory || input.category || ''}`).trim();
    const benchmark = modelName
      ? await db.findBenchmark('nagpur', modelName, input.faultType || 'Battery Replacement', 'aftermarket')
        || await db.findBenchmark('nagpur', modelName, 'Screen Replacement', 'aftermarket')
        || await db.findBenchmark('nagpur', modelName, 'Motor Capacitor / Bearing', 'aftermarket')
        || await db.findBenchmark('nagpur', modelName, 'Zip & Lining Repair', 'aftermarket')
        || await db.findBenchmark('nagpur', modelName, 'Joint Re-gluing', 'aftermarket')
      : null;

    let fpsData = null;
    if (input.quotedRepairCost != null && input.quotedRepairCost !== '' && modelName) {
      fpsData = await FairPriceShieldEngine.evaluateQuote({
        cityId: 'nagpur',
        modelName,
        faultType: input.faultType || benchmark?.fault_type || CATEGORY_DEFAULTS[input.category]?.fault_type || 'General Repair',
        quotedAmount: Number(input.quotedRepairCost)
      });
    }

    const decisionCore = this.evaluate(input, { benchmark });
    if (fpsData) {
      decisionCore.fair_price_shield = {
        ...decisionCore.fair_price_shield,
        verdict: fpsData.verdict,
        rating_code: fpsData.rating_code,
        advisory_message: fpsData.advisory_message,
        delta_from_median: fpsData.delta_from_median
      };
    }

    const [repairShops, ngos, recyclers] = await Promise.all([
      HyperlocalMatcherService.findOptimalMatches({ latitude, longitude, category: decisionCore.item_summary.category, targetTrack: 'repair' }),
      HyperlocalMatcherService.findOptimalMatches({ latitude, longitude, category: decisionCore.item_summary.category, targetTrack: 'ngo_donation' }),
      HyperlocalMatcherService.findOptimalMatches({ latitude, longitude, category: decisionCore.item_summary.category, targetTrack: 'formal_recycle' })
    ]);

    const decisionId = crypto.randomUUID();
    const itemRecord = input.itemId && (await db.getItem(input.itemId))
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
          id: input.itemId || undefined,
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

    const fullDecision = await db.saveDecision({
      decision_id: decisionId,
      item_id: itemRecord.id,
      user_id: userId,
      ...decisionCore,
      nearby_partners: {
        repair_shops: repairShops.partners.slice(0, 3),
        ngos: ngos.partners.slice(0, 4),
        authorised_recyclers: recyclers.partners.slice(0, 3)
      }
    });

    return fullDecision;
  }
}
