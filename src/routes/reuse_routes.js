import express from 'express';
import { z } from 'zod';
import { ReuseService } from '../services/reuse/reuse_service.js';
import { authenticateToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

const MemoryVaultSchema = z.object({
  title: z.string().min(1).max(160),
  emotionalStory: z.string().min(1).max(2000),
  photoUrls: z.array(z.string().max(500)).max(10).optional().default([]),
  reviewReminderMonths: z.coerce.number().int().min(1).max(60).optional().default(6)
});

// 1. Repurposing Ideas
router.get('/repurposing-ideas', (req, res) => {
  const { category = 'electronics', subType = 'smartphone', condition = 'working_slow' } = req.query;
  const ideas = ReuseService.getRepurposingIdeas({ category, subType, condition });
  return res.status(200).json({ success: true, data: ideas });
});

// 2. Memory Vault (authenticated; userId from token)
router.post('/memory-vault', authenticateToken, validate({ body: MemoryVaultSchema }), (req, res) => {
  const entry = ReuseService.saveToMemoryVault({
    userId: req.user.userId,
    title: req.body.title,
    emotionalStory: req.body.emotionalStory,
    photoUrls: req.body.photoUrls,
    reviewReminderMonths: req.body.reviewReminderMonths
  });
  return res.status(201).json({ success: true, data: entry });
});

// 3. Festive Clean-out Workflow
router.get('/festive-cleanout', (req, res) => {
  const { campaignName = 'Diwali Safai' } = req.query;
  const campaign = ReuseService.getFestiveCleanOutWorkflow({ campaignName });
  return res.status(200).json({ success: true, data: campaign });
});

export default router;
