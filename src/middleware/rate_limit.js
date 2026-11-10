// Fixed-window limiter keyed by client IP.
// ponytail: in-memory, so each server instance counts separately (weak on serverless).
// Move the counters to Postgres/Redis once the app runs on more than one instance.
export function rateLimit({ windowMs, max }) {
  const hits = new Map(); // ip -> { count, resetAt }
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 10000) for (const [ip, h] of hits) if (h.resetAt <= now) hits.delete(ip);
    let h = hits.get(req.ip);
    if (!h || h.resetAt <= now) hits.set(req.ip, (h = { count: 0, resetAt: now + windowMs }));
    if (++h.count > max) {
      const retryAfter = Math.ceil((h.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, error: 'Too many requests. Please try again shortly.', retry_after: retryAfter });
    }
    next();
  };
}
