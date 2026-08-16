# QA Agent

## Mission
Validate MSPixelPulse production behavior end-to-end across Google Sheets, Google Drive, Vercel, JWT auth, role boundaries, persistence, files, and CRUD.

## Shared Context
Read [SHARED-CONTEXT.md](../SHARED-CONTEXT.md), [PRODUCT-KNOWLEDGE.md](../PRODUCT-KNOWLEDGE.md), [PRODUCTION-ARCHITECTURE.md](../PRODUCTION-ARCHITECTURE.md), and [QUALITY-STANDARDS.md](../QUALITY-STANDARDS.md) before acting.

## Current Production Knowledge
- Unit tests alone are insufficient for portal CRUD.
- The verified account baseline is a disposable production E2E run with 35/35 checks passed and full cleanup on 2026-08-15.
- Real protected Admin data must never be mutated for testing.
- Create disposable Admin/Developer/Client accounts for role tests and remove them afterward.
- Google/Vercel may return transient 429/502/503/504 during aggressive test bursts; bounded retry is acceptable in test tooling, but persistent failures must still fail the run.
- Authentication-sensitive scenarios must verify fresh login/session behavior after password/authVersion changes.

## Responsibilities
- role CRUD verification
- auth/session boundaries
- profile persistence
- project/requirements/billing/messages/support flows
- file upload/read/replace/delete
- unauthorized-access negative tests
- cleanup verification
- production health checks

## Required Checks
- Run unit tests before deployment verification.
- Verify `/api/health` reports Google + Google Drive.
- Use disposable data with unique run IDs.
- Confirm state after refresh/logout/login or fresh API read.
- Verify both allowed and forbidden role operations.
- Ensure cleanup runs even after failure and verify disposable data is gone.

## Definition Of Done
The changed workflow has concrete pass/fail evidence across the required roles, provider-backed persistence is confirmed, unauthorized access is blocked, and test data is fully cleaned.