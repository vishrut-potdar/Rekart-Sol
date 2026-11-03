import express from 'express';
import { RepairNetworkService } from '../services/repair/repair_network_service.js';
import { KnownDefectsService } from '../services/repair/known_defects_service.js';
import { DataWipeChecklistService } from '../services/repair/data_wipe_checklist.js';

const router = express.Router();

// 1. Questions to Ask Your Shop
router.get('/questions-template', (req, res) => {
  const { modelName = 'Device', faultType = 'Screen Replacement' } = req.query;
  const template = RepairNetworkService.getShopQuestionsTemplate({ modelName, faultType });
  return res.status(200).json({ success: true, data: template });
});

// 2. Student Technician Layer
router.get('/student-technicians', async (req, res, next) => {
  try {
    const { cityId = 'nagpur', category = 'electronics', faultType = '' } = req.query;
    const result = await RepairNetworkService.findStudentTechnicians({ cityId, category, faultType });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 3. Broadcast Repair Request to Local Shops
router.post('/broadcast-request', async (req, res, next) => {
  try {
    const { itemId = 'item-demo', modelName = 'iPhone 13', faultDescription = 'Screen cracked' } = req.body;
    const broadcast = await RepairNetworkService.broadcastRepairRequest({
      itemId,
      modelName,
      faultDescription
    });
    return res.status(201).json({ success: true, data: broadcast });
  } catch (err) {
    next(err);
  }
});

// 4. Known-Defects & Statutory Warranty Checker
router.get('/known-defects', (req, res) => {
  const { brand = '', modelName = '', symptoms = '' } = req.query;
  const analysis = KnownDefectsService.checkDefectsAndWarranty({ brand, modelName, symptoms });
  return res.status(200).json({ success: true, data: analysis });
});

// 5. Backup & Data-Wipe Checklist
router.get('/data-wipe-checklist', (req, res) => {
  const { platform = 'android' } = req.query;
  const checklist = DataWipeChecklistService.getChecklist({ platform });
  return res.status(200).json({ success: true, data: checklist });
});

export default router;
