import { Router } from "express";
import {
  deleteComment,
  exportSubscribers,
  getSummary,
  listComments,
  listLeads,
  listNotifications,
  listSubscribers,
  retryNotification,
  unsubscribeSubscriber,
  updateComment,
  updateLead,
} from "../controllers/admin.controller.js";

const router = Router();

router.get("/summary", getSummary);
router.get("/comments", listComments);
router.patch("/comments/:commentId", updateComment);
router.delete("/comments/:commentId", deleteComment);
router.get("/subscribers", listSubscribers);
router.get("/subscribers.csv", exportSubscribers);
router.patch("/subscribers/:subscriberId/unsubscribe", unsubscribeSubscriber);
router.get("/leads", listLeads);
router.patch("/leads/:leadId", updateLead);
router.get("/notifications", listNotifications);
router.post("/notifications/:notificationId/retry", retryNotification);

export default router;
