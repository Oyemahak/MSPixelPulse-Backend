# Reusable Components

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
- Source: Notification and receipt workflow implementation
- Decision or note: Reuse `emitPortalEvent` for cross-role product events, the notification repository/API for read state, and `generateReceiptPdf` plus the receipt repository for every accepted payment. Do not add controller-specific email recipient logic or invoice-embedded receipt files.
- Evidence: Central event categories/recipient resolution, deterministic mail headers, idempotent payment controller, shared Letter/A4 generator, and focused tests.
- Affected areas: Controllers, API routes, Google provider rows, Resend, Gmail organization, Drive invoice hierarchy
- Confidence: High
- Reviewer: Backend, API, security, database, storage, and QA review required for new event categories
