import { db } from '../db/connection.js';

/**
 * Shared fixed-window limiter backed by the repository store.
 * Uses userId when authenticated, falling back to req.ip.
 */
export function rateLimit({ windowMs, max, keyPrefix = 'global' }) {
  return (req, res, next) => {
    const identity = req.user?.userId || req.ip || 'unknown';
    const key = `${keyPrefix}:${identity}`;
    const result = db.checkRateLimitSync(key, windowMs, max);
    if (!result.allowed) {
      res.set('Retry-After', String(result.retryAfter));
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again shortly.',
          status: 429,
          retry_after: result.retryAfter,
          request_id: req.requestId || null
        }
      });
    }
    next();
  };
}
