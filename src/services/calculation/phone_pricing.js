import { electronicsSubtype } from '../../../public/assets/device-type.js';
import { REPAIR_THRESHOLD_RATIO } from '../../config/constants.js';

const grades = { like_new: 1, good: 0.963, fair: 0.928, poor: 0.882 };
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const daysSince = (date, now) => (now - Date.parse(date)) / 86400000;
const recent = (date, now) => daysSince(date, now) >= 0 && daysSince(date, now) <= 90;
const rupees = value => Number.isFinite(value) && value > 0;
const approved = row => row && typeof row.source === 'string' && row.source.trim()
  && typeof row.permissionReference === 'string' && row.permissionReference.trim();
const cleanModel = model => String(model || '').replace(/\b\d{2,4}\s*gb\b/gi, '').trim();

function matches(row, input, phone) {
  const entered = normalize(phone ? cleanModel(input.modelName) : input.modelName);
  const model = normalize(row.model);
  const brand = normalize(row.brand);
  return (model === entered || (!model.startsWith(brand) && brand + model === entered))
    && (!input.brand || normalize(row.brand) === normalize(input.brand));
}

export function isPhone(input) {
  return input.category === 'electronics' && electronicsSubtype(input) === 'smartphone';
}

function percentile(sorted, fraction) {
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}

function latestDate(rows) {
  return rows.map(row => row.asOf).sort().at(-1);
}

export function calculatePhonePricing(input, data = {}, now = Date.now(), { phone = true } = {}) {
  const condition = Object.hasOwn(grades, input.condition) ? input.condition : 'good';
  const requestedStorage = input.storageGb ?? Number(String(input.modelName).match(/\b(\d{2,4})\s*gb\b/i)?.[1]);
  const storageMatches = row => !phone || !requestedStorage || row.storageGb === requestedStorage;
  const comparable = row => matches(row, input, phone) && (phone
    ? !row.category || row.category === 'electronics'
    : row.category === input.category && !row.storageGb);
  const safe = !input.isHazard;
  const working = ['yes', 'working'].includes(input.working);
  const faults = new Set(input.faultType ? [normalize(input.faultType)] : []);
  if (input.batteryNeedsService || (input.batteryHealthPercent != null && input.batteryHealthPercent < 80)) faults.add('batteryreplacement');
  const needsRepair = !working || faults.size > 0;
  const retailRows = (phone ? data.retail || [] : []).filter(row => approved(row) && /^https:\/\//i.test(row.sourceUrl || '') && comparable(row)
    && rupees(row.superbInr) && rupees(row.storageGb) && daysSince(row.asOf, now) >= 0);
  const orderedRetail = retailRows.sort((a, b) => b.asOf.localeCompare(a.asOf) || a.storageGb - b.storageGb || a.superbInr - b.superbInr);
  const retail = (requestedStorage ? orderedRetail.find(storageMatches) : null)
    || orderedRetail.find(row => row.baseVariant === true) || (!requestedStorage ? orderedRetail[0] : null);
  const gradePrice = grade => rupees(retail.gradePrices?.[grade])
    ? Math.round(retail.gradePrices[grade]) : Math.round(retail.superbInr * grades[grade]);
  const fullRetail = retail ? gradePrice(condition) : null;
  const lowerGrade = { like_new: 'good', good: 'fair', fair: 'poor', poor: 'poor' }[condition];

  const eligibleQuotes = (data.sell || []).filter(row => approved(row) && comparable(row)
    && storageMatches(row) && row.condition === condition && row.fullyWorking === true
    && ['nagpur_shop', 'direct_buyer'].includes(row.sourceType) && recent(row.asOf, now)
    && rupees(row.amountInr) && (!phone || rupees(row.storageGb)) && !/cashify/i.test(row.source));
  // Keep quotes from one storage variant and count each quote source once.
  const storage = requestedStorage || retail?.storageGb
    || (new Set(eligibleQuotes.map(row => row.storageGb)).size === 1 ? eligibleQuotes[0]?.storageGb : null);
  const latestQuotes = eligibleQuotes.filter(row => !phone || row.storageGb === storage)
    .sort((a, b) => b.asOf.localeCompare(a.asOf) || a.amountInr - b.amountInr);
  const quotes = [...new Map(latestQuotes.reverse().map(row => [normalize(row.source), row])).values()]
    .sort((a, b) => a.amountInr - b.amountInr);
  let clean = [];
  if (quotes.length >= 5) {
    const values = quotes.map(row => row.amountInr);
    const p25 = percentile(values, 0.25);
    const p75 = percentile(values, 0.75);
    const fence = 1.5 * (p75 - p25);
    clean = quotes.filter(row => row.amountInr >= p25 - fence && row.amountInr <= p75 + fence);
  }
  const sellValues = clean.length >= 5 ? clean.map(row => row.amountInr) : null;
  const sellRange = sellValues ? [Math.round(percentile(sellValues, 0.25)), Math.round(percentile(sellValues, 0.75))] : null;

  const repairRows = [...faults].map(fault => (data.repair || []).filter(row => approved(row)
    && comparable(row) && normalize(row.fault) === fault && rupees(row.amountInr)
    && recent(row.asOf, now) && row.allIn === true && ['official_service', 'nagpur_shop'].includes(row.sourceType))
    .sort((a, b) => Number(b.sourceType === 'nagpur_shop') - Number(a.sourceType === 'nagpur_shop')
      || b.asOf.localeCompare(a.asOf) || a.amountInr - b.amountInr)[0]);
  const explicitQuote = rupees(input.quotedRepairCost) ? input.quotedRepairCost : null;
  const repairCost = explicitQuote ?? (repairRows.length && repairRows.every(Boolean)
    ? repairRows.reduce((sum, row) => sum + row.amountInr, 0) : null);
  const ceilingLow = sellRange ? sellRange[0] * REPAIR_THRESHOLD_RATIO : null;
  const ceilingHigh = sellRange ? sellRange[1] * REPAIR_THRESHOLD_RATIO : (
    retail && recent(retail.asOf, now) && storageMatches(retail) ? fullRetail * REPAIR_THRESHOLD_RATIO : null);
  let verdict = 'borderline';
  if (!safe) verdict = 'release';
  else if (!needsRepair) verdict = 'not_needed';
  else if (repairCost != null && ceilingHigh != null && repairCost >= ceilingHigh) verdict = 'release';
  else if (repairCost != null && ceilingLow != null && repairCost < ceilingLow) verdict = 'repair';

  return {
    verdict,
    retail: safe && retail ? {
      range_inr: [Math.min(fullRetail, gradePrice(lowerGrade)), fullRetail],
      source: retail.source, source_url: /^https:\/\//i.test(retail.sourceUrl || '') ? retail.sourceUrl : null,
      as_of: retail.asOf, stale: !recent(retail.asOf, now), storage_gb: retail.storageGb,
      base_variant_only: !storageMatches(retail)
    } : null,
    sell: safe && sellRange ? {
      range_inr: sellRange, median_inr: Math.round(percentile(sellValues, 0.5)), source: 'user_reported', as_of: latestDate(clean), expires_at: new Date(Math.min(...clean.map(row => Date.parse(row.asOf))) + 90 * 86400000).toISOString(),
      storage_gb: phone ? storage : null, quote_count: clean.length
    } : null,
    repair_cost_inr: safe ? repairCost : null,
    repair_source: !safe || repairCost == null ? null : explicitQuote != null
      ? 'Your repair quote' : repairRows.map(row => row.source).join(', '),
    repair_as_of: !safe || explicitQuote != null || repairCost == null ? null : latestDate(repairRows),
    estimated_after_repair_deduction_inr: safe && needsRepair && working && fullRetail != null && repairCost != null
      ? Math.max(0, fullRetail - repairCost) : null,
    ceiling_low_inr: safe ? ceilingLow : null,
    ceiling_high_inr: safe ? ceilingHigh : null
  };
}

export function readPhonePricingData(raw) {
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || ['retail', 'sell', 'repair'].some(key => parsed[key] != null
      && (!Array.isArray(parsed[key]) || parsed[key].some(row => !row || typeof row !== 'object')))) {
    throw new Error('PHONE_PRICING_DATA_JSON must contain retail, sell or repair arrays');
  }
  return parsed;
}
