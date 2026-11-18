import crypto from 'crypto';

export function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] && typeof req.headers['x-request-id'] === 'string'
    ? req.headers['x-request-id'].replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
    : crypto.randomUUID();

  req.requestId = requestId || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);

  res.on('finish', () => {
    if (process.env.NODE_TEST_CONTEXT) return;
    const durationMs = Date.now() - start;
    console.log(JSON.stringify({
      level: res.statusCode >= 500 ? 'error' : 'info',
      timestamp: new Date().toISOString(),
      request_id: req.requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      duration_ms: durationMs
    }));
  });

  next();
}
