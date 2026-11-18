import dotenv from 'dotenv';
// Tests use built-in defaults, never a developer's local .env (keys would make them hit live APIs).
if (!process.env.NODE_TEST_CONTEXT) dotenv.config();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Dev defaults are published in this repo, so production must supply its own secrets.
export function requireSecret(name, devDefault, { env = process.env, production = IS_PRODUCTION } = {}) {
  if (env[name]) return env[name];
  if (production) throw new Error(`${name} must be set in production`);
  return devDefault;
}

export const ENV = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION,
  // Comma-separated origins allowed to call the API cross-origin. Unset: same-origin only in production, any origin in dev.
  CORS_ORIGINS: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  // Password for the seeded demo accounts in production. Unset: no demo accounts are created there.
  SEED_DEMO_PASSWORD: process.env.SEED_DEMO_PASSWORD || '',
  DATABASE_URL: process.env.DATABASE_URL || '',
  USE_POSTGRES: process.env.USE_POSTGRES === 'true' && Boolean(process.env.DATABASE_URL),

  // Firebase Firestore Persistence (preferred cloud DB) & Local Disk Persistence
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || '',
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
  FIREBASE_PRIVATE_KEY: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL || '',
  DATA_FILE_PATH: process.env.DATA_FILE_PATH || (process.env.VERCEL ? '/tmp/rekart-db.json' : './.data/rekart-db.json'),

  // Feature Flag for Non-v1 Modules (payments, partner terminal, rewards, async queue)
  ENABLE_V2_MODULES: process.env.ENABLE_V2_MODULES
    ? process.env.ENABLE_V2_MODULES === 'true'
    : Boolean(process.env.NODE_TEST_CONTEXT || !IS_PRODUCTION),

  // Storage (S3 / Cloudflare R2 / MinIO or local)
  STORAGE_MODE: process.env.STORAGE_MODE || 'local', // 'local' or 's3'
  S3_BUCKET: process.env.S3_BUCKET || 'rekart-assets-nagpur',
  S3_REGION: process.env.AWS_REGION || 'ap-south-1',
  S3_ENDPOINT: process.env.S3_ENDPOINT || '',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
  // Vercel's filesystem is read-only except /tmp
  LOCAL_UPLOAD_DIR: process.env.LOCAL_UPLOAD_DIR || (process.env.VERCEL ? '/tmp/uploads' : './uploads'),
  DEFAULT_CITY: process.env.DEFAULT_CITY || 'nagpur',

  // Authentication & Security
  JWT_SECRET: requireSecret('JWT_SECRET', 'rekart_dev_jwt_secret_key_nagpur_2026'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  PROOF_SIGNING_SECRET: process.env.PROOF_SIGNING_SECRET || process.env.JWT_SECRET || 'rekart_dev_proof_hmac_secret_2026',

  // Multimodal AI Vision Provider & Quotas
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-5.5', // any vision-capable OpenRouter model
  VISION_AI_PROVIDER: process.env.VISION_AI_PROVIDER || (process.env.OPENROUTER_API_KEY ? 'openrouter' : process.env.GEMINI_API_KEY ? 'gemini' : 'heuristic'),
  AI_TIMEOUT_MS: parseInt(process.env.AI_TIMEOUT_MS || '15000', 10),
  DAILY_AI_QUOTA_PER_USER: parseInt(process.env.DAILY_AI_QUOTA_PER_USER || '25', 10),

  // Payment & Payouts (Razorpay / Cashfree / Sandbox)
  PAYMENT_MODE: process.env.PAYMENT_MODE || 'sandbox', // 'sandbox' or 'live'
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  // No published default in production: with no secret set, webhooks are rejected.
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || (IS_PRODUCTION ? '' : 'sandbox_secret_key_rekart')
};
