# Learned Decisions

Use the Knowledge Update Protocol before editing this file.

## Entry Format
- Date:
- Source:
- Decision or note:
- Evidence:
- Affected areas:
- Confidence:
- Reviewer:

## Entries

- Date: 2026-08-22
- Source: User production-upgrade specification, provider architecture, and receipt render QA
- Decision or note: Use central event fan-out for persistent role-aware notifications and supplementary operational email. Route accepted payments only through an idempotent endpoint that issues retained payment/receipt records and immutable financial snapshots.
- Evidence: `portalEvents.js`, provider repositories, dedicated payment/receipt controller, 118 backend tests, and ten visually rendered Letter/A4 receipt fixtures.
- Affected areas: Google Sheets schema, project/requirement/message/lead/support/auth events, invoice totals/status, private Drive receipts, operational email
- Confidence: High
- Reviewer: Production API, role, Gmail, and storage verification required after deployment

- Date: 2026-08-19
- Source: User production invoice workflow specification and existing Google Sheets/Drive invoice architecture
- Decision or note: Persist explicit payment-stage, project-value, due-preset, payment-method, terms, closing, footer, and page-number fields while retaining legacy `kind` compatibility and the existing encrypted Drive relay.
- Evidence: `Invoice.js` and `invoice.controller.js` normalize and serialize the expanded fields; 107 backend tests pass; `verifyGoogleRuntime.js` now creates and relay-uploads a generated custom 25% PDF invoice, reloads the exact balance and metadata as the assigned client, and deletes all test records/files.
- Affected areas: Invoice schema/provider rows, Admin settings, invoice create/update/upload APIs, client-safe billing reads, production runtime verification
- Confidence: High
- Reviewer: Production runtime verification required after backend deployment
