
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const configDirectory = path.resolve(process.cwd(), "src/config");
const envModuleUrl = pathToFileURL(
  path.resolve(configDirectory, "env.ts"),
).href;

function loadProductionConfig(frontendUrl?: string) {
  const childEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    NODE_ENV: "production",
    DATABASE_URL:
      "postgresql://test:test@localhost:5432/smartcart_test",
  };

  if (frontendUrl !== undefined) {
    childEnv.FRONTEND_URL = frontendUrl;
  }

  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(envModuleUrl)})`,
    ],
    {
      cwd: configDirectory,
      env: childEnv,
      encoding: "utf8",
      timeout: 10_000,
    },
  );
}

describe("Production environment configuration", () => {
  it("rejects a missing FRONTEND_URL", () => {
    const result = loadProductionConfig();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Environment configuration is invalid.");
    expect(result.stderr).toContain("FRONTEND_URL");
  });

  it("rejects an HTTP frontend URL", () => {
    const result = loadProductionConfig("http://shop.example.com");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("FRONTEND_URL");
    expect(result.stderr).toContain("HTTPS");
  });

  it("accepts an HTTPS frontend URL", () => {
    const result = loadProductionConfig("https://shop.example.com");

    expect(result.status).toBe(0);
  });
});
