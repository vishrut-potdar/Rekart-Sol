import express from 'express';
import { FairPriceShieldEngine } from '../services/calculation/fair_price_shield.js';
import { RepairOrReleaseEngine } from '../services/calculation/repair_or_release.js';
import { ChannelComparisonEngine } from '../services/calculation/channel_comparison.js';
import { SafetyScorerEngine } from '../services/calculation/safety_scorer.js';

const router = express.Router();

// 1. Fair Price Shield
router.post('/fair-price-shield', async (req, res, next) => {
  try {
    const {
      cityId = 'nagpur',
      modelName,
      faultType,
      partGrade = 'aftermarket',
      quotedAmount
    } = req.body;

    if (!modelName || !faultType || quotedAmount === undefined) {
      return res.status(400).json({ error: 'modelName, faultType, and quotedAmount are required' });
    }

    const evaluation = await FairPriceShieldEngine.evaluateQuote({
      cityId,
      modelName,
      faultType,
      partGrade,
      quotedAmount
    });

    return res.status(200).json({ success: true, data: evaluation });
  } catch (err) {
    next(err);
  }
});

// 2. Repair-or-Release Decision Matrix (60% threshold)
router.post('/repair-or-release', (req, res) => {
  const {
    category = 'electronics',
    modelName = 'Device',
    functionalResaleValue,
    estimatedRepairCost,
    asIsScrapValue = 0,
    brandExchangeValue = 0,
    deviceAgeMonths = 24,
    safetyLevel = 'BEGINNER_SAFE'
  } = req.body;

  if (functionalResaleValue === undefined || estimatedRepairCost === undefined) {
    return res.status(400).json({ error: 'functionalResaleValue and estimatedRepairCost are required' });
  }

  const result = RepairOrReleaseEngine.evaluate({
    category,
    modelName,
    functionalResaleValue,
    estimatedRepairCost,
    asIsScrapValue,
    brandExchangeValue,
    deviceAgeMonths,
    safetyLevel
  });

  return res.status(200).json({ success: true, data: result });
});

// 3. Channel Comparison Engine
router.post('/channel-comparison', (req, res) => {
  const {
    category = 'electronics',
    modelName = 'Device',
    functionalMarketValue,
    estimatedRepairCost = 0,
    weightKg = 0.25,
    conditionGrade = 'B'
  } = req.body;

  if (functionalMarketValue === undefined) {
    return res.status(400).json({ error: 'functionalMarketValue is required' });
  }

  const channels = ChannelComparisonEngine.compareChannels({
    category,
    modelName,
    functionalMarketValue,
    estimatedRepairCost,
    weightKg,
    conditionGrade
  });

  return res.status(200).json({ success: true, data: channels });
});

// 4. Safety & Feasibility Scorer
router.post('/safety-score', (req, res) => {
  const {
    category = 'electronics',
    faultType = '',
    symptoms = [],
    isSwollenBattery = false,
    applianceType = ''
  } = req.body;

  const safety = SafetyScorerEngine.evaluateRisk({
    category,
    faultType,
    symptoms,
    isSwollenBattery,
    applianceType
  });

  return res.status(200).json({ success: true, data: safety });
});

export default router;
