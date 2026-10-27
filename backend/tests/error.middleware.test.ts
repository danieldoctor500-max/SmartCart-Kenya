
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { errorHandler } from "../src/middleware/error.middleware.js";

function createTestApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.post("/test", (_req, _res) => {
    throw new Error("Sensitive database details");
  });

  app.use(errorHandler);

  return app;
}

describe("Central error handler", () => {
  it("returns a safe 400 response for malformed JSON", async () => {
    const response = await request(createTestApp())
      .post("/test")
      .set("Content-Type", "application/json")
      .send("{");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: "The request body contains invalid JSON.",
    });
  });

  it("returns a generic 500 response without exposing internal errors", async () => {
    const response = await request(createTestApp())
      .post("/test")
      .send({ valid: true });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: "An unexpected error occurred. Please try again later.",
    });
    expect(JSON.stringify(response.body)).not.toContain(
      "Sensitive database details",
    );
  });
});
