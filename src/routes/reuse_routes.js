import express from 'express';
import { ReuseService } from '../services/reuse/reuse_service.js';

const router = express.Router();

// 1. Repurposing Ideas
router.get('/repurposing-ideas', (req, res) => {
  const { category = 'electronics', subType = 'smartphone', condition = 'working_slow' } = req.query;
  const ideas = ReuseService.getRepurposingIdeas({ category, subType, condition });
  return res.status(200).json({ success: true, data: ideas });
});

// 2. Memory Vault
router.post('/memory-vault', (req, res) => {
  const { userId = 'user_guest', title, emotionalStory, photoUrls = [], reviewReminderMonths = 6 } = req.body;
  if (!title || !emotionalStory) {
    return res.status(400).json({ error: 'title and emotionalStory are required' });
  }
  const entry = ReuseService.saveToMemoryVault({
    userId,
    title,
    emotionalStory,
    photoUrls,
    reviewReminderMonths: Number(reviewReminderMonths)
  });
  return res.status(201).json({ success: true, data: entry });
});

// 3. Festive Clean-out Workflow (e.g. Diwali Safai)
router.get('/festive-cleanout', (req, res) => {
  const { campaignName = 'Diwali Safai' } = req.query;
  const campaign = ReuseService.getFestiveCleanOutWorkflow({ campaignName });
  return res.status(200).json({ success: true, data: campaign });
});

export default router;
