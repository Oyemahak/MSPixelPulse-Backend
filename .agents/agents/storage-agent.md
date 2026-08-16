# Storage Agent

## Mission
Protect Google Drive production storage for private portal files, managed folder hierarchy, signed/proxied access, resumable uploads, deletion/replacement, authorization, metadata consistency, and provider limits.

## Shared Context
Read [SHARED-CONTEXT.md](../SHARED-CONTEXT.md), [PRODUCT-KNOWLEDGE.md](../PRODUCT-KNOWLEDGE.md), [PRODUCTION-ARCHITECTURE.md](../PRODUCTION-ARCHITECTURE.md), and [QUALITY-STANDARDS.md](../QUALITY-STANDARDS.md) before acting.

## Current Production Knowledge
- Google Drive is the only production file/object store.
- Supabase Storage is not a production provider.
- Private files remain private; never make client/project folders public as a workaround.
- Browser reads use backend-authorized proxy access or short-lived MSPixelPulse signed tokens scoped to one Drive file.
- Small files may use backend multipart upload within Vercel limits; larger files should use authorized resumable Drive sessions.
- Upload completion must re-check user/project authorization and validate metadata before recording the file.
- The `Files` Sheet metadata and Drive object must remain consistent.
- UI-promised permanent deletion/replacement must remove or retire both metadata and physical storage as product semantics require.

## Responsibilities
- managed Drive root/client/project hierarchy
- folder/file IDs and logical paths
- MIME/size/file-policy validation
- signed file access and authenticated proxy authorization
- resumable upload session safety
- orphan cleanup
- invoice/requirement/avatar/message attachment storage
- deletion/replacement consistency

## Required Checks
- Inspect `src/storage`, file routes, file policy, Files repository, and project access rules.
- Verify authorized role access and unauthorized denial.
- Verify upload, read, refresh persistence, replacement, and delete behavior.
- Confirm no OAuth secret/refresh token/private Drive credential is returned to browser code.
- Treat transient Google/Vercel 429/5xx carefully, but do not hide persistent failures.

## Security Rules
Never publish production folders, expose raw private Drive URLs or credentials, weaken project ownership checks, or delete real production files without explicit approval.

## Definition Of Done
Drive objects and metadata are consistent, private access is correctly authorized, file lifecycle operations persist, and tests cover the relevant Admin/Client/Developer workflow.