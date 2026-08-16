# Knowledge Update Protocol

1. Inspect repository files first.
2. Read `.agents/SHARED-CONTEXT.md`, `.agents/PRODUCT-KNOWLEDGE.md`, and `.agents/PRODUCTION-ARCHITECTURE.md` before any work affecting portal behavior, auth, data, files, performance, or deployment.
3. Treat those three files as inherited current knowledge for every specialist agent in `.agents/agents/`.
4. Use approved documentation and verified sources; do not treat assumptions as facts.
5. Record new architectural/product decisions in `knowledge/learned-decisions.md` when present.
6. Record rejected approaches in `knowledge/rejected-patterns.md` when present.
7. Record known risks in `knowledge/known-risks.md` when present.
8. Record reusable patterns in `knowledge/reusable-components.md` when present.
9. Include date, source, decision, evidence, affected areas, confidence, and reviewer for durable knowledge updates.
10. Do not silently overwrite previous decisions; supersede them explicitly with evidence.
11. Do not browse or collect external information unless permitted; prefer primary/official sources for technical knowledge.
12. Do not copy copyrighted content into the repository.
13. Do not store secrets, credentials, password hashes, OAuth refresh tokens, or private client data.
14. Require human review for major architectural or business decisions.
15. Current production provider truth must remain Google Sheets + Google Drive + Vercel + Resend unless a verified migration changes it.
16. MongoDB, Supabase, and Render are historical/non-production runtime references; never revive them from stale agent instructions.
17. Preserve the verified 2026-08-15 disposable role CRUD baseline: 35 passed, 0 failed, full cleanup.
18. For auth/account changes, preserve centralized `requireAuth`, `authVersion` invalidation, and targeted fresh Users rereads for stale Vercel cache state.
19. For performance changes, reduce redundant Google API work without sacrificing auth/persistence correctness.
20. Update shared knowledge first when a new fact affects multiple agents; update a specialist agent file when its mission/responsibilities are materially changed.