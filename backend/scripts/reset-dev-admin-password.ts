import argon2 from "argon2";
import { pathToFileURL } from "node:url";

import { env } from "../src/config/env.js";
import { prisma } from "../src/config/database.js";
import { registerSchema } from "../src/modules/auth/auth.schemas.js";

const EXPECTED_DATABASE_HOST = "localhost";
const EXPECTED_DATABASE_PORT = "5435";
const EXPECTED_DATABASE_NAME = "smartcart_kenya";
const TARGET_EMAIL = "danieldoctor500@gmail.com";
const EXPECTED_SERVER_IDENTITY_ENV =
  "SMARTCART_DEV_POSTGRES_SYSTEM_IDENTIFIER";
const MAX_POSTGRES_SYSTEM_IDENTIFIER = 18_446_744_073_709_551_615n;

class PasswordResetError extends Error {}

function getExpectedServerIdentity(): string {
  const expectedIdentity = process.env[EXPECTED_SERVER_IDENTITY_ENV];

  if (
    !expectedIdentity ||
    !/^[1-9]\d{0,19}$/.test(expectedIdentity) ||
    BigInt(expectedIdentity) > MAX_POSTGRES_SYSTEM_IDENTIFIER
  ) {
    throw new PasswordResetError(
      `${EXPECTED_SERVER_IDENTITY_ENV} must be explicitly configured as the approved PostgreSQL system identifier.`,
    );
  }

  return expectedIdentity;
}

function assertSafeEnvironment(): void {
  if (process.env.NODE_ENV !== "development") {
    throw new PasswordResetError(
      "Refusing to run: NODE_ENV must be explicitly set to development.",
    );
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(env.DATABASE_URL);
  } catch {
    throw new PasswordResetError(
      "Refusing to run: database configuration is invalid.",
    );
  }

  const expectedDatabaseUser = process.env.POSTGRES_USER;
  let configuredDatabaseUser: string;
  try {
    configuredDatabaseUser = decodeURIComponent(databaseUrl.username);
  } catch {
    throw new PasswordResetError(
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
    throw new PasswordResetError(
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
    throw new PasswordResetError(
      "Could not verify the PostgreSQL server identity. Confirm the configured identity and database-role permissions; no password was changed.",
    );
  }

  if (
    identity.length !== 1 ||
    identity[0]?.name !== EXPECTED_DATABASE_NAME ||
    identity[0]?.system_identifier !== expectedServerIdentity
  ) {
    throw new PasswordResetError(
      "Refusing to run: the connected PostgreSQL server or database identity does not match the approved development target.",
    );
  }
}

function readTerminalInput(prompt: string, masked = false): Promise<string> {
  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    typeof process.stdin.setRawMode !== "function" ||
    typeof Intl.Segmenter !== "function"
  ) {
    return Promise.reject(
      new PasswordResetError(
        "A TTY terminal with raw input support is required; no password was changed.",
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const wasRaw = Boolean(process.stdin.isRaw);
    const wasFlowing = process.stdin.readableFlowing;
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let value = "";
    let settled = false;

    const cleanup = (): Error | undefined => {
      let cleanupError: Error | undefined;
      const attempt = (action: () => void) => {
        try {
          action();
        } catch {
          cleanupError ??= new PasswordResetError(
            "Could not restore the terminal's original input state.",
          );
        }
      };

      attempt(() => process.stdin.off("data", onData));
      attempt(() => process.stdin.off("error", onInputError));
      attempt(() => process.stdin.off("end", onInputEnd));
      attempt(() => process.stdin.off("close", onInputClose));
      attempt(() => process.stdout.off("error", onOutputError));
      attempt(() => process.off("SIGINT", onSignal));
      attempt(() => process.off("SIGTERM", onSignal));
      if (process.platform === "win32") {
        attempt(() => process.off("SIGBREAK", onSignal));
      } else {
        attempt(() => process.off("SIGHUP", onSignal));
        attempt(() => process.off("SIGQUIT", onSignal));
      }
      attempt(() => process.stdin.setRawMode(wasRaw));
      if (wasFlowing !== true) attempt(() => process.stdin.pause());
      return cleanupError;
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      const cleanupError = cleanup();

      try {
        process.stdout.write("\n", (writeError?: Error | null) => {
          const finalError =
            error ??
            cleanupError ??
            (writeError
              ? new PasswordResetError(
                  "Terminal output failed; the password reset was cancelled.",
                )
              : undefined);
          if (finalError) reject(finalError);
          else resolve(value);
        });
      } catch {
        reject(
          error ??
            cleanupError ??
            new PasswordResetError(
              "Terminal output failed; the password reset was cancelled.",
            ),
        );
      }
    };

    const onData = (chunk: Buffer | string) => {
      try {
        const text = decoder.decode(
          typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk,
          { stream: true },
        );

        for (const character of text) {
          if (character === "\u0003" || character === "\u0004") {
            finish(new PasswordResetError("Password reset cancelled."));
            return;
          }

          if (character === "\r" || character === "\n") {
            try {
              decoder.decode();
            } catch {
              finish(
                new PasswordResetError(
                  "Terminal input contained incomplete Unicode data.",
                ),
              );
              return;
            }
            finish();
            return;
          }

          if (character === "\u007f" || character === "\b") {
            const graphemes = Array.from(segmenter.segment(value));
            const lastGrapheme = graphemes[graphemes.length - 1];
            if (lastGrapheme) {
              value = value.slice(0, lastGrapheme.index);
              const eraseCount = Math.max(
                1,
                Array.from(lastGrapheme.segment).length,
              );
              process.stdout.write("\b \b".repeat(eraseCount));
            }
            continue;
          }

          if (/\p{Cc}/u.test(character)) {
            finish(
              new PasswordResetError(
                "Unsupported terminal control input was rejected.",
              ),
            );
            return;
          }

          value += character;
          process.stdout.write(masked ? "*" : character);
        }
      } catch {
        finish(
          new PasswordResetError(
            "Terminal input failed; password reset was cancelled.",
          ),
        );
      }
    };

    const onInputError = () =>
      finish(new PasswordResetError("Terminal input failed; reset cancelled."));
    const onInputEnd = () =>
      finish(new PasswordResetError("Terminal input ended unexpectedly."));
    const onInputClose = () =>
      finish(new PasswordResetError("Terminal input closed unexpectedly."));
    const onOutputError = () =>
      finish(
        new PasswordResetError(
          "Terminal output failed; password reset was cancelled.",
        ),
      );
    const onSignal = () =>
      finish(new PasswordResetError("Password reset cancelled by signal."));

    try {
      process.stdin.on("data", onData);
      process.stdin.once("error", onInputError);
      process.stdin.once("end", onInputEnd);
      process.stdin.once("close", onInputClose);
      process.stdout.once("error", onOutputError);
      process.once("SIGINT", onSignal);
      process.once("SIGTERM", onSignal);
      if (process.platform === "win32") {
        process.once("SIGBREAK", onSignal);
      } else {
        process.once("SIGHUP", onSignal);
        process.once("SIGQUIT", onSignal);
      }
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdout.write(prompt, (writeError?: Error | null) => {
        if (writeError) {
          finish(
            new PasswordResetError(
              "Terminal output failed; password reset was cancelled.",
            ),
          );
        }
      });
    } catch {
      finish(
        new PasswordResetError(
          "Interactive terminal input could not be initialized safely.",
        ),
      );
    }
  });
}

function validateNewPassword(password: string): string {
  const parsed = registerSchema.safeParse({
    fullName: "Development Admin",
    email: TARGET_EMAIL,
    password,
  });
  if (!parsed.success) {
    throw new PasswordResetError(
      "The password must contain between 12 and 128 characters.",
    );
  }
  return parsed.data.password;
}

async function resetAdminPassword(): Promise<void> {
  assertSafeEnvironment();
  if (process.argv.length > 2) {
    throw new PasswordResetError(
      "Command-line arguments are not accepted; enter all values at the terminal prompts.",
    );
  }

  await verifyConnectedDatabaseIdentity(prisma);

  const enteredEmail = await readTerminalInput(
    `Enter the exact target email (${TARGET_EMAIL}): `,
  );
  const normalizedEmail = enteredEmail.trim().toLowerCase();
  if (enteredEmail !== TARGET_EMAIL || normalizedEmail !== TARGET_EMAIL) {
    throw new PasswordResetError(
      "The entered email does not match the approved target; no password was changed.",
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      status: true,
      roles: { select: { role: true } },
    },
  });
  if (!user) {
    throw new PasswordResetError(
      "The target account was not found; no password was changed.",
    );
  }
  if (
    user.status !== "ACTIVE" ||
    !user.roles.some(({ role }) => role === "ADMIN")
  ) {
    throw new PasswordResetError(
      "The target account must be active and have the ADMIN role; no password was changed.",
    );
  }

  const confirmation = await readTerminalInput(
    `Reset the password for ${TARGET_EMAIL} in ${EXPECTED_DATABASE_NAME} on PostgreSQL server ${getExpectedServerIdentity()}? Type "RESET PASSWORD ${TARGET_EMAIL}" to continue: `,
  );
  if (confirmation !== `RESET PASSWORD ${TARGET_EMAIL}`) {
    throw new PasswordResetError(
      "Password reset cancelled; no password was changed.",
    );
  }

  const password = await readTerminalInput("New password (input is masked): ", true);
  const passwordConfirmation = await readTerminalInput(
    "Confirm new password (input is masked): ",
    true,
  );
  if (password !== passwordConfirmation) {
    throw new PasswordResetError(
      "The passwords do not match; no password was changed.",
    );
  }

  const validatedPassword = validateNewPassword(password);
  const passwordHash = await argon2.hash(validatedPassword, {
    type: argon2.argon2id,
  });

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
      throw new PasswordResetError(
        "The confirmed account no longer exists; no password was changed.",
      );
    }
    if (
      lockedUser.id !== user.id ||
      lockedUser.email.trim().toLowerCase() !== TARGET_EMAIL
    ) {
      throw new PasswordResetError(
        "The confirmed account identity changed; no password was changed.",
      );
    }
    if (lockedUser.status !== "ACTIVE") {
      throw new PasswordResetError(
        "The target account is no longer active; no password was changed.",
      );
    }

    const currentUser = await transaction.user.findUnique({
      where: { id: lockedUser.id },
      select: { roles: { select: { role: true } } },
    });
    if (
      !currentUser ||
      !currentUser.roles.some(({ role }) => role === "ADMIN")
    ) {
      throw new PasswordResetError(
        "The target account no longer has the ADMIN role; no password was changed.",
      );
    }

    const updatedUsers = await transaction.$queryRaw<Array<{ id: string }>>`
      UPDATE "users"
      SET "passwordHash" = ${passwordHash}
      WHERE "id" = ${lockedUser.id}
      RETURNING "id"
    `;
    if (
      updatedUsers.length !== 1 ||
      updatedUsers[0]?.id !== user.id
    ) {
      throw new PasswordResetError(
        "The confirmed account password was not updated; transaction rolled back.",
      );
    }
  });

  process.stdout.write(
    `Password reset completed for ${TARGET_EMAIL}. The password and hash were not displayed.\n`,
  );
}

const invokedPath = process.argv[1];
const isDirectExecution =
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(invokedPath).href;

if (isDirectExecution) {
  resetAdminPassword()
    .catch((error: unknown) => {
      const message =
        error instanceof PasswordResetError
          ? error.message
          : "Password reset failed. No password, hash, credentials, or internal error details were printed.";
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
