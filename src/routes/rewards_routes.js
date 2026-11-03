import express from 'express';
import { RewardsService } from '../services/rewards/rewards_service.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// 1. Award Circular Points
router.post('/award', optionalAuth, async (req, res, next) => {
  try {
    const { userId, actionType, referenceId, pointsAwarded } = req.body;
    const resolvedUserId = req.user?.userId || userId || 'user_guest';

    if (!actionType) {
      return res.status(400).json({ error: 'actionType is required' });
    }

    const result = await RewardsService.awardPoints({
      userId: resolvedUserId,
      actionType,
      referenceId,
      pointsAwarded
    });

    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 2. Redeem Points for Repair Discounts
router.post('/redeem', optionalAuth, async (req, res, next) => {
  try {
    const { userId, pointsToRedeem, partnerId = 'p-rep-001' } = req.body;
    const resolvedUserId = req.user?.userId || userId || 'user_guest';

    if (!pointsToRedeem) {
      return res.status(400).json({ error: 'pointsToRedeem is required' });
    }

    const voucher = await RewardsService.redeemPoints({
      userId: resolvedUserId,
      pointsToRedeem: Number(pointsToRedeem),
      partnerId
    });

    return res.status(200).json({ success: true, data: voucher });
  } catch (err) {
    next(err);
  }
});

export default router;
