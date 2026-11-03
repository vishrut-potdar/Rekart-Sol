import express from 'express';
import { LeadManagerService } from '../services/partner/lead_manager.js';
import { PartnerTerminalService } from '../services/partner/partner_terminal.js';
import { PriceCalibrationService } from '../services/partner/price_calibration.js';

const router = express.Router();

// 1. Partner Lead Attribution (Isolated Neutral Commission)
router.post('/leads', async (req, res, next) => {
  try {
    const { itemId, partnerId, quotedPrice } = req.body;
    if (!itemId || !partnerId) {
      return res.status(400).json({ error: 'itemId and partnerId are required' });
    }
    const lead = await LeadManagerService.createAttributedLead({ itemId, partnerId, quotedPrice });
    return res.status(201).json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
});

// Internal settlement summary (for admin/partner accounting)
router.get('/leads/:id/settlement', async (req, res, next) => {
  try {
    const summary = await LeadManagerService.getInternalSettlementSummary(req.params.id);
    if (!summary) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
});

// 2. Partner Terminal Physical Check-in & Grade Amendment
router.post('/terminal/check-in', async (req, res, next) => {
  try {
    const {
      leadId,
      partnerId,
      inspectorId = 'tech_01',
      confirmedGrade,
      discrepancyReason,
      actualAmountAgreed
    } = req.body;

    if (!leadId || !confirmedGrade) {
      return res.status(400).json({ error: 'leadId and confirmedGrade are required' });
    }

    const checkInResult = await PartnerTerminalService.physicalCheckIn({
      leadId,
      partnerId,
      inspectorId,
      confirmedGrade,
      discrepancyReason,
      actualAmountAgreed
    });

    return res.status(200).json({ success: true, data: checkInResult });
  } catch (err) {
    next(err);
  }
});

// 3. Partner Terminal Digital Proof Issuance
router.post('/terminal/issue-proof', async (req, res, next) => {
  try {
    const {
      leadId,
      proofType = 'formal_recycling_certificate',
      documentUrl,
      issuerName = 'Authorized Partner'
    } = req.body;

    if (!leadId || !documentUrl) {
      return res.status(400).json({ error: 'leadId and documentUrl are required' });
    }

    const proof = await PartnerTerminalService.issueDigitalProof({
      leadId,
      proofType,
      documentUrl,
      issuerName
    });

    return res.status(201).json({ success: true, data: proof });
  } catch (err) {
    next(err);
  }
});

// 4. Crowdsourced Price Calibration Logging
router.post('/calibrate-price', async (req, res, next) => {
  try {
    const {
      userId,
      cityId = 'nagpur',
      modelName,
      faultType,
      partGrade = 'aftermarket',
      amountPaid,
      source = 'user_survey',
      receiptProofUrl
    } = req.body;

    if (!modelName || !faultType || amountPaid === undefined) {
      return res.status(400).json({ error: 'modelName, faultType, and amountPaid are required' });
    }

    const result = await PriceCalibrationService.submitActualPaymentLog({
      userId,
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
