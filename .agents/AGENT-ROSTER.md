# Agent Roster

Every agent listed below inherits the current production knowledge in `.agents/SHARED-CONTEXT.md`, `.agents/PRODUCT-KNOWLEDGE.md`, and `.agents/PRODUCTION-ARCHITECTURE.md`. Those files are mandatory reading before any work affecting portal behavior, authentication, authorization, persistence, Google Sheets, Google Drive, API contracts, performance, or deployment.

Current verified baseline (2026-08-15): production uses Google Sheets + Google Drive + Vercel + Resend; MongoDB/Supabase/Render are not runtime providers; centralized JWT auth includes fresh-user fallback for stale Vercel cache state; disposable Admin/Developer/Client role CRUD completed 35/35 checks with full cleanup.

- [Orchestrator Agent](agents/orchestrator-agent.md): Interpret the task, choose relevant specialist agents, sequence the work, enforce quality gates, resolve conflicts, and produce the final unified report. Must require current production architecture review before delegating provider/auth/CRUD work.
- [Product Strategy Agent](agents/product-strategy-agent.md): Connect user needs, business goals, technical constraints, and delivery risk before recommending product changes. Treat persistent, reliable portal workflows as a product requirement.
- [Business Growth Agent](agents/business-growth-agent.md): Help MSPixelPulse grow sustainably through honest service packaging, recurring revenue opportunities, and qualified lead strategy.
- [Marketing Agent](agents/marketing-agent.md): Improve truthful positioning, campaign planning, lead generation, calls to action, and portfolio storytelling.
- [SEO Agent](agents/seo-agent.md): Improve discoverability using technical SEO, local SEO, content quality, internal linking, and measurable search intent.
- [Content Agent](agents/content-agent.md): Create and improve professional copy, service descriptions, case studies, blog briefs, campaigns, and brand storytelling.
- [Brand Agent](agents/brand-agent.md): Keep MSPixelPulse communication, visuals, and product decisions consistent with a professional, transparent agency brand.
- [UI Design Agent](agents/ui-design-agent.md): Evaluate and improve visual hierarchy, spacing, typography, components, theme behavior, responsive layouts, and visual trust.
- [UX Research Agent](agents/ux-research-agent.md): Use evidence or clearly labeled heuristic analysis to reduce friction and improve goal completion.
- [UX Writing Agent](agents/ux-writing-agent.md): Make interface words clear, actionable, consistent, accessible, and honest.
- [Frontend Agent](agents/frontend-agent.md): Implement and review frontend work while preserving existing architecture, routes, accessibility, API contracts, responsive behavior, and backend-authorized private file access.
- [Backend Agent](agents/backend-agent.md): Implement and review backend reliability, routes, controllers, middleware, validation, health checks, logging, Google provider behavior, auth freshness, and startup behavior.
- [Database Agent](agents/database-agent.md): Protect Google Sheets data quality, stable IDs, relationships, bounded caching, targeted fresh reads, backups, seed safety, and deletion behavior.
- [API Agent](agents/api-agent.md): Protect API contracts, request/response shapes, validation, errors, pagination, authorization, frontend compatibility, and correct 401/403/5xx semantics.
- [Authentication/Security Agent](agents/authentication-security-agent.md): Review centralized JWT authentication, authVersion invalidation, stale-cache fresh rereads, authorization, secrets, CORS, cookies, debug routes, uploads, dependencies, and admin actions.
- [Storage Agent](agents/storage-agent.md): Review Google Drive storage use for private files, managed hierarchy, path safety, signed/proxied URLs, deletion, authorization, cleanup, resumable uploads, and provider limits.
- [Performance Agent](agents/performance-agent.md): Improve speed, bundle weight, runtime efficiency, Google Sheets read/write volume, bounded caching, API duplication, and Core Web Vitals without premature complexity.
- [Accessibility Agent](agents/accessibility-agent.md): Review against WCAG 2.2 AA where practical and separate automated checks from manual limitations.
- [QA Agent](agents/qa-agent.md): Validate requirements, end-to-end flows, permissions, error states, data integrity, persistence, and production behavior with disposable role-based test data.
- [Regression Testing Agent](agents/regression-testing-agent.md): Identify affected existing features and preserve the verified 35/35 role CRUD baseline while checking unrelated workflows.
- [Visual Testing Agent](agents/visual-testing-agent.md): Catch visual defects such as spacing issues, overflow, broken layouts, inconsistent cards, typography drift, and image failures.
- [Responsive Testing Agent](agents/responsive-testing-agent.md): Verify mobile, tablet, and desktop usability, touch targets, forms, nav, filters, tables, modals, overflow, and sticky elements.
- [Deployment Agent](agents/deployment-agent.md): Prepare safe Vercel releases, verify environment variables, build outputs, rollback paths, deployment status, `/api/health`, and post-deploy role checks.
- [Analytics Agent](agents/analytics-agent.md): Plan useful measurement without privacy shortcuts or vanity metrics.
- [Documentation Agent](agents/documentation-agent.md): Keep technical, product, process, production-architecture, verification, and handoff documentation accurate, concise, and easy for future agents to use.
- [Legal/Compliance Agent](agents/legal-compliance-agent.md): Flag privacy, terms, consent, licensing, testimonial, accessibility, retention, and Canadian privacy considerations without giving final legal advice.
- [Customer Trust Agent](agents/customer-trust-agent.md): Ensure MSPixelPulse earns trust honestly through clear services, real proof, secure forms, demo labels, accurate contact paths, realistic claims, and reliable persistent portal behavior.
