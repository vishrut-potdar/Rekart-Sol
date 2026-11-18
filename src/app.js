import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from './config/env.js';
import { requestLogger } from './middleware/request_logger.js';
import { errorHandler } from './middleware/error_handler.js';
import { securityHeaders } from './middleware/security_headers.js';
import { rateLimit } from './middleware/rate_limit.js';
import { optionalAuth } from './middleware/auth.js';
import { db } from './db/connection.js';
import { AppError } from './utils/errors.js';
import authRoutes from './routes/auth_routes.js';
import visionRoutes from './routes/vision_routes.js';
import decisionRoutes from './routes/decision_routes.js';
import triageRoutes from './routes/triage_routes.js';
import calculationRoutes from './routes/calculation_routes.js';
import routingRoutes from './routes/routing_routes.js';
import partnerRoutes from './routes/partner_routes.js';
import paymentRoutes from './routes/payment_routes.js';
import jobRoutes from './routes/job_routes.js';
import repairRoutes from './routes/repair_routes.js';
import sellingRoutes from './routes/selling_routes.js';
import reuseRoutes from './routes/reuse_routes.js';
import rewardsRoutes from './routes/rewards_routes.js';
import recyclingRoutes from './routes/recycling_routes.js';
import aiRoutes from './routes/ai_routes.js';
import { seedNagpurData } from './db/seed_data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));

export async function createApp() {
  const app = express();

  if (process.env.VERCEL) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cors({
    origin: ENV.CORS_ORIGINS.length ? ENV.CORS_ORIGINS : !ENV.IS_PRODUCTION,
    credentials: true
  }));
  app.use(requestLogger);

  // Mount raw-byte webhook parser BEFORE global express.json() so HMAC verifies raw bytes cleanly (C6).
  app.use('/api/v1/payment/webhook', express.raw({ type: 'application/json', limit: '256kb' }));

  // Default small JSON body limit (100kb); file uploads use multer's 10MB limit on /upload-media.
  app.use(express.json({
    limit: '100kb',
    verify: (req, _res, buf) => {
      req.rawBody = Buffer.from(buf);
    }
  }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // Static frontend: public/index.html is the main app, partner.html the terminal.
  const publicDir = path.resolve(__dirname, '../public');
  app.use(express.static(publicDir));

  // Owner-checked private media serving (removes open public /uploads directory listing)
  app.get('/uploads/:filename', optionalAuth, (req, res, next) => {
    const safeName = path.basename(req.params.filename || '');
    if (!safeName || safeName.startsWith('.')) {
      return next(AppError.notFound('Media file not found'));
    }
    const targetUrl = `/uploads/${safeName}`;
    const owningItem = Array.from(db.items.values()).find(
      item => Array.isArray(item.raw_media_urls) && item.raw_media_urls.includes(targetUrl)
    );
    if (owningItem && owningItem.user_id && owningItem.user_id !== 'anon_session') {
      if (!req.user) {
        return next(AppError.unauthorized('Authentication required to access private item photo'));
      }
      if (owningItem.user_id !== req.user.userId && req.user.role !== 'admin') {
        return next(AppError.forbidden('You do not own this media file'));
      }
    }

    const filePath = path.resolve(ENV.LOCAL_UPLOAD_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      return next(AppError.notFound('Media file not found'));
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(filePath);
  });

  // Honest health check & status
  app.get('/health', (req, res) => {
    const v1Features = [
      'core_decision_engine',
      'ai_vision_honest_fallback',
      'exif_stripped_uploads',
      'fair_price_shield',
      'repair_or_release_matrix',
      'ewaste_authorised_routing',
      'p2p_listing_generator',
      'marketplace_scam_shield',
      'where_does_this_go_lookup',
      'hyperlocal_matching'
    ];
    const v2Features = ENV.ENABLE_V2_MODULES
      ? ['partner_terminal', 'instant_upi_payouts', 'circular_rewards_points', 'async_job_queue']
      : [];

    res.status(200).json({
      status: 'UP',
      service: 'Rekart Backend Core',
      timestamp: new Date().toISOString(),
      version: pkg.version,
      active_pilot_city: 'Nagpur',
      persistence: db.getPersistenceStatus(),
      v2_modules_enabled: ENV.ENABLE_V2_MODULES,
      features: [...v1Features, ...v2Features]
    });
  });

  // Seed baseline data (only populates missing baseline partners/benchmarks; preserves existing user items)
  await seedNagpurData();

  // API v1 Routes — every route group throttled by shared repository rate limiter
  const MIN = 60 * 1000;
  app.use('/api/v1/auth', rateLimit({ windowMs: 15 * MIN, max: 30, keyPrefix: 'auth' }), authRoutes);
  app.use('/api/v1/vision', rateLimit({ windowMs: 10 * MIN, max: 30, keyPrefix: 'vision' }), visionRoutes);
  app.use('/api/v1/decide', rateLimit({ windowMs: 10 * MIN, max: 60, keyPrefix: 'decide' }), decisionRoutes);
  app.use('/api/v1/triage', rateLimit({ windowMs: 10 * MIN, max: 60, keyPrefix: 'triage' }), triageRoutes);
  app.use('/api/v1/calc', rateLimit({ windowMs: 10 * MIN, max: 60, keyPrefix: 'calc' }), calculationRoutes);
  app.use('/api/v1/routing', rateLimit({ windowMs: 10 * MIN, max: 60, keyPrefix: 'routing' }), routingRoutes);
  app.use('/api/v1/partner', rateLimit({ windowMs: 10 * MIN, max: 60, keyPrefix: 'partner' }), partnerRoutes);
  app.use('/api/v1/payment', rateLimit({ windowMs: 10 * MIN, max: 30, keyPrefix: 'payment' }), paymentRoutes);
  app.use('/api/v1/jobs', rateLimit({ windowMs: 10 * MIN, max: 60, keyPrefix: 'jobs' }), jobRoutes);
  app.use('/api/v1/repair', rateLimit({ windowMs: 10 * MIN, max: 60, keyPrefix: 'repair' }), repairRoutes);
  app.use('/api/v1/selling', rateLimit({ windowMs: 10 * MIN, max: 60, keyPrefix: 'selling' }), sellingRoutes);
  app.use('/api/v1/reuse', rateLimit({ windowMs: 10 * MIN, max: 60, keyPrefix: 'reuse' }), reuseRoutes);
  app.use('/api/v1/rewards', rateLimit({ windowMs: 10 * MIN, max: 60, keyPrefix: 'rewards' }), rewardsRoutes);
  app.use('/api/v1/recycling', rateLimit({ windowMs: 10 * MIN, max: 60, keyPrefix: 'recycling' }), recyclingRoutes);
  app.use('/api/v1/ai', rateLimit({ windowMs: 10 * MIN, max: 20, keyPrefix: 'ai' }), aiRoutes);

  // Unknown API routes return typed 404 JSON
  app.use('/api', (req, res, next) => {
    next(AppError.notFound('API endpoint not found'));
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

// Vercel's Express runtime picks src/app.js as the entrypoint and serves its default export.
const app = await createApp();
export default app;
