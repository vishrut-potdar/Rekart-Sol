import express from 'express';
import { ScamShieldService } from '../services/selling/scam_shield_service.js';
import { ListingGeneratorService } from '../services/selling/listing_generator.js';

const router = express.Router();

// 1. Marketplace Scam Shield Detector
router.post('/scam-shield', (req, res) => {
  const { message = '', paymentMethod = '', deliveryRequested = false } = req.body;
  const analysis = ScamShieldService.analyzeScamRisk({ message, paymentMethod, deliveryRequested });
  return res.status(200).json({ success: true, data: analysis });
});

// 2. AI P2P Listing Generator
router.post('/generate-listing', (req, res) => {
  const {
    brand = 'Apple',
    modelName = 'iPhone 13',
    storage = '128GB',
    color = 'Midnight Blue',
    conditionGrade = 'B',
    testedFunctions = ['Touch Screen', 'Face ID', 'Cameras'],
    knownFlaws = [],
    accessoriesIncluded = ['Original Box', 'Cable'],
    suggestedPrice = 36000
  } = req.body;

  const listing = ListingGeneratorService.generateListing({
    brand,
    modelName,
    storage,
    color,
    conditionGrade,
    testedFunctions,
    knownFlaws,
    accessoriesIncluded,
    suggestedPrice
  });

  return res.status(200).json({ success: true, data: listing });
});

export default router;
