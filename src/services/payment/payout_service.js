import crypto from 'crypto';
import { db } from '../../db/connection.js';
import { ENV } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { DecisionEngine } from '../decision/decision_engine.js';

const UPI_VPA_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

export class PayoutService {
  /**
   * Process Instant Buy-Back Payout to user's UPI address with ownership,
   * server-side valuation cap, idempotency, and honest gateway confirmation state.
   */
  static async processInstantBuybackPayout({ userId, itemId, amount, vpaAddress, idempotencyKey = null }) {
    if (!vpaAddress || typeof vpaAddress !== 'string' || !UPI_VPA_REGEX.test(vpaAddress.trim())) {
      throw AppError.badRequest('Invalid UPI VPA address. Format: identifier@bank (e.g. user@okhdfcbank)', 'INVALID_VPA');
    }

    if (idempotencyKey) {
      const existingByKey = await db.findPayoutByIdempotencyKey(idempotencyKey);
      if (existingByKey) {
        if (existingByKey.user_id !== userId) {
          throw AppError.forbidden('Idempotency key belongs to another user');
        }
        return this._formatPayoutResponse(existingByKey);
      }
    }

    const item = await db.getItem(itemId);
    if (!item) {
      throw AppError.notFound('Item not found');
    }

    // Strict ownership enforcement (C3)
    if (!item.user_id || item.user_id !== userId) {
      throw AppError.forbidden('You do not own this item');
    }

    // Prevent duplicate payout for the same item
    const existingItemPayout = await db.findCompletedPayoutByItem(itemId);
    if (existingItemPayout || item.status === 'fulfilled') {
      throw AppError.conflict('Payout already initiated or fulfilled for this item');
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw AppError.badRequest('Payout amount must be a positive number', 'INVALID_AMOUNT');
    }

    // Server-side valuation enforcement: compute ceiling from DecisionEngine / stored valuation
    let serverValuation = item.server_valuation_inr;
    if (serverValuation == null) {
      const evaluated = DecisionEngine.evaluate({
        category: item.category || 'other',
        brand: item.brand,
        modelName: item.model_name || item.category || 'Item',
        working: 'yes',
        condition: item.provisional_grade === 'A' ? 'like_new' : item.provisional_grade === 'C' ? 'fair' : 'good'
      });
      serverValuation = evaluated.item_summary.server_valuation_inr;
    }

    if (numericAmount > serverValuation) {
      throw AppError.badRequest(
        `Requested amount (₹${numericAmount}) exceeds server valuation cap (₹${serverValuation})`,
        'VALUATION_EXCEEDED'
      );
    }

    const cleanVpa = vpaAddress.trim();
    const isLive = ENV.PAYMENT_MODE === 'live' && Boolean(ENV.RAZORPAY_KEY_ID);
    const gatewayReference = `RPX-PO-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // Honest status: never fabricate a settled UTR or 'success' without live gateway confirmation webhook
    const payout = await db.createPayout({
      user_id: userId,
      item_id: itemId,
      amount: numericAmount,
      vpa_address: cleanVpa,
      idempotency_key: idempotencyKey,
      payout_status: 'pending_gateway_confirmation',
      simulated: !isLive,
      gateway_reference: gatewayReference,
      utr_number: null,
      settled_at: null
    });

    await db.updateItem(itemId, { status: 'payout_pending' });

    return this._formatPayoutResponse(payout);
  }

  static _formatPayoutResponse(payout) {
    return {
      payout_id: payout.id,
      item_id: payout.item_id,
      amount_inr: payout.amount,
      vpa_address: payout.vpa_address,
      status: payout.payout_status,
      simulated: Boolean(payout.simulated),
      utr_number: payout.utr_number,
      gateway_reference: payout.gateway_reference,
      timestamp: payout.initiated_at,
      receipt_message: `Payout of ₹${payout.amount} to ${payout.vpa_address} queued (${payout.payout_status}).`
    };
  }
}
