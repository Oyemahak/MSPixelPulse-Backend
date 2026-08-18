# MSPixelPulse Production Architecture

This file is a required source of truth for every coding agent working on MSPixelPulse.

## Production Runtime

- Public site: `https://mspixelpulse.com`
- Backend API: `https://api.mspixelpulse.com`
- Frontend hosting: Vercel
- Backend hosting: Vercel
- Structured application data: Google Sheets
- File/object storage: Google Drive
- Authentication: MSPixelPulse JWT/session logic backed by the `Users` Sheet
- Email delivery: Resend

MongoDB, Supabase, and Render are not production runtime providers. Do not add new production dependencies on them.

## Google Sheets Is The Application Database

The production spreadsheet is the durable structured-data store. Core tabs include:

- Users
- Projects
- ProjectMembers
- Requirements
- Messages
- Rooms
- Threads
- Invoices
- Files
- Leads
- Tasks
- Notifications
- BlogComments
- BlogReactions
- BlogShares
- BlogSubscribers
- SiteContent
- SupportTickets

Stable application IDs are authoritative. Spreadsheet row numbers are implementation details only.

Mongoose-shaped schemas/models may remain as controller/query compatibility facades while persistence is routed through the Google provider layer. Do not create a MongoDB connection or treat model presence as evidence that MongoDB is active.

## Google Drive Is The File Store

All private portal files must live in managed Google Drive folders and be represented by metadata in the `Files` Sheet.

Expected managed hierarchy:

- MSPixelPulse production root
  - Client files
    - one managed folder per client/user
      - Profile
      - Documents
      - Requirements where applicable
  - Project files
    - one managed folder per project
      - Requirements
      - Invoices
      - Deliverables
      - Message Attachments
      - Uploads

Do not expose the Google OAuth refresh token, client secret, raw Drive credentials, password hashes, or private Drive file URLs to the browser.

## File Read Authorization

Private Drive content is private by default.

Supported read paths:

1. A short-lived MSPixelPulse signed file-access token scoped to exactly one Drive file; or
2. An authenticated portal request whose user is authorized to read the owning project or user-scoped file.

Admins may read managed portal files required for administration. Clients and developers may read only files allowed by project membership/role policy. Public portfolio cover assets may be explicitly marked public.

The backend file proxy must perform authorization before streaming private bytes. Never make the production Drive root or client/project folders public as a shortcut.

## Upload Authorization

Small uploads may pass through the backend within platform body-size limits. Larger uploads should use an authorized Google Drive resumable upload session. Invoice uploads use an encrypted, expiring server-issued relay token and bounded chunks through the API; the browser must never receive the Google resumable-session URL.

Upload authorization must bind the session to the authenticated user, project/client scope, declared purpose, file metadata, and completion token. Completion must re-check authorization and validate Drive metadata before recording the file.

## Authentication Architecture

Authentication is centralized in `src/middleware/auth.js`.

- JWT signature verification, active-account checks, role/session validation, and stale Google user rereads belong in the shared auth middleware.
- `/api/auth/me` must pass through `requireAuth`; controllers must not duplicate a second independent JWT/account validation path.
- Password changes increment `authVersion`; pre-change JWTs are intentionally invalid.
- A fresh login must issue a JWT carrying the current `authVersion`.
- Vercel serverless instances may hold different warm in-memory cache snapshots. When cached auth/account state would reject a token, perform one authoritative fresh `Users` Sheet reread before returning 401.
- A Google provider outage or timeout is a service-availability problem, not invalid credentials. Do not convert provider errors into misleading 401 responses.

## CRUD Contract

CRUD behavior is a production requirement, not an optional enhancement.

### Admin

Admins must be able to perform every legitimate administrative operation exposed by the product, including:

- view and update normal user accounts
- change allowed role/status/profile fields
- activate/suspend accounts
- set/reset passwords without exposing stored password hashes
- assign/unassign projects
- create/read/update/delete projects
- manage requirements
- create/read/update/delete invoices and attached files
- read/manage project rooms and messages according to product policy
- manage support, leads, tasks, content, and portal records
- delete/replace managed files when the UI promises deletion/replacement

Protected super-admin safeguards must remain in place for destructive operations.

### Client

Clients must be able to perform all operations the UI promises for their own account and assigned projects, including profile persistence, avatar upload/replace/delete, requirements/files, billing visibility, project-room messaging, attachments, and support flows.

### Developer

Developers must be able to perform all operations the UI promises for projects assigned to them, including project visibility, permitted updates, room messaging, attachments, evidence/deliverables, and other role-authorized actions.

### Persistence

Successful writes must survive navigation, refresh, logout/login, a new browser session, and a new Vercel function instance. Never use in-memory state as the durable source of truth.

## Verified Production Role Baseline — 2026-08-15

A disposable production E2E run completed with 35 checks passed, 0 failed, and complete cleanup. Verified behavior:

- protected real Admin authenticated only for test bootstrap/cleanup
- disposable Admin creation and login
- disposable Developer and Client creation
- Admin list/detail reads
- Developer and Client identity updates
- disposable Admin password change and fresh login
- Developer and Client password changes
- Admin, Developer, and Client `/auth/me` identity verification
- Admin, Developer, and Client profile persistence
- Developer/Client rejection from Admin APIs
- disposable Admin access to Admin APIs
- Developer role mutation to Client and restoration to Developer
- Client suspension, persisted suspended status, reactivation, and persisted active status
- permanent deletion of Client, Developer, and disposable Admin
- post-delete verification that all disposable test users were absent

This is the minimum regression baseline for future authentication/account CRUD work.

The real protected production Admin must never be edited, role-changed, suspended, password-reset, or otherwise mutated as a test subject. Create a disposable Admin for test operations.

## Authorization Rules

- Authentication and authorization are separate concerns.
- Never authorize only because a client knows an ID or signed frontend URL.
- Admin routes must intentionally allow admins to manage normal users and portal resources.
- Client/developer access must be scoped by account status, application status where applicable, project membership, ownership, and operation type.
- Re-check authorization on destructive actions and resumable-upload completion.
- Return 401 for missing/invalid authentication and 403 for authenticated users lacking permission.

## Cache And Quota Rules

Google Sheets caching may be used to control quota, but correctness wins over cache convenience.

- Credential/account reads that affect login, password changes, role changes, suspension/activation, and authorization must be fresh when stale data could grant or deny access incorrectly.
- Mutations must update or invalidate the relevant cache.
- Do not disable all caching if doing so causes Google Sheets quota failures; prefer targeted fresh reads.
- Avoid duplicate portal reads, aggressive polling, and unnecessary per-entity requests when list/batch APIs can provide the same information.
- Controlled production E2E tooling may retry transient 429/502/503/504 responses with bounded backoff. Persistent failures must still fail the test.

## Required Verification Matrix

Before declaring portal work complete, test the relevant role end-to-end against production-like Google providers.

For Admin, Client, and Developer as applicable verify:

- login/logout/session refresh
- list/detail reads
- create
- update
- delete
- refresh persistence
- logout/login persistence
- authorization boundaries
- profile changes
- password reset/change flows
- avatar upload/replace/delete
- project CRUD and assignments
- requirement/file upload/read/delete
- generated invoice metadata and PDF upload, existing invoice upload, read/download, payment/status updates, delete/re-upload, private defaults, and client isolation
- persisted login/heartbeat/logout presence with explicit offline precedence and normalized last activity
- rooms/messages persistence
- message attachments
- support/task/content actions where exposed

For file operations additionally verify:

- Drive object exists in the expected managed folder
- `Files` metadata exists and matches the Drive object
- authorized users can read it
- unauthorized users cannot read it
- deletion removes both storage object and metadata when product semantics require permanent deletion
- replacement does not leave the previous object as an unintended active file

For invoice workflows additionally verify calculated line totals, discounts, optional tax, payments/balances, automatic status transitions, unique numbering, private settings, client-safe serialization, and secure file replacement cleanup.

## Deployment Rules

- Run backend tests before deploy.
- Run frontend lint/build before deploy.
- Check production health after deploy.
- Verify `/api/health` reports `data: google`, `storage: google-drive`, configured Google Sheets/Drive, and configured email.
- Verify the browser frontend targets the current production API.
- Do not reintroduce Render, Supabase, or MongoDB production environment variables.
- After auth/provider changes, verify a disposable-role production flow rather than relying only on unit tests.

## Agent Behavior

Every agent must inspect this file before changing authentication, authorization, CRUD, persistence, Google Sheets, Google Drive, portal APIs, deployment, or role behavior.

A passing unit test suite does not prove role-level CRUD is complete. Agents must pair automated tests with role-based API/UI verification for the workflow being changed.
