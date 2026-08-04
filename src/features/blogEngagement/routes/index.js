import { Router } from "express";
import rateLimit from "express-rate-limit";
import { optionalAuth } from "../../../middleware/auth.js";
import {
  confirmSubscription,
  getEngagement,
  recordShare,
  removeReaction,
  setReaction,
  startSubscription,
  submitComment,
  unsubscribe,
} from "../controllers/blog.controller.js";

const router = Router();
const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many engagement requests. Please try again later." },
});
const formLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many form submissions. Please try again later." },
});

router.use(optionalAuth);
router.get("/subscriptions/confirm", confirmSubscription);
router.get("/subscriptions/unsubscribe", unsubscribe);
router.post("/subscriptions", formLimiter, startSubscription);
router.get("/:slug", getEngagement);
router.put("/:slug/reaction", mutationLimiter, setReaction);
router.delete("/:slug/reaction", mutationLimiter, removeReaction);
router.post("/:slug/comments", formLimiter, submitComment);
router.post("/:slug/shares", mutationLimiter, recordShare);

export default router;
