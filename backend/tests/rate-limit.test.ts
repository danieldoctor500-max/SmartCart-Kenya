
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createAuthRateLimiter } from "../src/modules/auth/rate-limit.js";

function createTestApp(
  type: "login" | "registration",
) {
  const app = express();

  app.post(
    "/",
    createAuthRateLimiter(type, { skipInTests: false }),
    (_req, res) => {
      res.status(200).json({ success: true });
    },
  );

  return app;
}

describe("Authentication rate limiting", () => {
  it.each(["login", "registration"] as const)(
    "rejects the sixth %s request",
    async (type) => {
      const app = createTestApp(type);

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await request(app).post("/");

        expect(response.status).toBe(200);
      }

      const response = await request(app).post("/");

      expect(response.status).toBe(429);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        type === "registration"
          ? "Too many registration attempts. Please try again later."
          : "Too many login attempts. Please try again later.",
      );

      expect(response.headers["ratelimit"]).toBeDefined();
      expect(response.headers["ratelimit-policy"]).toBeDefined();
    },
  );
});
