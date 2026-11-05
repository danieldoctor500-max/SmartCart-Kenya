import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  assertBrowserTestDatabaseIdentity,
  backendDirectory,
  loadBrowserTestConfig,
} from "./browser-test-config.js";

async function main(): Promise<void> {
  const config = loadBrowserTestConfig();
  const { prisma } = await import("../src/config/database.js");

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
      "Migration refused because browser-test database identity or ownership could not be verified.",
    );
  }
  await prisma.$disconnect();

  const prismaCli = path.join(
    backendDirectory,
    "node_modules",
    "prisma",
    "build",
    "index.js",
  );
  const migration = spawnSync(
    process.execPath,
    [prismaCli, "migrate", "deploy"],
    {
      cwd: backendDirectory,
      env: process.env,
      stdio: "inherit",
    },
  );

  if (migration.error) {
    throw new Error("Could not start the Prisma browser-test migration command.");
  }
  if (migration.status !== 0) {
    process.exitCode = migration.status ?? 1;
  }
}

void main().catch(() => {
  process.stderr.write(
    "Browser-test migration failed closed. No development or shared test target was selected.\n",
  );
  process.exitCode = 1;
});
