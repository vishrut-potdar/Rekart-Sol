import express from 'express';
import { z } from 'zod';
import { ScamShieldService } from '../services/selling/scam_shield_service.js';
import { ListingGeneratorService } from '../services/selling/listing_generator.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

const ScamShieldSchema = z.object({
  message: z.string().max(2000).optional().default(''),
  paymentMethod: z.string().max(64).optional().default(''),
  deliveryRequested: z.boolean().optional().default(false)
});

const GenerateListingSchema = z.object({
  brand: z.string().max(100).optional().default('Generic'),
  modelName: z.string().min(1).max(160).optional().default('Device'),
  storage: z.string().max(64).optional().default(''),
  color: z.string().max(64).optional().default(''),
  conditionGrade: z.enum(['A', 'B', 'C', 'BER']).optional().default('B'),
  testedFunctions: z.array(z.string().max(100)).max(20).optional().default(['Basic functionality']),
  knownFlaws: z.array(z.string().max(120)).max(20).optional().default([]),
  accessoriesIncluded: z.array(z.string().max(100)).max(20).optional().default([]),
  suggestedPrice: z.coerce.number().positive().max(500000)
});

// 1. Marketplace Scam Shield Detector
router.post('/scam-shield', validate({ body: ScamShieldSchema }), (req, res) => {
  const analysis = ScamShieldService.analyzeScamRisk(req.body);
  return res.status(200).json({ success: true, data: analysis });
});

// 2. P2P Listing Generator
router.post('/generate-listing', validate({ body: GenerateListingSchema }), (req, res) => {
  const listing = ListingGeneratorService.generateListing(req.body);
  return res.status(200).json({ success: true, data: listing });
});

export default router;
