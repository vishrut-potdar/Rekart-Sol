import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/connection.js';

export class RewardsService {
  /**
   * Awards circular economy points to a user for eco-actions
   */
  static async awardPoints({ userId, actionType, referenceId, pointsAwarded = null }) {
    const pointValues = {
      ngo_donation_apparel: 100,
      ngo_donation_books: 120,
      formal_recycle_electronics: 250,
      society_drive_dropoff: 75,
      self_repair_completed: 150
    };

    const points = pointsAwarded || pointValues[actionType] || 50;

    const transaction = {
      id: uuidv4(),
      user_id: userId,
      type: 'earned',
      action_type: actionType,
      reference_id: referenceId,
      points,
      timestamp: new Date().toISOString()
    };

    const user = await db.findUserById(userId);
    let currentBalance = user?.metadata?.circular_points || 0;
    const newBalance = currentBalance + points;

    if (user) {
      await db.updateItem(userId, {
        metadata: {
          ...user.metadata,
          circular_points: newBalance
        }
      });
    }

    return {
      transaction_id: transaction.id,
      user_id: userId,
      points_earned: points,
      action_type: actionType,
      new_points_balance: newBalance,
      reward_notification: `🎉 You earned ${points} Circular Points for your ${actionType.replace(/_/g, ' ')}!`
    };
  }

  /**
   * Redeems points for partner repair discounts or marketplace vouchers
   */
  static async redeemPoints({ userId, pointsToRedeem, partnerId = 'p-rep-001' }) {
    if (pointsToRedeem < 200) {
      throw new Error('Minimum redemption threshold is 200 circular points.');
    }

    // Conversion rate: 2 points = ₹1 INR discount
    const discountAmountInr = Math.floor(pointsToRedeem / 2);
    const voucherCode = `REKART-SAVE-${Date.now().toString().substring(7)}-${pointsToRedeem}`;

    return {
      voucher_code: voucherCode,
      points_redeemed: pointsToRedeem,
      discount_amount_inr: discountAmountInr,
      applicable_partner_id: partnerId,
      validity_days: 90,
      redemption_terms: `Show this voucher code at Sitabuldi ProTech or participating Nagpur partner shops to deduct ₹${discountAmountInr} from your repair invoice.`
    };
  }
}
