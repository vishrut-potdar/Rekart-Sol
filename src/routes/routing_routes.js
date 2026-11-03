import express from 'express';
import { ReadinessGatekeeperService } from '../services/routing/readiness_gatekeeper.js';
import { HyperlocalMatcherService } from '../services/routing/hyperlocal_matcher.js';
import { SocietyDrivesService } from '../services/routing/society_drives.js';
import { NAGPUR_GEO_ANCHOR } from '../config/constants.js';

const router = express.Router();

// 1. Readiness Gatekeeper (NGO criteria & fallback)
router.post('/readiness-check', (req, res) => {
  const { category = 'apparel', conditionAttributes = {} } = req.body;
  const evaluation = ReadinessGatekeeperService.evaluateDonationReadiness({
    category,
    conditionAttributes
  });
  return res.status(200).json({ success: true, data: evaluation });
});

// 2. Hyperlocal Partner Matching
router.get('/nearby-partners', async (req, res, next) => {
  try {
    const latitude = parseFloat(req.query.latitude || String(NAGPUR_GEO_ANCHOR.latitude));
    const longitude = parseFloat(req.query.longitude || String(NAGPUR_GEO_ANCHOR.longitude));
    const category = req.query.category || 'electronics';
    const targetTrack = req.query.targetTrack || 'repair';
    const maxRadiusMeters = parseInt(req.query.maxRadiusMeters || '25000', 10);

    const matches = await HyperlocalMatcherService.findOptimalMatches({
      latitude,
      longitude,
      category,
      targetTrack,
      maxRadiusMeters
    });

    return res.status(200).json({ success: true, data: matches });
  } catch (err) {
    next(err);
  }
});

// 3. Society Drives & Community Collection Hubs
router.get('/society-drives', async (req, res, next) => {
  try {
    const latitude = parseFloat(req.query.latitude || String(NAGPUR_GEO_ANCHOR.latitude));
    const longitude = parseFloat(req.query.longitude || String(NAGPUR_GEO_ANCHOR.longitude));
    const radiusMeters = parseInt(req.query.radiusMeters || '15000', 10);

    const drives = await SocietyDrivesService.getUpcomingDrives({
      latitude,
      longitude,
      radiusMeters
    });

    return res.status(200).json({ success: true, data: drives });
  } catch (err) {
    next(err);
  }
});

export default router;
