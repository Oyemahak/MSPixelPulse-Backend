import { cleanText } from './validation.js';

export function boundedMessageLimit(value, fallback = 50) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(1, parsed));
}

export function normalizeMessageBody(body = {}) {
  const text = cleanText(body.text, 4000);
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 5) : [];

  // Attachment records must be minted by the server-side file workflow. Until
  // a dedicated message-asset endpoint exists, reject client-provided metadata.
  if (attachments.length) {
    return { ok: false, message: 'Message attachments are not available yet' };
  }
  if (!text) return { ok: false, message: 'Message text is required' };
  return { ok: true, text, attachments: [] };
}

