
import dotenv from "dotenv";
import path from "node:path";

const testEnvPath = path.resolve(process.cwd(), ".env.test");

const result = dotenv.config({
  path: testEnvPath,
  override: true,
});

if (result.error) {
  throw new Error("Could not load backend/.env.test.");
}

if (process.env.NODE_ENV !== "test") {
  throw new Error("backend/.env.test must explicitly set NODE_ENV=test.");
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing from backend/.env.test.");
}

let parsedUrl: URL;

try {
  parsedUrl = new URL(databaseUrl);
} catch {
  throw new Error("The root DATABASE_URL is invalid.");
}

if (
  parsedUrl.protocol !== "postgresql:" ||
  parsedUrl.hostname !== "localhost" ||
  parsedUrl.port !== "5435" ||
  parsedUrl.pathname !== "/smartcart_kenya_test" ||
  parsedUrl.search !== "" ||
  parsedUrl.hash !== ""
) {
  throw new Error(
    "Refusing tests: backend/.env.test must target localhost:5435/smartcart_kenya_test without URL options.",
  );
}

const { prisma } = await import("../src/config/database.js");
let identity: Array<{ databaseName: string }>;

try {
  identity = await prisma.$queryRaw<Array<{ databaseName: string }>>`
    SELECT current_database() AS "databaseName"
  `;
} catch (error) {
  await prisma.$disconnect();
  throw error;
}

if (
  identity.length !== 1 ||
  identity[0]?.databaseName !== "smartcart_kenya_test"
) {
  await prisma.$disconnect();
  throw new Error(
    "Refusing to run tests: connected database identity is not smartcart_kenya_test.",
  );
}

console.log("Test environment verified for smartcart_kenya_test.");
