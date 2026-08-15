// src/features/auth/routes/index.js

import { Router } from 'express';

import {
  login,
  logout,
  me,
  register,
} from '../controllers/auth.controller.js';

import {
  requireAuth,
} from '../../../middleware/auth.js';

const router = Router();

router.post(
  '/login',
  login,
);

router.post(
  '/logout',
  logout,
);

router.get(
  '/me',
  requireAuth,
  me,
);

router.post(
  '/register',
  register,
);

export default router;