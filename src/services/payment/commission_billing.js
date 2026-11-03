import crypto from 'crypto';
import { db } from '../../db/connection.js';
import { ENV } from '../../config/env.js';

export class CommissionBillingService {
  /**
   * Generates a monthly commission invoice for a partner based on attributed leads
   */
  static async generatePartnerInvoice(partnerId, billingPeriod) {
    const partner = await db.getPartner(partnerId);
    if (!partner) {
      throw new Error(`Partner not found: ${partnerId}`);
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
   * Validates Razorpay Webhook signature
   */
  static verifyWebhookSignature(payloadBody, receivedSignature) {
    const expectedSignature = crypto
      .createHmac('sha256', ENV.RAZORPAY_KEY_SECRET)
      .update(typeof payloadBody === 'string' ? payloadBody : JSON.stringify(payloadBody))
      .digest('hex');

    return expectedSignature === receivedSignature;
  }
}
