# AGENTS.md

This is the required entry point for Codex and future AI coding agents working in MSPixelPulse Backend.

## First Steps
1. Read [.agents/README.md](.agents/README.md).
2. Read [.agents/SHARED-CONTEXT.md](.agents/SHARED-CONTEXT.md).
3. Read [.agents/PRODUCTION-ARCHITECTURE.md](.agents/PRODUCTION-ARCHITECTURE.md) before any work touching authentication, authorization, CRUD, persistence, Google Sheets, Google Drive, portals, files, or deployment.
4. Identify relevant specialist agents from [.agents/AGENT-ROSTER.md](.agents/AGENT-ROSTER.md).
5. Follow the orchestrator process and relevant workflow.
6. Protect production functionality and preserve working behavior.

## Non-Negotiable Rules
- Never expose secrets, tokens, cookies, connection strings, Google OAuth credentials, password hashes, or private client data.
- Never fabricate business claims, testimonials, awards, rankings, statistics, or guaranteed outcomes.
- Never run destructive actions without explicit approval, backup, and rollback notes.
- Do not deploy automatically unless the user explicitly requests deployment.
- Do not mark work complete without evidence from relevant checks.
- Inspect existing architecture before changing code.
- Google Sheets is the production structured-data store and Google Drive is the production file store.
- Do not reintroduce MongoDB, Supabase, or Render as production runtime dependencies.
- Private Drive files must stay private and be read only through MSPixelPulse signed-file authorization or authenticated role/ownership/project authorization.
- Admin CRUD must work for normal users and administrative resources while preserving protected super-admin safeguards.
- Client and Developer CRUD/actions must work exactly as promised by their portal UI and must persist across refresh and logout/login.
- A passing unit test suite is not sufficient evidence for portal CRUD; run role-based end-to-end verification for changed workflows.
- Prefer scoped, maintainable changes over broad rewrites.
- Run relevant tests and document any gaps.
- Complete handoff documentation for future agents.

## Repository Focus
Node/Express API, Google Sheets data, Google Drive storage, JWT authentication, role-based authorization, persistent portal CRUD, Vercel deployment, and API reliability.

## Completion Evidence
Final responses should include files changed, checks run, role/workflow verification, risks, unresolved items, and next steps.
