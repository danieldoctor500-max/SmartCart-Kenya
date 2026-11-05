# SmartCart Kenya

SmartCart Kenya is a Kenya-first, multi-vendor marketplace MVP. It brings
customers, sellers, and administrators together in one storefront, with
server-side controls for accounts, catalogue data, stock, orders, and delivery
fees.

## Objectives

- Provide a clear online shopping experience for Kenyan customers.
- Give approved sellers a place to manage products and seller orders.
- Keep pricing, stock reservation, permissions, and checkout decisions on the
  backend.
- Provide administrative workflows for seller review, stores, and delivery
  rates.

## Features

- Public storefront and product catalogue.
- Customer registration, sign-in, profile, and address management.
- Guest and signed-in shopping carts.
- Seller applications and role-protected seller product/order workflows.
- Administrator dashboards, seller review, store management, and delivery-rate
  configuration.
- Checkout creates customer orders, groups items by seller, and reserves
  available inventory for 30 minutes.
- Delivery fees are calculated by the backend from active county/town rates.

Payment processing is **not enabled**. Daraja integration is limited to
Sandbox OAuth groundwork; it does not initiate or confirm customer payments.

## Technology

- Frontend: React, TypeScript, Vite, React Router, Axios.
- Backend: Node.js, Express, TypeScript.
- Database: PostgreSQL.
- ORM, migrations, and generated client: Prisma 7 with the PostgreSQL driver
  adapter.
- Local PostgreSQL development: Docker Compose.

## Repository structure

```text
backend/
  prisma/                 Prisma schema, migrations, and seed
  scripts/                Local development and browser-test utilities
  src/                    Express API and application modules
  tests/                  Backend tests
frontend/
  src/                    React application and frontend tests
  public/                 Static assets
docs/                     Browser acceptance and local admin guidance
docker-compose.yml        Local PostgreSQL service
```

## Prerequisites

- Git.
- A Node.js and npm version compatible with the package dependencies.
- Docker with the Docker Compose plugin for the local PostgreSQL option.
- PostgreSQL 16 or a compatible managed PostgreSQL service if not using Docker.

## Local development

### Configure PostgreSQL

The root `docker-compose.yml` runs PostgreSQL 16, binds it to loopback, and
persists database files in a named Docker volume. From the repository root,
configure the local environment using the variable names in the development
environment section below, then start the database:

```sh
docker compose up -d db
```

Compose requires `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`.
`POSTGRES_PORT` is optional and defaults to port 5433 on the local machine.
Set `DATABASE_URL` to connect the backend to this local database. No
credentials or connection strings belong in source control.

### Install dependencies

Install backend and frontend dependencies separately:

```sh
cd backend
npm ci
cd ../frontend
npm ci
```

### Generate Prisma Client and prepare the local database

From `backend/`, make sure `DATABASE_URL` is available to Prisma. Client
generation does not connect to PostgreSQL, but the Prisma configuration
requires that variable to be defined:

```sh
npm run db:generate
npm run db:migrate
```

`db:migrate` runs `prisma migrate dev` and is for local development. It may
connect to the configured database and apply development migrations. Review
the target environment before running it. Production migration guidance is in
[docs/deployment-render-neon.md](./docs/deployment-render-neon.md).

### Start the applications

In one terminal, from `backend/`:

```sh
npm run dev
```

In another terminal, from `frontend/`:

```sh
npm run dev
```

Vite listens on port 5173 and proxies `/api` requests to the backend on port
3000 by default. `VITE_API_PROXY_TARGET` can override that development proxy.
The frontend API client uses `/api/v1` by default, so local requests continue
through the Vite proxy.

## Environment variables

Set environment variables in the appropriate local environment or hosting
service. This section documents **names and purposes only**; do not commit
secrets or publish actual values.

### Development

| Name | Purpose |
| --- | --- |
| `NODE_ENV` | Backend runtime mode; defaults to development. |
| `DATABASE_URL` | PostgreSQL connection configuration used by Prisma and the backend. |
| `BACKEND_PORT` | Local backend port when the hosting-provided `PORT` is absent; defaults to 3000. |
| `PORT` | Standard hosting-provided backend port; takes precedence over `BACKEND_PORT`. |
| `FRONTEND_PORT` | Local frontend port used to form the default development `FRONTEND_URL`; defaults to 5173. |
| `FRONTEND_URL` | Browser origin allowed by backend CORS; defaults to the local frontend origin outside production. |
| `SESSION_COOKIE_NAME` | Name of the HTTP session cookie; defaults to `smartcart_session`. |
| `POSTGRES_DB` | Database name used by the local Docker Compose PostgreSQL service. |
| `POSTGRES_USER` | User created by the local Docker Compose PostgreSQL service. |
| `POSTGRES_PASSWORD` | Password for the local Docker Compose PostgreSQL user. |
| `POSTGRES_PORT` | Host port for local PostgreSQL; defaults to 5433. |
| `VITE_API_BASE_URL` | Frontend API base URL; defaults to `/api/v1` when unset. |
| `VITE_API_PROXY_TARGET` | Vite development proxy destination; defaults to the local backend. |

### Testing

Backend integration tests use a separate `backend/.env.test` file and require
`NODE_ENV` and `DATABASE_URL`. The test setup verifies that the target is the
dedicated local integration-test database before tests proceed. Backend tests
may access PostgreSQL; do not run them against development or production data.

The isolated browser-acceptance setup uses root `.env.browser-test` with
`NODE_ENV`, `DATABASE_URL`, and `BROWSER_TEST_DATABASE_USER`. It optionally
accepts `BACKEND_PORT`, `FRONTEND_URL`, and `SESSION_COOKIE_NAME`, with
strict local target checks. The frontend browser-test mode uses
`VITE_API_PROXY_TARGET` to point to its isolated backend. See
[docs/browser-acceptance-environment.md](./docs/browser-acceptance-environment.md)
before using any test database workflow.

### Production

Production backend configuration requires `NODE_ENV`, `DATABASE_URL`, and
`FRONTEND_URL`. `FRONTEND_URL` must be the exact HTTPS frontend origin. The
backend listens on `PORT` when the hosting platform provides it, falling back
to `BACKEND_PORT`.

The frontend build requires `VITE_API_BASE_URL` when it is hosted separately
from the backend. Vite embeds this value into the static build, so configure it
before the frontend build. See
[docs/deployment-render-neon.md](./docs/deployment-render-neon.md).

The optional `MPESA_ENVIRONMENT`, `MPESA_CONSUMER_KEY`,
`MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, and
`MPESA_CALLBACK_URL` settings are for Sandbox-only integration work. They do
not make payment processing operational.

## Prisma and database workflow

- Prisma schema: `backend/prisma/schema.prisma`.
- Migration history: `backend/prisma/migrations/`.
- Generated client output: `backend/src/generated/prisma/` (generated and
  ignored by Git).
- `npm run db:generate` generates Prisma Client.
- `npm run db:migrate` runs the local development migration workflow.
- `npm run build` generates Prisma Client before compiling TypeScript.
- Production migrations must be applied as a deliberate release operation with
  `prisma migrate deploy`; application startup does not run migrations.

## Build and start

Build the frontend from `frontend/`:

```sh
npm run build
```

This type-checks the frontend and writes static production files to `frontend/dist`.
Preview a local production build with `npm run preview`.

Build the backend from `backend/`:

```sh
npm run build
```

This generates Prisma Client and compiles TypeScript to `backend/dist`. Start
the compiled API with:

```sh
npm start
```

## API health

The database-aware health endpoint is `GET /api/v1/health`. It returns a
successful status when the API can reach PostgreSQL and a service-unavailable
status when the database is unavailable.

## Authentication and session cookies

Authentication uses server-side sessions stored by the backend and an
HTTP-only cookie in the browser. The frontend sends credentialed requests.
In production, the backend marks session cookies `Secure` and uses
`SameSite=Lax`; credentialed CORS is restricted to the configured
`FRONTEND_URL`. Deploy both services over HTTPS and configure the exact
frontend origin. Browser cookie rules may block requests when the frontend and
backend are on different sites; see the deployment guide.

## MVP limitations

- Payment processing is not enabled. Daraja support is Sandbox-only OAuth
  groundwork and does not complete a payment lifecycle.
- Checkout requires an administrator to configure active county/town delivery
  rates. No default rates are seeded; locations without configured rates
  cannot complete checkout.
- This is an MVP. Review authorization, operational monitoring, backup and
  recovery, availability, and provider-specific requirements before a public
  launch.

## Tests

Frontend tests run with `npm test` from `frontend/` and use the frontend test
environment. Backend `npm test` runs the backend suite, whose setup requires
the dedicated database configuration described above. Do not run database
tests without verifying that target first.
