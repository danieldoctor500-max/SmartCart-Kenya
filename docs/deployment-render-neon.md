# Render and Neon deployment guide

This guide describes a single-origin deployment: one Render Web Service serves
the Express API and the built React/Vite application, with PostgreSQL hosted
separately on Neon. The browser and API use the same Render HTTPS origin.

This is operational guidance, not a deployment manifest. No service is
configured or deployed by this document.

## 1. Provision Neon PostgreSQL

1. Create a production Neon project and database.
2. Keep development, test, and production databases/branches separate.
3. Configure two Neon connection URLs as protected backend service
   environment variables:
   - `DATABASE_URL`: Neon pooled endpoint for application runtime.
   - `DIRECT_URL`: Neon direct endpoint for controlled Prisma CLI operations,
     including production migrations.
4. `DIRECT_URL` is not required by the running backend. Runtime Prisma Client
   uses only `DATABASE_URL`.
5. Use the TLS-enabled URLs supplied by Neon. Do not add a hard-coded SSL
   configuration; verify certificate validation behavior for the selected
   endpoints during deployment preparation.
6. Establish a backup and recovery process appropriate to the production data
   before accepting customer traffic.

Never put either production connection URL in the repository, frontend
configuration, logs, or support reports.

## 2. Configure the Render Web Service

Create one Node Web Service for the repository with:

- **Root directory:** repository root
- **Build command:**

  ```sh
  npm ci --include=dev --prefix backend &&
  npm ci --include=dev --prefix frontend &&
  npm run build --prefix frontend &&
  npm run build --prefix backend
  ```

- **Start command:** `npm start --prefix backend`
- **Health-check path:** `/api/v1/health`

The frontend build outputs `frontend/dist`; the backend build outputs
`backend/dist`. Express serves the frontend build and API from the same
service. Do not create a separate Render Static Site for this deployment
topology. Keep the reservation-release worker on one backend instance until
its multi-instance behavior is addressed.

Configure these backend service environment-variable names in Render:

| Name | Purpose |
| --- | --- |
| `NODE_ENV` | Set to `production`; selects production security behavior. |
| `DATABASE_URL` | Neon pooled PostgreSQL URL used by backend runtime and as Prisma CLI fallback. |
| `FRONTEND_URL` | Exact public HTTPS origin of the single Render service; used by CORS and trusted-origin checks. |
| `SESSION_COOKIE_NAME` | Optional session-cookie name; defaults in the backend if omitted. |
| `PORT` | Supplied by Render and consumed by the backend listener. |

Do not set `DIRECT_URL` on the normal Web Service environment. Supply it only
to the isolated, separately controlled Prisma CLI migration process.

`FRONTEND_URL` must be the service origin only (scheme, hostname, and optional
port), with no path. CORS remains configured for that origin with credentials.
The frontend should use the same-origin `/api/v1` API base; no separate
frontend hostname or production `VITE_API_BASE_URL` is needed for this
topology.

Do not configure `MPESA_*` variables for live payments. The current Daraja
code is Sandbox-only OAuth groundwork, and payment initiation, callback
verification, and completed payment processing are not enabled.

## 3. Prisma configuration and local workflows

Prisma CLI configuration loads the repository-root `.env` when commands run
from the backend package, except when `SMARTCART_BROWSER_TEST=1`. The Prisma
datasource uses `DIRECT_URL` whenever that variable is present in the process
environment; if it is absent, it falls back to `DATABASE_URL`. An explicitly
empty `DIRECT_URL` is invalid and must not be used as a fallback signal.

Local Docker development continues to use the root `.env` `DATABASE_URL` when
`DIRECT_URL` is absent. Keep `DIRECT_URL` unset in local development and test
environments. Do not put production migration credentials in
`backend/.env.test`. The existing test database safety guard must remain
enabled and must not be bypassed.

Prisma Client generation evaluates `prisma.config.ts`, so the selected URL
variable must be present in the environment or loaded `.env`; generation does
not require a live database connection. For normal local generation and
development migrations, keep `DIRECT_URL` absent so `DATABASE_URL` selects the
local Docker database:

```sh
cd backend
npm run db:generate
npm run db:migrate
```

`db:migrate` runs `prisma migrate dev` and is for local development only.

## 4. Apply production Prisma migrations as a controlled operation

Application startup and normal builds must not apply migrations. Production
migrations must be reviewed and run as a separate, controlled release
operation before deploying code that depends on the new schema.

1. Review the migration files, intended Neon production target, and release
   plan; take or verify a recoverable backup.
2. Provide `DIRECT_URL` securely to the isolated migration process using the
   platform's protected environment settings or secret injection. Do not echo,
   log, or otherwise print it. Do not place it in `.env.test`.
3. From the backend package, run the installed project-local Prisma 7 CLI:

   ```sh
   ./node_modules/.bin/prisma migrate deploy
   ```

4. Confirm the migration operation succeeds before directing application
   traffic to code that depends on the new schema.

Never use `prisma migrate dev` against production. Do not run migration
commands in the normal build or application start command, and do not run
concurrent production migration jobs.

## 5. SPA routing, API access, and session cookies

The application uses `BrowserRouter`; Express serves the frontend `dist`
directory and provides the SPA entry point for frontend navigation. API routes
remain handled by Express and unknown API paths retain their JSON 404 response.
The frontend uses the same-origin `/api/v1` path, so no Render Static Site
rewrite or separate frontend API hostname is required.

The backend marks session cookies `Secure`, `HttpOnly`, and `SameSite=Lax`.
Using one HTTPS origin keeps browser requests same-origin and makes this cookie
policy suitable. Keep origin validation and credentialed CORS configuration
restricted to the exact service origin. After deployment, verify registration,
login, current-user refresh, logout, authenticated route refresh, frontend
asset loading, and API error handling in a real browser.

## Environment-variable scope

- **Local development:** backend `NODE_ENV`, `DATABASE_URL`,
  `BACKEND_PORT`, `FRONTEND_PORT`, `FRONTEND_URL`, and `SESSION_COOKIE_NAME`;
  local Compose also uses `POSTGRES_DB`, `POSTGRES_USER`,
  `POSTGRES_PASSWORD`, and optionally `POSTGRES_PORT`. Keep `DIRECT_URL`
  absent. Frontend `VITE_API_BASE_URL` defaults to `/api/v1`, and
  `VITE_API_PROXY_TARGET` can override the local Vite proxy.
- **Testing:** backend integration tests use `NODE_ENV` and a dedicated
  `DATABASE_URL` in `backend/.env.test`. The isolated browser environment uses
  `NODE_ENV`, `DATABASE_URL`, and `BROWSER_TEST_DATABASE_USER`, with optional
  `BACKEND_PORT`, `FRONTEND_URL`, and `SESSION_COOKIE_NAME`. Keep
  `DIRECT_URL` absent. Browser-test Vite uses `VITE_API_PROXY_TARGET`. See
  [browser-acceptance-environment.md](./browser-acceptance-environment.md)
  for its guarded workflow. Never point tests at production or bypass the test
  database guard.
- **Production runtime:** `NODE_ENV`, pooled `DATABASE_URL`, and `FRONTEND_URL`;
  Render supplies `PORT`. Keep `DIRECT_URL` out of the normal Web Service
  environment; inject it only into the separately controlled Prisma CLI
  migration process. Do not expose production database variables to frontend
  builds or use them as `VITE_*` variables.
