
import dotenv from "dotenv";
import path from "node:path";

const rootEnvPath = path.resolve(process.cwd(), "../.env");

const result = dotenv.config({
  path: rootEnvPath,
  override: true,
});

if (result.error) {
  throw new Error("Could not load the root .env configuration.");
}

process.env.NODE_ENV = "test";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing from the root .env file.");
}

let parsedUrl: URL;

try {
  parsedUrl = new URL(databaseUrl);
} catch {
  throw new Error("The root DATABASE_URL is invalid.");
}

if (parsedUrl.pathname !== "/smartcart_kenya") {
  throw new Error(
    "Refusing to derive the test URL from an unexpected database.",
  );
}

parsedUrl.pathname = "/smartcart_kenya_test";
process.env.DATABASE_URL = parsedUrl.toString();

if (new URL(process.env.DATABASE_URL).pathname !== "/smartcart_kenya_test") {
  throw new Error("Test database safety verification failed.");
}

console.log("Test environment configured for smartcart_kenya_test.");
