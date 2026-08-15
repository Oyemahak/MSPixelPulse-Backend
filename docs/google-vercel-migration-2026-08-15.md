# Google and Vercel migration record

This document records the verified migration inputs, destinations, safety
decisions, and rollback procedure. It intentionally contains no credentials or
production record contents.

## Backup and source inventory

- Local backup root (outside Git):
  `/Users/mahak/Documents/MSPixelPulse Migration Backups/20260815T011245Z`
- MongoDB archive: `mongodb-production.archive.gz`
- Archive SHA-256:
  `b780326066034ed0623d63e5a3d7052958d51944b9f83cc01b1bd3bfb1a90689`
- `mongorestore --dryRun` succeeded.
- MongoDB source total: 175 documents in 17 collections.
- Supabase source total: 13 objects, 4,748,916 bytes.
- Every backed-up Supabase object was locally checksum-verified.

| MongoDB collection | Documents |
| --- | ---: |
| blogcomments | 2 |
| blogreactions | 6 |
| blogshares | 0 |
| blogsubscribers | 1 |
| files | 0 |
| invoices | 10 |
| leads | 33 |
| messages | 34 |
| notificationlogs | 20 |
| projects | 19 |
| requirements | 5 |
| rooms | 12 |
| sitecontents | 19 |
| supporttickets | 0 |
| tasks | 0 |
| threads | 8 |
| users | 6 |

## Permanent Google destinations

The resource IDs originally supplied for the production Sheet and Drive
folders returned Google API `404` responses for the configured MSPixelPulse
OAuth account. Replacement resources were therefore created and verified as
owned by `mspixelpulse@gmail.com`:

- Spreadsheet: `1HYhsvei9ya9YiKais0eco5LzCPAK7yKhnRPWER932o8`
- Drive root: `1MbxPvlPawZfxGGa2ThO7eFcnFN4cTSss`
- Client Files: `1AI0M4P-lZnOUCogdEkEZ6eKlMs6Rj8E1`
- Project Files: `1SfW1o6qGN3WBXX0Vq6r2VAMihdelnrZ1`

The spreadsheet contains all 18 runtime tables, including `Threads` and
`SupportTickets`. MongoDB ObjectIds were preserved as strings. The migration is
idempotent.

Historical hard deletions had left 54 references to missing users/projects in
MongoDB. Reconciliation created seven suspended, non-login user tombstones and
eight archived, unpublished project tombstones so all relationships remain
valid. Runtime queries hide these migration tombstones.

| Google Sheet tab | Rows after migration |
| --- | ---: |
| Users | 13 |
| Projects | 27 |
| ProjectMembers | 1 |
| Requirements | 5 |
| Messages | 34 |
| Rooms | 12 |
| Invoices | 10 |
| Leads | 33 |
| Tasks | 0 |
| Notifications | 20 |
| Files | 13 |
| BlogComments | 2 |
| BlogReactions | 6 |
| BlogShares | 0 |
| BlogSubscribers | 1 |
| SiteContent | 19 |
| Threads | 8 |
| SupportTickets | 0 |

All 13 Supabase objects were uploaded to Drive, recorded in `Files`, and
downloaded again for byte-count verification: 4,748,916 of 4,748,916 bytes.
Original Supabase references remain in the metadata for rollback.

## Runtime design

- `DATA_PROVIDER=google` makes the existing controller/model surface persist
  through the Google Sheets provider model.
- `STORAGE_PROVIDER=google-drive` selects private Drive storage and signed API
  downloads.
- Defaults remain `mongodb` and `supabase`, preserving the old deployment as a
  rollback path.
- Browser uploads use authenticated resumable Drive sessions. File bytes go
  directly to Google rather than through the Vercel Function request body.
- Room and direct messaging use the existing reliable REST persistence path.
  The frontend has no Socket.IO client dependency, so a persistent WebSocket
  server is not required for the production user flow.

## Verification and rollback

The migration comparison must report zero missing IDs, duplicate IDs, and
unresolved relationships before cutover. The Google runtime QA script creates
isolated users/projects/data, checks access boundaries and persistence, then
verifies that cleanup removed every marker record.

Rollback does not require data deletion:

1. Restore the prior frontend deployment or point `VITE_API_BASE` back to the
   existing Render API.
2. Keep the Render service configured with `DATA_PROVIDER=mongodb` and
   `STORAGE_PROVIDER=supabase`.
3. If MongoDB restoration is ever needed, use the verified archive in the
   backup root and restore into a new database first; never overwrite the only
   copy.
4. Retain the Google destinations and Supabase originals until rollback is no
   longer required and the owner explicitly approves retirement.

