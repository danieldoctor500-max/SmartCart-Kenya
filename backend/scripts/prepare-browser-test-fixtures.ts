import argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  assertBrowserTestDatabaseIdentity,
  backendDirectory,
  loadBrowserTestConfig,
} from "./browser-test-config.js";

interface FixtureIds {
  sellerUserId: string;
  sellerRoleId: string;
  sellerProfileId: string;
  storeId: string;
  customerUserId: string;
  customerRoleId: string;
  categoryId: string;
  productId: string;
  inventoryMovementId: string;
}

async function writeAtomic(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  await fs.rename(temporaryPath, filePath);
}

async function main(): Promise<void> {
  const config = loadBrowserTestConfig();
  const { prisma } = await import("../src/config/database.js");
  const runId = randomUUID().replaceAll("-", "");
  const emailSuffix = runId.slice(0, 20);
  const sellerEmail = `browser-seller-${emailSuffix}@example.test`;
  const customerEmail = `browser-customer-${emailSuffix}@example.test`;
  const sellerPassword = randomBytes(32).toString("base64url");
  const customerPassword = randomBytes(32).toString("base64url");
  const ids: FixtureIds = {
    sellerUserId: randomUUID(),
    sellerRoleId: randomUUID(),
    sellerProfileId: randomUUID(),
    storeId: randomUUID(),
    customerUserId: randomUUID(),
    customerRoleId: randomUUID(),
    categoryId: randomUUID(),
    productId: randomUUID(),
    inventoryMovementId: randomUUID(),
  };
  const fixtureDirectory = path.join(
    backendDirectory,
    ".browser-test-fixtures",
  );
  const manifestPath = path.join(fixtureDirectory, `${runId}.json`);
  const credentialsPath = path.join(
    fixtureDirectory,
    `${runId}.credentials.json`,
  );
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
    assertBrowserTestDatabaseIdentity(identity, config);

    const existing = await prisma.user.findMany({
      where: { email: { in: [sellerEmail, customerEmail] } },
      select: { id: true },
    });
    if (existing.length > 0) {
      throw new Error("A generated fixture identity already exists.");
    }

    await fs.mkdir(fixtureDirectory, { recursive: true, mode: 0o700 });
    const manifest = {
      format: "smartcart-browser-test-fixtures",
      version: 1,
      runId,
      state: "prepared",
      createdAt: new Date().toISOString(),
      databaseName: "smartcart_kenya_browser_test",
      identities: { sellerEmail, customerEmail },
      ids,
    };
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await fs.writeFile(
      credentialsPath,
      `${JSON.stringify(
        {
          warning:
            "Local browser-test credentials. Do not commit or share this file.",
          seller: { email: sellerEmail, password: sellerPassword },
          customer: { email: customerEmail, password: customerPassword },
        },
        null,
        2,
      )}\n`,
      { flag: "wx", mode: 0o600 },
    );

    try {
      const sellerPasswordHash = await argon2.hash(sellerPassword, {
        type: argon2.argon2id,
      });
      const customerPasswordHash = await argon2.hash(customerPassword, {
        type: argon2.argon2id,
      });

      await prisma.$transaction(async (tx) => {
        await tx.category.create({
          data: {
            id: ids.categoryId,
            name: `Browser Test ${emailSuffix}`,
            slug: `browser-test-${emailSuffix}`,
            isActive: true,
          },
        });

        await tx.user.create({
          data: {
            id: ids.sellerUserId,
            email: sellerEmail,
            passwordHash: sellerPasswordHash,
            fullName: "Browser Acceptance Seller",
            status: "ACTIVE",
            roles: {
              create: {
                id: ids.sellerRoleId,
                role: "SELLER",
              },
            },
            sellerProfile: {
              create: {
                id: ids.sellerProfileId,
                businessName: `Browser Acceptance ${emailSuffix}`,
                applicationStatus: "APPROVED",
                email: sellerEmail,
                store: {
                  create: {
                    id: ids.storeId,
                    name: `Browser Acceptance Store ${emailSuffix}`,
                    slug: `browser-acceptance-${emailSuffix}`,
                    description: "Isolated browser acceptance fixture.",
                    status: "ACTIVE",
                  },
                },
              },
            },
          },
        });

        await tx.user.create({
          data: {
            id: ids.customerUserId,
            email: customerEmail,
            passwordHash: customerPasswordHash,
            fullName: "Browser Acceptance Customer",
            status: "ACTIVE",
            roles: {
              create: {
                id: ids.customerRoleId,
                role: "CUSTOMER",
              },
            },
          },
        });

        await tx.product.create({
          data: {
            id: ids.productId,
            storeId: ids.storeId,
            categoryId: ids.categoryId,
            name: `Browser Test Product ${emailSuffix}`,
            slug: `browser-test-product-${emailSuffix}`,
            description: "Fixture for seller product publishing acceptance.",
            price: "1250.00",
            currency: "KES",
            stockQuantity: 5,
            reservedQuantity: 0,
            status: "DRAFT",
            movements: {
              create: {
                id: ids.inventoryMovementId,
                quantityDelta: 5,
                reason: "RESTOCK",
                note: "Initial browser-test fixture stock.",
              },
            },
          },
        });
      });
    } catch (error) {
      await fs.rm(credentialsPath, { force: true });
      throw error;
    }

    try {
      await writeAtomic(manifestPath, { ...manifest, state: "created" });
    } catch {
      process.stderr.write(
        `Fixture records were created in the isolated database, but the run manifest could not be updated. Do not rerun; inspect the prepared manifest at ${manifestPath}.\n`,
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `Browser-test fixtures created in the verified isolated database. Run record: ${manifestPath}\nCredentials are stored locally in the ignored fixture directory; their values were not printed.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const reason =
    error instanceof Error && error.message === "A generated fixture identity already exists."
      ? "Generated fixture identity collision; no existing account was modified."
      : "Check the isolated database, ownership, and local configuration.";
  process.stderr.write(
    `Browser-test fixture creation failed. ${reason} No credential values were printed.\n`,
  );
  process.exitCode = 1;
});
