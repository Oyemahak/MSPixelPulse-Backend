// src/lib/consoleIntake.js
// Forwards a copy of a genuine new website lead to the private MSPixelPulse console's signed intake.
// Off unless CONSOLE_INTAKE_URL (https) and CONSOLE_INTAKE_SECRET (32+ characters) are both set.
// It never throws, never retries, is bounded by a timeout and logs only short codes.
import crypto from "node:crypto";
import { cleanPublicUrl, cleanText } from "./validation.js";

export const CONSOLE_INTAKE_TIMEOUT_MS = 4000;
const MIN_SECRET_LENGTH = 32;
const MAX_BODY_BYTES = 32000;
const OPTIONAL_TEXT_FIELDS = { phone: 80, businessName: 180, service: 180, inquiryType: 80 };

export function consoleIntakeConfig(env = process.env) {
  const secret = typeof env.CONSOLE_INTAKE_SECRET === "string" ? env.CONSOLE_INTAKE_SECRET : "";
  if (secret.length < MIN_SECRET_LENGTH) return null;
  let url;
  try {
    url = new URL(String(env.CONSOLE_INTAKE_URL || "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  return { url: url.toString(), secret };
}

export function signConsoleIntake(secret, timestamp, rawBody) {
  return `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

function isoDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

// Only the contract fields are sent. IP address, user agent and delivery statuses are never included.
export function buildConsoleIntakePayload(lead) {
  const externalId = String(lead?._id || lead?.id || "").trim();
  const name = cleanText(lead?.name, 120);
  const email = cleanText(lead?.email, 254);
  const message = cleanText(lead?.message, 12000);
  if (!externalId || !name || !email || !message) return null;
  const payload = { externalId, name, email };
  for (const [field, max] of Object.entries(OPTIONAL_TEXT_FIELDS)) {
    const value = cleanText(lead?.[field], max);
    if (value) payload[field] = value;
  }
  // The lead model has no visitor website today; sourceUrl is the page the form was sent from, not the visitor's site.
  const website = cleanPublicUrl(lead?.website);
  if (website) payload.website = website;
  payload.message = message;
  const sourceUrl = cleanPublicUrl(lead?.sourceUrl);
  if (sourceUrl) payload.sourceUrl = sourceUrl;
  const createdAt = isoDate(lead?.createdAt);
  if (createdAt) payload.createdAt = createdAt;
  return payload;
}

function serialize(payload) {
  let rawBody = JSON.stringify(payload);
  let excess = Buffer.byteLength(rawBody) - MAX_BODY_BYTES;
  while (excess > 0 && payload.message.length > 1) {
    payload.message = payload.message.slice(0, Math.max(1, payload.message.length - excess));
    rawBody = JSON.stringify(payload);
    excess = Buffer.byteLength(rawBody) - MAX_BODY_BYTES;
  }
  return excess > 0 ? "" : rawBody;
}

function logCode(code) {
  console.warn("[lead] console intake:", code);
}

export async function forwardLeadToConsole(lead, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = CONSOLE_INTAKE_TIMEOUT_MS,
} = {}) {
  try {
    const config = consoleIntakeConfig(env);
    if (!config) return { status: "skipped", code: "CONSOLE_INTAKE_DISABLED" };
    const payload = buildConsoleIntakePayload(lead);
    const rawBody = payload ? serialize(payload) : "";
    if (!rawBody) {
      logCode("CONSOLE_INTAKE_INVALID_LEAD");
      return { status: "skipped", code: "CONSOLE_INTAKE_INVALID_LEAD" };
    }
    if (typeof fetchImpl !== "function") {
      logCode("CONSOLE_INTAKE_NO_FETCH");
      return { status: "failed", code: "CONSOLE_INTAKE_NO_FETCH" };
    }
    const timestamp = String(Math.floor(now() / 1000));
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MSP-Timestamp": timestamp,
        "X-MSP-Signature": signConsoleIntake(config.secret, timestamp, rawBody),
      },
      body: rawBody,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    try { await response?.body?.cancel?.(); } catch { /* the response body is not needed */ }
    if (response?.ok) return { status: "sent", code: "CONSOLE_INTAKE_SENT" };
    const code = `CONSOLE_INTAKE_HTTP_${Number(response?.status) || 0}`;
    logCode(code);
    return { status: "failed", code };
  } catch (error) {
    const code = error?.name === "TimeoutError" || error?.name === "AbortError"
      ? "CONSOLE_INTAKE_TIMEOUT"
      : "CONSOLE_INTAKE_NETWORK";
    logCode(code);
    return { status: "failed", code };
  }
}

function vercelRequestContext() {
  try {
    return globalThis[Symbol.for("@vercel/request-context")]?.get?.() || null;
  } catch {
    return null;
  }
}

// Starts forwarding and returns a promise the caller awaits before responding.
// On Vercel the delivery is handed to waitUntil, so the returned promise resolves at once;
// elsewhere it is the bounded delivery itself. The promise never rejects.
export function startConsoleIntake(lead, options = {}) {
  const delivery = forwardLeadToConsole(lead, options);
  const context = options.requestContext === undefined ? vercelRequestContext() : options.requestContext;
  if (typeof context?.waitUntil === "function") {
    try {
      context.waitUntil(delivery);
      return Promise.resolve({ status: "scheduled", code: "CONSOLE_INTAKE_SCHEDULED" });
    } catch {
      return delivery;
    }
  }
  return delivery;
}
