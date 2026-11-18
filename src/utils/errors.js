/**
 * Typed application error with consistent HTTP status, machine-readable code,
 * and safe error message formatting.
 */
export class AppError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details = null } = {}) {
    super(String(message || 'Internal server error'));
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, code = 'VALIDATION_ERROR', details = null) {
    return new AppError(message, { status: 400, code, details });
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new AppError(message, { status: 401, code });
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN') {
    return new AppError(message, { status: 403, code });
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(message, { status: 404, code });
  }

  static conflict(message, code = 'CONFLICT') {
    return new AppError(message, { status: 409, code });
  }

  static unsupportedMedia(message = 'Unsupported media type', code = 'UNSUPPORTED_MEDIA_TYPE') {
    return new AppError(message, { status: 415, code });
  }

  static tooManyRequests(message = 'Too many requests. Please try again shortly.', code = 'RATE_LIMITED', details = null) {
    return new AppError(message, { status: 429, code, details });
  }

  static featureDisabled(featureName) {
    return new AppError(`${featureName} is disabled in v1 mode`, {
      status: 404,
      code: 'FEATURE_DISABLED_IN_V1'
    });
  }
}

/**
 * Strip HTML angle brackets / control characters before returning any user-derived identifier in messages.
 */
export function sanitizeErrorText(value, maxLen = 120) {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, maxLen);
}
