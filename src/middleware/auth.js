import { AuthService } from '../services/auth/auth_service.js';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    // If running in development and no token provided, allow guest/mock user for backward-compatible developer calls
    if (req.headers['x-guest-user-id']) {
      req.user = {
        userId: req.headers['x-guest-user-id'],
        role: 'donor',
        email: 'guest@rekart.in'
      };
      return next();
    }
    return res.status(401).json({ success: false, error: 'Access token required. Please log in.' });
  }

  const payload = AuthService.verifyToken(token);
  if (!payload) {
    return res.status(403).json({ success: false, error: 'Invalid or expired token.' });
  }

  req.user = payload;
  next();
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (token) {
    const payload = AuthService.verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: `Forbidden: role '${req.user.role}' does not have required permissions`
      });
    }
    next();
  };
}
