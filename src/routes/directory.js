// src/routes/directory.js

import express from 'express';

import {
  requireAuth,
  requireRole,
} from '../middleware/auth.js';

import {
  listAuthorizedDirectPeers,
} from '../lib/directMessageAccess.js';

const router =
  express.Router();

router.get(
  '/',

  requireAuth,

  requireRole([
    'admin',
    'developer',
    'client',
  ]),

  async (
    req,
    res,
    next,
  ) => {
    try {
      const users =
        await listAuthorizedDirectPeers(
          req.user,
        );

      return res.json({
        users,
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
