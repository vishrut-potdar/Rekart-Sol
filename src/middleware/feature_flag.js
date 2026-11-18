import { ENV } from '../config/env.js';
import { AppError } from '../utils/errors.js';

/**
 * Gates non-v1 endpoints behind ENV.ENABLE_V2_MODULES so they can be cleanly
 * disabled in v1 production while keeping fixed implementations tested.
 */
export function requireV2Module(moduleName) {
  return (req, res, next) => {
    if (!ENV.ENABLE_V2_MODULES) {
      return next(AppError.featureDisabled(moduleName));
    }
    next();
  };
}
