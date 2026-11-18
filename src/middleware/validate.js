import { AppError } from '../utils/errors.js';

/**
 * Express middleware that validates req.body, req.query, and req.params against Zod schemas.
 */
export function validate({ body, query, params } = {}) {
  return (req, res, next) => {
    try {
      if (params) {
        const parsed = params.safeParse(req.params || {});
        if (!parsed.success) {
          return next(formatZodError(parsed.error, 'Invalid route parameters'));
        }
        req.params = parsed.data;
      }

      if (query) {
        const parsed = query.safeParse(req.query || {});
        if (!parsed.success) {
          return next(formatZodError(parsed.error, 'Invalid query parameters'));
        }
        req.query = parsed.data;
      }

      if (body) {
        const parsed = body.safeParse(req.body || {});
        if (!parsed.success) {
          return next(formatZodError(parsed.error, 'Invalid request body'));
        }
        req.body = parsed.data;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

function formatZodError(zodError, prefix) {
  const issues = (zodError?.issues || []).map(issue => ({
    path: issue.path?.join('.') || 'body',
    message: issue.message
  }));
  const firstMsg = issues[0] ? `${issues[0].path}: ${issues[0].message}` : prefix;
  return AppError.badRequest(`${prefix} (${firstMsg})`, 'VALIDATION_ERROR', issues);
}
