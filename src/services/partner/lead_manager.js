import { db } from '../../db/connection.js';

/**
 * Partner Attribution & Lead Management Service
 * Enforces strict NEUTRAL PRICING ISOLATION:
 * Commissions are logged purely for settlement and cannot influence algorithm rankings.
 */
export class LeadManagerService {
  static async createAttributedLead({ itemId, partnerId, quotedPrice = null }) {
    const partner = await db.getPartner(partnerId);
    if (!partner) {
      throw new Error(`Partner not found: ${partnerId}`);
    }

    const item = await db.getItem(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    // Commission is isolated and calculated asynchronously
    const partnerFee = quotedPrice ? quotedPrice * (partner.commission_rate || 0.05) : 0;

    const lead = await db.createLead({
      item_id: itemId,
      partner_id: partnerId,
      status: 'referred',
      quoted_price: quotedPrice,
      partner_fee: partnerFee
    });

    await db.updateItem(itemId, { status: 'routed' });

    return {
      lead_id: lead.id,
      item_id: itemId,
      partner_id: partnerId,
      partner_name: partner.name,
      partner_type: partner.partner_type,
      status: lead.status,
      // Note: partner_fee is omitted from user views to maintain neutrality
      created_at: lead.created_at
    };
  }

  static async getInternalSettlementSummary(leadId) {
    const lead = await db.getLead(leadId);
    if (!lead) return null;
    const partner = await db.getPartner(lead.partner_id);

    return {
      lead_id: lead.id,
      item_id: lead.item_id,
      partner_id: lead.partner_id,
      partner_name: partner?.name,
      commission_rate: partner?.commission_rate,
      partner_fee: lead.partner_fee,
      actual_paid_price: lead.actual_paid_price,
      status: lead.status
    };
  }
}
