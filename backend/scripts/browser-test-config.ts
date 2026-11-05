import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const backendDirectory = path.resolve(scriptDirectory, "..");
export const repositoryDirectory = path.resolve(backendDirectory, "..");
export const browserTestEnvironmentPath = path.join(
  repositoryDirectory,
  ".env.browser-test",
);
export const browserTestDatabaseName = "smartcart_kenya_browser_test";

const environmentKeys = [
  "NODE_ENV",
  "DATABASE_URL",
  "BROWSER_TEST_DATABASE_USER",
  "BACKEND_PORT",
  "FRONTEND_URL",
  "SESSION_COOKIE_NAME",
] as const;
const inheritedProjectKeys = [
  ...environmentKeys,
  "APP_NAME",
  "FRONTEND_PORT",
  "PORT",
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_PORT",
  "SESSION_SECRET",
  "AI_API_KEY",
  "MPESA_ENVIRONMENT",
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_SHORTCODE",
  "MPESA_PASSKEY",
  "MPESA_CALLBACK_URL",
  "VITE_API_BASE_URL",
  "VITE_API_PROXY_TARGET",
  "SMARTCART_BROWSER_TEST",
];

export interface BrowserTestConfig {
  databaseUrl: string;
  databaseUser: string;
  backendPort: number;
  frontendUrl: string;
  sessionCookieName: string;
}

export function loadBrowserTestConfig(): BrowserTestConfig {
  let fileContents: string;
  try {
    fileContents = fs.readFileSync(browserTestEnvironmentPath, "utf8");
  } catch {
    throw new Error(
      "Missing .env.browser-test. Create it from .env.browser-test.example and configure the dedicated database.",
    );
  }

  const parsed = dotenv.parse(fileContents);
  const unknownKeys = Object.keys(parsed).filter(
    (key) => !environmentKeys.includes(key as (typeof environmentKeys)[number]),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      ".env.browser-test contains unsupported settings; review the allowed variables in the browser acceptance guide.",
    );
  }

  if (parsed.NODE_ENV !== "test") {
    throw new Error(".env.browser-test must explicitly set NODE_ENV=test.");
  }

  const databaseUrl = parsed.DATABASE_URL;
  const databaseUser = parsed.BROWSER_TEST_DATABASE_USER;
  if (!databaseUrl || !databaseUser || databaseUser.includes(":")) {
    throw new Error(
      ".env.browser-test must define DATABASE_URL and BROWSER_TEST_DATABASE_USER.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("The browser-test database URL is invalid.");
  }

  let urlUser: string;
  let urlPassword: string;
  try {
    urlUser = decodeURIComponent(parsedUrl.username);
    urlPassword = decodeURIComponent(parsedUrl.password);
  } catch {
    throw new Error("The browser-test database URL credentials are invalid.");
  }

  if (
    parsedUrl.protocol !== "postgresql:" ||
    parsedUrl.hostname !== "localhost" ||
    parsedUrl.port !== "5435" ||
    parsedUrl.pathname !== `/${browserTestDatabaseName}` ||
    parsedUrl.search !== "" ||
    parsedUrl.hash !== "" ||
    urlUser !== databaseUser ||
    urlPassword.length === 0 ||
    urlPassword.toUpperCase().includes("URL_ENCODED_LOCAL_SECRET")
  ) {
    throw new Error(
      "The browser-test database URL must target the dedicated local browser-test database and role.",
    );
  }

  const backendPort = Number(parsed.BACKEND_PORT ?? "3001");
  if (backendPort !== 3001) {
    throw new Error("The isolated browser-test backend must use port 3001.");
  }

  const frontendUrl = parsed.FRONTEND_URL ?? "http://localhost:5173";
  if (frontendUrl !== "http://localhost:5173") {
    throw new Error(
      "Browser-test backend FRONTEND_URL must be http://localhost:5173.",
    );
  }

  const sessionCookieName =
    parsed.SESSION_COOKIE_NAME ?? "smartcart_browser_test_session";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(sessionCookieName)) {
    throw new Error("SESSION_COOKIE_NAME is invalid.");
  }

  for (const key of inheritedProjectKeys) {
    delete process.env[key];
  }
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = databaseUrl;
  process.env.BACKEND_PORT = String(backendPort);
  process.env.FRONTEND_URL = frontendUrl;
  process.env.SESSION_COOKIE_NAME = sessionCookieName;
  process.env.SMARTCART_BROWSER_TEST = "1";

  return {
    databaseUrl,
    databaseUser,
    backendPort,
    frontendUrl,
    sessionCookieName,
  };
}

export function assertBrowserTestDatabaseIdentity(
  identity: Array<{
    databaseName: string;
    currentRole: string;
    sessionRole: string;
    databaseOwner: string;
  }>,
  config: BrowserTestConfig,
): void {
  const actual = identity[0];
  if (
    identity.length !== 1 ||
    actual?.databaseName !== browserTestDatabaseName ||
    actual.currentRole !== config.databaseUser ||
    actual.sessionRole !== config.databaseUser ||
    actual.databaseOwner !== config.databaseUser
  ) {
    throw new Error(
      "Browser-test database identity or ownership verification failed.",
    );
  }
}
