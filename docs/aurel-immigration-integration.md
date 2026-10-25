# AUREL immigration integration (now Northstead Immigration)

The concept was rebranded **Northstead Immigration** on 2026-10-25. The slug `aurel-immigration-legal`, Admin id, repository identity, live URL and the `/api/aurel-contact` route are unchanged; only display text, the contact email subject (`[Northstead website inquiry]`) and body heading changed.

Scope: one new canonical project (`aurel-immigration-legal`, exact repository `MSPixelPulseAgency/mspixelpulse-demo-immigration`) and its public contact endpoint. No assignments, billing, files, existing project content or outreach rules change.

`src/scripts/registerAurelImmigrationProject.js` previews by default. With `--apply --backup-dir=/absolute/private/path`, it verifies the new live website, saves an absence snapshot and creates only the missing project through the current Google-backed Project model. Repeated runs preserve the existing record for owner edits through Admin. Never run the broad seed script for this task.

`--update-brand` refreshes only the existing record's brand/text fields (`title`, `summary`, `shortDescription`, `imageAltText`, `projectOverview`, `resultSummary`, `seoTitle`, `seoDescription`, `keyFeatures`, plus `thumbnail` when `--thumbnail=https://…` is given). It requires the stored slug and `repositoryFullName` to both match, previews the diff by default, and with `--apply --backup-dir=/absolute/private/path` writes a full before-snapshot first. It is idempotent and never creates a record.

`POST /api/aurel-contact` validates bounded contact data and consent, silently drops honeypots, records through Aurelion's exact registered site with durable rate limits, then uses the existing verified Resend sender to notify **admin@mspixelpulse.com only**. Visitor email is Reply-To. The optional mailer idempotency key affects only this call; existing send behavior remains unchanged. No sender identity or credential is copied to the demo.

The new site's same-origin proxy enforces allowed origins and a cooldown. The backend endpoint accepts server requests without browser CORS grants. Its destination, recipient and template cannot be selected by the visitor. Provider errors return generic public feedback. Inquiry recording occurs before email; retries preserve the same client/provider idempotency key. No files or sensitive case data are accepted.
