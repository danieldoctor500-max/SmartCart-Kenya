# Development Admin provisioning

`npm run admin:provision` creates one new active Admin user for local
development. It does not promote existing accounts, reset passwords, run
migrations, or seed data. It is not a production provisioning tool.

## Required configuration

Run the command from `backend/`. The backend environment module loads the root
`.env`; the provisioning script additionally requires `NODE_ENV` to be
explicitly set to `development`.

The script pins the configured PostgreSQL URL to protocol `postgresql:`, host
`localhost`, port `5435`, database `smartcart_kenya`, and a username matching
`POSTGRES_USER`. It also requires:

```text
SMARTCART_DEV_POSTGRES_SYSTEM_IDENTIFIER
```

Set this variable in the process environment used to launch the command. Do
not add it to source files, command scripts, or committed configuration. The
system identifier is not a password or connection credential, but it is a
trust anchor and should be handled deliberately. For example, in a private
PowerShell session:

```powershell
$env:NODE_ENV = "development"
$env:SMARTCART_DEV_POSTGRES_SYSTEM_IDENTIFIER = "<expected identifier from trusted records>"
npm.cmd run admin:provision
```

In a POSIX-compatible shell, set the same two variables in that shell's
environment before invoking `npm run admin:provision`. Remove the variables
from the session afterward if they are no longer needed. Do not put an actual
identifier in this document or in source control.

## Establishing the expected server identity

Obtain the expected identifier through a trusted source independent of the
connection that the provisioning script will verify. Suitable sources include
the PostgreSQL host administrator's verified instance inventory, deployment
records, or backup/restore records tied to the intended local instance. An
authorized database operator can also obtain it through a separately
authenticated maintenance procedure after independently confirming the
server's identity.

Do not let the provisioning script discover an identifier from its current
connection and then trust that same value. That would make the comparison
circular and would not protect against a local port forward or tunnel pointing
at an unintended server. No expected identifier is supplied or verified by
this documentation.

The script compares the configured value with `system_identifier` returned by
PostgreSQL's `pg_control_system()` and also checks `current_database()`. It
performs these checks before the initial account lookup and again within the
transaction before its lookup and creation. It has no fallback if the query
fails or the values differ.

Reading `pg_control_system()` requires permission to execute that function.
On PostgreSQL versions that grant it through `pg_monitor`, membership in that
role or superuser access may be required. Confirm the exact permission model
for the installed PostgreSQL version with its administrator; `pg_monitor` is a
broad monitoring role. If the script's database role cannot read the function,
provisioning stops. Do not weaken the check to work around a permission error.

## Running and confirming provisioning

Only proceed after independently confirming that the configured local
PostgreSQL instance and its expected system identifier are the intended
development target. From `backend/`, invoke:

```text
npm run admin:provision
```

The script asks for the account name and email and prompts for the password
twice with masked input. It applies the normal registration validation and
Argon2id hashing. It refuses to modify an existing email. After displaying
the target database and expected PostgreSQL system identifier, it requires
the exact confirmation `CREATE`. That confirmation authorizes creation of a
new active user and its `ADMIN` role together in one transaction. Any other
input cancels without creating the account.

If the transaction succeeds but terminal success reporting fails, do not
rerun provisioning immediately. The script attempts to report that account
creation succeeded and includes the created account ID and email. Verify that
specific account through an approved administrative process before deciding
what to do next. If both output streams fail, the script cannot display the
warning; its exit status alone does not establish that the transaction failed.

## Promote an existing development user to Admin

Use `npm run admin:promote` from `backend/` only when the intended user already
exists. This is separate from `admin:provision`, which creates a new account.
The promotion tool is pinned to `danieldoctor500@gmail.com`; it requires
`NODE_ENV=development`, the same local database target and independently
configured `SMARTCART_DEV_POSTGRES_SYSTEM_IDENTIFIER` described above. It
checks the connected database name and PostgreSQL system identifier before
the initial lookup and again inside the transaction. It fails closed if
either identity check fails.

The operator must enter the exact target email and then type
`PROMOTE danieldoctor500@gmail.com` at the confirmation prompt. The command
aborts if the account is missing, inactive, or already an Admin. On success
it adds only an `ADMIN` role assignment in a transaction; existing roles,
including `CUSTOMER`, are preserved. The schema's unique `(userId, role)`
constraint prevents duplicate assignments. A repeated attempt does not add
another role and reports that the account already has Admin access.

Run from `backend/` after independently confirming the expected development
database identity:

```powershell
$env:NODE_ENV = "development"
$env:SMARTCART_DEV_POSTGRES_SYSTEM_IDENTIFIER = "<expected identifier from trusted records>"
npm.cmd run admin:promote
```

The promotion script does not change the user's password, email, status, or
profile. It does not create accounts, run migrations, or seed data. Keep the
same terminal and TTY cautions listed below.

## Terminal requirements and restrictions

The provisioning script requires interactive stdin and stdout TTYs, stdin
raw-mode support, and `Intl.Segmenter`. It handles masked password input and
restores terminal state during handled input, output, and signal failures.
The promotion script requires interactive stdin and stdout TTYs and handles
Ctrl+C cancellation. PowerShell and Git Bash compatibility have not been
tested; do not assume either is supported. Use only a terminal environment
verified to provide the required TTY behavior.

Never use this command against production, a remote database, a port-forwarded
or tunneled endpoint, or any database/server whose identity has not been
independently confirmed as the intended local development instance. The
script's target checks are safeguards, not authorization to provision an
account on an unintended system.
