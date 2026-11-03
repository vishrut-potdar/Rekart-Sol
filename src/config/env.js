import dotenv from 'dotenv';
// Tests use built-in defaults, never a developer's local .env (keys would make them hit live APIs).
if (!process.env.NODE_TEST_CONTEXT) dotenv.config();

export const ENV = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || '',
  USE_POSTGRES: process.env.USE_POSTGRES === 'true' && Boolean(process.env.DATABASE_URL),
  
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
  JWT_SECRET: process.env.JWT_SECRET || 'rekart_dev_jwt_secret_key_nagpur_2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // Multimodal AI Vision Provider
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-5.5', // any vision-capable OpenRouter model
  VISION_AI_PROVIDER: process.env.VISION_AI_PROVIDER || (process.env.OPENROUTER_API_KEY ? 'openrouter' : process.env.GEMINI_API_KEY ? 'gemini' : 'heuristic'),

  // Payment & Payouts (Razorpay / Cashfree / Sandbox)
  PAYMENT_MODE: process.env.PAYMENT_MODE || 'sandbox', // 'sandbox' or 'live'
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'sandbox_secret_key_rekart'
};
