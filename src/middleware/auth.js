// src/middleware/auth.js

import jwt from 'jsonwebtoken';

import { jwtSecret } from '../utils/jwt.js';
import { isPortalAccountActive } from '../lib/accountPolicy.js';
import { usersRepository } from '../repositories/users.repository.js';

function getToken(req) {
  const header =
    req.headers.authorization;

  if (
    header?.startsWith(
      'Bearer ',
    )
  ) {
    return header.slice(7);
  }

  if (req.cookies?.token) {
    return req.cookies.token;
  }

  return null;
}

function tokenVersion(payload) {
  return Number(
    payload?.ver || 0,
  );
}

function userVersion(user) {
  return Number(
    user?.authVersion || 0,
  );
}

function validSession(
  user,
  payload,
) {
  return Boolean(
    user &&
    isPortalAccountActive(user) &&
    tokenVersion(payload) ===
      userVersion(user),
  );
}

/*
 * Vercel serverless instances can temporarily hold different copies
 * of the bounded Google Sheets Users cache.
 *
 * Normal requests use the cached user record to avoid exhausting
 * Google Sheets read quotas.
 *
 * If that cached record says the JWT is stale/inactive, do ONE fresh
 * read before rejecting it. This handles:
 *
 * - password changes / authVersion bumps
 * - requests landing on an older Vercel instance
 * - recently reactivated accounts
 *
 * We never reject a valid token solely because one warm function
 * instance has an older Users cache snapshot.
 */
async function authenticatedUser(
  payload,
) {
  const userId =
    payload?.id ||
    payload?.sub;

  if (!userId) {
    return null;
  }

  const cached =
    await usersRepository.findById(
      userId,
    );

  if (
    validSession(
      cached,
      payload,
    )
  ) {
    return cached;
  }

  const fresh =
    await usersRepository.findById(
      userId,
      {
        fresh: true,
      },
    );

  if (
    validSession(
      fresh,
      payload,
    )
  ) {
    return fresh;
  }

  return null;
}

export async function requireAuth(
  req,
  res,
  next,
) {
  const token =
    getToken(req);

  if (!token) {
    return res
      .status(401)
      .json({
        message:
          'Unauthorized',
      });
  }

  let payload;

  try {
    payload =
      jwt.verify(
        token,
        jwtSecret(),
      );
  } catch {
    return res
      .status(401)
      .json({
        message:
          'Unauthorized',
      });
  }

  try {
    const user =
      await authenticatedUser(
        payload,
      );

    if (!user) {
      return res
        .status(401)
        .json({
          message:
            'Unauthorized',
        });
    }

    req.user =
      user;

    return next();
  } catch (error) {
    /*
     * Google/remote-provider failures are server availability
     * problems, not invalid credentials.
     *
     * Do not turn a Sheets timeout/quota/transient failure into
     * a misleading 401.
     */
    console.error(
      'Authentication provider lookup failed:',
      error?.code ||
        error?.message ||
        'unknown error',
    );

    return res
      .status(503)
      .json({
        message:
          'Authentication service is temporarily unavailable',
        code:
          'AUTH_PROVIDER_UNAVAILABLE',
      });
  }
}

export async function optionalAuth(
  req,
  _res,
  next,
) {
  const token =
    getToken(req);

  if (!token) {
    return next();
  }

  let payload;

  try {
    payload =
      jwt.verify(
        token,
        jwtSecret(),
      );
  } catch {
    return next();
  }

  try {
    const user =
      await authenticatedUser(
        payload,
      );

    if (user) {
      req.user =
        user;
    }
  } catch {
    /*
     * Optional authentication must not break public endpoints.
     */
  }

  return next();
}

export function requireRole(
  roles,
) {
  const allowed =
    Array.isArray(roles)
      ? roles
      : [roles];

  return (
    req,
    res,
    next,
  ) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            'Unauthorized',
        });
    }

    if (
      !allowed.includes(
        req.user.role,
      )
    ) {
      return res
        .status(403)
        .json({
          message:
            'Forbidden',
        });
    }

    return next();
  };
}

export const authMiddlewareInternals = {
  getToken,
  tokenVersion,
  userVersion,
  validSession,
};