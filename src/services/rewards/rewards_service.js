import crypto from 'crypto';
import { db } from '../../db/connection.js';
import { AppError } from '../../utils/errors.js';

export const REWARD_ACTION_POINTS = Object.freeze({
  ngo_donation_apparel: 100,
  ngo_donation_books: 120,
  formal_recycle_electronics: 250,
  society_drive_dropoff: 75,
  self_repair_completed: 150
});

const DAILY_AWARD_CAP_POINTS = 1000;

export class RewardsService {
  /**
   * Awards circular economy points only for allowlisted server-verified action types,
   * enforcing per-reference deduplication and a daily earn cap.
   */
  static async awardPoints({ userId, actionType, referenceId }) {
    if (!userId) {
      throw AppError.unauthorized('Authentication required to earn rewards');
    }
    if (!actionType || !Object.prototype.hasOwnProperty.call(REWARD_ACTION_POINTS, actionType)) {
      throw AppError.badRequest('Invalid or unsupported reward actionType', 'INVALID_ACTION_TYPE');
    }
    if (!referenceId || typeof referenceId !== 'string') {
      throw AppError.badRequest('referenceId is required to prevent duplicate claims', 'MISSING_REFERENCE_ID');
    }

    const duplicate = await db.findPointAward(userId, actionType, referenceId);
    if (duplicate) {
      throw AppError.conflict('Points have already been awarded for this reference', 'DUPLICATE_REWARD_CLAIM');
    }

    const points = REWARD_ACTION_POINTS[actionType];
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const ledger = await db.getPointLedger(userId);
    const earnedToday = ledger
      .filter(e => e.type === 'earned' && String(e.timestamp).startsWith(todayPrefix))
      .reduce((sum, e) => sum + e.points, 0);

    if (earnedToday + points > DAILY_AWARD_CAP_POINTS) {
      throw AppError.tooManyRequests(`Daily circular points cap (${DAILY_AWARD_CAP_POINTS}) reached`, 'DAILY_REWARD_CAP');
    }

    const transaction = {
      id: crypto.randomUUID(),
      user_id: userId,
      type: 'earned',
      action_type: actionType,
      reference_id: referenceId,
      points,
      timestamp: new Date().toISOString()
    };

    await db.recordPointLedger(transaction);
    const newBalance = await db.addPoints(userId, points);

    return {
      transaction_id: transaction.id,
      user_id: userId,
      points_earned: points,
      action_type: actionType,
      reference_id: referenceId,
      new_points_balance: newBalance,
      reward_notification: `You earned ${points} Circular Points for ${actionType.replace(/_/g, ' ')}.`
    };
  }

  /**
   * Redeems points for a stored, unpredictable repair discount voucher.
   */
  static async redeemPoints({ userId, pointsToRedeem, partnerId = 'p-rep-001' }) {
    if (!userId) {
      throw AppError.unauthorized('Authentication required to redeem points');
    }
    const pts = Math.floor(Number(pointsToRedeem));
    if (!Number.isFinite(pts) || pts < 200) {
      throw AppError.badRequest('Minimum redemption threshold is 200 circular points.', 'MIN_REDEMPTION_THRESHOLD');
    }

    const balance = await db.getPoints(userId);
    if (pts > balance) {
      throw AppError.badRequest(`Not enough points: you have ${balance}, tried to redeem ${pts}.`, 'INSUFFICIENT_POINTS');
    }

    const newBalance = await db.addPoints(userId, -pts);
    await db.recordPointLedger({
      id: crypto.randomUUID(),
      user_id: userId,
      type: 'redeemed',
      action_type: 'voucher_redemption',
      reference_id: partnerId,
      points: -pts,
      timestamp: new Date().toISOString()
    });

    const discountAmountInr = Math.floor(pts / 2);
    const randomCode = crypto.randomBytes(6).toString('hex').toUpperCase();
    const voucherCode = `REKART-SAVE-${randomCode}`;
    const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();

    const voucher = await db.createVoucher({
      voucher_code: voucherCode,
      user_id: userId,
      partner_id: partnerId,
      points_redeemed: pts,
      discount_amount_inr: discountAmountInr,
      status: 'active',
      expires_at: expiresAt,
      created_at: new Date().toISOString()
    });

    return {
      voucher_code: voucher.voucher_code,
      points_redeemed: pts,
      new_points_balance: newBalance,
      discount_amount_inr: discountAmountInr,
      applicable_partner_id: partnerId,
      validity_days: 90,
      expires_at: expiresAt,
      status: voucher.status,
      redemption_terms: `Show this voucher code at participating Nagpur partner shops to deduct ₹${discountAmountInr} from your repair invoice.`
    };
  }

  static async verifyAndUseVoucher({ voucherCode, partnerId, redeem = false }) {
    const voucher = await db.getVoucher(voucherCode);
    if (!voucher) {
      throw AppError.notFound('Voucher code not found');
    }
    if (voucher.status !== 'active') {
      throw AppError.conflict(`Voucher is already ${voucher.status}`, 'VOUCHER_ALREADY_USED');
    }
    if (new Date(voucher.expires_at) <= new Date()) {
      throw AppError.badRequest('Voucher has expired', 'VOUCHER_EXPIRED');
    }
    if (partnerId && voucher.partner_id && voucher.partner_id !== partnerId) {
      throw AppError.forbidden('Voucher is scoped to a different partner');
    }

    if (redeem) {
      return await db.redeemVoucher(voucherCode, partnerId);
    }
    return voucher;
  }
}
