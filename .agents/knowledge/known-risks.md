# Known Risks

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
- Source: Gmail API provisioning boundary
- Decision or note: The exact `mspixelpulse@gmail.com` mailbox was provisioned on 2026-08-22 with the parent plus ten category labels and ten deterministic subject filters that skip Inbox. Future CLI reprovisioning still needs a Gmail-scoped refresh token; the production Sheets/Drive token does not include Gmail scope.
- Evidence: Signed-in Gmail verification showed all managed labels and ten active filters with Skip Inbox and the matching category label; existing mail was not reprocessed.
- Affected areas: Operational email triage only
- Confidence: High
- Reviewer: Recheck the exact mailbox after future category changes

- Date: 2026-08-22
- Source: Google Sheets sequence allocation under serverless concurrency
- Decision or note: Stable payment and receipt identifiers depend on unique stored IDs and idempotency keys. New payment code must preserve conflict checks and never generate numbers client-side; higher-volume allocation may require a stronger transactional counter if contention grows.
- Evidence: Current controller derives the next provider-backed sequence, enforces idempotent replay, and stores stable identifiers before returning success.
- Affected areas: Concurrent payment recording and audit identifiers
- Confidence: Medium
- Reviewer: Backend/database review before materially higher payment volume
