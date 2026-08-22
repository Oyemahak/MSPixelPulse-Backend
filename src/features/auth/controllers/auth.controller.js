// src/features/auth/controllers/auth.controller.js

import {
  boolEnv,
  isProduction,
} from '../../../config/env.js';

import {
  cleanPublicUrl,
  cleanText,
  isValidEmail,
  normalizeEmail,
} from '../../../lib/validation.js';

import {
  presentUser,
} from '../../../lib/presentUser.js';

import {
  accountAccessState,
} from '../../../lib/accountPolicy.js';

import {
  usersRepository,
} from '../../../repositories/users.repository.js';
import { emitPortalEvent } from '../../../lib/portalEvents.js';

const COOKIE_NAME =
  'token';

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',

  secure:
    isProduction() ||
    boolEnv(
      'COOKIE_SECURE',
      false,
    ),

  path: '/',

  maxAge:
    7 *
    24 *
    60 *
    60 *
    1000,
};

/*
 * POST /api/auth/register
 */
export async function register(
  req,
  res,
) {
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

  const normalizedEmail =
    normalizeEmail(email);

  const safeName =
    cleanText(
      name,
      120,
    );

  if (
    !safeName ||
    !isValidEmail(
      normalizedEmail,
    )
  ) {
    return res
      .status(400)
      .json({
        message:
          'A valid name and email are required',
      });
  }

  if (
    typeof password !==
      'string' ||
    password.length < 8 ||
    password.length > 72
  ) {
    return res
      .status(400)
      .json({
        message:
          'Password must be between 8 and 72 characters',
      });
  }

  const website =
    businessWebsite
      ? cleanPublicUrl(
          businessWebsite,
        )
      : '';

  if (
    businessWebsite &&
    !website
  ) {
    return res
      .status(400)
      .json({
        message:
          'Business website must be a valid http or https URL',
      });
  }

  const exists =
    await usersRepository.findByEmail(
      normalizedEmail,
    );

  if (exists) {
    return res
      .status(409)
      .json({
        message:
          'Email already in use',
      });
  }

  const user =
    await usersRepository.create({
      name:
        safeName,

      email:
        normalizedEmail,

      password,

      role:
        'client',

      status:
        'pending',

      accountStatus:
        'pending',

      phone:
        cleanText(
          phone,
          40,
        ),

      businessName:
        cleanText(
          businessName,
          160,
        ),

      businessWebsite:
        website,

      industry:
        cleanText(
          industry,
          120,
        ),

      projectContactPreference:
        cleanText(
          projectContactPreference,
          2000,
        ),

      accessApplication: {
        status:
          'pending',

        requestedRole:
          'client',

        submittedAt:
          new Date(),
      },
    });

  await emitPortalEvent({
    type: 'account_approval_requested', category: 'approvals', title: `New account approval request - ${safeName}`,
    message: 'A new client account application is awaiting Administrator review.', actor: user,
    relatedEntityType: 'User', relatedEntityId: String(user._id || user.id), actionUrl: '/admin/approvals',
    targets: { admins: true }, dedupeKey: `account-approval-request:${String(user._id || user.id)}`,
  });

  return res
    .status(201)
    .json({
      user,
    });
}

/*
 * POST /api/auth/login
 */
export async function login(
  req,
  res,
) {
  try {
    const {
      email = '',
      password = '',
    } = req.body || {};

    const normalizedEmail =
      String(
        email || '',
      )
        .trim()
        .toLowerCase();

    if (
      !normalizedEmail ||
      !password
    ) {
      return res
        .status(400)
        .json({
          message:
            'Email and password are required',
        });
    }

    const user =
      await usersRepository.verifyCredentials(
        normalizedEmail,
        password,
      );

    if (!user) {
      return res
        .status(401)
        .json({
          message:
            'Invalid credentials',
        });
    }

    if (
      !accountAccessState(
        user,
      ).allowed
    ) {
      return res
        .status(403)
        .json({
          message:
            'Account is not active. Please contact an administrator.',
        });
    }

    /*
     * Token creation remains here because login establishes the session.
     */
    const {
      signToken,
    } = await import(
      '../../../utils/jwt.js'
    );

    const token =
      signToken(user);

    res.cookie(
      COOKIE_NAME,
      token,
      COOKIE_OPTS,
    );

    /*
     * Force one authoritative user reread after authentication.
     * Login should return the same authVersion that was placed in
     * the newly-issued JWT.
     */
    const now =
      new Date().toISOString();

    const current =
      await usersRepository.updatePresence(
        user._id,
        {
          lastSeenAt: now,
          lastActivityAt: now,
          presenceState: 'online',
        },
      );

    const safe =
      await presentUser(
        current || user,
      );

    return res.json({
      token,
      user:
        safe,
    });
  } catch (error) {
    console.error(
      'Login error:',
      error?.code ||
        error?.message ||
        'LOGIN_FAILURE',
    );

    return res
      .status(
        error?.status ||
          500,
      )
      .json({
        message:
          'Login failed',
      });
  }
}

/*
 * POST /api/auth/logout
 */
export async function logout(
  req,
  res,
) {
  const userId =
    req.user?._id ||
    req.user?.id;

  if (userId) {
    const now =
      new Date().toISOString();

    await usersRepository
      .updatePresence(
        userId,
        {
          lastSeenAt: now,
          lastActivityAt: now,
          presenceState: 'offline',
        },
      )
      .catch(() => undefined);
  }

  res.clearCookie(
    COOKIE_NAME,
    {
      ...COOKIE_OPTS,
      maxAge: 0,
    },
  );

  return res.json({
    ok: true,
  });
}

/*
 * GET /api/auth/me
 *
 * requireAuth runs before this controller.
 *
 * Authentication, JWT validation, authVersion validation,
 * account-state validation, and stale Google Sheets cache
 * recovery are therefore handled centrally by middleware/auth.js.
 *
 * Do NOT independently verify the JWT here.
 */
export async function me(
  req,
  res,
) {
  if (!req.user) {
    return res
      .status(401)
      .json({
        message:
          'Unauthorized',
      });
  }

  return res.json({
    user:
      await presentUser(
        req.user,
      ),
  });
}
