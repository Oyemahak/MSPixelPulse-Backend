import { cleanText } from './validation.js';
import { pathBelongsToProjectPurpose } from './filePolicy.js';

export function boundedMessageLimit(value, fallback = 50) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(1, parsed));
}

export function normalizeMessageBody(body = {}, { projectId = '' } = {}) {
  const text = cleanText(body.text, 4000);
  const attachments = Array.isArray(body.attachments)
    ? body.attachments.slice(0, 5).map((attachment) => ({
      name: cleanText(attachment?.name, 180),
      type: cleanText(attachment?.type || attachment?.mime, 120),
      mime: cleanText(attachment?.mime || attachment?.type, 120),
      size: Number(attachment?.size || 0),
      path: cleanText(attachment?.path, 500),
      url: '',
    }))
    : [];

  if (attachments.some((attachment) => (
    !projectId ||
    !attachment.name ||
    !attachment.path ||
    !pathBelongsToProjectPurpose(attachment.path, projectId, 'message')
  ))) {
    return { ok: false, message: 'Message attachments must be uploaded to this project first' };
  }
  if (!text && !attachments.length) return { ok: false, message: 'Message text or an attachment is required' };
  return { ok: true, text, attachments };
}
