// src/routes/directory.js

import express from 'express';

import User from '../models/User.js';

import {
  requireAuth,
  requireRole,
} from '../middleware/auth.js';

import {
  presentPresence,
} from '../lib/presence.js';

const router =
  express.Router();

router.get(
  '/',

  requireAuth,

  requireRole([
    'admin',
    'developer',
  ]),

  async (
    req,
    res,
    next,
  ) => {
    try {
      const roles =
        req.user.role ===
        'admin'
          ? [
              'admin',
              'developer',
              'client',
            ]
          : [
              'admin',
              'developer',
            ];

      const rows =
        await User.find({
          role: {
            $in:
              roles,
          },

          status:
            'active',

          accountStatus: {
            $ne:
              'suspended',
          },
        })
          .select(
            '_id name email role status accountStatus avatarUrl avatarPath lastSeenAt',
          )
          .sort({
            role: 1,
            name: 1,
          })
          .lean();

      const users =
        rows.map(
          (user) => ({
            ...user,

            presence:
              presentPresence(
                user,
              ),

            online:
              presentPresence(
                user,
              ).online,
          }),
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