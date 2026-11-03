import { db } from '../../db/connection.js';
import crypto from 'crypto';

/**
 * Partner Terminal Service
 * Physical check-in terminal for technicians, NGO coordinators, and scrap collectors.
 */
export class PartnerTerminalService {
  /**
   * Inspect and amend or confirm provisional grade
   */
  static async physicalCheckIn({
    leadId,
    partnerId,
    inspectorId,
    confirmedGrade,
    discrepancyReason = null,
    actualAmountAgreed = null
  }) {
    const lead = await db.getLead(leadId);
    if (!lead) {
      throw new Error(`Lead transaction ${leadId} not found`);
    }

    const item = await db.getItem(lead.item_id);
    if (!item) {
      throw new Error(`Item ${lead.item_id} not found`);
    }

    const provisionalGrade = item.provisional_grade || 'B';
    const isGradeAmended = provisionalGrade !== confirmedGrade;

    // Update item and lead
    await db.updateItem(item.id, {
      final_grade: confirmedGrade,
      status: 'fulfilled',
      metadata: {
        ...item.metadata,
        inspection_log: {
          inspected_by: inspectorId,
          provisional_grade: provisionalGrade,
          confirmed_grade: confirmedGrade,
          is_amended: isGradeAmended,
          discrepancy_reason: discrepancyReason,
          inspected_at: new Date().toISOString()
        }
      }
    });

    await db.updateLead(leadId, {
      status: 'inspected',
      actual_paid_price: actualAmountAgreed
    });

    return {
      success: true,
      item_id: item.id,
      lead_id: leadId,
      provisional_grade: provisionalGrade,
      confirmed_grade: confirmedGrade,
      is_grade_amended: isGradeAmended,
      discrepancy_reason: discrepancyReason,
      actual_amount_agreed: actualAmountAgreed
    };
  }

  /**
   * Generate Digital Proof Receipt (CPCB Recycling Certificate or NGO distribution photo)
   */
  static async issueDigitalProof({
    leadId,
    proofType = 'formal_recycling_certificate', // 'formal_recycling_certificate' or 'ngo_distribution_proof'
    documentUrl,
    issuerName
  }) {
    const lead = await db.getLead(leadId);
    if (!lead) {
      throw new Error(`Lead transaction ${leadId} not found`);
    }

    const timestamp = new Date().toISOString();
    const certificateNumber = `CERT-${proofType.toUpperCase().substring(0, 4)}-${Date.now()}`;
    const signature = crypto
      .createHash('sha256')
      .update(`${leadId}:${certificateNumber}:${timestamp}:${documentUrl}`)
      .digest('hex');

    const proofObject = {
      certificate_number: certificateNumber,
      proof_type: proofType,
      item_id: lead.item_id,
      lead_id: leadId,
      document_url: documentUrl,
      issuer_name: issuerName,
      issued_at: timestamp,
      tamper_proof_signature: signature
    };

    const currentProofs = lead.digital_proof_urls || [];
    currentProofs.push(proofObject);

    await db.updateLead(leadId, {
      status: 'fulfilled',
      digital_proof_urls: currentProofs
    });

    return proofObject;
  }
}
