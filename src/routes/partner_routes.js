import express from 'express';
import { z } from 'zod';
import { LeadManagerService } from '../services/partner/lead_manager.js';
import { PartnerTerminalService } from '../services/partner/partner_terminal.js';
import { PriceCalibrationService } from '../services/partner/price_calibration.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requireV2Module } from '../middleware/feature_flag.js';
import { db } from '../db/connection.js';
import { AppError } from '../utils/errors.js';

const router = express.Router();

const partnerOnly = [authenticateToken, requireRole('partner_technician', 'ngo_coordinator')];

const CreateLeadSchema = z.object({
  itemId: z.string().min(1).max(128),
  partnerId: z.string().min(1).max(128).optional(),
  quotedPrice: z.coerce.number().min(0).max(500000).optional().nullable()
});

const CheckInSchema = z.object({
  leadId: z.string().min(1).max(128),
  partnerId: z.string().min(1).max(128).optional(),
  inspectorId: z.string().max(128).optional(),
  confirmedGrade: z.enum(['A', 'B', 'C', 'BER']),
  discrepancyReason: z.string().max(400).optional().nullable(),
  actualAmountAgreed: z.coerce.number().min(0).max(500000).optional().nullable()
});

const IssueProofSchema = z.object({
  leadId: z.string().min(1).max(128),
  proofType: z.enum(['partner_handoff_receipt', 'formal_repair_warranty_certificate', 'ngo_distribution_proof', 'formal_recycling_certificate']).optional().default('partner_handoff_receipt'),
  documentUrl: z.string().min(1).max(500),
  issuerName: z.string().min(1).max(160).optional().default('Authorized Partner')
});

const CalibratePriceSchema = z.object({
  cityId: z.string().max(64).optional().default('nagpur'),
  modelName: z.string().min(1).max(150),
  faultType: z.string().min(1).max(120),
  partGrade: z.enum(['OEM', 'aftermarket', 'reconditioned']).optional().default('aftermarket'),
  amountPaid: z.coerce.number().positive().max(250000),
  source: z.string().max(64).optional().default('user_survey'),
  receiptProofUrl: z.string().max(500).optional().nullable()
});

function resolveScopedPartnerId(user, requestedPartnerId) {
  if (user.role === 'admin') {
    return requestedPartnerId || user.partnerId;
  }
  if (!user.partnerId) {
    throw AppError.forbidden('Partner user is not bound to a partner organization');
  }
  if (requestedPartnerId && requestedPartnerId !== user.partnerId) {
    throw AppError.forbidden('Cannot act on behalf of another partner');
  }
  return user.partnerId;
}

// 1. Partner Lead Attribution (v2 gated)
router.post('/leads', requireV2Module('partner_terminal'), partnerOnly, validate({ body: CreateLeadSchema }), async (req, res, next) => {
  try {
    const partnerId = resolveScopedPartnerId(req.user, req.body.partnerId);
    const lead = await LeadManagerService.createAttributedLead({
      itemId: req.body.itemId,
      partnerId,
      quotedPrice: req.body.quotedPrice
    });
    return res.status(201).json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
});

// Internal settlement summary (scoped to owning partner or admin)
router.get('/leads/:id/settlement', requireV2Module('partner_terminal'), partnerOnly, async (req, res, next) => {
  try {
    const lead = await db.getLead(req.params.id);
    if (!lead) {
      throw AppError.notFound('Lead not found');
    }
    if (req.user.role !== 'admin' && lead.partner_id !== req.user.partnerId) {
      throw AppError.forbidden('Lead does not belong to your partner organization');
    }
    const summary = await LeadManagerService.getInternalSettlementSummary(req.params.id);
    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
});

// 2. Partner Terminal Physical Check-in & Grade Amendment (v2 gated, IDOR fixed)
router.post('/terminal/check-in', requireV2Module('partner_terminal'), partnerOnly, validate({ body: CheckInSchema }), async (req, res, next) => {
  try {
    const scopedPartnerId = resolveScopedPartnerId(req.user, req.body.partnerId);
    const checkInResult = await PartnerTerminalService.physicalCheckIn({
      leadId: req.body.leadId,
      partnerId: scopedPartnerId,
      role: req.user.role,
      inspectorId: req.user.userId,
      confirmedGrade: req.body.confirmedGrade,
      discrepancyReason: req.body.discrepancyReason,
      actualAmountAgreed: req.body.actualAmountAgreed
    });

    return res.status(200).json({ success: true, data: checkInResult });
  } catch (err) {
    next(err);
  }
});

// 3. Partner Terminal Digital Proof Issuance (v2 gated, HMAC signed, IDOR fixed)
router.post('/terminal/issue-proof', requireV2Module('partner_terminal'), partnerOnly, validate({ body: IssueProofSchema }), async (req, res, next) => {
  try {
    const proof = await PartnerTerminalService.issueDigitalProof({
      leadId: req.body.leadId,
      partnerId: req.user.partnerId,
      role: req.user.role,
      proofType: req.body.proofType,
      documentUrl: req.body.documentUrl,
      issuerName: req.body.issuerName
    });

    return res.status(201).json({ success: true, data: proof });
  } catch (err) {
    next(err);
  }
});

// 4. Crowdsourced Price Calibration Logging (session required to prevent spam poisoning)
router.post('/calibrate-price', authenticateToken, validate({ body: CalibratePriceSchema }), async (req, res, next) => {
  try {
    const {
      cityId,
      modelName,
      faultType,
      partGrade,
      amountPaid,
      source,
      receiptProofUrl
    } = req.body;

    const result = await PriceCalibrationService.submitActualPaymentLog({
      userId: req.user.userId,
      cityId,
      modelName,
      faultType,
      partGrade,
      amountPaid,
      source,
      receiptProofUrl
    });

    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
