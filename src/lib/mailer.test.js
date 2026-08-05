import test from "node:test";
import assert from "node:assert/strict";
import {
  PUBLIC_BUSINESS_EMAIL,
  SECONDARY_NOTIFICATION_EMAIL,
  mailerStatus,
  notificationRecipients,
  sendMail,
} from "./mailer.js";

test("internal notifications always retain info and add the Gmail inbox", () => {
  const previous = process.env.NOTIFICATION_RECIPIENTS;
  process.env.NOTIFICATION_RECIPIENTS = "extra@example.com,INFO@mspixelpulse.com";
  const recipients = notificationRecipients();
  assert.deepEqual(recipients, [PUBLIC_BUSINESS_EMAIL, SECONDARY_NOTIFICATION_EMAIL, "extra@example.com"]);
  if (previous === undefined) delete process.env.NOTIFICATION_RECIPIENTS;
  else process.env.NOTIFICATION_RECIPIENTS = previous;
});

test("Resend is preferred and receives the complete notification payload", async () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  const originalFetch = globalThis.fetch;
  let request;

  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_EMAIL = "MSPixelPulse <info@mspixelpulse.com>";
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "email_test_123" }),
    };
  };

  try {
    assert.deepEqual(mailerStatus(), { configured: true, provider: "resend" });
    const result = await sendMail({
      to: [PUBLIC_BUSINESS_EMAIL, SECONDARY_NOTIFICATION_EMAIL],
      subject: "Notification test",
      html: "<p>Notification body</p>",
      text: "Notification body",
      replyTo: "visitor@example.com",
    });
    const payload = JSON.parse(request.options.body);

    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.options.headers.Authorization, "Bearer test-resend-key");
    assert.deepEqual(payload.to, [PUBLIC_BUSINESS_EMAIL, SECONDARY_NOTIFICATION_EMAIL]);
    assert.equal(payload.from, "MSPixelPulse <info@mspixelpulse.com>");
    assert.equal(payload.reply_to, "visitor@example.com");
    assert.equal(result.id, "email_test_123");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = previousFrom;
  }
});

test("email delivery fails fast when Resend is not configured", async () => {
  const previousKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    assert.deepEqual(mailerStatus(), { configured: false, provider: "unconfigured" });
    await assert.rejects(
      sendMail({
        to: PUBLIC_BUSINESS_EMAIL,
        subject: "Notification test",
        html: "<p>Notification body</p>",
        text: "Notification body",
      }),
      { code: "RESEND_NOT_CONFIGURED" },
    );
  } finally {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }
});
