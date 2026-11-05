# Render and Neon deployment guide

This guide describes a deployment shape with the Express API on a Render Web
Service, the React/Vite application on Render Static Site hosting, and
PostgreSQL on Neon. The services are separate; the frontend calls the backend
over HTTPS.

This is operational guidance, not a deployment manifest. No service is
configured or deployed by this document.

## 1. Provision Neon PostgreSQL

1. Create a production Neon project and database.
2. Keep development, test, and production databases/branches separate.
3. Store the Neon PostgreSQL connection configuration as the backend
   `DATABASE_URL` environment variable in Render. Treat it as a secret; do not
   put it in this repository, frontend configuration, logs, or support
   reports.
4. Configure the production database before the backend build and migration
   release. Prisma Client generation loads Prisma configuration and requires
   `DATABASE_URL` to be present, although generation itself does not connect to
   PostgreSQL.
5. Establish a backup and recovery process appropriate to the production data
   before accepting customer traffic.

Follow Neon guidance for the connection endpoint and TLS settings. If using a
pooled endpoint, verify that it is compatible with the selected application
and migration workflows.

## 2. Configure the Render backend Web Service

Create a Node Web Service for the repository with:

- **Root directory:** `backend`
- **Build command:** `npm ci --include=dev && npm run build`
- **Start command:** `npm start`
- **Health-check path:** `/api/v1/health`

The build command installs development build tools, generates Prisma Client,
and compiles TypeScript. The start command runs the compiled `dist/server.js`.
The backend listens on Render's standard `PORT` environment variable, falling
back to `BACKEND_PORT` when `PORT` is absent.

Configure these backend environment-variable names in Render:

| Name | Purpose |
| --- | --- |
| `NODE_ENV` | Selects production behavior, including HTTPS-only session cookies. |
| `DATABASE_URL` | Private Neon PostgreSQL connection configuration used by Prisma. |
| `FRONTEND_URL` | Exact public HTTPS origin of the Render frontend; used for credentialed CORS and trusted-origin checks. |
| `SESSION_COOKIE_NAME` | Optional session-cookie name; defaults in the backend if omitted. |
| `PORT` | Supplied by Render and consumed by the backend listener. |

`FRONTEND_URL` must be the frontend **origin only** (scheme, hostname, and
optional port), with no path. CORS is configured for one origin with
credentials enabled. If the public frontend origin changes, update
`FRONTEND_URL` and redeploy the backend.

Do not configure `MPESA_*` variables for live payments. The current Daraja
code is Sandbox-only OAuth groundwork, and payment initiation, callback
verification, and completed payment processing are not enabled.

## 3. Apply Prisma migrations as a controlled release

Application startup does not apply database migrations. Do not use
`npm run db:migrate` for production: it runs `prisma migrate dev`, intended
for development.

Before deploying an application version that requires new database objects:

1. Review the migration files and confirm the target Neon database and release
   plan.
2. Take or verify a recoverable database backup according to the operational
   policy.
3. Run Prisma's deploy migration command as a controlled pre-deploy operation
   or one-off release job from the `backend` package, using the same reviewed
   revision and production `DATABASE_URL`:

   ```sh
   npx prisma migrate deploy
   ```

4. Confirm the migration job succeeds before directing application traffic to
   code that depends on the new schema.

Use the hosting platform's supported pre-deploy mechanism where available.
Otherwise run a separately controlled migration job. Do not put migration
execution in the API start command or run concurrent migration jobs.

## 4. Configure the Render Static Site

Create a Render Static Site for the same repository with:

- **Root directory:** `frontend`
- **Build command:** `npm ci && npm run build`
- **Publish directory:** `dist`

Set the following environment-variable name in the Static Site build
environment:

| Name | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Public backend HTTPS base URL ending in `/api/v1`. It is embedded in the frontend build and is not a secret. |

Set this variable before building. Changing it requires a new frontend build
and deployment. Do not put database credentials, cookie values, payment
secrets, or any other private value in a `VITE_*` variable.

## 5. Configure SPA routing and API access

The application uses `BrowserRouter`. Configure a Render Static Site rewrite
so direct navigation and refreshes of client-side routes return the SPA entry
point:

| Source | Destination | Action |
| --- | --- | --- |
| `/*` | `/index.html` | Rewrite |

The frontend calls the separately hosted API using `VITE_API_BASE_URL`;
the development Vite proxy is not used by the static production site. The
rewrite is for frontend routes and must not be used to serve API requests.

The backend must allow the exact frontend origin through `FRONTEND_URL` and
must return credentialed CORS responses. The frontend Axios client already
enables credentialed requests. Verify registration, login, current-user
refresh, logout, and authenticated page refresh in a real browser after
deployment.

## 6. HTTPS and session cookies

The backend requires an HTTPS `FRONTEND_URL` in production and marks its
session cookies `Secure`, `HttpOnly`, and `SameSite=Lax`. Use HTTPS for both
services. Do not attempt to expose session cookies to JavaScript.

The frontend and backend are different **origins**, even when both use HTTPS;
credentialed CORS must therefore remain enabled and restricted to the exact
frontend origin. Cookie `SameSite` behavior depends on whether the browser
considers the two deployed hostnames same-site. With `SameSite=Lax`, browsers
do not send cookies on cross-site API fetch/XHR requests. If the selected
domains are cross-site, authentication will not work with the current cookie
policy; use a same-site domain/reverse-proxy topology or make a separately
reviewed backend cookie-policy change (`SameSite=None` also requires `Secure`
and may encounter browser third-party-cookie restrictions).

## Environment-variable scope

- **Local development:** backend `NODE_ENV`, `DATABASE_URL`,
  `BACKEND_PORT`, `FRONTEND_PORT`, `FRONTEND_URL`, and `SESSION_COOKIE_NAME`;
  local Compose also uses `POSTGRES_DB`, `POSTGRES_USER`,
  `POSTGRES_PASSWORD`, and optionally `POSTGRES_PORT`. Frontend
  `VITE_API_BASE_URL` is optional because `/api/v1` is the default, and
  `VITE_API_PROXY_TARGET` can override the local Vite proxy.
- **Testing:** backend integration tests use `NODE_ENV` and a dedicated
  `DATABASE_URL` in `backend/.env.test`. The isolated browser environment uses
  `NODE_ENV`, `DATABASE_URL`, and `BROWSER_TEST_DATABASE_USER`, with optional
  `BACKEND_PORT`, `FRONTEND_URL`, and `SESSION_COOKIE_NAME`. Browser-test Vite
  uses `VITE_API_PROXY_TARGET`. See
  [browser-acceptance-environment.md](./browser-acceptance-environment.md)
  for its guarded workflow. Never point tests at production.
- **Production:** backend `NODE_ENV`, `DATABASE_URL`, and `FRONTEND_URL`;
  Render supplies `PORT`. The Render Static Site build uses
  `VITE_API_BASE_URL`. Development and test database variables do not belong in
  production service configuration unless explicitly required for an
  independently reviewed operational purpose.
