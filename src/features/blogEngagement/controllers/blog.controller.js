import crypto from "crypto";
import BlogReaction from "../../../models/BlogReaction.js";
import BlogComment from "../../../models/BlogComment.js";
import BlogShare from "../../../models/BlogShare.js";
import BlogSubscriber from "../../../models/BlogSubscriber.js";
import { cleanPublicUrl, cleanSlug, cleanText, isValidEmail, normalizeEmail } from "../../../lib/validation.js";
import { deliverNotification } from "../../../lib/notificationService.js";
import { notificationRecipients } from "../../../lib/mailer.js";
import {
  commentNotificationEmail,
  reactionNotificationEmail,
  shareNotificationEmail,
  subscriptionConfirmationEmail,
  subscriptionNotificationEmail,
} from "../../../lib/emailTemplates.js";

const SHARE_PLATFORMS = new Set(["copy_link", "linkedin", "facebook", "whatsapp", "email", "native"]);
const SHARE_EVENTS = new Set(["share_option_selected", "native_share_completed"]);

function identityHash(req, { required = false } = {}) {
  const userId = req.user?._id?.toString();
  const anonymousId = cleanText(req.body?.anonymousId || req.query?.anonymousId, 200);
  const source = userId
    ? `user:${userId}`
    : /^[a-zA-Z0-9-]{20,200}$/.test(anonymousId)
      ? `anonymous:${anonymousId}`
      : "";
  if (!source && required) {
    const error = new Error("A browser identity is required for this action.");
    error.status = 400;
    throw error;
  }
  if (!source) return "";
  const salt = String(process.env.ANONYMOUS_ID_SALT || process.env.JWT_SECRET || "local-engagement-salt");
  return crypto.createHmac("sha256", salt).update(source).digest("hex");
}

function readArticle(req) {
  const blogSlug = cleanSlug(req.params.slug || req.body?.blogSlug);
  const blogTitle = cleanText(req.body?.blogTitle, 220);
  const blogUrl = cleanPublicUrl(req.body?.blogUrl);
  if (!blogSlug || !blogTitle || !blogUrl) {
    const error = new Error("Valid article details are required.");
    error.status = 400;
    throw error;
  }
  return { blogSlug, blogTitle, blogUrl };
}

function cleanCommentText(value) {
  return cleanText(value, 4000).replace(/<[^>]*>/g, "").trim();
}

async function countsFor(blogSlug) {
  const [likes, dislikes, shares, approvedComments] = await Promise.all([
    BlogReaction.countDocuments({ blogSlug, reactionType: "like" }),
    BlogReaction.countDocuments({ blogSlug, reactionType: "dislike" }),
    BlogShare.countDocuments({ blogSlug }),
    BlogComment.countDocuments({ blogSlug, status: "approved" }),
  ]);
  return { likes, dislikes, shares, approvedComments };
}

function safeAsync(label, task) {
  void task.catch((error) => {
    console.error(`[blog-engagement] ${label}:`, error?.code || error?.name || "FAILED");
  });
}

export async function getEngagement(req, res) {
  try {
    const blogSlug = cleanSlug(req.params.slug);
    if (!blogSlug) return res.status(400).json({ error: "Invalid article slug." });
    const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
    const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 8));
    const hash = identityHash(req);

    const [counts, comments, reaction] = await Promise.all([
      countsFor(blogSlug),
      BlogComment.find({ blogSlug, status: "approved" })
        .select("name comment createdAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      hash
        ? BlogReaction.findOne({ blogSlug, identityHash: hash }).select("reactionType").lean()
        : null,
    ]);

    return res.json({
      blogSlug,
      counts,
      viewerReaction: reaction?.reactionType || null,
      comments,
      pagination: {
        page,
        limit,
        hasMore: page * limit < counts.approvedComments,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Unable to load blog engagement." });
  }
}

export async function setReaction(req, res) {
  try {
    const article = readArticle(req);
    const reactionType = cleanText(req.body?.reactionType, 20).toLowerCase();
    if (!new Set(["like", "dislike"]).has(reactionType)) {
      return res.status(400).json({ error: "Reaction must be like or dislike." });
    }
    const hash = identityHash(req, { required: true });
    const existing = await BlogReaction.findOne({ blogSlug: article.blogSlug, identityHash: hash })
      .select("+identityHash");
    const action = existing
      ? existing.reactionType === reactionType
        ? reactionType === "like" ? "Like" : "Dislike"
        : "Changed Vote"
      : reactionType === "like" ? "Like" : "Dislike";

    const reaction = existing || new BlogReaction({
      ...article,
      identityHash: hash,
      user: req.user?._id || null,
    });
    reaction.blogTitle = article.blogTitle;
    reaction.blogUrl = article.blogUrl;
    reaction.reactionType = reactionType;
    await reaction.save();

    const counts = await countsFor(article.blogSlug);
    const recordedAt = new Date().toISOString();
    const details = { ...article, action, ...counts, recordedAt };
    safeAsync("reaction notification failed", deliverNotification({
      type: reactionType === "like" ? "blog_like" : "blog_dislike",
      relatedEntityType: "BlogReaction",
      relatedEntityId: reaction._id,
      message: reactionNotificationEmail(details),
      dedupeKey: `reaction:${reaction._id}:${reaction.updatedAt.getTime()}`,
      metadata: details,
    }));

    return res.json({ ok: true, reaction: reactionType, counts });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "That reaction was already recorded." });
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Unable to save the reaction." });
  }
}

export async function removeReaction(req, res) {
  try {
    const article = readArticle(req);
    const hash = identityHash(req, { required: true });
    const reaction = await BlogReaction.findOneAndDelete({ blogSlug: article.blogSlug, identityHash: hash })
      .select("+identityHash");
    const counts = await countsFor(article.blogSlug);
    if (reaction) {
      const details = {
        ...article,
        action: "Removed Vote",
        ...counts,
        recordedAt: new Date().toISOString(),
      };
      safeAsync("reaction removal notification failed", deliverNotification({
        type: "blog_reaction_removed",
        relatedEntityType: "BlogReaction",
        relatedEntityId: reaction._id,
        message: reactionNotificationEmail(details),
        dedupeKey: `reaction-removed:${reaction._id}:${Date.now()}`,
        metadata: details,
      }));
    }
    return res.json({ ok: true, reaction: null, counts });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Unable to remove the reaction." });
  }
}

export async function submitComment(req, res) {
  try {
    if (cleanText(req.body?._hp, 100)) return res.status(201).json({ ok: true, status: "pending" });
    const article = readArticle(req);
    const name = cleanText(req.body?.name, 120);
    const email = normalizeEmail(req.body?.email);
    const commentText = cleanCommentText(req.body?.comment);
    if (!name || !isValidEmail(email) || commentText.length < 3) {
      return res.status(400).json({ error: "Name, a valid email, and a comment are required." });
    }

    const recentDuplicate = await BlogComment.findOne({
      blogSlug: article.blogSlug,
      email,
      comment: commentText,
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
    }).select("_id status");
    if (recentDuplicate) {
      return res.status(200).json({ ok: true, status: recentDuplicate.status, duplicate: true });
    }

    const comment = await BlogComment.create({
      ...article,
      name,
      email,
      comment: commentText,
      status: "pending",
    });
    const log = await deliverNotification({
      type: "blog_comment",
      relatedEntityType: "BlogComment",
      relatedEntityId: comment._id,
      message: commentNotificationEmail(comment),
      dedupeKey: `comment:${comment._id}`,
      metadata: { blogSlug: article.blogSlug, blogTitle: article.blogTitle, blogUrl: article.blogUrl },
    });
    comment.emailDeliveryStatus = log.status;
    await comment.save();

    return res.status(201).json({ ok: true, status: "pending" });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Unable to submit the comment." });
  }
}

export async function recordShare(req, res) {
  try {
    const article = readArticle(req);
    const platform = cleanText(req.body?.platform, 40).toLowerCase();
    const eventType = cleanText(req.body?.eventType, 60).toLowerCase();
    if (!SHARE_PLATFORMS.has(platform) || !SHARE_EVENTS.has(eventType)) {
      return res.status(400).json({ error: "Invalid share event." });
    }
    const hash = identityHash(req, { required: true });
    const share = await BlogShare.create({ ...article, platform, eventType, identityHash: hash });
    const shareCount = await BlogShare.countDocuments({ blogSlug: article.blogSlug });
    safeAsync("share notification failed", deliverNotification({
      type: "blog_share",
      relatedEntityType: "BlogShare",
      relatedEntityId: share._id,
      message: shareNotificationEmail(share, shareCount),
      dedupeKey: `share:${share._id}`,
      metadata: { ...article, platform, eventType, shareCount },
    }));
    return res.status(201).json({ ok: true, shareCount });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Unable to record the share." });
  }
}

function tokenPair() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: crypto.createHash("sha256").update(token).digest("hex") };
}

export async function startSubscription(req, res) {
  try {
    if (cleanText(req.body?._hp, 100)) return res.status(201).json({ ok: true, status: "pending" });
    const article = readArticle(req);
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });

    let subscriber = await BlogSubscriber.findOne({ email })
      .select("+confirmationTokenHash +unsubscribeTokenHash");
    if (subscriber?.status === "active") {
      return res.status(200).json({ ok: true, status: "active", alreadySubscribed: true });
    }

    const confirmation = tokenPair();
    const unsubscribe = tokenPair();
    if (!subscriber) subscriber = new BlogSubscriber({ email });
    subscriber.status = "pending";
    subscriber.sourceBlogSlug = article.blogSlug;
    subscriber.sourceBlogTitle = article.blogTitle;
    subscriber.sourceBlogUrl = article.blogUrl;
    subscriber.confirmationTokenHash = confirmation.hash;
    subscriber.confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    subscriber.unsubscribeTokenHash = unsubscribe.hash;
    subscriber.unsubscribedAt = null;
    await subscriber.save();

    const [notificationLog, confirmationLog] = await Promise.all([
      deliverNotification({
        type: "blog_subscription_started",
        relatedEntityType: "BlogSubscriber",
        relatedEntityId: subscriber._id,
        message: subscriptionNotificationEmail(subscriber, "started"),
        dedupeKey: `subscription-started:${subscriber._id}:${confirmation.hash.slice(0, 12)}`,
        metadata: { blogSlug: article.blogSlug, blogTitle: article.blogTitle, blogUrl: article.blogUrl, eventLabel: "started" },
      }),
      deliverNotification({
        type: "blog_subscription_confirmation",
        relatedEntityType: "BlogSubscriber",
        relatedEntityId: subscriber._id,
        recipients: [subscriber.email],
        message: subscriptionConfirmationEmail(subscriber, confirmation.token, unsubscribe.token),
        dedupeKey: `subscription-confirmation:${subscriber._id}:${confirmation.hash.slice(0, 12)}`,
        metadata: { blogSlug: article.blogSlug },
      }),
    ]);
    subscriber.notificationEmailStatus = notificationLog.status;
    subscriber.confirmationEmailStatus = confirmationLog.status;
    await subscriber.save();

    return res.status(201).json({
      ok: true,
      status: "pending",
      confirmationEmailStatus: confirmationLog.status,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Unable to start the subscription." });
  }
}

export async function confirmSubscription(req, res) {
  try {
    const rawToken = cleanText(req.query.token, 200);
    if (!rawToken) return res.status(400).json({ error: "The confirmation link is invalid." });
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const subscriber = await BlogSubscriber.findOne({
      confirmationTokenHash: tokenHash,
      confirmationExpiresAt: { $gt: new Date() },
    }).select("+confirmationTokenHash +unsubscribeTokenHash");
    if (!subscriber) return res.status(410).json({ error: "This confirmation link is invalid or has expired." });

    subscriber.status = "active";
    subscriber.confirmedAt = new Date();
    subscriber.confirmationTokenHash = null;
    subscriber.confirmationExpiresAt = null;
    await subscriber.save();
    safeAsync("subscription confirmed notification failed", deliverNotification({
      type: "blog_subscription_confirmed",
      relatedEntityType: "BlogSubscriber",
      relatedEntityId: subscriber._id,
      message: subscriptionNotificationEmail(subscriber, "confirmed"),
      dedupeKey: `subscription-confirmed:${subscriber._id}:${subscriber.confirmedAt.getTime()}`,
      metadata: {
        blogSlug: subscriber.sourceBlogSlug,
        blogTitle: subscriber.sourceBlogTitle,
        blogUrl: subscriber.sourceBlogUrl,
        eventLabel: "confirmed",
      },
    }));
    return res.json({ ok: true, status: "active" });
  } catch {
    return res.status(500).json({ error: "Unable to confirm the subscription." });
  }
}

export async function unsubscribe(req, res) {
  try {
    const rawToken = cleanText(req.query.token, 200);
    if (!rawToken) return res.status(400).json({ error: "The unsubscribe link is invalid." });
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const subscriber = await BlogSubscriber.findOne({ unsubscribeTokenHash: tokenHash })
      .select("+unsubscribeTokenHash");
    if (!subscriber) return res.status(410).json({ error: "This unsubscribe link is invalid or no longer available." });
    subscriber.status = "unsubscribed";
    subscriber.unsubscribedAt = new Date();
    await subscriber.save();
    return res.json({ ok: true, status: "unsubscribed" });
  } catch {
    return res.status(500).json({ error: "Unable to unsubscribe this address." });
  }
}

export async function retryCommentNotification(comment, existingLog) {
  const fullComment = comment.email ? comment : await BlogComment.findById(comment._id).select("+email");
  return deliverNotification({
    type: "blog_comment",
    relatedEntityType: "BlogComment",
    relatedEntityId: fullComment._id,
    recipients: notificationRecipients(),
    message: commentNotificationEmail(fullComment),
    metadata: existingLog.metadata,
    existingLog,
  });
}
