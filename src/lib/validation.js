const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(value, maxLength = 1000) {
  return String(value ?? "")
    .replace(CONTROL_CHARACTERS, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

export function normalizeEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function cleanSlug(value) {
  const slug = cleanText(value, 180).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

export function cleanPublicUrl(value) {
  try {
    const url = new URL(cleanText(value, 1000));
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}
