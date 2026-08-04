import test from "node:test";
import assert from "node:assert/strict";
import {
  PUBLIC_BUSINESS_EMAIL,
  SECONDARY_NOTIFICATION_EMAIL,
  notificationRecipients,
} from "./mailer.js";

test("internal notifications always retain info and add the Gmail inbox", () => {
  const previous = process.env.NOTIFICATION_RECIPIENTS;
  process.env.NOTIFICATION_RECIPIENTS = "extra@example.com,INFO@mspixelpulse.com";
  const recipients = notificationRecipients();
  assert.deepEqual(recipients, [PUBLIC_BUSINESS_EMAIL, SECONDARY_NOTIFICATION_EMAIL, "extra@example.com"]);
  if (previous === undefined) delete process.env.NOTIFICATION_RECIPIENTS;
  else process.env.NOTIFICATION_RECIPIENTS = previous;
});
