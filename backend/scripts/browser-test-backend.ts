import {
  assertBrowserTestDatabaseIdentity,
  loadBrowserTestConfig,
} from "./browser-test-config.js";

async function main(): Promise<void> {
  const config = loadBrowserTestConfig();
  const [{ default: app }, { prisma }] = await Promise.all([
    import("../src/app.js"),
    import("../src/config/database.js"),
  ]);

  try {
    const identity = await prisma.$queryRaw<
      Array<{
        databaseName: string;
        currentRole: string;
        sessionRole: string;
        databaseOwner: string;
      }>
    >`
      SELECT
        current_database() AS "databaseName",
        current_user AS "currentRole",
        session_user AS "sessionRole",
        pg_get_userbyid(database_record.datdba) AS "databaseOwner"
      FROM pg_database AS database_record
      WHERE database_record.datname = current_database()
    `;

    await assertBrowserTestDatabaseIdentity(identity, config);
  } catch {
    await prisma.$disconnect();
    throw new Error(
      "Browser-test backend refused to start because database identity or ownership could not be verified.",
    );
  }

  process.stdout.write(
    "Verified browser-test database: smartcart_kenya_browser_test; database owner and runtime role match.\n",
  );
  const server = app.listen(config.backendPort);
  server.once("listening", () => {
    process.stdout.write(
      `Isolated browser-test API listening on port ${config.backendPort}.\n`,
    );
  });
  server.once("error", () => {
    process.stderr.write("Browser-test API could not bind its configured port.\n");
    process.exitCode = 1;
    void prisma.$disconnect();
  });

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    server.close(async () => {
      await prisma.$disconnect();
      process.stdout.write(`Browser-test API stopped (${signal}).\n`);
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

void main().catch(() => {
  process.stderr.write(
    "Browser-test backend stopped before accepting requests. Check the dedicated configuration and database ownership.\n",
  );
  process.exitCode = 1;
});
