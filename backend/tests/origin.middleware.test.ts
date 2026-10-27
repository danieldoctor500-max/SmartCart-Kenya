import express, { type RequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../src/config/env.js";
import { requireTrustedOrigin } from "../src/modules/auth/origin.middleware.js";

const trustedOrigin = new URL(env.FRONTEND_URL).origin;

function createTestApp() {
  const app = express();

  const protectedHandler = vi.fn<RequestHandler>((_req, res) => {
    res.status(200).json({
      success: true,
      message: "Protected handler reached.",
    });
  });

  app.get("/protected", requireTrustedOrigin, protectedHandler);

  return { app, protectedHandler };
}

describe("Trusted origin middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows the configured frontend origin", async () => {
    const { app, protectedHandler } = createTestApp();

    const response = await request(app)
      .get("/protected")
      .set("Origin", trustedOrigin);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(protectedHandler).toHaveBeenCalledOnce();
  });

  it.each([
    ["a missing Origin header", undefined],
    ["an untrusted origin", "https://untrusted.example"],
    ["a lookalike hostname", `${trustedOrigin}.evil.example`],
    [
      "an origin using a different port",
      `${new URL(trustedOrigin).protocol}//${new URL(trustedOrigin).hostname}:9999`,
    ],
  ])("rejects %s", async (_description, origin) => {
    const { app, protectedHandler } = createTestApp();

    let testRequest = request(app).get("/protected");

    if (origin !== undefined) {
      testRequest = testRequest.set("Origin", origin);
    }

    const response = await testRequest;

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      message: "This request origin is not allowed.",
    });
    expect(protectedHandler).not.toHaveBeenCalled();
  });
});
