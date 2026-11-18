import express from 'express';
import { z } from 'zod';
import { ReadinessGatekeeperService } from '../services/routing/readiness_gatekeeper.js';
import { HyperlocalMatcherService } from '../services/routing/hyperlocal_matcher.js';
import { SocietyDrivesService } from '../services/routing/society_drives.js';
import { NAGPUR_GEO_ANCHOR } from '../config/constants.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

const ReadinessSchema = z.object({
  category: z.string().max(64).optional().default('apparel'),
  conditionAttributes: z.record(z.string(), z.unknown()).optional().default({})
});

const NearbyPartnersQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional().default(NAGPUR_GEO_ANCHOR.latitude),
  longitude: z.coerce.number().min(-180).max(180).optional().default(NAGPUR_GEO_ANCHOR.longitude),
  category: z.string().max(64).optional().default('electronics'),
  targetTrack: z.enum(['repair', 'ngo_donation', 'formal_recycle', 'kabadiwala_scrap']).optional().default('repair'),
  maxRadiusMeters: z.coerce.number().int().min(100).max(100000).optional().default(25000)
});

const SocietyDrivesQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional().default(NAGPUR_GEO_ANCHOR.latitude),
  longitude: z.coerce.number().min(-180).max(180).optional().default(NAGPUR_GEO_ANCHOR.longitude),
  radiusMeters: z.coerce.number().int().min(100).max(100000).optional().default(15000)
});

// 1. Readiness Gatekeeper (NGO criteria & fallback)
router.post('/readiness-check', validate({ body: ReadinessSchema }), (req, res) => {
  const evaluation = ReadinessGatekeeperService.evaluateDonationReadiness(req.body);
  return res.status(200).json({ success: true, data: evaluation });
});

// 2. Hyperlocal Partner Matching
router.get('/nearby-partners', validate({ query: NearbyPartnersQuerySchema }), async (req, res, next) => {
  try {
    const matches = await HyperlocalMatcherService.findOptimalMatches(req.query);
    return res.status(200).json({ success: true, data: matches });
  } catch (err) {
    next(err);
  }
});

// 3. Society Drives & Community Collection Hubs
router.get('/society-drives', validate({ query: SocietyDrivesQuerySchema }), async (req, res, next) => {
  try {
    const drives = await SocietyDrivesService.getUpcomingDrives(req.query);
    return res.status(200).json({ success: true, data: drives });
  } catch (err) {
    next(err);
  }
});

export default router;
