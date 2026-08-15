# MSPixelPulse Web Solutions Backend

Official MSPixelPulse backend API for authentication, users, agency projects, client workspaces, messaging, billing, portfolio content, and secure file workflows.

## Architecture

- Google Sheets is the production application database.
- Google Drive is the production file-storage provider.
- Mongoose schemas remain as a temporary controller-compatibility façade; the Google provider is the configured production data source.
- Vercel hosts the API and frontend.
- Vercel hosts the React frontend.
- Authentication is custom JWT auth with Authorization header support and an HTTP-only cookie.

## Stack

- Node.js and Express
- Google Sheets and Google Drive
- Mongoose compatibility façade
- JSON Web Tokens
- Google OAuth2 with refresh-token authentication
- Multer memory uploads
- Socket.IO
- Vercel deployment

## Folder Structure

- `src/app.js` - Express app, middleware, health endpoints, API mounting
- `src/server.js` - local HTTP boot process and optional legacy Mongo compatibility connection
- `api/index.js` - Vercel serverless Express entrypoint
- `src/config/` - environment, CORS, providers, and optional Mongo compatibility helpers
- `src/features/` - feature controllers and routes
- `src/models/` - Mongoose schemas
- `src/google/` - OAuth, Sheets, Drive, and bounded retry utilities
- `src/repositories/` - provider-neutral domain repositories
- `src/storage/` - Google Drive storage provider and storage interface
- `src/middleware/` - auth, roles, error handling
- `src/lib/` - storage, file-policy, authorization, and health helpers
- `src/scripts/` - seed and maintenance scripts

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Local API default:

```text
http://localhost:4000
```

## Environment Variables

Use `.env.example` as the source of truth. Never commit `.env`.

Required for normal operation:

```text
NODE_ENV=development
PORT=4000
JWT_SECRET=replace-with-long-random-secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173,https://mspixelpulse.com,https://www.mspixelpulse.com
COOKIE_SECURE=false
```

Required production provider configuration:

```text
DATA_PROVIDER=google
STORAGE_PROVIDER=google-drive
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DATABASE_SPREADSHEET_ID=
GOOGLE_DRIVE_ROOT_FOLDER_ID=
GOOGLE_DRIVE_CLIENT_FILES_FOLDER_ID=
GOOGLE_DRIVE_PROJECT_FILES_FOLDER_ID=
```

See [`docs/google-vercel-migration-2026-08-15.md`](docs/google-vercel-migration-2026-08-15.md)
for the verified Google migration record and recovery notes.

Required for contact and blog notification email:

```text
RESEND_API_KEY=
RESEND_FROM_EMAIL="MSPixelPulse <info@mspixelpulse.com>"
PUBLIC_SITE_URL=https://mspixelpulse.com
ANONYMOUS_ID_SALT=replace-with-long-random-secret
NOTIFICATION_RECIPIENTS=info@mspixelpulse.com,mspixelpulse@gmail.com
```

The backend sends through Resend over HTTPS, avoiding outbound SMTP connection delays and app-password handling. The sending domain must be verified with the provider.

`info@mspixelpulse.com` remains the public business and sender-facing address. Internal contact and blog notifications are delivered to both `info@mspixelpulse.com` and `mspixelpulse@gmail.com`; recipient lists are de-duplicated. Use the per-event flags in `.env.example` to pause a notification category without disabling the underlying database action.

Production super-admin seed:

```text
SUPER_ADMIN_EMAIL=mahakpateluiux@gmail.com
SUPER_ADMIN_PASSWORD=replace-with-secure-secret
SUPER_ADMIN_NAME=Mahak Patel
```

Debug routes are disabled by default:

```text
ENABLE_DEBUG_ROUTES=false
DEBUG_ROUTE_KEY=
```

## Google persistence

Production must use `DATA_PROVIDER=google` and `STORAGE_PROVIDER=google-drive`.
Google Sheets records use stable IDs, never row numbers. Google Drive files are
private and referenced by Drive file IDs plus logical metadata in the `Files`
sheet. OAuth failures surface as controlled storage/configuration errors rather
than switching to another provider.

## Authentication Flow

1. Frontend posts to `POST /api/auth/login`.
2. Backend normalizes the email with `trim().toLowerCase()`.
3. The Users repository reads `passwordHash` from the Users Sheet.
4. Password is verified with bcrypt.
5. Active users receive a JWT.
6. Frontend stores the token and redirects by role.

Demo-safe accounts should be created with environment-provided passwords only. Do not publish production or demo passwords in docs, frontend code, backend code, logs, or seed output.

## API Summary

- `GET /health`
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/admin/users`
- `GET /api/projects`
- `POST /api/files/upload`
- `PUT /api/projects/:projectId/requirements`
- `POST /api/users/me/avatar`
- `POST /api/contact`
- `GET /api/blog-engagement/:slug`
- `PUT|DELETE /api/blog-engagement/:slug/reaction`
- `POST /api/blog-engagement/:slug/comments`
- `POST /api/blog-engagement/:slug/shares`
- `POST /api/blog-engagement/subscriptions`
- `GET /api/blog-engagement/subscriptions/confirm`
- `GET /api/blog-engagement/subscriptions/unsubscribe`
- `GET /api/admin/blog-engagement/*` (admin only)

## Health Endpoints

Health endpoints are public and safe:

```bash
curl https://api.mspixelpulse.com/health
curl https://api.mspixelpulse.com/api/health
```

They report process status, environment, uptime, the selected providers, and
Google Drive configuration without exposing hosts, keys, passwords, or tokens.

## Seed Commands

Protected production super admin:

```bash
SUPER_ADMIN_EMAIL='mahakpateluiux@gmail.com' SUPER_ADMIN_PASSWORD='set-secure-value' SUPER_ADMIN_NAME='Mahak Patel' npm run seed:super-admin
```

Portal demo users and sample invoice:

```bash
PORTAL_DEMO_CLIENT_PASSWORD='set-secure-value' PORTAL_DEMO_DEVELOPER_PASSWORD='set-secure-value' npm run seed:portal-demo
npm run seed:demo-invoice
```

Legacy local demo users require explicit password environment variables:

```bash
SEED_DEMO_ADMIN_PASSWORD='set-secure-value' SEED_DEMO_CLIENT_PASSWORD='set-secure-value' SEED_DEMO_DEVELOPER_PASSWORD='set-secure-value' \
npm run seed:demo
```

Seed commands are idempotent and do not log passwords. Use demo seeds for local/dev or controlled production preview data only.

## Vercel Deployment

Production Vercel variables include:

```text
NODE_ENV=production
JWT_SECRET
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://mspixelpulse.com,https://www.mspixelpulse.com
COOKIE_SECURE=true
DATA_PROVIDER=google
STORAGE_PROVIDER=google-drive
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
GOOGLE_DATABASE_SPREADSHEET_ID
GOOGLE_DRIVE_ROOT_FOLDER_ID
GOOGLE_DRIVE_CLIENT_FILES_FOLDER_ID
GOOGLE_DRIVE_PROJECT_FILES_FOLDER_ID
```

Do not overwrite real dashboard secrets with placeholder values.

## Troubleshooting

- Login fails with network errors: check the Vercel API health endpoint and `/health`.
- Uploads return `503`: check the server-only Google OAuth and Drive environment variables.
- CORS errors: confirm `CORS_ORIGIN` includes the exact frontend origin. The canonical public origin is `https://mspixelpulse.com`.
- Invalid credentials: seed the expected admin/demo users or confirm the account is active.

## Security Notes

- Never commit `.env`, cookies, keys, tokens, dumps, or backups.
- Rotate secrets if they were ever committed to Git history.
- Debug routes require `ENABLE_DEBUG_ROUTES=true` and, in production, `x-debug-key`.
