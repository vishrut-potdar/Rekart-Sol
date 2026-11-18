import crypto from 'crypto';
import { db } from '../../db/connection.js';
import { ENV } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';

export class CommissionBillingService {
  /**
   * Generates a monthly commission invoice for a partner based on attributed leads
   */
  static async generatePartnerInvoice(partnerId, billingPeriod) {
    const partner = await db.getPartner(partnerId);
    if (!partner) {
      throw AppError.notFound('Partner not found');
    }

    const leads = await db.listLeadsByPartner(partnerId);
    let totalCommissionDue = 0;
    let countedLeads = 0;

    for (const lead of leads) {
      if (lead.partner_fee > 0) {
        totalCommissionDue += lead.partner_fee;
        countedLeads += 1;
      }
    }

    const invoice = await db.createInvoice({
      partner_id: partnerId,
      billing_period: billingPeriod,
      total_leads_count: countedLeads,
      total_commission_due: totalCommissionDue,
      status: totalCommissionDue > 0 ? 'pending' : 'paid'
    });

    return {
      invoice_id: invoice.id,
      partner_id: partnerId,
      partner_name: partner.name,
      billing_period: billingPeriod,
      total_leads_count: countedLeads,
      total_commission_due: totalCommissionDue,
      status: invoice.status,
      razorpay_order_id: `order_mock_${invoice.id.substring(0, 8)}`
    };
  }

  /**
   * Validates Razorpay Webhook signature against raw payload bytes using constant-time comparison.
   */
  static verifyWebhookSignature(rawPayload, receivedSignature) {
    if (!ENV.RAZORPAY_KEY_SECRET) return false;
    if (!receivedSignature || typeof receivedSignature !== 'string') return false;
    if (!Buffer.isBuffer(rawPayload) && typeof rawPayload !== 'string') return false;

    const expectedHex = crypto
      .createHmac('sha256', ENV.RAZORPAY_KEY_SECRET)
      .update(rawPayload)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedHex, 'utf8');
    const receivedBuf = Buffer.from(receivedSignature.trim(), 'utf8');

    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  }
}
