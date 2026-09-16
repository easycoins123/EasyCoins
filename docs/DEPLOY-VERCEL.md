# Deploying to Vercel + Supabase

Three Vercel projects from one repository, and one Supabase database. Nothing
here is automatic: someone opens the accounts and pastes the values. This is the
checklist for doing it once, correctly.

The repository is already prepared for it:

- `backend/api/index.ts` runs the NestJS app as a Vercel Function.
- `backend/vercel.json` builds it, routes every path to it, and schedules the
  housekeeping sweep as a cron.
- `vercel.json` (root) is the SPA fallback both Angular apps need.
- Prisma has a `directUrl` so migrations use a direct connection while the app
  uses the pooled one.

## 1. Supabase (the database)

1. Create a project. Choose a region close to Israel (Frankfurt is the usual
   pick). The password you set here is the database password; keep it in a
   password manager, not in the repo.
2. Confirm the database is UTF-8. Supabase is UTF-8 by default, which matters:
   the catalog is Hebrew and a WIN1252 cluster rejects it.
3. From **Project Settings → Database**, copy the pooler connection string:
   - **Session pooler** (host `...pooler.supabase.com`, port **5432**, user
     `postgres.<project-ref>`). This is both `DATABASE_URL` (runtime) and
     `DIRECT_URL` (migrations). Append `?connection_limit=1` to `DATABASE_URL`.

Use the **session** pooler, not the transaction pooler (port 6543). Order
creation, payment settlement and inventory holds run inside Prisma interactive
transactions, and the transaction pooler (pgBouncer transaction mode) does not
hold one connection across the statements of an interactive transaction on
serverless. It fails at runtime with "Transaction not found ... refers to an old
closed transaction", even though single-query reads work. The session pooler
gives each connection a stable Postgres session, so the transactions behave like
a direct connection. `connection_limit=1` keeps each warm function instance to a
single session so the pool is not exhausted.

The direct host (`db.<ref>.supabase.co:5432`) is not reachable from Vercel
(IPv6 only), which is why both URLs use the pooler host.

## 2. Backend project (the API)

Create a Vercel project from the repository. **Root Directory: `backend`.** That
makes Vercel read `backend/vercel.json`, which already sets the build, the
routing and the cron.

Environment variables (Project Settings → Environment Variables), Production:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the Supabase **session pooler** URL (port 5432, user `postgres.<ref>`, with `?connection_limit=1`) |
| `DIRECT_URL` | the same **session pooler** URL (port 5432), no query string |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `PAYMENT_WEBHOOK_SECRET` | a different `openssl rand -hex 32` |
| `CRON_SECRET` | a third `openssl rand -hex 32` |
| `COOKIE_SECURE` | `true` |
| `CORS_ALLOWED_ORIGINS` | the storefront's Vercel URL, exact, no trailing slash |
| `APP_BASE_URL` | the storefront's Vercel URL |
| `ADMIN_TOKENS` | `yuval:<hex>,dekel:<hex>` — one 32+ char token each |
| `NOTIFICATION_TRANSPORT` | `none` (until a mail provider exists) |
| `OTP_DEV_ECHO` | `false` |
| `HOUSEKEEPING_INTERVAL_SECONDS` | `0` — the cron drives the sweep, not a timer |

The service refuses to start if any required one is missing or unsafe. That is
the intended behaviour: a half-configured commerce backend that boots is worse
than one that does not.

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` are optional;
leave them empty and Google sign-in simply is not offered. If you set them, the
redirect URI must be `https://<api-url>/api/v1/auth/google/callback`, registered
in the Google console exactly.

Deploy. Then check:

- `GET https://<api-url>/api/v1/ready` returns 200 and names the database check.
- `GET https://<api-url>/api/v1/products` returns the catalog. If it is empty,
  the migration ran but the seed did not — run it once from a local machine
  pointed at the Supabase **direct** URL: `cd backend && DATABASE_URL=<direct>
  npm run seed`.
- **Vercel → the project → Settings → Cron Jobs** lists the housekeeping job.

## 3. Storefront project

A second Vercel project from the same repository. **Root Directory: repo root.**
Vercel detects Angular; override if needed:

- Build Command: `npm run build`
- Output Directory: `dist/top-token`

It reads the root `vercel.json` for the SPA fallback.

**Point it at the API.** The storefront calls `/api/v1/...` relative to itself,
so route that to the backend. Add this to the root `vercel.json` **above** the
SPA fallback, with the real API URL:

```json
{ "source": "/api/:path*", "destination": "https://<api-url>/api/:path*" }
```

Proxying keeps the browser same-origin, so the httpOnly session cookie works
without `SameSite=None`. The alternative is to set `apiBaseUrl` in
`src/environments/environment.production.ts` to the absolute API URL, but then
the cookie needs cross-site settings and the CORS origin must match exactly.

Finally flip the storefront off mock mode: in
`src/environments/environment.production.ts`, `apiMode: 'mock'` → `'http'`. It is
a demo until this is switched.

## 4. Admin project

A third Vercel project, same repository, **Root Directory: repo root**, with
overrides:

- Build Command: `npx ng build top-token-admin`
- Output Directory: `dist/top-token-admin`

Give it the same API proxy as the storefront (it calls the same API). It is a
separate project so no operator code is ever served from the storefront's
domain, and so it can be put behind Vercel's password protection or an allowlist
without touching the shop.

## What is still not wired

- **Email.** `NOTIFICATION_TRANSPORT=none`. A customer gets no mail until a
  provider (Resend) is configured. The delivery instruction is on the order page.
- **Real payments.** `PAYMENT_MODE` stays `sandbox`; production is refused at
  startup until a provider is integrated.
- **A custom domain.** Vercel serves `*.vercel.app` URLs until you add one.

## Supabase free tier, honestly

A free project pauses after about a week with no traffic and takes a few seconds
to wake. Connection count is capped. Fine for development and a quiet launch;
upgrade when there is real, steady traffic.
