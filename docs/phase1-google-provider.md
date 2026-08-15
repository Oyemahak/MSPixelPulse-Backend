# Google provider layer: Phase 1 handoff

> Historical Phase 1 handoff. The completed migration architecture and current
> resource IDs are recorded in `docs/google-vercel-migration-2026-08-15.md`.

## Current data map

| Domain | Current Mongo model / relationship | Phase 1 Sheet tab |
| --- | --- | --- |
| Users and JWT identity | `User`; projects reference `client` and `developer` | `Users` |
| Projects | `Project`; client/developer assignments, portfolio fields, embedded evidence/announcements | `Projects` |
| Memberships | `Project.client` and `Project.developer` | `ProjectMembers` |
| Requirements | `Requirement.project`, `Requirement.client` | `Requirements` |
| Rooms and room messages | `Room.project`; `Message.room`, `Message.project`, `Message.author` | `Rooms`, `Messages` |
| Direct messages | `Thread.participants`; `Message.thread` | `Messages` (a `Threads` tab is required before direct-message cutover) |
| Billing | `Invoice.project`, `Invoice.client`, `Invoice.uploadedBy` | `Invoices` |
| Files | logical paths embedded in project/requirement/message/invoice/profile fields | `Files` plus Google Drive file IDs |
| Leads and tasks | `Lead`; `Task.project`, `Task.assignee` | `Leads`, `Tasks` |
| Notifications | `NotificationLog` | `Notifications` |
| Blog engagement | `BlogComment`, `BlogReaction`, `BlogShare`, `BlogSubscriber` | matching `Blog*` tabs |
| Public editable content | `SiteContent` | `SiteContent` |
| Support tickets | `SupportTicket.requester`, embedded replies | No supplied tab: keep Mongo fallback until a `SupportTickets` tab is provisioned |

The frontend has one backend boundary in `src/lib/api.js`; it has no direct MongoDB, Supabase Storage, Google Sheet, or Drive access. `VITE_API_BASE` must continue to point to the backend API during the staged backend migration.

## Audited dependency map

- MongoDB/Mongoose: `src/config/db.js`, `src/server.js`, all files in `src/models/`, auth middleware, project access helpers, user-deletion logic, maintenance/seed scripts, and feature controllers/routes for auth, admin, projects, invoices, requirements, rooms, direct messages, support, blog engagement, leads, content, directory, and audit logs.
- Supabase Storage: the compatibility façade `src/lib/supabase.js`, low-level adapter `src/storage/supabaseStorage.js`, profile avatars, requirements, project covers/evidence, invoices, room attachment URL refresh, generic uploads, presentation helpers, deletion cleanup, storage cleanup, and health reporting.
- Render-specific runtime: `src/server.js` owns the HTTP listener and Socket.IO server; `src/app.js` remains host-neutral Express middleware. The frontend API client takes `VITE_API_BASE` and does not hardcode a provider.
- Routes: `src/routes/index.js` composes all `/api` feature mounts. Its controllers retain current API request/response shapes; Phase 1 adds no public route contract change except the inactive-until-selected Drive download proxy at `/api/files/drive/:driveFileId`.

This audit is the reason the Phase 1 repositories are additive. Rewriting every controller to a new non-transactional data store before export validation would risk the live MongoDB authority and is deliberately deferred to staged Phase 2 cutover work.

## Provider contract

`DATA_PROVIDER` selects repository storage:

```text
mongodb     # default; current controllers and production remain unchanged
google      # use the new Sheets repository layer in controlled testing
```

`STORAGE_PROVIDER` selects file storage:

```text
supabase    # default
google-drive
```

Google secrets are server-only. Do not place them in the frontend or commit any `.env*` local file.

The two Drive IDs supplied with typographic en-dashes were normalized to ASCII hyphens in `.env.example`; copy the canonical IDs from Google Drive before running the live smoke test.

## Google Drive layout

The Drive adapter stores managed folders using Drive `appProperties`, not just names:

```text
Client Files/
  client-<id>/Profile/

Project Files/
  project-<id>/Requirements/
  project-<id>/Invoices/
  project-<id>/Deliverables/
  project-<id>/Message Attachments/
  project-<id>/Uploads/
```

Each `Files` record stores the Drive file ID, parent folder ID, logical application path, relationships, name, MIME type, size, category, uploader, and timestamps. Existing logical paths remain the application-side authorization key.

## Safe live smoke test

The test script creates uniquely prefixed records and removes them in `finally`. It refuses to run without *separate* test resources:

```bash
DATA_PROVIDER=google \
STORAGE_PROVIDER=google-drive \
GOOGLE_PHASE1_TEST_SPREADSHEET_ID=your-isolated-test-spreadsheet-id \
GOOGLE_PHASE1_TEST_DRIVE_ROOT_FOLDER_ID=your-isolated-test-drive-folder-id \
npm run test:google-provider
```

The test exercises user lookup/password verification, project and membership CRUD, requirements, rooms/messages, invoices, files metadata, leads, tasks, notifications, all blog engagement repositories, site content, and Drive upload/list/rename/replace/download/delete. It must not be pointed at migrated or production records.

## Vercel preparation and Socket.IO boundary

`api/index.js` is a serverless Express entrypoint. It opens MongoDB only when `DATA_PROVIDER=mongodb`; Render continues using `src/server.js`.

Vercel announced WebSocket and Socket.IO support in public beta in June 2026, but the existing Socket.IO implementation owns its own HTTP server and `listen()` lifecycle in `src/server.js`; it cannot be copied unchanged into this request handler. Keep Render as the realtime host in Phase 1. In Phase 2, either retain the dedicated realtime service or first refactor and production-test Vercel's beta WebSocket model, including authenticated room joins, reconnects, fan-out, and concurrent-function behavior. Do not silently deploy Socket.IO from this serverless entrypoint.

Vercel Functions have a 4.5 MB request-body limit, below the current 15 MB Multer endpoint. Before moving uploads to Vercel, use a secure direct/resumable upload flow or keep the upload API on the persistent backend. Do not change the current Render upload path during Phase 1.

Reference: [Vercel WebSocket public beta](https://vercel.com/changelog/websocket-support-is-now-in-public-beta) and [Vercel Function upload limit](https://vercel.com/docs/vercel-blob/server-upload).

## Phase 2 sequence

1. Provision an isolated Google test spreadsheet with the supplied tabs plus `SupportTickets` and `Threads`, and an isolated Drive test root.
2. Set the Google OAuth variables and run the smoke test above.
3. Export MongoDB records preserving every ObjectId as the string `id` and relationship IDs (`userId`, `projectId`, `clientId`, `roomId`, and so on).
4. Import in dependency order: Users, Projects, ProjectMembers, Rooms/Threads, Requirements, Messages, Invoices/Files, Tasks, Leads, Notifications, Blog data, SiteContent, SupportTickets.
5. Add controller-level repository use behind dual-read/dual-write flags, validate counts and sampled record hashes, then switch one domain at a time.
6. Keep MongoDB/Supabase/Render rollback paths until acceptance tests and recovery drills pass.
