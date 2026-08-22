# Product Knowledge

## Public Website
Home, Projects, Services, Pricing, Contact, Login, and Start Project flows.

## Roles
Visitor, Applicant, Client, Admin, and Developer where supported by product policy.

## Production Infrastructure
React/Vite frontend, Node/Express API, Google Sheets, Google Drive, JWT authentication, Resend email, and Vercel hosting for both applications.

Google Sheets is the production structured-data database. Google Drive is the production file/object store. MongoDB, Supabase, and Render are not production runtime providers.

Mongoose-shaped schemas/models may remain only as compatibility/query facades over the Google provider layer. Do not create a MongoDB runtime connection because model files still exist.

## Production Health Contract

Healthy production must report through `/api/health`:

- data provider: `google`
- storage provider: `google-drive`
- Google client configured
- production spreadsheet configured
- production Drive configured
- Resend email configured when transactional email is required

## Core Portal Contract

Every visible portal action must map to a real, persistent backend operation.

Admin must be able to manage normal users, allowed role/status changes, activation/suspension, passwords, project assignments, projects, requirements, invoices/files, rooms/messages, support, leads, tasks, and content while protected-super-admin safeguards remain enforced.

Clients must be able to use all promised self-service and assigned-project workflows, including profile persistence, avatar upload/replace/delete, requirements/files, billing visibility, messaging, attachments, and support.

Developers must be able to use all promised assigned-project workflows, including permitted project operations, messages, attachments, evidence/deliverables, and related actions.

Writes must survive navigation, refresh, logout/login, new browser sessions, and new Vercel function instances.

## Verified Role CRUD Baseline — 2026-08-15

A disposable production E2E run completed with 35 passed checks, 0 failures, and complete cleanup. The verified baseline covers:

- disposable Admin, Developer, and Client creation
- Admin user list/detail reads
- identity updates for normal users
- password updates and fresh login
- `/auth/me` for all three roles
- profile persistence for all three roles
- Admin API denial for Developer and Client
- Admin API access for Admin
- Developer role mutation/restoration
- Client suspension/reactivation persistence
- permanent deletion and post-delete verification

Treat this as the minimum regression baseline for future auth/account CRUD changes.

## Authentication And Session Contract

- `src/middleware/auth.js` is the centralized JWT/account authorization path.
- `/api/auth/me` must pass through `requireAuth`; do not maintain a separate stale-cache-sensitive auth implementation.
- Password changes increment `authVersion`, invalidate older JWTs, and require a new login token.
- Authentication-sensitive user reads may use bounded cache for quota control, but stale state must receive a fresh Google Sheets reread before denying a valid session.
- Provider outages/timeouts must not be mislabeled as invalid credentials.

## Google Sheets Performance Contract

Google Sheets is durable storage, not a low-latency transactional database. Agents must minimize redundant reads/writes:

- prefer bounded caching for general reads
- use targeted fresh reads for credential/account correctness
- invalidate/update cache after mutations
- avoid portal polling loops and duplicate mount requests
- batch work when repository APIs support it
- recognize 429/502/503/504 as potentially transient infrastructure signals during controlled test tooling, without hiding persistent failures

## File Security

Private Drive files stay private. Browser reads use a backend-authorized file proxy or a short-lived MSPixelPulse signed file URL scoped to one Drive file. Admin access and Client/Developer access must still respect application authorization rules. Never expose Google OAuth secrets or make managed Drive folders public as a workaround.

Small uploads may pass through the API within platform limits. Larger files should use the authorized resumable Google Drive flow. For invoices, the API relays bounded chunks using an encrypted, expiring session token so private Google upload URLs remain server-side. Completion must re-check user/project authorization before metadata becomes active.

## Billing And Invoice Contract

Admin billing supports generated branded PDFs and uploaded external invoices as separate source types. Invoice records persist sender/client identity, line items, discounts, optional tax, totals, payments, balances, notes, paper size, status, and private internal notes. Invoice defaults are stored as unpublished private site content and must never be returned from public content routes.

Invoice records also persist `paymentStage`, `paymentPercent`, `projectValue`, and `paymentTermsPreset`, while legacy `kind` remains compatible. Supported stages are full (100%), advance (50%), remaining (50%), custom percentage/amount, and other amount. Due-on-receipt, Net 7, Net 14, Net 30, and custom-date presets store an exact due date. Generated PDFs receive only Admin-configured payment methods/instructions, scope/refund terms, closing copy, footer text, and page-number preference; private banking data must never be hardcoded.

Tax is off by default. Never copy sample GST/HST registration details, small-supplier statements, legal claims, or tax status into production configuration without explicit business-owner input. Client reads exclude drafts, archives, and `internalNotes`; all file access remains scoped to authorized projects and backend-signed Drive access.

Payments use `POST /api/projects/:projectId/invoices/:invoiceId/payments` with a required idempotency key. The server validates amount and overpayment, issues stable payment/receipt identifiers, writes an immutable receipt snapshot, generates a private one-page Letter or A4 PDF, and updates invoice paid/balance/status state. Replaying the same key returns the original successful result.

Receipts are first-class retained records. Authorized Admin/Client reads are project-scoped, Admin void requires a reason, and void never deletes or renumbers a record. Generic invoice update payloads must not mutate payments, `amountPaid`, or `balanceDue`; an invoice with receipt history cannot be deleted.

## Notification Contract

All role-aware events go through the central portal event service. Categories are requirements, projects, messages, announcements, evidence, billing, leads, approvals, support, and system. Each in-app record stores a recipient, role-safe action URL, category, title, message, metadata, read timestamp, and creation timestamp.

Email copies use deterministic `[MSP:CATEGORY]` subjects and `X-MSPixelPulse-Category`. Admin email-category settings are stored in `SiteContent`; disabling one email category does not disable in-app records. Operational delivery has exactly one configured recipient and must not duplicate the existing application recipient mail flow.

## Presence Contract

User records persist `lastActivityAt`, `lastSeenAt`, and `presenceState`. Login and heartbeat mark online activity; authenticated logout marks explicit offline state. Presence presentation gives explicit offline state precedence over timestamp freshness and safely reports missing or malformed activity as offline.

## Testing Rule

Unit tests are necessary but not sufficient. For changes affecting roles, auth, persistence, files, or portal CRUD, verify the relevant disposable Admin/Developer/Client workflow against the Google-backed runtime and remove all test data afterward.

The protected real production Admin must never be mutated as a test subject. Use a disposable Admin created only for the test run.

## Workflows
Visitor browses work, reviews services/pricing, starts a project, applicant submits requirements, admin reviews and approves, client accesses portal, client uploads files, admin/client/developer communicate according to access rules, project progress is managed, billing and support records persist, and testimonials may be reviewed and published.

Detailed production rules live in `.agents/PRODUCTION-ARCHITECTURE.md` and are required reading for relevant work.
