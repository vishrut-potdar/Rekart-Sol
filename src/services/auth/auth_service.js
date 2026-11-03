import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../../db/connection.js';
import { ENV } from '../../config/env.js';

export class AuthService {
  static async register({ email, password, full_name, phone = null, role = 'donor', partner_id = null, city = 'Nagpur' }) {
    const existing = await db.findUserByEmail(email);
    if (existing) {
      const err = new Error('User already exists with this email');
      err.status = 409;
      throw err;
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
    if (!user) {
      const err = new Error('Invalid email or password');
      err.status = 401;
      throw err;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const err = new Error('Invalid email or password');
      err.status = 401;
      throw err;
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

  static generateToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        partnerId: user.partner_id
      },
      ENV.JWT_SECRET,
      { expiresIn: ENV.JWT_EXPIRES_IN }
    );
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, ENV.JWT_SECRET);
    } catch (err) {
      return null;
    }
  }
}
