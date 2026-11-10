import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from './config/env.js';
import { requestLogger } from './middleware/request_logger.js';
import { errorHandler } from './middleware/error_handler.js';
import authRoutes from './routes/auth_routes.js';
import visionRoutes from './routes/vision_routes.js';
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
import { rateLimit } from './middleware/rate_limit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp() {
  const app = express();

  // Basic Middlewares
  // Behind Vercel's proxy the client IP is in X-Forwarded-For; trust it only there, so it can't be spoofed elsewhere.
  if (process.env.VERCEL) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(cors({ origin: ENV.CORS_ORIGINS.length ? ENV.CORS_ORIGINS : !ENV.IS_PRODUCTION }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Static frontend: public/index.html is the main app, legacy.html the old portal, partner.html the terminal.
  // Locally Express serves it; on Vercel the CDN serves public/** directly.
  const publicDir = path.resolve(__dirname, '../public');
  app.use(express.static(publicDir));
  app.use('/uploads', express.static(path.resolve(ENV.LOCAL_UPLOAD_DIR), { setHeaders: res => res.set('X-Content-Type-Options', 'nosniff') }));

  // Health check & status
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'UP',
      service: 'Rekart Backend Core',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      active_pilot_city: 'Nagpur',
      features: [
        'ai_vision_decomposition',
        'dynamic_triage_trees',
        'fair_price_shield',
        'repair_or_release_matrix',
        'student_technician_layer',
        'shop_broadcast_comparator',
        'known_defects_warranty_check',
        'data_wipe_checklist',
        'marketplace_scam_shield',
        'p2p_listing_generator',
        'circular_rewards_points',
        'item_repurposing_library',
        'memory_vault_keep_outcome',
        'festive_cleanout_campaigns',
        'where_does_this_go_lookup',
        'hyperlocal_matching',
        'partner_terminal',
        'instant_upi_payouts',
        'jwt_rbac_auth',
        'async_job_queue'
      ]
    });
  });

  // Seed baseline data
  await seedNagpurData();

  // API v1 Routes
  // Public endpoints that cost money (AI calls, storage) or write data are throttled per IP.
  const MIN = 60 * 1000;
  app.use('/api/v1/auth', rateLimit({ windowMs: 15 * MIN, max: 20 }), authRoutes);
  app.use('/api/v1/vision', rateLimit({ windowMs: 10 * MIN, max: 30 }), visionRoutes);
  app.use('/api/v1/triage', triageRoutes);
  app.use('/api/v1/calc', calculationRoutes);
  app.use('/api/v1/routing', routingRoutes);
  app.use('/api/v1/partner', rateLimit({ windowMs: 10 * MIN, max: 60 }), partnerRoutes);
  app.use('/api/v1/payment', paymentRoutes);
  app.use('/api/v1/jobs', jobRoutes);
  app.use('/api/v1/repair', repairRoutes);
  app.use('/api/v1/selling', sellingRoutes);
  app.use('/api/v1/reuse', reuseRoutes);
  app.use('/api/v1/rewards', rateLimit({ windowMs: 10 * MIN, max: 60 }), rewardsRoutes);
  app.use('/api/v1/recycling', recyclingRoutes);
  app.use('/api/v1/ai', rateLimit({ windowMs: 10 * MIN, max: 20 }), aiRoutes);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

// Vercel's Express runtime picks src/app.js as the entrypoint and serves its default export.
const app = await createApp();
export default app;
