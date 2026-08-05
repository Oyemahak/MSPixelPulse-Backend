import crypto from "crypto";
import BlogReaction from "../../../models/BlogReaction.js";
import BlogComment from "../../../models/BlogComment.js";
import BlogShare from "../../../models/BlogShare.js";
import BlogSubscriber from "../../../models/BlogSubscriber.js";
import Lead from "../../../models/Lead.js";
import NotificationLog from "../../../models/NotificationLog.js";
import { cleanText } from "../../../lib/validation.js";
import { deliverNotification } from "../../../lib/notificationService.js";
import { notificationRecipients } from "../../../lib/mailer.js";
import {
  commentNotificationEmail,
  reactionNotificationEmail,
  shareNotificationEmail,
  subscriptionConfirmationEmail,
  subscriptionNotificationEmail,
} from "../../../lib/emailTemplates.js";
import { retryLeadNotification } from "../../leads/controllers/lead.controller.js";
import {
  commentFilters,
  createdAtSort,
  leadFilters,
  notificationFilters,
  subscriberFilters,
} from "../adminFilters.js";

const COMMENT_STATUSES = new Set(["pending", "approved", "rejected", "spam"]);
const LEAD_STATUSES = new Set(["new", "contacted", "qualified", "completed", "spam"]);

function pageOptions(query) {
  const page = Math.max(1, Math.min(1000, Number(query.page) || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

function cleanCommentText(value) {
  return cleanText(value, 4000).replace(/<[^>]*>/g, "").trim();
}

function handleError(res, error, message) {
  console.error("[blog-admin]", error?.code || error?.name || "FAILED");
  return res.status(error.status || 500).json({ error: error.status ? error.message : message });
}

export async function getSummary(_req, res) {
  try {
    const [likes, dislikes, comments, pendingComments, approvedComments, shares, activeSubscribers, reactionGroups, commentGroups, shareGroups] = await Promise.all([
      BlogReaction.countDocuments({ reactionType: "like" }),
      BlogReaction.countDocuments({ reactionType: "dislike" }),
      BlogComment.countDocuments(),
      BlogComment.countDocuments({ status: "pending" }),
      BlogComment.countDocuments({ status: "approved" }),
      BlogShare.countDocuments(),
      BlogSubscriber.countDocuments({ status: "active" }),
      BlogReaction.aggregate([
        { $group: {
          _id: "$blogSlug",
          title: { $last: "$blogTitle" },
          likes: { $sum: { $cond: [{ $eq: ["$reactionType", "like"] }, 1, 0] } },
          dislikes: { $sum: { $cond: [{ $eq: ["$reactionType", "dislike"] }, 1, 0] } },
        } },
        { $sort: { likes: -1, dislikes: -1 } },
      ]),
      BlogComment.aggregate([
        { $group: { _id: "$blogSlug", title: { $last: "$blogTitle" }, comments: { $sum: 1 } } },
      ]),
      BlogShare.aggregate([
        { $group: { _id: "$blogSlug", title: { $last: "$blogTitle" }, shares: { $sum: 1 } } },
      ]),
    ]);
    const byBlog = new Map();
    for (const item of reactionGroups) {
      byBlog.set(item._id, {
        blogSlug: item._id,
        blogTitle: item.title,
        likes: item.likes,
        dislikes: item.dislikes,
        comments: 0,
        shares: 0,
      });
    }
    for (const item of commentGroups) {
      const current = byBlog.get(item._id) || {
        blogSlug: item._id,
        blogTitle: item.title,
        likes: 0,
        dislikes: 0,
        comments: 0,
        shares: 0,
      };
      current.comments = item.comments;
      byBlog.set(item._id, current);
    }
    for (const item of shareGroups) {
      const current = byBlog.get(item._id) || {
        blogSlug: item._id,
        blogTitle: item.title,
        likes: 0,
        dislikes: 0,
        comments: 0,
        shares: 0,
      };
      current.shares = item.shares;
      byBlog.set(item._id, current);
    }
    return res.json({
      metrics: { likes, dislikes, comments, pendingComments, approvedComments, shares, activeSubscribers },
      byBlog: Array.from(byBlog.values())
        .sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares))
        .slice(0, 20),
    });
  } catch (error) {
    return handleError(res, error, "Unable to load engagement metrics.");
  }
}

export async function listComments(req, res) {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const condition = commentFilters(req.query, COMMENT_STATUSES);
    const [comments, total] = await Promise.all([
      BlogComment.find(condition).select("+email").sort(createdAtSort(req.query)).skip(skip).limit(limit).lean(),
      BlogComment.countDocuments(condition),
    ]);
    return res.json({ comments, pagination: { page, limit, total, hasMore: page * limit < total } });
  } catch (error) {
    return handleError(res, error, "Unable to load comments.");
  }
}

export async function updateComment(req, res) {
  try {
    const comment = await BlogComment.findById(req.params.commentId).select("+email");
    if (!comment) return res.status(404).json({ error: "Comment not found." });
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "status")) {
      if (!COMMENT_STATUSES.has(req.body.status)) return res.status(400).json({ error: "Invalid comment status." });
      comment.status = req.body.status;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "name")) {
      const name = cleanText(req.body.name, 120);
      if (!name) return res.status(400).json({ error: "Commenter name is required." });
      comment.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "comment")) {
      const text = cleanCommentText(req.body.comment);
      if (text.length < 3) return res.status(400).json({ error: "Comment text is too short." });
      comment.comment = text;
    }
    await comment.save();
    return res.json({ comment });
  } catch (error) {
    return handleError(res, error, "Unable to update the comment.");
  }
}

export async function deleteComment(req, res) {
  try {
    const comment = await BlogComment.findByIdAndDelete(req.params.commentId);
    if (!comment) return res.status(404).json({ error: "Comment not found." });
    return res.json({ ok: true });
  } catch (error) {
    return handleError(res, error, "Unable to delete the comment.");
  }
}

export async function listSubscribers(req, res) {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const condition = subscriberFilters(req.query);
    const [subscribers, total] = await Promise.all([
      BlogSubscriber.find(condition).sort(createdAtSort(req.query)).skip(skip).limit(limit).lean(),
      BlogSubscriber.countDocuments(condition),
    ]);
    return res.json({ subscribers, pagination: { page, limit, total, hasMore: page * limit < total } });
  } catch (error) {
    return handleError(res, error, "Unable to load subscribers.");
  }
}

export async function unsubscribeSubscriber(req, res) {
  try {
    const subscriber = await BlogSubscriber.findById(req.params.subscriberId);
    if (!subscriber) return res.status(404).json({ error: "Subscriber not found." });
    subscriber.status = "unsubscribed";
    subscriber.unsubscribedAt = new Date();
    await subscriber.save();
    return res.json({ subscriber });
  } catch (error) {
    return handleError(res, error, "Unable to unsubscribe this address.");
  }
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function exportSubscribers(_req, res) {
  try {
    const subscribers = await BlogSubscriber.find().sort({ createdAt: -1 }).lean();
    const lines = [
      ["email", "status", "sourceBlogSlug", "sourceBlogTitle", "createdAt", "confirmedAt", "unsubscribedAt"],
      ...subscribers.map((subscriber) => [
        subscriber.email,
        subscriber.status,
        subscriber.sourceBlogSlug,
        subscriber.sourceBlogTitle,
        subscriber.createdAt?.toISOString?.() || "",
        subscriber.confirmedAt?.toISOString?.() || "",
        subscriber.unsubscribedAt?.toISOString?.() || "",
      ]),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="mspixelpulse-blog-subscribers.csv"');
    return res.send(lines.map((row) => row.map(csvCell).join(",")).join("\n"));
  } catch (error) {
    return handleError(res, error, "Unable to export subscribers.");
  }
}

export async function listLeads(req, res) {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const condition = leadFilters(req.query, LEAD_STATUSES);
    const [leads, total] = await Promise.all([
      Lead.find(condition).sort(createdAtSort(req.query)).skip(skip).limit(limit).lean(),
      Lead.countDocuments(condition),
    ]);
    return res.json({ leads, pagination: { page, limit, total, hasMore: page * limit < total } });
  } catch (error) {
    return handleError(res, error, "Unable to load leads.");
  }
}

export async function updateLead(req, res) {
  try {
    if (!LEAD_STATUSES.has(req.body?.status)) return res.status(400).json({ error: "Invalid lead status." });
    const lead = await Lead.findByIdAndUpdate(
      req.params.leadId,
      { $set: { status: req.body.status } },
      { new: true, runValidators: true },
    );
    if (!lead) return res.status(404).json({ error: "Lead not found." });
    return res.json({ lead });
  } catch (error) {
    return handleError(res, error, "Unable to update the lead.");
  }
}

export async function listNotifications(req, res) {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const condition = notificationFilters(req.query);
    const [notifications, total] = await Promise.all([
      NotificationLog.find(condition).sort(createdAtSort(req.query)).skip(skip).limit(limit).lean(),
      NotificationLog.countDocuments(condition),
    ]);
    return res.json({ notifications, pagination: { page, limit, total, hasMore: page * limit < total } });
  } catch (error) {
    return handleError(res, error, "Unable to load notification logs.");
  }
}

function newToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: crypto.createHash("sha256").update(token).digest("hex") };
}

async function retryMessage(log) {
  if (log.notificationType.startsWith("contact_")) {
    const lead = await Lead.findById(log.relatedEntityId);
    if (!lead) return null;
    return { entity: lead, result: retryLeadNotification(lead, log) };
  }
  if (log.notificationType === "blog_comment") {
    const comment = await BlogComment.findById(log.relatedEntityId).select("+email");
    if (!comment) return null;
    return {
      entity: comment,
      result: deliverNotification({
        type: log.notificationType,
        relatedEntityType: "BlogComment",
        relatedEntityId: comment._id,
        recipients: notificationRecipients(),
        message: commentNotificationEmail(comment),
        metadata: log.metadata,
        existingLog: log,
      }),
    };
  }
  if (log.notificationType === "blog_share") {
    const share = await BlogShare.findById(log.relatedEntityId);
    if (!share) return null;
    const shareCount = await BlogShare.countDocuments({ blogSlug: share.blogSlug });
    return {
      entity: share,
      result: deliverNotification({
        type: log.notificationType,
        relatedEntityType: "BlogShare",
        relatedEntityId: share._id,
        recipients: notificationRecipients(),
        message: shareNotificationEmail(share, shareCount),
        metadata: log.metadata,
        existingLog: log,
      }),
    };
  }
  if (["blog_like", "blog_dislike", "blog_reaction_removed"].includes(log.notificationType)) {
    return {
      entity: null,
      result: deliverNotification({
        type: log.notificationType,
        relatedEntityType: log.relatedEntityType,
        relatedEntityId: log.relatedEntityId,
        recipients: notificationRecipients(),
        message: reactionNotificationEmail(log.metadata),
        metadata: log.metadata,
        existingLog: log,
      }),
    };
  }
  if (["blog_subscription_started", "blog_subscription_confirmed"].includes(log.notificationType)) {
    const subscriber = await BlogSubscriber.findById(log.relatedEntityId);
    if (!subscriber) return null;
    return {
      entity: subscriber,
      result: deliverNotification({
        type: log.notificationType,
        relatedEntityType: "BlogSubscriber",
        relatedEntityId: subscriber._id,
        recipients: notificationRecipients(),
        message: subscriptionNotificationEmail(subscriber, log.metadata?.eventLabel || "updated"),
        metadata: log.metadata,
        existingLog: log,
      }),
    };
  }
  if (log.notificationType === "blog_subscription_confirmation") {
    const subscriber = await BlogSubscriber.findById(log.relatedEntityId)
      .select("+confirmationTokenHash +unsubscribeTokenHash");
    if (!subscriber || subscriber.status !== "pending") return null;
    const confirmation = newToken();
    const unsubscribe = newToken();
    subscriber.confirmationTokenHash = confirmation.hash;
    subscriber.confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    subscriber.unsubscribeTokenHash = unsubscribe.hash;
    await subscriber.save();
    return {
      entity: subscriber,
      result: deliverNotification({
        type: log.notificationType,
        relatedEntityType: "BlogSubscriber",
        relatedEntityId: subscriber._id,
        recipients: [subscriber.email],
        message: subscriptionConfirmationEmail(subscriber, confirmation.token, unsubscribe.token),
        metadata: log.metadata,
        existingLog: log,
      }),
    };
  }
  return null;
}

export async function retryNotification(req, res) {
  try {
    const log = await NotificationLog.findById(req.params.notificationId);
    if (!log) return res.status(404).json({ error: "Notification log not found." });
    if (log.status === "sent") return res.status(409).json({ error: "This notification was already delivered." });
    const retry = await retryMessage(log);
    if (!retry) return res.status(409).json({ error: "This notification can no longer be retried safely." });
    const result = await retry.result;

    if (log.notificationType.startsWith("contact_")) {
      if (log.notificationType === "contact_confirmation") retry.entity.confirmationEmailStatus = result.status;
      else retry.entity.emailDeliveryStatus = result.status;
      await retry.entity.save();
    } else if (log.notificationType === "blog_comment") {
      retry.entity.emailDeliveryStatus = result.status;
      await retry.entity.save();
    } else if (log.notificationType.startsWith("blog_subscription_")) {
      if (log.notificationType === "blog_subscription_confirmation") retry.entity.confirmationEmailStatus = result.status;
      else retry.entity.notificationEmailStatus = result.status;
      await retry.entity.save();
    }
    return res.json({ notification: result });
  } catch (error) {
    return handleError(res, error, "Unable to retry the notification.");
  }
}
