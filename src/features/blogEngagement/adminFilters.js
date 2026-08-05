import { cleanText } from "../../lib/validation.js";

const INTERNAL_RECIPIENTS = ["info@mspixelpulse.com", "mspixelpulse@gmail.com"];

export function safeRegex(value, maxLength = 180) {
  const cleaned = cleanText(value, maxLength).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(cleaned, "i");
}

function validDate(value) {
  const cleaned = cleanText(value, 80);
  if (!cleaned) return null;
  const date = new Date(cleaned);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function createdAtRange(query = {}) {
  const from = validDate(query.from);
  const to = validDate(query.to);
  if (!from && !to) return null;
  return {
    ...(from ? { $gte: from } : {}),
    ...(to ? { $lte: to } : {}),
  };
}

export function createdAtSort(query = {}) {
  return { createdAt: query.sort === "oldest" ? 1 : -1 };
}

export function addCreatedAtRange(condition, query) {
  const range = createdAtRange(query);
  if (range) condition.createdAt = range;
  return condition;
}

export function commentFilters(query = {}, allowedStatuses = new Set()) {
  const condition = {};
  if (allowedStatuses.has(query.status)) condition.status = query.status;
  if (query.blogSlug) condition.blogSlug = safeRegex(query.blogSlug);
  if (query.q) {
    const search = safeRegex(query.q);
    condition.$or = [{ name: search }, { email: search }, { comment: search }, { blogTitle: search }, { blogSlug: search }];
  }
  return addCreatedAtRange(condition, query);
}

export function subscriberFilters(query = {}) {
  const condition = {};
  if (["pending", "active", "unsubscribed"].includes(query.status)) condition.status = query.status;
  if (query.q) {
    const search = safeRegex(query.q);
    condition.$or = [{ email: search }, { sourceBlogTitle: search }, { sourceBlogSlug: search }];
  }
  return addCreatedAtRange(condition, query);
}

export function leadFilters(query = {}, allowedStatuses = new Set()) {
  const condition = {};
  if (allowedStatuses.has(query.status)) condition.status = query.status;
  if (query.source) condition.source = safeRegex(query.source, 120);
  if (query.inquiryType) condition.inquiryType = safeRegex(query.inquiryType, 120);
  if (query.q) {
    const search = safeRegex(query.q);
    condition.$or = [
      { name: search },
      { email: search },
      { phone: search },
      { businessName: search },
      { inquiryType: search },
      { service: search },
      { source: search },
      { message: search },
    ];
  }
  return addCreatedAtRange(condition, query);
}

export function notificationFilters(query = {}) {
  const condition = {};
  if (["pending", "sent", "failed", "skipped"].includes(query.status)) condition.status = query.status;
  if (query.type) condition.notificationType = cleanText(query.type, 120);
  if (query.audience === "internal") condition.recipients = { $all: INTERNAL_RECIPIENTS };
  if (query.audience === "recipient") condition.$nor = [{ recipients: { $all: INTERNAL_RECIPIENTS } }];
  if (query.q) {
    const search = safeRegex(query.q);
    condition.$or = [
      { notificationType: search },
      { relatedEntityType: search },
      { recipients: search },
      { lastError: search },
    ];
  }
  return addCreatedAtRange(condition, query);
}

