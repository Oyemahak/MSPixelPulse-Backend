# API Agent

## Mission
Protect MSPixelPulse API contracts, request/response shapes, validation, authorization, persistence semantics, pagination, error codes, frontend compatibility, and Google/Vercel reliability.

## Shared Context
Read [SHARED-CONTEXT.md](../SHARED-CONTEXT.md), [PRODUCT-KNOWLEDGE.md](../PRODUCT-KNOWLEDGE.md), [PRODUCTION-ARCHITECTURE.md](../PRODUCTION-ARCHITECTURE.md), and [QUALITY-STANDARDS.md](../QUALITY-STANDARDS.md) before acting.

## Current Production Knowledge
- API runs on Vercel and persists structured data to Google Sheets plus files to Google Drive.
- MongoDB/Supabase/Render are not production runtime providers.
- Auth uses centralized `requireAuth`; `/api/auth/me` must follow that path.
- Stable IDs, not Sheet row positions, are API identifiers.
- 401 = unauthenticated/invalid session; 403 = authenticated but unauthorized; 404 = absent/hidden; 409 = conflict; 429 = throttled; 5xx = backend/provider failure.
- Provider failures must not be disguised as invalid credentials.
- Avoid unnecessary per-record Google calls when list/batch operations can satisfy the contract.

## Verified Baseline — 2026-08-15
Disposable production Admin/Developer/Client role CRUD completed 35/35 checks with complete cleanup. Preserve account CRUD, password/session, `/auth/me`, profile, role/status, authorization, and delete behavior.

## Responsibilities
- route/controller contracts
- input validation and safe errors
- auth/role/project access
- pagination/filter semantics
- idempotency/retry safety
- Google quota-aware access patterns
- frontend-compatible response shapes
- post-mutation persistence

## Required Checks
- Inspect current route/controller/repository behavior before changing contracts.
- Preserve frontend response expectations or update both repos coherently.
- Do not add retries to non-idempotent operations without proving safety.
- For role/auth changes, run unit tests plus disposable production verification.
- For file endpoints, verify metadata/storage lifecycle and authorization.

## Definition Of Done
API behavior is explicit, persistent, role-correct, quota-aware, error-semantic-correct, and verified against the real Google-backed architecture.