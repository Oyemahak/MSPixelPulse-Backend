// src/middleware/auth.js

import jwt from "jsonwebtoken";

import {
  accountAccessState,
} from "../lib/accountPolicy.js";

import {
  requiredEnv,
} from "../config/env.js";

import {
  usersRepository,
} from "../repositories/users.repository.js";

const AUTH_CACHE_TTL_MS = 30_000;
const AUTH_STALE_GRACE_MS = 90_000;
const AUTH_CACHE_MAX = 500;

const authCache = new Map();

function getCookieToken(req) {
  const cookieHeader = String(
    req.headers?.cookie || "",
  );

  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] =
      cookie.trim().split("=");

    if (name === "token") {
      return decodeURIComponent(
        valueParts.join("="),
      );
    }
  }

  return "";
}

function getBearerToken(req) {
  const value = String(
    req.headers?.authorization || "",
  ).trim();

  if (
    value.toLowerCase().startsWith("bearer ")
  ) {
    return value.slice(7).trim();
  }

  return "";
}

function getRequestToken(req) {
  return (
    getBearerToken(req) ||
    getCookieToken(req)
  );
}

function jwtSecret() {
  return requiredEnv("JWT_SECRET");
}

function authVersion(value) {
  const version = Number(
    value ?? 0,
  );

  return Number.isFinite(version)
    ? version
    : 0;
}

function cacheKey(id) {
  return String(id || "");
}

function pruneCache() {
  if (
    authCache.size < AUTH_CACHE_MAX
  ) {
    return;
  }

  const ordered =
    [...authCache.entries()].sort(
      (
        [, left],
        [, right],
      ) =>
        Number(left?.storedAt || 0) -
        Number(right?.storedAt || 0),
    );

  const removeCount = Math.max(
    1,
    Math.ceil(
      ordered.length * 0.2,
    ),
  );

  for (
    const [key] of ordered.slice(
      0,
      removeCount,
    )
  ) {
    authCache.delete(key);
  }
}

function rememberUser(user) {
  const id = cacheKey(
    user?._id || user?.id,
  );

  if (!id) {
    return user;
  }

  pruneCache();

  authCache.set(id, {
    user,
    storedAt: Date.now(),
  });

  return user;
}

function getCachedUser(
  id,
  maxAge = AUTH_CACHE_TTL_MS,
) {
  const entry =
    authCache.get(
      cacheKey(id),
    );

  if (!entry?.user) {
    return null;
  }

  if (
    Date.now() -
      Number(entry.storedAt || 0) >
    maxAge
  ) {
    return null;
  }

  return entry.user;
}

export function invalidateAuthUser(
  id,
) {
  authCache.delete(
    cacheKey(id),
  );
}

export function clearAuthCache() {
  authCache.clear();
}

async function validateSession(
  payload,
) {
  const id = payload?.id;

  if (!id) {
    return null;
  }

  const tokenVersion =
    authVersion(
      payload.ver,
    );

  /*
   * Fast path:
   * JWT is still cryptographically verified on every request,
   * but an already validated user does not need another
   * Google Sheets read for every API call.
   */
  const cached =
    getCachedUser(id);

  if (
    cached &&
    authVersion(
      cached.authVersion,
    ) === tokenVersion
  ) {
    const access =
      accountAccessState(
        cached,
      );

    return access.allowed
      ? cached
      : null;
  }

  try {
    let user =
      await usersRepository.findById(
        id,
      );

    /*
     * A version mismatch is security-sensitive.
     * Confirm it against a fresh provider read.
     */
    if (
      user &&
      authVersion(
        user.authVersion,
      ) !== tokenVersion
    ) {
      user =
        await usersRepository.findById(
          id,
          {
            fresh: true,
          },
        );
    }

    if (!user) {
      return null;
    }

    if (
      authVersion(
        user.authVersion,
      ) !== tokenVersion
    ) {
      return null;
    }

    const access =
      accountAccessState(
        user,
      );

    if (!access.allowed) {
      return null;
    }

    return rememberUser(user);
  } catch (error) {
    /*
     * If Google has a brief outage, keep an already validated
     * session usable for a tightly bounded grace period.
     *
     * We still require:
     * - a previously validated user
     * - matching authVersion
     * - an active account
     */
    const stale =
      getCachedUser(
        id,
        AUTH_STALE_GRACE_MS,
      );

    if (
      stale &&
      authVersion(
        stale.authVersion,
      ) === tokenVersion &&
      accountAccessState(
        stale,
      ).allowed
    ) {
      return stale;
    }

    throw error;
  }
}

export async function requireAuth(
  req,
  res,
  next,
) {
  const token =
    getRequestToken(req);

  if (!token) {
    return res
      .status(401)
      .json({
        message: "Unauthorized",
      });
  }

  let payload;

  try {
    payload = jwt.verify(
      token,
      jwtSecret(),
    );
  } catch {
    return res
      .status(401)
      .json({
        message: "Unauthorized",
      });
  }

  try {
    const user =
      await validateSession(
        payload,
      );

    if (!user) {
      return res
        .status(401)
        .json({
          message: "Unauthorized",
        });
    }

    req.user = user;

    req.auth = {
      token,
      payload,
    };

    return next();
  } catch (error) {
    console.error(
      "Authentication provider unavailable:",
      error?.message || error,
    );

    return res
      .status(503)
      .json({
        message:
          "Authentication service is temporarily unavailable",

        code:
          "AUTH_PROVIDER_UNAVAILABLE",
      });
  }
}

export async function optionalAuth(
  req,
  _res,
  next,
) {
  const token =
    getRequestToken(req);

  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(
      token,
      jwtSecret(),
    );

    const user =
      await validateSession(
        payload,
      );

    if (user) {
      req.user = user;

      req.auth = {
        token,
        payload,
      };
    }
  } catch {
    /*
     * Public/optional-auth requests should not fail because
     * authentication infrastructure had a temporary issue.
     */
  }

  return next();
}

export function requireRole(
  roles,
) {
  const allowed =
    new Set(
      (
        Array.isArray(roles)
          ? roles
          : [roles]
      )
        .filter(Boolean)
        .map(String),
    );

  return (
    req,
    res,
    next,
  ) => {
    if (
      !req.user ||
      !allowed.has(
        String(
          req.user.role || "",
        ),
      )
    ) {
      return res
        .status(403)
        .json({
          message: "Forbidden",
        });
    }

    return next();
  };
}