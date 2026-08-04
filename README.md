# MSPixelPulse Backend

Official MSPixelPulse backend API for authentication, users, agency projects, client workspaces, messaging, billing, portfolio content, and secure file workflows.

## Architecture

- MongoDB Atlas with Mongoose is the primary application database.
- Users and authentication data live in MongoDB.
- Business data such as projects, messages, requirements, invoices, and leads live in MongoDB.
- Supabase is used for file storage only.
- Render hosts the Express backend.
- Vercel hosts the React frontend.
- Authentication is custom JWT auth with Authorization header support and an HTTP-only cookie.

## Stack

- Node.js and Express
- MongoDB Atlas and Mongoose
- JSON Web Tokens
- Supabase Storage, private bucket preferred
- Multer memory uploads
- Socket.IO
- Render deployment

## Folder Structure

- `src/app.js` - Express app, middleware, health endpoints, API mounting
- `src/server.js` - boot process, MongoDB connection, HTTP and Socket.IO server
- `src/config/` - environment, CORS, MongoDB helpers
- `src/features/` - feature controllers and routes
- `src/models/` - Mongoose schemas
- `src/middleware/` - auth, roles, error handling
- `src/lib/` - Supabase/storage and health helpers
- `src/scripts/` - seed and maintenance scripts

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Local API default:

```text
http://localhost:5000
```

## Environment Variables

Use `.env.example` as the source of truth. Never commit `.env`.

Required for normal operation:

```text
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb+srv://USERNAME:PASSWORD@HOST/DATABASE
JWT_SECRET=replace-with-long-random-secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173,https://mspixelpulse.com,https://www.mspixelpulse.com
COOKIE_SECURE=false
```

Required for file uploads:

```text
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-with-server-secret
SUPABASE_BUCKET=uploads
```

Required for contact and blog notification email:

```text
SMTP_USER=
SMTP_PASS=
SMTP_FROM="MSPixelPulse <info@mspixelpulse.com>"
PUBLIC_SITE_URL=https://mspixelpulse.com
ANONYMOUS_ID_SALT=replace-with-long-random-secret
NOTIFICATION_RECIPIENTS=info@mspixelpulse.com,mspixelpulse@gmail.com
```

`info@mspixelpulse.com` remains the public business and sender-facing address. Internal contact and blog notifications are delivered to both `info@mspixelpulse.com` and `mspixelpulse@gmail.com`; recipient lists are de-duplicated. Use the per-event flags in `.env.example` to pause a notification category without disabling the underlying database action.

Production super-admin seed:

```text
SUPER_ADMIN_EMAIL=mahakpateluiux@gmail.com
SUPER_ADMIN_PASSWORD=replace-with-render-secret
SUPER_ADMIN_NAME=Mahak Patel
```

Debug routes are disabled by default:

```text
ENABLE_DEBUG_ROUTES=false
DEBUG_ROUTE_KEY=
```

## MongoDB

MongoDB Atlas is required in production. If MongoDB cannot connect, the backend exits instead of running partially. Startup logs use sanitized error categories only.

## Supabase Storage

Supabase is storage only. Do not migrate authentication or database records to Supabase.

Use a private bucket named:

```text
uploads
```

If Supabase variables are missing, the API still starts, login still works, and upload endpoints return a controlled `503` response.

## Authentication Flow

1. Frontend posts to `POST /api/auth/login`.
2. Backend normalizes the email with `trim().toLowerCase()`.
3. User is loaded from MongoDB.
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
curl https://capstone-backend-o3o2.onrender.com/health
curl https://capstone-backend-o3o2.onrender.com/api/health
```

They report process status, environment, uptime, MongoDB state, and whether Supabase/storage config is present. They do not expose hosts, connection strings, keys, passwords, or tokens.

## Seed Commands

Protected production super admin:

```bash
SUPER_ADMIN_EMAIL='mahakpateluiux@gmail.com' SUPER_ADMIN_PASSWORD='set-in-render' SUPER_ADMIN_NAME='Mahak Patel' npm run seed:super-admin
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

## Dummy Data Cleanup

Dry-run only:

```bash
npm run cleanup:dummy:dry
```

Confirmed cleanup:

```bash
npm run cleanup:dummy
```

The confirmed cleanup requires the script's `--confirm` flag, creates a JSON backup under the OS temp directory, and currently deletes only matched standalone lead records. Matched users and relational records are reported but preserved for manual review to avoid orphaned references. Review the dry-run output before running cleanup.

Storage dry-run:

```bash
npm run cleanup:storage:dry
```

## Render Deployment

Production Render variables should include:

```text
NODE_ENV=production
MONGO_URI
JWT_SECRET
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://mspixelpulse.com,https://www.mspixelpulse.com,https://mspixelpulse.vercel.app
COOKIE_SECURE=true
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_BUCKET=uploads
SUPER_ADMIN_EMAIL
SUPER_ADMIN_PASSWORD
SUPER_ADMIN_NAME
```

Do not overwrite real dashboard secrets with placeholder values.

## Troubleshooting

- Login fails with network errors: check Render service health and `/health`.
- Health says MongoDB disconnected: check Atlas URI, Atlas network access, and database user.
- Uploads return `503`: check Supabase URL, server secret key, and `SUPABASE_BUCKET=uploads`.
- CORS errors: confirm `CORS_ORIGIN` includes the exact frontend origin. The canonical public origin is `https://mspixelpulse.com`.
- Invalid credentials: seed the expected admin/demo users or confirm the account is active.

## Security Notes

- Never commit `.env`, cookies, keys, tokens, dumps, or backups.
- Rotate secrets if they were ever committed to Git history.
- Debug routes require `ENABLE_DEBUG_ROUTES=true` and, in production, `x-debug-key`.
- Keep Supabase service keys on the backend only.
