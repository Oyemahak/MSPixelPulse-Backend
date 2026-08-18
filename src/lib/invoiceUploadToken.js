import crypto from 'crypto';

const VERSION = 'v1';
const DEFAULT_TTL_MS = 20 * 60 * 1000;

function encryptionKey() {
  const secret = String(process.env.JWT_SECRET || '').trim();

  if (!secret) {
    const error = new Error('Invoice upload relay is unavailable');
    error.status = 503;
    error.code = 'INVOICE_UPLOAD_TOKEN_UNAVAILABLE';
    throw error;
  }

  return crypto.createHash('sha256').update(secret).digest();
}

function invalidToken() {
  const error = new Error('Invoice upload session is invalid or expired');
  error.status = 403;
  error.code = 'INVOICE_UPLOAD_TOKEN_INVALID';
  return error;
}

export function sealInvoiceUploadToken(
  claims,
  {
    ttlMs = DEFAULT_TTL_MS,
    now = Date.now(),
  } = {},
) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const payload = Buffer.from(JSON.stringify({
    ...claims,
    exp: Number(now) + Number(ttlMs),
  }));
  const encrypted = Buffer.concat([
    cipher.update(payload),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    tag.toString('base64url'),
  ].join('.');
}

export function openInvoiceUploadToken(
  token,
  {
    now = Date.now(),
  } = {},
) {
  try {
    const [version, encodedIv, encodedPayload, encodedTag, extra] =
      String(token || '').split('.');

    if (
      version !== VERSION ||
      !encodedIv ||
      !encodedPayload ||
      !encodedTag ||
      extra
    ) {
      throw invalidToken();
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(encodedIv, 'base64url'),
    );

    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encodedPayload, 'base64url')),
      decipher.final(),
    ]);

    const claims = JSON.parse(decrypted.toString('utf8'));

    if (!Number.isFinite(Number(claims?.exp)) || Number(claims.exp) < Number(now)) {
      throw invalidToken();
    }

    return claims;
  } catch (error) {
    if (error?.code === 'INVOICE_UPLOAD_TOKEN_UNAVAILABLE') throw error;
    if (error?.code === 'INVOICE_UPLOAD_TOKEN_INVALID') throw error;
    throw invalidToken();
  }
}

export const invoiceUploadTokenInternals = {
  DEFAULT_TTL_MS,
  VERSION,
};
