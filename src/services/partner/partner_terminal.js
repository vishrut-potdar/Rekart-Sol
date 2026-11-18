import crypto from 'crypto';
import { db } from '../../db/connection.js';
import { ENV } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';

/**
 * Partner Terminal Service
 * Physical check-in terminal for technicians, NGO coordinators, and scrap collectors.
 * Enforces partner ownership on leads and HMAC-SHA256 signing on handoff proofs.
 */
export class PartnerTerminalService {
  static _assertLeadOwnership(lead, partnerId, role = 'partner_technician') {
    if (role !== 'admin' && lead.partner_id !== partnerId) {
      throw AppError.forbidden('Lead does not belong to your partner organization');
    }
  }

  /**
   * Inspect and amend or confirm provisional grade
   */
  static async physicalCheckIn({
    leadId,
    partnerId,
    role = 'partner_technician',
    inspectorId,
    confirmedGrade,
    discrepancyReason = null,
    actualAmountAgreed = null
  }) {
    const lead = await db.getLead(leadId);
    if (!lead) {
      throw AppError.notFound('Lead transaction not found');
    }
    this._assertLeadOwnership(lead, partnerId, role);

    const item = await db.getItem(lead.item_id);
    if (!item) {
      throw AppError.notFound('Item associated with lead not found');
    }

    const provisionalGrade = item.provisional_grade || 'B';
    const isGradeAmended = provisionalGrade !== confirmedGrade;

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

  static _signProofPayload({ leadId, certificateNumber, timestamp, documentUrl, proofType }) {
    return crypto
      .createHmac('sha256', ENV.PROOF_SIGNING_SECRET)
      .update(`${leadId}:${proofType}:${certificateNumber}:${timestamp}:${documentUrl}`)
      .digest('hex');
  }

  /**
   * Generate server-HMAC signed Partner Handoff Proof Receipt
   */
  static async issueDigitalProof({
    leadId,
    partnerId = null,
    role = 'partner_technician',
    proofType = 'partner_handoff_receipt',
    documentUrl,
    issuerName
  }) {
    const lead = await db.getLead(leadId);
    if (!lead) {
      throw AppError.notFound('Lead transaction not found');
    }
    if (partnerId || role !== 'admin') {
      this._assertLeadOwnership(lead, partnerId, role);
    }

    const timestamp = new Date().toISOString();
    const certificateNumber = `PROOF-${proofType.toUpperCase().substring(0, 4)}-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const signature = this._signProofPayload({
      leadId,
      certificateNumber,
      timestamp,
      documentUrl,
      proofType
    });

    const proofObject = {
      certificate_number: certificateNumber,
      proof_type: proofType,
      item_id: lead.item_id,
      lead_id: leadId,
      partner_id: lead.partner_id,
      document_url: documentUrl,
      issuer_name: issuerName,
      issued_at: timestamp,
      signature_algorithm: 'HMAC-SHA256',
      tamper_proof_signature: signature,
      regulatory_disclaimer: 'Signed partner handoff proof issued by Rekart; not a statutory CPCB Form-6 certificate.'
    };

    const currentProofs = lead.digital_proof_urls || [];
    currentProofs.push(proofObject);

    await db.updateLead(leadId, {
      status: 'fulfilled',
      digital_proof_urls: currentProofs
    });

    return proofObject;
  }

  static verifyDigitalProof(proofObject) {
    if (!proofObject?.tamper_proof_signature) return false;
    const expected = this._signProofPayload({
      leadId: proofObject.lead_id,
      certificateNumber: proofObject.certificate_number,
      timestamp: proofObject.issued_at,
      documentUrl: proofObject.document_url,
      proofType: proofObject.proof_type
    });
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(proofObject.tamper_proof_signature), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}
