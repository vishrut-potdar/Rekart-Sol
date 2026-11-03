import express from 'express';
import { AuthService } from '../services/auth/auth_service.js';
import { authenticateToken } from '../middleware/auth.js';
import { db } from '../db/connection.js';

const router = express.Router();

// Register new user
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, full_name, phone, role, partner_id, city } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'email, password, and full_name are required' });
    }
    const result = await AuthService.register({
      email,
      password,
      full_name,
      phone,
      role: role || 'donor',
      partner_id,
      city: city || 'Nagpur'
    });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const result = await AuthService.login({ email, password });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Current user profile
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await db.findUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { password_hash, ...safeUser } = user;
    return res.status(200).json({ success: true, data: safeUser });
  } catch (err) {
    next(err);
  }
});

export default router;
