import express from 'express';
import { PayoutService } from '../services/payment/payout_service.js';
import { CommissionBillingService } from '../services/payment/commission_billing.js';
import { optionalAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// 1. Process Instant Buy-Back UPI Payout
router.post('/instant-payout', optionalAuth, async (req, res, next) => {
  try {
    const { itemId, amount, vpaAddress, userId } = req.body;
    const resolvedUserId = req.user?.userId || userId || 'user_guest';

    if (!itemId || !amount || !vpaAddress) {
      return res.status(400).json({ error: 'itemId, amount, and vpaAddress are required' });
    }

    const result = await PayoutService.processInstantBuybackPayout({
      userId: resolvedUserId,
      itemId,
      amount,
      vpaAddress
    });

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 2. Generate Partner Commission Invoice
router.post('/partner-invoice', optionalAuth, async (req, res, next) => {
  try {
    const { partnerId, billingPeriod = '2026-11' } = req.body;
    if (!partnerId) {
      return res.status(400).json({ error: 'partnerId is required' });
    }

    const invoice = await CommissionBillingService.generatePartnerInvoice(partnerId, billingPeriod);
    return res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

// 3. Payment Gateway Webhook Receiver
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const isValid = CommissionBillingService.verifyWebhookSignature(req.body, signature);

  if (!isValid && process.env.NODE_ENV === 'production') {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  // Handle payment events (order.paid, payout.processed, etc.)
  return res.status(200).json({ received: true });
});

export default router;
