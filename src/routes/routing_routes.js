import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { ReadinessGatekeeperService } from '../services/routing/readiness_gatekeeper.js';
import { HyperlocalMatcherService } from '../services/routing/hyperlocal_matcher.js';
import { SocietyDrivesService } from '../services/routing/society_drives.js';
import { db, calculateHaversineDistanceMeters } from '../db/connection.js';
import { NAGPUR_GEO_ANCHOR } from '../config/constants.js';
import { validate } from '../middleware/validate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NGO_DIR_PATH = path.resolve(__dirname, '../data/ngo_directory.json');

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

const CommunityHubsQuerySchema = z.object({
  type: z.enum(['all', 'ngo', 'cpcb_recycler', 'repair_shop', 'brand_dropbox', 'kabadiwala']).optional().default('all'),
  category: z.string().max(64).optional().default(''),
  latitude: z.coerce.number().min(-90).max(90).optional().default(NAGPUR_GEO_ANCHOR.latitude),
  longitude: z.coerce.number().min(-180).max(180).optional().default(NAGPUR_GEO_ANCHOR.longitude)
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

// 4. Unified Nagpur Community Hubs, NGO Directory & Gatherings
router.get('/community-hubs', validate({ query: CommunityHubsQuerySchema }), async (req, res, next) => {
  try {
    const { type, category, latitude, longitude } = req.query;
    const rawDir = fs.existsSync(NGO_DIR_PATH)
      ? JSON.parse(fs.readFileSync(NGO_DIR_PATH, 'utf8'))
      : { general_ngo_rules: [] };

    const allPartners = await db.listPartners();
    const activeDemands = await db.getActiveDemands(category || null);
    const drives = await db.listSocietyDrives(latitude, longitude, 50000);

    const partners = allPartners
      .filter(p => (type === 'all' || p.partner_type === type))
      .filter(p => (!category || (Array.isArray(p.accepted_categories) && p.accepted_categories.includes(category))))
      .map(p => {
        const distanceMeters = calculateHaversineDistanceMeters(latitude, longitude, p.latitude, p.longitude);
        const partnerDemands = activeDemands.filter(d => d.partner_id === p.id);
        return {
          ...p,
          distance_meters: distanceMeters,
          distance_km: parseFloat((distanceMeters / 1000).toFixed(2)),
          active_shortages: partnerDemands,
          has_active_shortage: partnerDemands.length > 0
        };
      })
      .sort((a, b) => {
        if (a.has_active_shortage !== b.has_active_shortage) return a.has_active_shortage ? -1 : 1;
        return a.distance_meters - b.distance_meters;
      });

    return res.status(200).json({
      success: true,
      data: {
        city: rawDir.city || 'Nagpur',
        last_updated: rawDir.last_updated || null,
        general_ngo_rules: rawDir.general_ngo_rules || [],
        partners,
        active_demands: activeDemands,
        gatherings_and_drives: drives
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
