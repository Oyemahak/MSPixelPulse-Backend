import nodemailer from "nodemailer";
import { escapeHtml } from "./validation.js";

export const PUBLIC_BUSINESS_EMAIL = "info@mspixelpulse.com";
export const SECONDARY_NOTIFICATION_EMAIL = "mspixelpulse@gmail.com";

let transporter;

function splitAddresses(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
}

export function notificationRecipients() {
  return Array.from(new Set([
    PUBLIC_BUSINESS_EMAIL,
    SECONDARY_NOTIFICATION_EMAIL,
    ...splitAddresses(process.env.NOTIFICATION_RECIPIENTS),
    ...splitAddresses(process.env.CONTACT_RECIPIENTS),
    ...splitAddresses(process.env.BLOG_NOTIFICATION_RECIPIENTS),
  ]));
}

function getTransporter() {
  if (transporter) return transporter;

  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "").trim();
  if (!user || !pass) {
    const error = new Error("SMTP is not configured");
    error.code = "SMTP_NOT_CONFIGURED";
    throw error;
  }

  const host = String(process.env.SMTP_HOST || "").trim();
  transporter = nodemailer.createTransport(host ? {
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
    auth: { user, pass },
  } : {
    service: "gmail",
    auth: { user, pass },
  });

  return transporter;
}

export async function sendMail({ to, subject, html, text, replyTo }) {
  const from = String(process.env.SMTP_FROM || `MSPixelPulse <${PUBLIC_BUSINESS_EMAIL}>`).trim();
  return getTransporter().sendMail({
    from,
    to: Array.isArray(to) ? to.join(", ") : to,
    subject,
    html,
    text,
    ...(replyTo ? { replyTo } : {}),
  });
}

function renderRows(rows) {
  return rows
    .filter((row) => row?.value !== undefined && row?.value !== null && row.value !== "")
    .map((row) => `
      <tr>
        <th align="left" style="padding:8px 12px;color:#475569;font-size:13px;vertical-align:top;width:150px">${escapeHtml(row.label)}</th>
        <td style="padding:8px 12px;color:#0f172a;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(row.value)}</td>
      </tr>`)
    .join("");
}

export function brandedEmail({ eyebrow, heading, intro, rows = [], button, footer }) {
  const textRows = rows
    .filter((row) => row?.value !== undefined && row?.value !== null && row.value !== "")
    .map((row) => `${row.label}: ${row.value}`)
    .join("\n");
  const buttonHtml = button?.url ? `
    <p style="margin:24px 0 0">
      <a href="${escapeHtml(button.url)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">${escapeHtml(button.label)}</a>
    </p>` : "";

  return {
    html: `<!doctype html>
      <html><body style="margin:0;background:#f1f5f9;padding:24px;color:#0f172a">
        <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ee;border-radius:18px;overflow:hidden;font-family:Arial,sans-serif">
          <div style="padding:24px;background:#0b1220;color:#ffffff">
            <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#93c5fd">${escapeHtml(eyebrow)}</div>
            <h1 style="font-size:24px;line-height:1.25;margin:8px 0 0">${escapeHtml(heading)}</h1>
          </div>
          <div style="padding:24px">
            ${intro ? `<p style="margin:0 0 18px;color:#334155;line-height:1.65">${escapeHtml(intro)}</p>` : ""}
            ${rows.length ? `<table role="presentation" style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">${renderRows(rows)}</table>` : ""}
            ${buttonHtml}
            <p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:1.6">${escapeHtml(footer || "MSPixelPulse · Toronto, Ontario · info@mspixelpulse.com")}</p>
          </div>
        </div>
      </body></html>`,
    text: [eyebrow, heading, intro, textRows, button?.url ? `${button.label}: ${button.url}` : "", footer]
      .filter(Boolean)
      .join("\n\n"),
  };
}
