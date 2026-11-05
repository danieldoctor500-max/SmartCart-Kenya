import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

import { Prisma } from "../src/generated/prisma/client.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/database.js";

const EXPECTED_DATABASE_HOST = "localhost";
const EXPECTED_DATABASE_PORT = "5435";
const EXPECTED_DATABASE_NAME = "smartcart_kenya";
const TARGET_EMAIL = "danieldoctor500@gmail.com";
const EXPECTED_SERVER_IDENTITY_ENV =
  "SMARTCART_DEV_POSTGRES_SYSTEM_IDENTIFIER";
const MAX_POSTGRES_SYSTEM_IDENTIFIER = 18_446_744_073_709_551_615n;

class PromotionError extends Error {}

function writeTerminalMessage(
  stream: NodeJS.WriteStream,
  message: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(message, (error?: Error | null) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function getExpectedServerIdentity(): string {
  const expectedIdentity = process.env[EXPECTED_SERVER_IDENTITY_ENV];

  if (
    !expectedIdentity ||
    !/^[1-9]\d{0,19}$/.test(expectedIdentity) ||
    BigInt(expectedIdentity) > MAX_POSTGRES_SYSTEM_IDENTIFIER
  ) {
    throw new PromotionError(
      `${EXPECTED_SERVER_IDENTITY_ENV} must be explicitly configured as the approved PostgreSQL system identifier.`,
    );
  }

  return expectedIdentity;
}

function assertSafeEnvironment(): void {
  if (process.env.NODE_ENV !== "development") {
    throw new PromotionError(
      "Refusing to run: NODE_ENV must be explicitly set to development.",
    );
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(env.DATABASE_URL);
  } catch {
    throw new PromotionError(
      "Refusing to run: database configuration is invalid.",
    );
  }

  const expectedDatabaseUser = process.env.POSTGRES_USER;
  let configuredDatabaseUser: string;
  try {
    configuredDatabaseUser = decodeURIComponent(databaseUrl.username);
  } catch {
    throw new PromotionError(
      "Refusing to run: database configuration is invalid.",
    );
  }

  if (
    databaseUrl.protocol !== "postgresql:" ||
    databaseUrl.hostname !== EXPECTED_DATABASE_HOST ||
    databaseUrl.port !== EXPECTED_DATABASE_PORT ||
    databaseUrl.pathname !== `/${EXPECTED_DATABASE_NAME}` ||
    !expectedDatabaseUser ||
    configuredDatabaseUser !== expectedDatabaseUser ||
    databaseUrl.search !== "" ||
    databaseUrl.hash !== ""
  ) {
    throw new PromotionError(
      "Refusing to run: database configuration does not match the approved local development database.",
    );
  }

  getExpectedServerIdentity();
}

async function verifyConnectedDatabaseIdentity(
  client: Pick<typeof prisma, "$queryRaw">,
): Promise<void> {
  const expectedServerIdentity = getExpectedServerIdentity();
  let identity: Array<{ name: string; system_identifier: string }>;

  try {
    identity = await client.$queryRaw<Array<{
      name: string;
      system_identifier: string;
    }>>`
      SELECT
        current_database() AS name,
        system_identifier::text AS system_identifier
      FROM pg_control_system()
    `;
  } catch {
    throw new PromotionError(
      "Could not verify the PostgreSQL server identity. Confirm the configured identity and database-role permissions; no role was changed.",
    );
  }

  if (
    identity.length !== 1 ||
    identity[0]?.name !== EXPECTED_DATABASE_NAME ||
    identity[0]?.system_identifier !== expectedServerIdentity
  ) {
    throw new PromotionError(
      "Refusing to run: the connected PostgreSQL server or database identity does not match the approved development target.",
    );
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function promoteAdmin(): Promise<void> {
  assertSafeEnvironment();
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new PromotionError(
      "Interactive stdin and stdout TTYs are required; no role was changed.",
    );
  }

  await verifyConnectedDatabaseIdentity(prisma);

  const abortController = new AbortController();
  const onSigint = () => abortController.abort();
  process.once("SIGINT", onSigint);
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const enteredEmail = await terminal.question(
      `Enter the exact target email (${TARGET_EMAIL}): `,
      { signal: abortController.signal },
    );
    const normalizedEmail = enteredEmail.trim().toLowerCase();
    if (enteredEmail !== TARGET_EMAIL || normalizedEmail !== TARGET_EMAIL) {
      throw new PromotionError(
        "The entered email does not match the approved target; no role was changed.",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        roles: { select: { role: true } },
      },
    });

    if (!user) {
      throw new PromotionError(
        "The target account was not found; no role was changed.",
      );
    }
    if (user.status !== "ACTIVE") {
      throw new PromotionError(
        "The target account is not active; no role was changed.",
      );
    }
    if (user.roles.some(({ role }) => role === "ADMIN")) {
      throw new PromotionError(
        "The target account already has the ADMIN role; no changes were made.",
      );
    }

    const confirmation = await terminal.question(
      `Promote ${user.email} (${user.fullName}) to ADMIN in ${EXPECTED_DATABASE_NAME} on PostgreSQL server ${getExpectedServerIdentity()}? Type "PROMOTE ${TARGET_EMAIL}" to continue: `,
      { signal: abortController.signal },
    );
    if (confirmation !== `PROMOTE ${TARGET_EMAIL}`) {
      throw new PromotionError(
        "Promotion cancelled; no role was changed.",
      );
    }

    try {
      await prisma.$transaction(async (transaction) => {
        await verifyConnectedDatabaseIdentity(transaction);

        const lockedUsers = await transaction.$queryRaw<Array<{
          id: string;
          email: string;
          status: string;
        }>>`
          SELECT "id", "email", "status"::text AS "status"
          FROM "users"
          WHERE "id" = ${user.id}
          FOR UPDATE
        `;
        const lockedUser = lockedUsers[0];

        if (!lockedUser) {
          throw new PromotionError(
            "The target account no longer exists; no role was changed.",
          );
        }
        if (
          lockedUser.id !== user.id ||
          lockedUser.email.trim().toLowerCase() !== TARGET_EMAIL
        ) {
          throw new PromotionError(
            "The confirmed account identity changed; no role was changed.",
          );
        }
        if (lockedUser.status !== "ACTIVE") {
          throw new PromotionError(
            "The target account is not active; no role was changed.",
          );
        }

        const currentUser = await transaction.user.findUnique({
          where: { id: lockedUser.id },
          select: {
            roles: { select: { role: true } },
          },
        });
        if (!currentUser) {
          throw new PromotionError(
            "The locked target account no longer exists; no role was changed.",
          );
        }
        if (currentUser.roles.some(({ role }) => role === "ADMIN")) {
          throw new PromotionError(
            "The target account already has the ADMIN role; no changes were made.",
          );
        }

        await transaction.roleAssignment.create({
          data: {
            userId: lockedUser.id,
            role: "ADMIN",
          },
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new PromotionError(
          "The ADMIN role was concurrently assigned or already exists; no duplicate role was created.",
        );
      }
      throw error;
    }

    try {
      await writeTerminalMessage(
        process.stdout,
        `ADMIN role assigned to ${user.email}. Existing account data and roles were preserved.\n`,
      );
    } catch {
      process.exitCode = 1;
      try {
        await writeTerminalMessage(
          process.stderr,
          `ADMIN promotion succeeded for ${user.email}, but terminal reporting failed. Do not retry without first verifying the role assignment.\n`,
        );
      } catch {
        // The committed role assignment remains in place if both streams fail.
      }
    }
  } finally {
    process.off("SIGINT", onSigint);
    terminal.close();
  }
}

const invokedPath = process.argv[1];
const isDirectExecution =
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(invokedPath).href;

if (isDirectExecution) {
  promoteAdmin()
    .catch((error: unknown) => {
      const message =
        error instanceof PromotionError
          ? error.message
          : "Admin promotion failed. No password, credential, or internal error details were printed.";
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        await prisma.$disconnect();
      } catch {
        process.stderr.write("Could not cleanly disconnect the database client.\n");
        process.exitCode = 1;
      }
    });
}
