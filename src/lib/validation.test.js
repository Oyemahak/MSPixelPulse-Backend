import test from "node:test";
import assert from "node:assert/strict";
import { cleanPublicUrl, cleanSlug, cleanText, isValidEmail, normalizeEmail } from "./validation.js";

test("cleanText removes unsafe control characters and limits length", () => {
  assert.equal(cleanText("  hello\u0000 world  ", 20), "hello world");
  assert.equal(cleanText("abcdef", 3), "abc");
});

test("email normalization and validation are consistent", () => {
  assert.equal(normalizeEmail(" Info@MSPixelPulse.com "), "info@mspixelpulse.com");
  assert.equal(isValidEmail("person@example.com"), true);
  assert.equal(isValidEmail("invalid@example"), false);
});

test("slugs and public URLs reject malformed values", () => {
  assert.equal(cleanSlug("website-cost-canada"), "website-cost-canada");
  assert.equal(cleanSlug("../admin"), "");
  assert.equal(cleanPublicUrl("https://mspixelpulse.com/blog/example"), "https://mspixelpulse.com/blog/example");
  assert.equal(cleanPublicUrl("javascript:alert(1)"), "");
});
