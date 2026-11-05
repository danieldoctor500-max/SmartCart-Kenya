# Isolated browser-acceptance environment

This setup is separate from the development database and the existing integration-test database. It does not create databases, run automatically at startup, or clean up database records.

## Database target and environment

Use a dedicated local PostgreSQL role and a manually created database named exactly `smartcart_kenya_browser_test`. Neither `smartcart_kenya` nor `smartcart_kenya_test` is an allowed target. The configured connection must use `localhost:5435`, the dedicated role as both URL user and database owner, and no URL query parameters or fragment.

1. Have an authorized local PostgreSQL administrator create a role and the exact database above, owned by that role. Do not use the development role unless the database owner and connection identity can be independently verified.
2. Copy the root `.env.browser-test.example` to the ignored root `.env.browser-test`. Set a strong local-only password in `DATABASE_URL` (URL-encode reserved characters) and set `BROWSER_TEST_DATABASE_USER` to the same dedicated role name. The config must explicitly use `NODE_ENV=test`.
3. Before migrating, review the target in that local file without printing it. The guarded migration command connects and verifies `current_database()`, `current_user`, `session_user`, and the actual database owner against the fixed target and configured role before invoking Prisma `migrate deploy`. It fails closed if any check fails.
4. Configure the database manually before running `npm run browser-test:migrate` from `backend`. Migration is an explicit operator action, not part of server startup or fixture creation.

The backend integration-test configuration is separate: `backend/tests/setup.ts` now reads only `backend/.env.test` and requires `localhost:5435/smartcart_kenya_test`, with live database-name verification. The local ignored `backend/.env.test` found during the audit used a different port; update that local file deliberately if integration tests are to run. The browser-test tools never read it or derive a browser-test URL from the root development `.env`.

## Start the isolated backend

From `backend`:

```powershell
npm run browser-test:backend
```

The launcher loads only root `.env.browser-test`, defaults to port `3001`, verifies database name, active/session role, and database ownership before listening, and prints the verified database name without printing a URL or credentials. It does not start the reservation-release worker. Stop it with Ctrl+C.

## Prepare browser fixtures

Only after the dedicated database exists, has been migrated, and its identity/ownership is verified:

```powershell
npm run browser-test:fixtures
```

The script generates unique seller and customer emails, checks for identity collisions, and creates only new rows in one database transaction: active customer/seller users, their roles, an approved seller profile, an active store, a unique category, and an in-stock draft product with an inventory movement. It creates no Admin account, does not update existing rows, and has no cleanup command.

The script records all created IDs in an ignored per-run manifest under `backend/.browser-test-fixtures/`. Generated login passwords are written only to a separate ignored local credentials file; they are not printed. On Windows, restrict the file's ACL before opening or sharing it. Remove the credential file when no longer needed. The fixture records and database rows are retained; any future cleanup must be reviewed and restricted to the IDs in that run's manifest.

## Start Vite against the isolated backend

Copy `frontend/.env.browser-test.example` to `frontend/.env.browser-test`. The required proxy target is exactly `http://localhost:3001`.

From `frontend`:

```powershell
npm run dev:browser-test
```

Browser-test mode refuses to start if the proxy target is not port `3001`. Normal `npm run dev` continues to proxy to `http://localhost:3000`.

Use the fixture credentials file to sign in as the seller or customer. Do not put credentials in command-line arguments, logs, screenshots, source control, or shared reports. The customer may also use the guest cart. Browser cart activity is isolated to the dedicated browser-test database.

## Identity verification and stopping

The backend prints `Verified browser-test database: smartcart_kenya_browser_test` only after a live query confirms all identity and owner fields. The guarded migration script performs the same checks before migration. A database URL or health response alone is not proof of database identity.

Stop Vite and the backend with Ctrl+C in their respective terminals. Do not run `db:seed`, `db:migrate`, or the Admin provisioning command for this setup. Do not point either process at the development or integration-test database.
