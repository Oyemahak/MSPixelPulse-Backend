// src/features/leads/routes/index.js
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createLead } from "../controllers/lead.controller.js";

const router = Router();
const contactLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many contact attempts. Please try again later." },
});

// POST /api/contact
router.post("/", contactLimiter, createLead);

export default router;
