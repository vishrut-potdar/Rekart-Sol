import { ENV } from '../config/env.js';
import { sanitizeErrorText } from '../utils/errors.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.requestId || null;
  const status = Number(err?.status) || (err?.type === 'entity.too.large' ? 413 : 500);
  const code = err?.code || (status === 404 ? 'NOT_FOUND' : status === 400 ? 'BAD_REQUEST' : status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 409 ? 'CONFLICT' : status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : status === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR');

  console.error(JSON.stringify({
    level: status >= 500 ? 'error' : 'warn',
    timestamp: new Date().toISOString(),
    request_id: requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    status,
    code,
    message: err?.message || 'Unknown error'
  }));

  const safeMessage = status >= 500 && ENV.IS_PRODUCTION
    ? 'Internal server error'
    : status >= 500
      ? 'Internal server error'
      : sanitizeErrorText(err?.message || 'Request failed', 300);

  const errorBody = {
    code,
    message: safeMessage,
    status,
    request_id: requestId
  };

  if (status < 500 && err?.details) {
    errorBody.details = err.details;
  }

  return res.status(status).json({
    success: false,
    error: errorBody
  });
}
