import argon2 from "argon2";
import { pathToFileURL } from "node:url";

import { env } from "../src/config/env.js";
import { prisma } from "../src/config/database.js";
import { registerSchema } from "../src/modules/auth/auth.schemas.js";

const EXPECTED_DATABASE_HOST = "localhost";
const EXPECTED_DATABASE_PORT = "5435";
const EXPECTED_DATABASE_NAME = "smartcart_kenya";
const EXPECTED_SERVER_IDENTITY_ENV =
  "SMARTCART_DEV_POSTGRES_SYSTEM_IDENTIFIER";
const MAX_POSTGRES_SYSTEM_IDENTIFIER = 18_446_744_073_709_551_615n;

class ProvisioningError extends Error {}

function getExpectedServerIdentity(): string {
  const expectedIdentity = process.env[EXPECTED_SERVER_IDENTITY_ENV];

  if (
    !expectedIdentity ||
    !/^[1-9]\d{0,19}$/.test(expectedIdentity) ||
    BigInt(expectedIdentity) > MAX_POSTGRES_SYSTEM_IDENTIFIER
  ) {
    throw new ProvisioningError(
      `${EXPECTED_SERVER_IDENTITY_ENV} must be explicitly configured as the approved PostgreSQL system identifier.`,
    );
  }

  return expectedIdentity;
}

function writeTerminalMessage(
  stream: NodeJS.WriteStream,
  message: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (error?: Error | null) => {
      if (settled) {
        return;
      }

      settled = true;
      stream.off("error", onError);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const onError = (error: Error) => finish(error);

    stream.once("error", onError);
    try {
      stream.write(message, (error?: Error | null) => finish(error));
    } catch (error) {
      finish(
        error instanceof Error
          ? error
          : new Error("Terminal output failed."),
      );
    }
  });
}

async function reportCreatedAccount(
  account: { id: string; email: string },
): Promise<void> {
  try {
    await writeTerminalMessage(
      process.stdout,
      `Admin account created successfully. Account ID: ${account.id}; email: ${account.email}.\n`,
    );
  } catch {
    process.exitCode = 1;
    try {
      await writeTerminalMessage(
        process.stderr,
        `Account creation succeeded (ID: ${account.id}; email: ${account.email}), but terminal reporting failed. Do not retry provisioning; verify this account before taking further action.\n`,
      );
    } catch {
      // Creation success remains recorded even if both output streams fail.
    }
  }
}

function assertSafeEnvironment(): void {
  if (process.env.NODE_ENV !== "development") {
    throw new ProvisioningError(
      "Refusing to run: NODE_ENV must be explicitly set to development.",
    );
  }

  let databaseUrl: URL;

  try {
    databaseUrl = new URL(env.DATABASE_URL);
  } catch {
    throw new ProvisioningError(
      "Refusing to run: database configuration is invalid.",
    );
  }

  const expectedDatabaseUser = process.env.POSTGRES_USER;
  let configuredDatabaseUser: string;

  try {
    configuredDatabaseUser = decodeURIComponent(databaseUrl.username);
  } catch {
    throw new ProvisioningError(
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
    throw new ProvisioningError(
      "Refusing to run: database configuration does not match the approved local development database.",
    );
  }

  getExpectedServerIdentity();
}

function readTerminalInput(prompt: string, masked = false): Promise<string> {
  // Requires a real TTY with raw-mode support; PowerShell and Git Bash have not been verified.
  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    typeof process.stdin.setRawMode !== "function" ||
    typeof Intl.Segmenter !== "function"
  ) {
    return Promise.reject(
      new ProvisioningError(
        "A TTY terminal with raw input support and Unicode grapheme segmentation is required.",
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
    let completed = false;
    let pendingOutputError: Error | undefined;

    const restoreTerminal = (): Error | undefined => {
      let restoreError: Error | undefined;
      const attempt = (action: () => void) => {
        try {
          action();
        } catch {
          restoreError ??= new ProvisioningError(
            "Could not restore the terminal's original input state.",
          );
        }
      };

      attempt(() => process.stdin.off("data", onData));
      attempt(() => process.stdin.off("error", onError));
      attempt(() => process.stdin.off("end", onEnd));
      attempt(() => process.stdin.off("close", onClose));
      attempt(() => process.off("SIGINT", onSigint));
      attempt(() => process.off("SIGTERM", onSigterm));
      if (process.platform === "win32") {
        attempt(() => process.off("SIGBREAK", onSigbreak));
      } else {
        attempt(() => process.off("SIGHUP", onSighup));
        attempt(() => process.off("SIGQUIT", onSigquit));
      }
      attempt(() => process.stdin.setRawMode(wasRaw));
      if (wasFlowing !== true) {
        attempt(() => process.stdin.pause());
      }

      return restoreError;
    };

    const complete = (error?: Error) => {
      if (completed) {
        return;
      }

      completed = true;
      try {
        process.stdout.off("error", onOutputError);
      } catch {
        pendingOutputError ??= new ProvisioningError(
          "Terminal output cleanup failed.",
        );
      }
      const finalError = error ?? pendingOutputError;

      if (finalError) {
        reject(finalError);
      } else {
        resolve(value);
      }
    };

    const finish = (error?: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      const restoreError = restoreTerminal();
      const finalError =
        error && restoreError
          ? new ProvisioningError(
              "Terminal input failed, and the original terminal state could not be restored.",
            )
          : error ?? restoreError;

      try {
        process.stdout.write("\n", (writeError?: Error | null) => {
          complete(
            finalError ??
              (writeError
                ? new ProvisioningError(
                    "Terminal output failed; provisioning was cancelled.",
                  )
                : undefined),
          );
        });
      } catch {
        complete(
          finalError ??
            new ProvisioningError(
              "Terminal output failed; provisioning was cancelled.",
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
            finish(new ProvisioningError("Provisioning cancelled."));
            return;
          }

          if (character === "\r" || character === "\n") {
            try {
              decoder.decode();
            } catch {
              finish(
                new ProvisioningError(
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
              const eraseCount = masked
                ? Array.from(lastGrapheme.segment).length
                : Math.max(1, Array.from(lastGrapheme.segment).length);
              process.stdout.write("\b \b".repeat(eraseCount));
            }
            continue;
          }

          if (/\p{Cc}/u.test(character)) {
            finish(
              new ProvisioningError(
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
          new ProvisioningError(
            "Terminal input failed; provisioning was cancelled.",
          ),
        );
      }
    };

    const onError = () =>
      finish(
        new ProvisioningError(
          "Terminal input failed; provisioning was cancelled.",
        ),
      );
    const onEnd = () =>
      finish(new ProvisioningError("Terminal input ended unexpectedly."));
    const onClose = () =>
      finish(new ProvisioningError("Terminal input closed unexpectedly."));
    const onSigint = () =>
      finish(new ProvisioningError("Provisioning cancelled."));
    const onSigterm = () =>
      finish(new ProvisioningError("Provisioning cancelled by termination signal."));
    const onSighup = () =>
      finish(new ProvisioningError("Provisioning cancelled by terminal hangup."));
    const onSigquit = () =>
      finish(new ProvisioningError("Provisioning cancelled by terminal signal."));
    const onSigbreak = () =>
      finish(new ProvisioningError("Provisioning cancelled by terminal break."));
    const onOutputError = () => {
      pendingOutputError = new ProvisioningError(
        "Terminal output failed; provisioning was cancelled.",
      );
      if (settled) {
        complete(pendingOutputError);
      } else {
        finish(pendingOutputError);
      }
    };

    try {
      process.stdout.on("error", onOutputError);
      process.stdin.on("data", onData);
      process.stdin.once("error", onError);
      process.stdin.once("end", onEnd);
      process.stdin.once("close", onClose);
      process.once("SIGINT", onSigint);
      process.once("SIGTERM", onSigterm);
      if (process.platform === "win32") {
        process.once("SIGBREAK", onSigbreak);
      } else {
        process.once("SIGHUP", onSighup);
        process.once("SIGQUIT", onSigquit);
      }
      process.stdin.setRawMode(true);
      process.stdin.resume();

      process.stdout.write(prompt, (writeError?: Error | null) => {
        if (writeError) {
          finish(
            new ProvisioningError(
              "Terminal output failed; provisioning was cancelled.",
            ),
          );
        }
      });
    } catch {
      finish(
        new ProvisioningError(
          "Interactive terminal input could not be initialized safely.",
        ),
      );
    }
  });
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
    throw new ProvisioningError(
      "Could not verify the PostgreSQL server identity. Confirm the configured identity and that the database role can read it; no account was created.",
    );
  }

  if (
    identity.length !== 1 ||
    identity[0]?.name !== EXPECTED_DATABASE_NAME ||
    identity[0]?.system_identifier !== expectedServerIdentity
  ) {
    throw new ProvisioningError(
      "Refusing to run: the connected PostgreSQL server or database identity does not match the approved development target.",
    );
  }
}

function validateAccountInput(fullName: string, email: string, password: string) {
  const parsed = registerSchema.safeParse({ fullName, email, password });

  if (!parsed.success) {
    throw new ProvisioningError(
      "Invalid account details. Use a valid email, a 2-100 character name, and a 12-128 character password.",
    );
  }

  return parsed.data;
}

async function provisionAdmin(): Promise<void> {
  assertSafeEnvironment();

  const fullName = await readTerminalInput("Admin full name: ");
  const email = await readTerminalInput("Admin email: ");
  const password = await readTerminalInput("Password (input is masked): ", true);
  const passwordConfirmation = await readTerminalInput(
    "Confirm password (input is masked): ",
    true,
  );

  if (password !== passwordConfirmation) {
    throw new ProvisioningError("The passwords do not match.");
  }

  const account = validateAccountInput(fullName, email, password);
  await verifyConnectedDatabaseIdentity(prisma);

  const existingUser = await prisma.user.findUnique({
    where: { email: account.email },
    select: { id: true },
  });

  if (existingUser) {
    throw new ProvisioningError(
      "That email already belongs to an account. No existing account was changed.",
    );
  }

  const confirmation = await readTerminalInput(
    `Create a new ACTIVE Admin account for ${account.email} in ${EXPECTED_DATABASE_NAME} on PostgreSQL server ${getExpectedServerIdentity()}? Type CREATE to continue: `,
  );

  if (confirmation !== "CREATE") {
    throw new ProvisioningError("Provisioning cancelled; no account was created.");
  }

  const passwordHash = await argon2.hash(account.password, {
    type: argon2.argon2id,
  });

  let createdAccount: { id: string; email: string };
  let accountCreationSucceeded = false;

  try {
    createdAccount = await prisma.$transaction(async (transaction) => {
      await verifyConnectedDatabaseIdentity(transaction);

      const currentUser = await transaction.user.findUnique({
        where: { email: account.email },
        select: { id: true },
      });

      if (currentUser) {
        throw new ProvisioningError(
          "That email already belongs to an account. No existing account was changed.",
        );
      }

      return transaction.user.create({
        data: {
          fullName: account.fullName,
          email: account.email,
          passwordHash,
          status: "ACTIVE",
          roles: {
            create: { role: "ADMIN" },
          },
        },
        select: {
          id: true,
          email: true,
        },
      });
    });

  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new ProvisioningError(
        "That email already belongs to an account. No existing account was changed.",
      );
    }

    throw error;
  }

  accountCreationSucceeded = true;
  if (accountCreationSucceeded) {
    await reportCreatedAccount(createdAccount);
  }
}

const invokedPath = process.argv[1];
const isDirectExecution =
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(invokedPath).href;

if (isDirectExecution) {
  provisionAdmin()
    .catch((error: unknown) => {
      const message =
        error instanceof ProvisioningError
          ? error.message
          : "Provisioning failed. Check the local database availability; no credentials or internal error details were printed.";
      console.error(message);
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        await prisma.$disconnect();
      } catch {
        console.error("Could not cleanly disconnect the database client.");
        process.exitCode = 1;
      }
    });
}
