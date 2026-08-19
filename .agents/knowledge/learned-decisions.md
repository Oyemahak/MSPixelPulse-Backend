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

- Date: 2026-08-19
- Source: User production invoice workflow specification and existing Google Sheets/Drive invoice architecture
- Decision or note: Persist explicit payment-stage, project-value, due-preset, payment-method, terms, closing, footer, and page-number fields while retaining legacy `kind` compatibility and the existing encrypted Drive relay.
- Evidence: `Invoice.js` and `invoice.controller.js` normalize and serialize the expanded fields; 107 backend tests pass; `verifyGoogleRuntime.js` now creates and relay-uploads a generated custom 25% PDF invoice, reloads the exact balance and metadata as the assigned client, and deletes all test records/files.
- Affected areas: Invoice schema/provider rows, Admin settings, invoice create/update/upload APIs, client-safe billing reads, production runtime verification
- Confidence: High
- Reviewer: Production runtime verification required after backend deployment
