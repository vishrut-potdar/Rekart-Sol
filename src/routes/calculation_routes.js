import express from 'express';
import { z } from 'zod';
import { FairPriceShieldEngine } from '../services/calculation/fair_price_shield.js';
import { RepairOrReleaseEngine } from '../services/calculation/repair_or_release.js';
import { ChannelComparisonEngine } from '../services/calculation/channel_comparison.js';
import { SafetyScorerEngine } from '../services/calculation/safety_scorer.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

const FairPriceSchema = z.object({
  cityId: z.string().max(64).optional().default('nagpur'),
  modelName: z.string().min(1).max(160),
  faultType: z.string().min(1).max(120),
  partGrade: z.enum(['OEM', 'aftermarket', 'reconditioned']).optional().default('aftermarket'),
  quotedAmount: z.coerce.number().min(0).max(500000)
});

const RepairOrReleaseSchema = z.object({
  category: z.enum(['electronics', 'apparel', 'appliance', 'furniture', 'other']).optional().default('electronics'),
  modelName: z.string().max(160).optional().default('Device'),
  functionalResaleValue: z.coerce.number().min(0).max(2000000),
  estimatedRepairCost: z.coerce.number().min(0).max(500000),
  asIsScrapValue: z.coerce.number().min(0).max(100000).optional().default(0),
  brandExchangeValue: z.coerce.number().min(0).max(500000).optional().default(0),
  deviceAgeMonths: z.coerce.number().min(0).max(600).optional().default(24),
  safetyLevel: z.enum(['BEGINNER_SAFE', 'NEEDS_SPECIALIZED_TOOLS', 'DO_NOT_ATTEMPT']).optional().default('BEGINNER_SAFE')
});

const ChannelCompareSchema = z.object({
  category: z.enum(['electronics', 'apparel', 'appliance', 'furniture', 'other']).optional().default('electronics'),
  modelName: z.string().max(160).optional().default('Device'),
  functionalMarketValue: z.coerce.number().min(0).max(2000000),
  estimatedRepairCost: z.coerce.number().min(0).max(500000).optional().default(0),
  weightKg: z.coerce.number().positive().max(500).optional().default(0.25),
  conditionGrade: z.enum(['A', 'B', 'C', 'BER']).optional().default('B')
});

const SafetyScoreSchema = z.object({
  category: z.string().max(64).optional().default('electronics'),
  faultType: z.string().max(150).optional().default(''),
  symptoms: z.array(z.string().max(120)).max(20).optional().default([]),
  isSwollenBattery: z.boolean().optional().default(false),
  applianceType: z.string().max(80).optional().default('')
});

// 1. Fair Price Shield
router.post('/fair-price-shield', validate({ body: FairPriceSchema }), async (req, res, next) => {
  try {
    const evaluation = await FairPriceShieldEngine.evaluateQuote(req.body);
    return res.status(200).json({ success: true, data: evaluation });
  } catch (err) {
    next(err);
  }
});

// 2. Repair-or-Release Decision Matrix (60% threshold)
router.post('/repair-or-release', validate({ body: RepairOrReleaseSchema }), (req, res) => {
  const result = RepairOrReleaseEngine.evaluate(req.body);
  return res.status(200).json({ success: true, data: result });
});

// 3. Channel Comparison Engine
router.post('/channel-comparison', validate({ body: ChannelCompareSchema }), (req, res) => {
  const channels = ChannelComparisonEngine.compareChannels(req.body);
  return res.status(200).json({ success: true, data: channels });
});

// 4. Safety & Feasibility Scorer
router.post('/safety-score', validate({ body: SafetyScoreSchema }), (req, res) => {
  const safety = SafetyScorerEngine.evaluateRisk(req.body);
  return res.status(200).json({ success: true, data: safety });
});

export default router;
