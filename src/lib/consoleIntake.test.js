import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildConsoleIntakePayload,
  consoleIntakeConfig,
  forwardLeadToConsole,
  signConsoleIntake,
  startConsoleIntake,
} from "./consoleIntake.js";

const secret = ["intake", "test", "value"].join("-").padEnd(40, "k");
const env = { CONSOLE_INTAKE_URL: "https://console.example.com/api/intake/inquiry", CONSOLE_INTAKE_SECRET: secret };
const lead = {
  _id: "lead-123",
  name: "Example Visitor",
  email: "visitor@example.com",
  phone: "555-0100",
  businessName: "Example Bakery",
  service: "Website redesign",
  inquiryType: "Website Inquiry",
  message: "Please help with our website.",
  sourceUrl: "https://mspixelpulse.example.com/contact",
  createdAt: new Date("2026-09-01T12:00:00.000Z"),
  ip: "203.0.113.9",
  ua: "ExampleBrowser/1.0",
  emailDeliveryStatus: "sent",
};

function recordingFetch(response = { ok: true, status: 202 }) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return response;
  };
  return { calls, fetchImpl };
}

test("the signed request matches an independent HMAC computation", async () => {
  const { calls, fetchImpl } = recordingFetch();
  const result = await forwardLeadToConsole(lead, { env, fetchImpl, now: () => 1790000000123 });
  assert.equal(result.status, "sent");
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url, env.CONSOLE_INTAKE_URL);
  assert.equal(options.method, "POST");
  assert.equal(options.headers["Content-Type"], "application/json");
  assert.equal(options.headers["X-MSP-Timestamp"], "1790000000");
  const expected = crypto.createHmac("sha256", secret).update(`1790000000.${options.body}`).digest("hex");
  assert.equal(options.headers["X-MSP-Signature"], `v1=${expected}`);
  assert.equal(signConsoleIntake(secret, "1790000000", options.body), `v1=${expected}`);
  assert.ok(options.signal instanceof AbortSignal);
});

test("the payload carries only contract fields and never the IP address or user agent", async () => {
  const { calls, fetchImpl } = recordingFetch();
  await forwardLeadToConsole(lead, { env, fetchImpl });
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body, {
    externalId: "lead-123",
    name: "Example Visitor",
    email: "visitor@example.com",
    phone: "555-0100",
    businessName: "Example Bakery",
    service: "Website redesign",
    inquiryType: "Website Inquiry",
    message: "Please help with our website.",
    sourceUrl: "https://mspixelpulse.example.com/contact",
    createdAt: "2026-09-01T12:00:00.000Z",
  });
  assert.ok(!calls[0].options.body.includes("203.0.113.9"));
  assert.ok(!calls[0].options.body.includes("ExampleBrowser"));
  assert.equal("website" in body, false, "sourceUrl is never reused as the visitor website");
});

test("the website is forwarded only when the lead has one", () => {
  assert.equal(buildConsoleIntakePayload({ ...lead, website: "https://bakery.example.com" }).website, "https://bakery.example.com/");
  assert.equal(buildConsoleIntakePayload({ ...lead, website: "javascript:alert(1)" }).website, undefined);
  assert.equal(buildConsoleIntakePayload({ ...lead, _id: "" }), null);
});

test("no request is made unless both variables are set and the URL is https", async () => {
  const cases = [
    {},
    { CONSOLE_INTAKE_URL: env.CONSOLE_INTAKE_URL },
    { CONSOLE_INTAKE_SECRET: secret },
    { CONSOLE_INTAKE_URL: "http://console.example.com/api/intake/inquiry", CONSOLE_INTAKE_SECRET: secret },
    { CONSOLE_INTAKE_URL: "not a url", CONSOLE_INTAKE_SECRET: secret },
    { CONSOLE_INTAKE_URL: env.CONSOLE_INTAKE_URL, CONSOLE_INTAKE_SECRET: "too-short" },
  ];
  for (const candidate of cases) {
    const { calls, fetchImpl } = recordingFetch();
    assert.equal(consoleIntakeConfig(candidate), null);
    const result = await forwardLeadToConsole(lead, { env: candidate, fetchImpl });
    assert.equal(result.status, "skipped");
    assert.equal(calls.length, 0);
  }
});

test("timeouts, network errors and error statuses never throw and log only a short code", async () => {
  const logged = [];
  const originalWarn = console.warn;
  console.warn = (...args) => logged.push(args.join(" "));
  try {
    const hanging = (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason));
    });
    assert.deepEqual(
      await forwardLeadToConsole(lead, { env, fetchImpl: hanging, timeoutMs: 20 }),
      { status: "failed", code: "CONSOLE_INTAKE_TIMEOUT" },
    );
    const failing = async () => { throw new TypeError("fetch failed for visitor@example.com"); };
    assert.deepEqual(
      await forwardLeadToConsole(lead, { env, fetchImpl: failing }),
      { status: "failed", code: "CONSOLE_INTAKE_NETWORK" },
    );
    const { fetchImpl } = recordingFetch({ ok: false, status: 401 });
    assert.deepEqual(
      await forwardLeadToConsole(lead, { env, fetchImpl }),
      { status: "failed", code: "CONSOLE_INTAKE_HTTP_401" },
    );
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(logged.length, 3);
  for (const line of logged) {
    assert.match(line, /^\[lead\] console intake: CONSOLE_INTAKE_[A-Z0-9_]+$/);
  }
});

test("oversized messages are trimmed to fit the intake body limit", async () => {
  const { calls, fetchImpl } = recordingFetch();
  await forwardLeadToConsole({ ...lead, message: "é".repeat(12000) + "x".repeat(20000) }, { env, fetchImpl });
  assert.ok(Buffer.byteLength(calls[0].options.body) <= 32000);
});

test("on Vercel the delivery is handed to waitUntil; elsewhere the bounded delivery is awaited", async () => {
  const { calls, fetchImpl } = recordingFetch();
  const scheduled = [];
  const pending = await startConsoleIntake(lead, {
    env, fetchImpl, requestContext: { waitUntil: (promise) => scheduled.push(promise) },
  });
  assert.equal(pending.status, "scheduled");
  assert.equal(scheduled.length, 1);
  assert.equal((await scheduled[0]).status, "sent");

  const direct = await startConsoleIntake(lead, { env, fetchImpl, requestContext: null });
  assert.equal(direct.status, "sent");
  assert.equal(calls.length, 2);
});
