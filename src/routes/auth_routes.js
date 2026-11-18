import express from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth/auth_service.js';
import { authenticateToken, setSessionCookie, clearSessionCookie } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { db } from '../db/connection.js';
import { AppError } from '../utils/errors.js';
import { MediaStorageService } from '../services/vision/media_storage.js';

const router = express.Router();

const RegisterSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  full_name: z.string().trim().min(1).max(150),
  phone: z.string().trim().max(20).optional().nullable(),
  city: z.string().trim().max(100).optional().default('Nagpur')
});

const LoginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128)
});

// Register new donor (public sign-up ignores role/partner_id)
router.post('/register', validate({ body: RegisterSchema }), async (req, res, next) => {
  try {
    const { email, password, full_name, phone, city } = req.body;
    const result = await AuthService.register({
      email,
      password,
      full_name,
      phone,
      role: 'donor',
      city
    });
    setSessionCookie(res, result.token);
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Login
router.post('/login', validate({ body: LoginSchema }), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await AuthService.login({ email, password });
    setSessionCookie(res, result.token);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Start an anonymous browser session (httpOnly cookie) for v1 scan/decide/AI flow
router.post('/anonymous', (req, res) => {
  const session = AuthService.createAnonymousSession();
  setSessionCookie(res, session.token, 24 * 60 * 60);
  return res.status(200).json({ success: true, data: session });
});

// Logout & revoke current token
router.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    if (req.user?.jti) {
      const expIso = req.user.exp ? new Date(req.user.exp * 1000).toISOString() : null;
      await db.revokeToken(req.user.jti, expIso);
    }
    clearSessionCookie(res);
    return res.status(200).json({ success: true, data: { logged_out: true } });
  } catch (err) {
    next(err);
  }
});

// Current user profile
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    if (req.user.role === 'anonymous') {
      return res.status(200).json({
        success: true,
        data: { id: req.user.userId, role: 'anonymous', city: 'Nagpur' }
      });
    }
    const user = await db.findUserById(req.user.userId);
    if (!user) {
      throw AppError.notFound('User not found');
    }
    const { password_hash, ...safeUser } = user;
    return res.status(200).json({ success: true, data: safeUser });
  } catch (err) {
    next(err);
  }
});

// DPDP Act 2023: Export my personal data & items
router.get('/my-data', authenticateToken, async (req, res, next) => {
  try {
    const exported = await db.exportUserData(req.user.userId);
    return res.status(200).json({ success: true, data: exported });
  } catch (err) {
    next(err);
  }
});

// DPDP Act 2023: Delete my data & uploaded photos
router.delete('/me', authenticateToken, async (req, res, next) => {
  try {
    const deleted = await db.deleteUserData(req.user.userId);
    for (const key of deleted.media_keys) {
      MediaStorageService.deleteLocalMedia(key);
    }
    if (req.user?.jti) {
      await db.revokeToken(req.user.jti);
    }
    clearSessionCookie(res);
    return res.status(200).json({
      success: true,
      data: {
        deleted: true,
        summary: {
          items_removed: deleted.deleted_items,
          decisions_removed: deleted.deleted_decisions,
          media_files_removed: deleted.media_keys.length
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
