import { AuthService } from '../services/auth/auth_service.js';
import { ENV } from '../config/env.js';
import { db } from '../db/connection.js';

export function parseCookies(cookieHeader = '') {
  const cookies = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      cookies[k] = decodeURIComponent(v);
    } catch {
      cookies[k] = v;
    }
  }
  return cookies;
}

export function extractAuthToken(req) {
  const authHeader = req.headers?.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers?.cookie);
  return cookies.rekart_session || null;
}

export function setSessionCookie(res, token, maxAgeSeconds = 7 * 24 * 60 * 60) {
  if (typeof res.cookie === 'function') {
    res.cookie('rekart_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: ENV.IS_PRODUCTION,
      path: '/',
      maxAge: maxAgeSeconds * 1000
    });
  } else if (typeof res.set === 'function') {
    const flags = [`rekart_session=${encodeURIComponent(token)}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
    if (ENV.IS_PRODUCTION) flags.push('Secure');
    res.set('Set-Cookie', flags.join('; '));
  }
}

export function clearSessionCookie(res) {
  if (typeof res.clearCookie === 'function') {
    res.clearCookie('rekart_session', { path: '/' });
  } else if (typeof res.set === 'function') {
    res.set('Set-Cookie', 'rekart_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  }
}

function sendAuthError(res, req, status, code, message) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      status,
      request_id: req.requestId || null
    }
  });
}

export async function authenticateToken(req, res, next) {
  const token = extractAuthToken(req);

  if (!token) {
    return sendAuthError(res, req, 401, 'UNAUTHORIZED', 'Access token required. Please log in or start a session.');
  }

  const payload = AuthService.verifyToken(token);
  if (!payload) {
    return sendAuthError(res, req, 403, 'INVALID_TOKEN', 'Invalid or expired token.');
  }

  if (payload.jti && (await db.isTokenRevoked(payload.jti))) {
    return sendAuthError(res, req, 401, 'TOKEN_REVOKED', 'Session has been logged out.');
  }

  req.user = payload;
  next();
}

export async function optionalAuth(req, res, next) {
  const token = extractAuthToken(req);
  if (token) {
    const payload = AuthService.verifyToken(token);
    if (payload && (!payload.jti || !(await db.isTokenRevoked(payload.jti)))) {
      req.user = payload;
    }
  }
  next();
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendAuthError(res, req, 401, 'UNAUTHORIZED', 'Authentication required');
    }
    if (!allowedRoles.includes(req.user.role) && req.user.role !== 'admin') {
      return sendAuthError(res, req, 403, 'FORBIDDEN', 'Forbidden: insufficient permissions');
    }
    next();
  };
}
