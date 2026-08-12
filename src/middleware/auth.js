// backend/src/middleware/auth.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { jwtSecret } from "../utils/jwt.js";

function getToken(req) {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice(7);
  if (req.cookies?.token) return req.cookies.token;
  return null;
}

export async function requireAuth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const payload = jwt.verify(token, jwtSecret());
    const userId = payload.id || payload.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(userId).select("-password");
    if (!user || user.status !== "active" || user.accountStatus === "suspended") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

export async function optionalAuth(req, _res, next) {
  try {
    const token = getToken(req);
    if (!token) return next();
    const payload = jwt.verify(token, jwtSecret());
    const userId = payload.id || payload.sub;
    if (!userId) return next();
    const user = await User.findById(userId).select("-password");
    if (user?.status === "active" && user.accountStatus !== "suspended") req.user = user;
  } catch {
    // Public engagement remains available when an optional token is absent or stale.
  }
  return next();
}

export function requireRole(roles) {
  const allow = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    if (!allow.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}
