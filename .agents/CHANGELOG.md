# Agent System Changelog

## 2026-08-22
- Added first-class `PortalNotifications` and `Receipts` provider-backed records, central event fan-out, role-aware recipients/deep links, explicit read state, and Admin operational-email category settings.
- Added dedicated idempotent payment recording, stable payment/receipt identifiers, immutable snapshots, invoice-status reconciliation, retained void audit records, and private one-page Letter/A4 receipt PDFs.
- Added deterministic Gmail category subjects/headers and an idempotent exact-account label/filter provisioner that archives only managed category mail.
- Added focused notification, Gmail-filter, and PDF regression tests plus ten visual receipt fixtures.

## 2026-08-19
- Persisted payment stage, percentage, project value, due preset, configured payment methods, professional terms, closing copy, footer text, and page numbering without breaking legacy invoice `kind` values.
- Expanded production runtime verification to generate and relay-upload a PDF invoice, reload the exact custom 25% calculation, and confirm assigned-client visibility before complete cleanup.

## 2026-08-18
- Added the generated/uploaded invoice contract, configurable private defaults, optional-tax safety, payment/balance calculation, expanded statuses, and client-safe serialization requirements.
- Added persisted presence guidance for login, authenticated heartbeat, explicit logout, and normalized last-activity display.

## 2026-08-15
- Refreshed shared agent knowledge for the completed Google Sheets + Google Drive + Vercel production architecture.
- Recorded that MongoDB, Supabase, and Render are not production runtime providers.
- Added the verified disposable Admin/Developer/Client role CRUD baseline: 35 passed, 0 failed, full cleanup.
- Recorded centralized `requireAuth`, `/api/auth/me` alignment, `authVersion` invalidation, and fresh Users reread behavior for stale Vercel cache state.
- Added Google Sheets quota/cache guidance and bounded transient 429/502/503/504 handling for controlled test tooling.
- Retrained Database, Storage, Authentication/Security, API, Performance, QA, and Deployment specialist guidance.
- Updated Agent Roster so every specialist inherits Shared Context, Product Knowledge, and Production Architecture.

## 2026-07-11
- Created MSPixelPulse multi-agent operating system documentation.
- Added shared standards, specialist agents, workflows, checklists, templates, and knowledge protocol.
