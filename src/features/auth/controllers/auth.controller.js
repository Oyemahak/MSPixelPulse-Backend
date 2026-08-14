// backend/src/features/auth/controllers/auth.controller.js
import jwt from 'jsonwebtoken';
import { jwtSecret, signToken } from '../../../utils/jwt.js';
import { boolEnv, isProduction } from '../../../config/env.js';
import { cleanPublicUrl, cleanText, isValidEmail, normalizeEmail } from '../../../lib/validation.js';
import { presentUser } from '../../../lib/presentUser.js';
import { accountAccessState } from '../../../lib/accountPolicy.js';
import { usersRepository } from '../../../repositories/users.repository.js';

const COOKIE_NAME = 'token';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction() || boolEnv('COOKIE_SECURE', false),
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
};

function getToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  if (req.cookies?.[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  return null;
}

// POST /api/auth/register
export async function register(req, res) {
  const {
    name = '',
    email = '',
    password = '',
    phone = '',
    businessName = '',
    businessWebsite = '',
    industry = '',
    projectContactPreference = '',
  } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const safeName = cleanText(name, 120);
  if (!safeName || !isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: 'A valid name and email are required' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return res.status(400).json({ message: 'Password must be between 8 and 72 characters' });
  }
  const website = businessWebsite ? cleanPublicUrl(businessWebsite) : '';
  if (businessWebsite && !website) {
    return res.status(400).json({ message: 'Business website must be a valid http or https URL' });
  }

  const exists = await usersRepository.findByEmail(normalizedEmail);
  if (exists) return res.status(409).json({ message: 'Email already in use' });

  const user = await usersRepository.create({
    name: safeName,
    email: normalizedEmail,
    password,
    // Public registration is always an applicant request for client access.
    // Privileged roles are created or assigned only by an existing Admin.
    role: 'client',
    status: 'pending',
    accountStatus: 'pending',
    phone: cleanText(phone, 40),
    businessName: cleanText(businessName, 160),
    businessWebsite: website,
    industry: cleanText(industry, 120),
    projectContactPreference: cleanText(projectContactPreference, 2000),
    accessApplication: {
      status: 'pending',
      requestedRole: 'client',
      submittedAt: new Date(),
    },
  });

  res.status(201).json({ user });
}

// POST /api/auth/login
export async function login(req, res) {
  try {
    const { email = '', password = '' } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await usersRepository.verifyCredentials(normalizedEmail, password);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    if (!accountAccessState(user).allowed) {
      return res.status(403).json({ message: 'Account is not active. Please contact an administrator.' });
    }

    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTS);

    const safe = await presentUser(await usersRepository.findById(user._id));
    return res.json({ token, user: safe });
  } catch (err) {
    console.error('Login error:', err.code || 'LOGIN_FAILURE');
    return res.status(err.status || 500).json({ message: 'Login failed' });
  }
}

// POST /api/auth/logout
export async function logout(_req, res) {
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTS, maxAge: 0 });
  res.json({ ok: true });
}

// GET /api/auth/me
export async function me(req, res) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const payload = jwt.verify(token, jwtSecret());
    const user = await usersRepository.findById(payload.id || payload.sub);
    if (
      !accountAccessState(user).allowed ||
      Number(payload.ver || 0) !== Number(user.authVersion || 0)
    ) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    res.json({ user: await presentUser(user) });
  } catch {
    res.status(401).json({ message: 'Unauthorized' });
  }
}
