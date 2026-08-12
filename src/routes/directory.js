import express from "express";
import User from "../models/User.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Admins can contact active clients and team members. Developers only receive
// the active internal team directory.
router.get(
  "/",
  requireAuth,
  requireRole(["admin", "developer"]),
  async (req, res) => {
    const roles = req.user.role === "admin" ? ["admin", "developer", "client"] : ["admin", "developer"];
    const users = await User.find({
      role: { $in: roles },
      status: "active",
      accountStatus: { $ne: "suspended" },
    })
      .select("_id name email role status")
      .sort({ role: 1, name: 1 });
    res.json({ users });
  }
);

export default router;
