import express from 'express';
import { z } from 'zod';
import { RewardsService } from '../services/rewards/rewards_service.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requireV2Module } from '../middleware/feature_flag.js';
import { db } from '../db/connection.js';

const router = express.Router();

const AwardSchema = z.object({
  actionType: z.enum([
    'ngo_donation_apparel',
    'ngo_donation_books',
    'formal_recycle_electronics',
    'society_drive_dropoff',
    'self_repair_completed'
  ]),
  referenceId: z.string().min(1).max(128)
});

const RedeemSchema = z.object({
  pointsToRedeem: z.coerce.number().int().min(200).max(100000),
  partnerId: z.string().min(1).max(128).optional().default('p-rep-001')
});

const VerifyVoucherSchema = z.object({
  voucherCode: z.string().min(6).max(64),
  redeem: z.boolean().optional().default(false)
});

// Gate non-v1 rewards routes behind ENABLE_V2_MODULES
router.use(requireV2Module('rewards'));

// 1. Award Circular Points (authenticated; userId from token only, never body)
router.post('/award', authenticateToken, validate({ body: AwardSchema }), async (req, res, next) => {
  try {
    const { actionType, referenceId } = req.body;
    const result = await RewardsService.awardPoints({
      userId: req.user.userId,
      actionType,
      referenceId
    });

    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 1b. Current points balance & ledger
router.get('/balance', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    return res.status(200).json({
      success: true,
      data: {
        user_id: userId,
        points_balance: await db.getPoints(userId),
        ledger: await db.getPointLedger(userId)
      }
    });
  } catch (err) {
    next(err);
  }
});

// 2. Redeem Points for Stored Repair Discount Voucher
router.post('/redeem', authenticateToken, validate({ body: RedeemSchema }), async (req, res, next) => {
  try {
    const { pointsToRedeem, partnerId } = req.body;
    const voucher = await RewardsService.redeemPoints({
      userId: req.user.userId,
      pointsToRedeem,
      partnerId
    });

    return res.status(200).json({ success: true, data: voucher });
  } catch (err) {
    next(err);
  }
});

// 3. Partner / Staff Voucher Verification & Redemption
router.post('/verify-voucher', authenticateToken, requireRole('partner_technician', 'ngo_coordinator'), validate({ body: VerifyVoucherSchema }), async (req, res, next) => {
  try {
    const partnerId = req.user.role === 'admin' ? null : req.user.partnerId;
    const voucher = await RewardsService.verifyAndUseVoucher({
      voucherCode: req.body.voucherCode,
      partnerId,
      redeem: req.body.redeem
    });
    return res.status(200).json({ success: true, data: voucher });
  } catch (err) {
    next(err);
  }
});

export default router;
