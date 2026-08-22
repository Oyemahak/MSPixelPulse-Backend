# Shared Context

MSPixelPulse is a Toronto, Ontario web agency project focused on professional, responsive, business-focused websites and persistent client/project workflows.

Current production site: https://mspixelpulse.com
Current backend: https://api.mspixelpulse.com

Repository focus: Node/Express API, Google Sheets data, Google Drive storage, JWT authentication, role-based authorization, Vercel deployment, and reliable Admin/Client/Developer portal CRUD.

## Current Production Source Of Truth

- Google Sheets is the production structured application database.
- Google Drive is the production managed private file store.
- Vercel hosts both frontend and backend.
- Resend handles configured transactional email.
- MongoDB, Supabase, and Render are not production runtime providers and must not be reintroduced.
- Mongoose-shaped models may remain only as compatibility/query facades over the Google provider layer; their presence does not mean MongoDB is active.
- `/api/health` must report `providers.data = google` and `providers.storage = google-drive` before production is considered healthy.

## Verified Production Behavior — 2026-08-15

A disposable production role-CRUD E2E run completed with 35 checks passed, 0 failed, and complete cleanup. Verified behavior includes:

- bootstrap Admin authentication
- disposable Admin/Developer/Client creation
- Admin list/detail reads
- normal-user identity updates
- password changes and re-login after auth-version change
- Admin, Developer, and Client `/auth/me` identity verification
- profile persistence for all three roles
- Developer/Client denial from Admin APIs
- disposable Admin access to Admin APIs
- Developer role change and restoration
- Client suspension/reactivation and persistence
- permanent deletion of disposable accounts with post-delete verification

The real protected production Admin account must never be used as a mutation test subject. It may only bootstrap disposable Admin test accounts and remove them afterward.

## Portal Notifications And Payment Receipts — 2026-08-22

- `PortalNotifications` and `Receipts` are production Google Sheets tabs behind repository adapters; do not bypass them with local-only state or a new database provider.
- Invoice payment state changes only through the dedicated idempotent payment endpoint. Generic invoice update/delete logic must not create, edit, or erase accepted payment history.
- Every accepted payment creates stable `MSP-PAY-*` and `MSP-RCT-*` identifiers, an immutable receipt snapshot, and a private generated PDF stored through the existing Google Drive boundary.
- Admin may void a receipt with a required audit reason. Void retains the identifier, original snapshot, record, and private document; receipts are never deleted or renumbered.
- Role-aware in-app notifications are the authoritative record. Operational email is supplementary, uses deterministic `[MSP:CATEGORY]` subjects, and defaults to `mspixelpulse@gmail.com` unless configured.
- Notification and operational-email failures must not roll back an otherwise successful business mutation.

## Authentication Rules

- JWT auth and account authorization are centralized in `src/middleware/auth.js`.
- `/api/auth/me` must use the same hardened `requireAuth` path rather than independently reimplementing JWT/account checks.
- Password changes increment `authVersion`; old JWTs must become invalid.
- Google Sheets row caching is allowed for quota control, but stale cached auth/account state must receive one authoritative fresh reread before returning 401.
- Remote provider failures are availability failures, not bad credentials; avoid misreporting provider errors as 401.

## Google Sheets / Vercel Performance Rules

- Vercel instances can have independent warm in-memory caches.
- Mutations must update or invalidate relevant caches.
- Authentication-sensitive reads must be fresh when stale data could wrongly grant or deny access.
- Do not disable all caching as a shortcut; aggressive uncached reads can exhaust Google Sheets quotas.
- Production test tooling may retry transient 429/502/503/504 responses with bounded backoff, but product code must still expose real persistent failures.
- Avoid high-frequency polling or duplicate reads in portal pages.

## File Rules

- Private Drive files remain private.
- Browser reads must use backend-authorized proxy/signed access scoped to the correct file and role/project ownership.
- Never expose Google OAuth secrets, refresh tokens, client secrets, password hashes, or private Drive credentials to the browser.
- File deletion/replacement promised by the UI must remove/update both Drive storage and metadata as product semantics require.

All agents must read `.agents/PRODUCTION-ARCHITECTURE.md` and `.agents/PRODUCT-KNOWLEDGE.md` before changing authentication, authorization, CRUD, persistence, files, Google providers, portal behavior, or deployment.

Agents must protect production behavior, inspect existing files first, avoid secrets, preserve role boundaries, verify persistence after refresh/logout/login, distinguish transient infrastructure failures from application bugs, and communicate truthfully.
