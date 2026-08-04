import NotificationLog from "../models/NotificationLog.js";
import { boolEnv } from "../config/env.js";
import { notificationRecipients, sendMail } from "./mailer.js";

const featureFlags = {
  contact_notification: "CONTACT_EMAIL_NOTIFICATIONS",
  contact_confirmation: "CONTACT_CONFIRMATION_EMAILS",
  blog_like: "BLOG_LIKE_EMAILS",
  blog_dislike: "BLOG_DISLIKE_EMAILS",
  blog_reaction_removed: "BLOG_LIKE_EMAILS",
  blog_comment: "BLOG_COMMENT_EMAILS",
  blog_share: "BLOG_SHARE_EMAILS",
  blog_subscription_started: "BLOG_SUBSCRIBE_EMAILS",
  blog_subscription_confirmed: "BLOG_SUBSCRIBE_EMAILS",
  blog_subscription_confirmation: "BLOG_SUBSCRIBE_EMAILS",
};

function notificationEnabled(type) {
  if (!boolEnv("BLOG_EMAIL_NOTIFICATIONS", true) && type.startsWith("blog_")) return false;
  const variable = featureFlags[type];
  return variable ? boolEnv(variable, true) : true;
}

function safeErrorCode(error) {
  return String(error?.code || error?.name || "EMAIL_SEND_FAILED").slice(0, 120);
}

async function getOrCreateLog({
  type,
  relatedEntityType,
  relatedEntityId,
  recipients,
  dedupeKey,
  metadata,
  existingLog,
}) {
  if (existingLog) return existingLog;
  const data = {
    notificationType: type,
    relatedEntityType,
    relatedEntityId: relatedEntityId || null,
    recipients,
    metadata: metadata || {},
    ...(dedupeKey ? { dedupeKey } : {}),
  };
  if (!dedupeKey) return NotificationLog.create(data);
  return NotificationLog.findOneAndUpdate(
    { dedupeKey },
    { $setOnInsert: data },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export async function deliverNotification({
  type,
  relatedEntityType,
  relatedEntityId,
  message,
  recipients = notificationRecipients(),
  dedupeKey,
  metadata = {},
  existingLog = null,
}) {
  const normalizedRecipients = Array.from(new Set(
    (Array.isArray(recipients) ? recipients : [recipients])
      .map((recipient) => String(recipient || "").trim().toLowerCase())
      .filter(Boolean),
  ));
  const log = await getOrCreateLog({
    type,
    relatedEntityType,
    relatedEntityId,
    recipients: normalizedRecipients,
    dedupeKey,
    metadata,
    existingLog,
  });

  if (log.status === "sent" && !existingLog) return log;
  if (!notificationEnabled(type)) {
    log.status = "skipped";
    log.lastError = "NOTIFICATION_DISABLED";
    await log.save();
    return log;
  }

  try {
    log.status = "pending";
    log.attemptCount += 1;
    log.lastError = "";
    await log.save();
    await sendMail({ to: normalizedRecipients, ...message });
    log.status = "sent";
    log.sentAt = new Date();
    await log.save();
    return log;
  } catch (error) {
    log.status = "failed";
    log.lastError = safeErrorCode(error);
    await log.save();
    return log;
  }
}
