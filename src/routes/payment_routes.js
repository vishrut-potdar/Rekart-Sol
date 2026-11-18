import express from 'express';
import { z } from 'zod';
import { PayoutService } from '../services/payment/payout_service.js';
import { CommissionBillingService } from '../services/payment/commission_billing.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requireV2Module } from '../middleware/feature_flag.js';
import { ENV } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const router = express.Router();

const PayoutBodySchema = z.object({
  itemId: z.string().min(1).max(128),
  amount: z.coerce.number().positive().max(250000),
  vpaAddress: z.string().trim().min(5).max(150),
  idempotencyKey: z.string().min(4).max(128).optional()
});

const PartnerInvoiceSchema = z.object({
  partnerId: z.string().min(1).max(128).optional(),
  billingPeriod: z.string().regex(/^\d{4}-\d{2}$/).optional().default('2026-11')
});

// Gate non-v1 payment endpoints behind ENABLE_V2_MODULES
router.use(requireV2Module('payment'));

// 1. Process Instant Buy-Back UPI Payout
router.post('/instant-payout', authenticateToken, validate({ body: PayoutBodySchema }), async (req, res, next) => {
  try {
    const { itemId, amount, vpaAddress, idempotencyKey } = req.body;
    const headerIdem = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : null;

    const result = await PayoutService.processInstantBuybackPayout({
      userId: req.user.userId,
      itemId,
      amount,
      vpaAddress,
      idempotencyKey: headerIdem || idempotencyKey || null
    });

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 2. Generate Partner Commission Invoice (scoped to caller's partnerId unless admin)
router.post('/partner-invoice', authenticateToken, requireRole('partner_technician'), validate({ body: PartnerInvoiceSchema }), async (req, res, next) => {
  try {
    const requestedPartnerId = req.body.partnerId;
    const billingPeriod = req.body.billingPeriod;

    if (req.user.role !== 'admin') {
      if (!req.user.partnerId) {
        throw AppError.forbidden('Partner account is missing partnerId');
      }
      if (requestedPartnerId && requestedPartnerId !== req.user.partnerId) {
        throw AppError.forbidden('Cannot generate invoice for another partner');
      }
    }

    const scopedPartnerId = req.user.role === 'admin' ? (requestedPartnerId || req.user.partnerId) : req.user.partnerId;
    if (!scopedPartnerId) {
      throw AppError.badRequest('partnerId is required', 'MISSING_PARTNER_ID');
    }

    const invoice = await CommissionBillingService.generatePartnerInvoice(scopedPartnerId, billingPeriod);
    return res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

// 3. Payment Gateway Webhook Receiver (validates raw bytes captured before express.json)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawPayload = Buffer.isBuffer(req.body) ? req.body : req.rawBody;
  const isValid = CommissionBillingService.verifyWebhookSignature(rawPayload, signature);

  if (!ENV.RAZORPAY_KEY_SECRET || !isValid) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_WEBHOOK_SIGNATURE',
        message: 'Invalid webhook signature',
        status: 400
      }
    });
  }

  return res.status(200).json({ success: true, received: true });
});

export default router;
