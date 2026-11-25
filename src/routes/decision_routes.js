import express from 'express';
import { z } from 'zod';
import { currentSavedPricing, DecisionEngine } from '../services/decision/decision_engine.js';
import { optionalAuth, authenticateToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { db } from '../db/connection.js';
import { AppError } from '../utils/errors.js';

const router = express.Router();

const DecideBodySchema = z.object({
  itemId: z.string().max(128).optional(),
  category: z.enum(['electronics', 'apparel', 'appliance', 'furniture', 'other']),
  subCategory: z.string().max(100).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  modelName: z.string().min(1).max(160),
  ageYears: z.coerce.number().min(0).max(50).optional(),
  ageBracket: z.enum(['<1', '1-2', '3-5', '5+']).optional(),
  working: z.enum(['yes', 'partly', 'no', 'working', 'not_working']).default('partly'),
  condition: z.enum(['like_new', 'good', 'fair', 'poor']).default('good'),
  storageGb: z.number().int().positive().optional(),
  batteryNeedsService: z.boolean().optional(),
  batteryHealthPercent: z.number().min(0).max(100).optional(),
  faultType: z.string().max(120).optional().nullable(),
  symptoms: z.array(z.string().max(120)).max(20).optional(),
  note: z.string().max(500).optional().default(''),
  quotedRepairCost: z.number().min(0).max(500000).optional().nullable(),
  originalPrice: z.coerce.number().positive().max(2000000).optional().nullable(),
  priority: z.enum(['balanced', 'max_cash', 'lowest_effort', 'fastest', 'eco_social']).default('balanced'),
  isSwollenBattery: z.boolean().optional().default(false),
  applianceType: z.string().max(80).optional().default(''),
  imageUrl: z.string().max(500).optional().nullable(),
  isSample: z.boolean().optional().default(false),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional()
});

// POST /api/v1/decide — Core Decision Engine endpoint
router.post('/', optionalAuth, validate({ body: DecideBodySchema }), async (req, res, next) => {
  try {
    const userId = req.user?.userId || 'anon_session';
    const decision = await DecisionEngine.decideAndPersist(req.body, {
      userId,
      latitude: req.body.latitude,
      longitude: req.body.longitude
    });
    return res.status(200).json({ success: true, data: decision });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/decide — List current session/user's saved items & decisions
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const items = await db.listItemsByUser(req.user.userId);
    const decisions = (await db.listDecisionsByUser(req.user.userId)).map(decision => currentSavedPricing(decision));
    const valuations = new Map(decisions.map(decision => [decision.item_id, decision.item_summary.server_valuation_inr]));
    const safeItems = items.map(item => ({ ...item, server_valuation_inr: valuations.get(item.id) ?? null }));
    return res.status(200).json({
      success: true,
      data: { items: safeItems, decisions }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/decide/:itemId — Retrieve persisted decision with ownership check
router.get('/:itemId', authenticateToken, async (req, res, next) => {
  try {
    const decision = await db.getDecisionByItemId(req.params.itemId);
    if (!decision) {
      throw AppError.notFound('Decision not found');
    }
    if (decision.user_id && decision.user_id !== req.user.userId && req.user.role !== 'admin') {
      throw AppError.forbidden('You do not have permission to view this decision');
    }
    return res.status(200).json({ success: true, data: currentSavedPricing(decision) });
  } catch (err) {
    next(err);
  }
});

export default router;
