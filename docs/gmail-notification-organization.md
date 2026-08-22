# Gmail organization for portal notifications

Production email remains on Resend. Portal-event copies are sent only to `mspixelpulse@gmail.com` through `PORTAL_OPERATIONAL_NOTIFICATION_EMAIL`; public confirmations and other customer-facing messages retain their existing recipients.

Every operational message uses a deterministic `[MSP:CATEGORY]` subject prefix and `X-MSPixelPulse-Category` header. The setup command creates the `MSPixelPulse` parent label, ten category labels, and subject filters that apply the category label and remove `INBOX` while leaving each message searchable and unread:

```bash
npm run gmail:setup-notification-labels
```

Create a dedicated OAuth client/consent grant for `mspixelpulse@gmail.com` with only these Gmail API scopes:

- `https://www.googleapis.com/auth/gmail.labels`
- `https://www.googleapis.com/auth/gmail.settings.basic`

Set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and optional `GMAIL_REDIRECT_URI` in the secure backend environment. Never commit the values. The script verifies the authenticated profile is exactly `mspixelpulse@gmail.com`, is idempotent, preserves unrelated labels and filters, and runs only when invoked manually.

Production provisioning was completed on 2026-08-22 through the signed-in Gmail filter import because the existing production Google token is intentionally limited to Sheets and Drive scopes. The live filters match only the unique `subject:([MSP:CATEGORY])` tags, skip Inbox, and apply the corresponding nested label. Existing email was not reprocessed. The CLI remains the preferred idempotent maintenance path after a dedicated Gmail-scoped token is configured.

Verification: run the command, send one tagged test event per category, confirm it is absent from Inbox, present under the expected `MSPixelPulse/...` label, searchable by its subject tag, and still unread. To roll back, delete only filters matching a deterministic `[MSP:CATEGORY]` subject and then remove the `MSPixelPulse/...` labels if no longer needed. Removing filters does not delete existing messages.
