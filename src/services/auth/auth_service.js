import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from '../../db/connection.js';
import { ENV } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';

// Precomputed bcrypt hash used when email does not exist so login timing does not leak account existence.
const DUMMY_BCRYPT_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8u1S/j4H3x1k/h4o4xA9qQ4zM8U4uK';

export class AuthService {
  static async register({ email, password, full_name, phone = null, role = 'donor', partner_id = null, city = 'Nagpur' }) {
    const existing = await db.findUserByEmail(email);
    if (existing) {
      throw AppError.conflict('User already exists with this email');
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const user = await db.createUser({
      email,
      password_hash,
      full_name,
      phone,
      role,
      partner_id,
      city
    });

    const token = this.generateToken(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        partner_id: user.partner_id,
        city: user.city
      },
      token
    };
  }

  static async login({ email, password }) {
    const user = await db.findUserByEmail(email);
    const hashToCheck = user ? user.password_hash : DUMMY_BCRYPT_HASH;
    const isMatch = await bcrypt.compare(password, hashToCheck);

    if (!user || !isMatch) {
      throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const token = this.generateToken(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        partner_id: user.partner_id,
        city: user.city
      },
      token
    };
  }

  static createAnonymousSession() {
    const anonId = `anon_${crypto.randomUUID()}`;
    const token = jwt.sign(
      {
        jti: crypto.randomUUID(),
        userId: anonId,
        email: null,
        role: 'anonymous',
        partnerId: null
      },
      ENV.JWT_SECRET,
      { expiresIn: '24h' }
    );
    return {
      user: {
        id: anonId,
        role: 'anonymous',
        city: 'Nagpur'
      },
      token
    };
  }

  static generateToken(user) {
    return jwt.sign(
      {
        jti: crypto.randomUUID(),
        userId: user.id,
        email: user.email,
        role: user.role,
        partnerId: user.partner_id || null
      },
      ENV.JWT_SECRET,
      { expiresIn: ENV.JWT_EXPIRES_IN }
    );
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, ENV.JWT_SECRET);
    } catch {
      return null;
    }
  }
}
