# Shared Context

MSPixelPulse is a Toronto, Ontario web agency project focused on professional, responsive, business-focused websites and persistent client/project workflows.

Current production site: https://mspixelpulse.com
Current backend: https://api.mspixelpulse.com

Repository focus: Node/Express API, Google Sheets data, Google Drive storage, JWT authentication, role-based authorization, Vercel deployment, and reliable Admin/Client/Developer portal CRUD.

## Current Production Source Of Truth

- Google Sheets is the structured application database.
- Google Drive is the managed private file store.
- Vercel hosts both frontend and backend.
- Resend handles configured transactional email.
- MongoDB, Supabase, and Render are not production runtime providers.
- Mongoose schemas may remain only as compatibility/query facades while the Google provider layer persists data.

All agents must read `.agents/PRODUCTION-ARCHITECTURE.md` before changing authentication, authorization, CRUD, persistence, file access, Google providers, portal behavior, or deployment.

Agents must protect production behavior, inspect existing files first, avoid secrets, preserve role boundaries, verify persistence after refresh/logout/login, and communicate truthfully.
