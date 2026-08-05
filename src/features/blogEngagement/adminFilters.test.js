import assert from "node:assert/strict";
import test from "node:test";
import {
  createdAtRange,
  createdAtSort,
  leadFilters,
  notificationFilters,
  safeRegex,
} from "./adminFilters.js";

test("admin search escapes regex control characters", () => {
  const pattern = safeRegex("info+team@example.com");
  assert.equal(pattern.test("INFO+TEAM@example.com"), true);
  assert.equal(pattern.test("infoteam@example.com"), false);
});

test("admin date filters ignore invalid values and retain valid boundaries", () => {
  assert.equal(createdAtRange({ from: "not-a-date", to: "" }), null);
  const range = createdAtRange({
    from: "2026-08-01T04:00:00.000Z",
    to: "2026-08-06T03:59:59.999Z",
  });
  assert.equal(range.$gte.toISOString(), "2026-08-01T04:00:00.000Z");
  assert.equal(range.$lte.toISOString(), "2026-08-06T03:59:59.999Z");
  assert.deepEqual(createdAtSort({ sort: "oldest" }), { createdAt: 1 });
  assert.deepEqual(createdAtSort({ sort: "anything-else" }), { createdAt: -1 });
});

test("contact filters search team-relevant lead fields", () => {
  const filters = leadFilters({ q: "Toronto", source: "contact", inquiryType: "Website" }, new Set(["new"]));
  assert.equal(filters.source.test("public-contact"), true);
  assert.equal(filters.inquiryType.test("Website Project Inquiry"), true);
  assert.equal(filters.$or.length, 8);
});

test("notification audience filters distinguish internal and recipient email", () => {
  const internal = notificationFilters({ audience: "internal", q: "gmail" });
  assert.deepEqual(internal.recipients.$all, ["info@mspixelpulse.com", "mspixelpulse@gmail.com"]);
  assert.equal(internal.$or.length, 4);

  const recipient = notificationFilters({ audience: "recipient" });
  assert.deepEqual(recipient.$nor, [{ recipients: { $all: ["info@mspixelpulse.com", "mspixelpulse@gmail.com"] } }]);
});

