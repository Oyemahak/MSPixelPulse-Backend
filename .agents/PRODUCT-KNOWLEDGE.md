# Product Knowledge

## Public Website
Home, Projects, Services, Pricing, Contact, Login, and Start Project flows.

## Roles
Visitor, Applicant, Client, Admin, and Developer where still supported.

## Infrastructure
React/Vite frontend, Node/Express API, Google Sheets, Google Drive, JWT authentication, Resend email, and Vercel hosting for both applications.

Google Sheets is the production structured-data database. Google Drive is the production file/object store. MongoDB, Supabase, and Render are not production runtime providers.

Mongoose schemas may remain only as a Google-provider controller/query compatibility facade.

## Core Portal Contract

Every visible portal action must map to a real, persistent backend operation.

Admin must be able to manage normal users, allowed role/status changes, activation/suspension, passwords, project assignments, projects, requirements, invoices/files, rooms/messages, support, leads, tasks, and content while protected-super-admin safeguards remain enforced.

Clients must be able to use all promised self-service and assigned-project workflows, including profile persistence, avatar upload/replace/delete, requirements/files, billing visibility, messaging, attachments, and support.

Developers must be able to use all promised assigned-project workflows, including permitted project operations, messages, attachments, evidence/deliverables, and related actions.

Writes must survive navigation, refresh, logout/login, new browser sessions, and new Vercel function instances.

## File Security

Private Drive files stay private. Browser reads use a backend-authorized file proxy or a short-lived MSPixelPulse signed file URL scoped to one Drive file. Admin access and Client/Developer access must still respect application authorization rules. Never expose Google OAuth secrets or make managed Drive folders public as a workaround.

## Workflows
Visitor browses work, reviews services/pricing, starts a project, applicant submits requirements, admin reviews and approves, client accesses portal, client uploads files, admin/client/developer communicate according to access rules, project progress is managed, billing and support records persist, and testimonials may be reviewed and published.

Detailed production rules and the role CRUD verification matrix live in `.agents/PRODUCTION-ARCHITECTURE.md` and are required reading for relevant work.
