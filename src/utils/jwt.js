// src/utils/jwt.js – choose ONE shape and stick to it
import jwt from 'jsonwebtoken';
import { isProduction } from '../config/env.js';

export function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !String(secret).trim() || (isProduction() && secret === 'change-me')) {
    const err = new Error('JWT secret is not configured');
    err.status = 500;
    err.code = 'JWT_SECRET_MISSING';
    throw err;
  }
  return String(secret).trim();
}

export function signToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      ver: Number(user.authVersion || 0),
    },
    jwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}
