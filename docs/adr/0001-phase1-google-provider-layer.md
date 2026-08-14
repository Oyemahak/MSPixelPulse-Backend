# ADR 0001: Phase 1 Google Sheets and Drive provider layer

## Status

Accepted for Phase 1 preparation. No production provider switch or data migration is authorized by this decision.

## Context

The application currently uses MongoDB/Mongoose for identity and business data, Supabase Storage for files, Render for the Express/Socket.IO runtime, and Vercel for the React frontend. The target architecture will use Google Sheets and Google Drive, but the current production system must remain recoverable until a verified migration is complete.

## Decision

- Keep `DATA_PROVIDER=mongodb` and `STORAGE_PROVIDER=supabase` as the defaults.
- Add server-side OAuth refresh-token authentication for the Google APIs.
- Centralize Sheets access in `src/google/sheets.js` and repository modules. Logical records use durable `id` values, never Sheet row numbers.
- Preserve existing MongoDB ObjectIds as strings during future export/import. New Google-only test records use UUIDs.
- Add a provider-neutral storage façade. Existing controllers continue importing `src/lib/supabase.js`; the façade selects the current Supabase adapter or the new Drive adapter.
- Store Google Drive IDs and logical-path metadata in the `Files` sheet. Logical paths remain stable so existing project-file authorization checks continue to work.
- Add a Vercel Express entrypoint without changing Render's `src/server.js` or Socket.IO runtime.

## Consequences

- Existing production behavior remains on MongoDB/Supabase until flags are deliberately changed.
- Google live tests require a separately provisioned test spreadsheet and Drive root; they must not use migrated or production records.
- Existing controllers still use Mongoose directly. Phase 2 must move controller use to the repositories incrementally, then run dual-read/dual-write validation before any cutover.
- Real-time Socket.IO remains on Render in Phase 1. Vercel announced Socket.IO support in public beta, but the current `src/server.js` owns its HTTP server and `listen()` lifecycle, so it cannot be moved unchanged into the serverless handler.

## Rollback

Set `DATA_PROVIDER=mongodb` and `STORAGE_PROVIDER=supabase` (the defaults). No Phase 1 code removes MongoDB/Supabase data or disables Render.
