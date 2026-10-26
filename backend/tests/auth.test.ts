
import { createHash, randomUUID } from "node:crypto";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import app from "../src/app.js";
import { prisma } from "../src/config/database.js";

const password = "SmartCart-Test-Password-2026!";
const email = `auth-test-${randomUUID()}@example.com`;
const trustedOrigin = "http://localhost:5173";
const sessionCookieName = "smartcart_session";

function getSessionToken(setCookieHeaders: string[] | undefined): string {
  if (!setCookieHeaders) {
    throw new Error("Login response did not contain a session cookie.");
  }

  const cookiePrefix = `${sessionCookieName}=`;
  const cookieHeader = setCookieHeaders.find((header) =>
    header.startsWith(cookiePrefix),
  );

  if (!cookieHeader) {
    throw new Error("Expected session cookie was not found.");
  }

  const rawValue = cookieHeader
    .slice(cookiePrefix.length)
    .split(";")[0];

  if (!rawValue) {
    throw new Error("Session cookie was empty.");
  }

  return decodeURIComponent(rawValue);
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

describe("Authentication API integration tests", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email },
    });

    await prisma.$disconnect();
  });

  it("registers a customer without exposing the password hash", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", trustedOrigin)
      .send({
        fullName: "SmartCart Test Customer",
        email,
        password,
        phone: "0712345678",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(email);
    expect(response.body.data.user.roles).toContainEqual({
      role: "CUSTOMER",
    });
    expect(response.body.data.user).not.toHaveProperty("passwordHash");

    const savedUser = await prisma.user.findUnique({
      where: { email },
      select: { passwordHash: true },
    });

    expect(savedUser).not.toBeNull();
    expect(savedUser!.passwordHash).not.toBe(password);
    expect(savedUser!.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("rejects registration with invalid input", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", trustedOrigin)
      .send({
        fullName: "A",
        email: "not-an-email",
        password: "short",
      });

    expect(response.status).toBe(400);
  });

  it("rejects duplicate email registration", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", trustedOrigin)
      .send({
        fullName: "Duplicate Test Customer",
        email,
        password,
      });

    expect(response.status).toBe(409);
  });

  it("rejects access to the current-user endpoint without a session", async () => {
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
  });

  it("logs in, validates the session, and logs out", async () => {
    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/api/v1/auth/login")
      .set("Origin", trustedOrigin)
      .send({ email, password });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.success).toBe(true);
    expect(loginResponse.body.data.user.email).toBe(email);

    const setCookie = loginResponse.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(setCookie!.join(";")).toContain("HttpOnly");

    const currentUserResponse = await agent.get("/api/v1/auth/me");

    expect(currentUserResponse.status).toBe(200);
    expect(currentUserResponse.body.data.user.email).toBe(email);

    const logoutResponse = await agent
      .post("/api/v1/auth/logout")
      .set("Origin", trustedOrigin);

    expect(logoutResponse.status).toBe(200);

    const afterLogoutResponse = await agent.get("/api/v1/auth/me");

    expect(afterLogoutResponse.status).toBe(401);
  });

  it("rejects an incorrect password", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", trustedOrigin)
      .send({
        email,
        password: "Incorrect-Test-Password-2026!",
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("rejects login requests without an Origin header", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("rejects login requests from an untrusted origin", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "https://untrusted.example")
      .send({ email, password });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("rejects registration requests from an untrusted origin", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", "https://untrusted.example")
      .send({
        fullName: "Untrusted Test Customer",
        email: `untrusted-${randomUUID()}@example.com`,
        password,
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("rejects logout requests without an Origin header", async () => {
    const response = await request(app)
      .post("/api/v1/auth/logout");

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("rejects an expired session and deletes it", async () => {
    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", trustedOrigin)
      .send({ email, password });

    expect(loginResponse.status).toBe(200);

    const token = getSessionToken(loginResponse.headers["set-cookie"]);
    const tokenHash = hashSessionToken(token);

    const session = await prisma.session.findUnique({
      where: { tokenHash },
    });

    expect(session).not.toBeNull();

    await prisma.session.update({
      where: { id: session!.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", `${sessionCookieName}=${token}`);

    expect(response.status).toBe(401);

    const remainingSession = await prisma.session.findUnique({
      where: { id: session!.id },
    });

    expect(remainingSession).toBeNull();
  });

  it.each(["SUSPENDED", "DEACTIVATED"] as const)(
    "rejects an existing session for a %s account and deletes it",
    async (status) => {
      const loginResponse = await request(app)
        .post("/api/v1/auth/login")
        .set("Origin", trustedOrigin)
        .send({ email, password });

      expect(loginResponse.status).toBe(200);

      const token = getSessionToken(loginResponse.headers["set-cookie"]);
      const tokenHash = hashSessionToken(token);

      const session = await prisma.session.findUnique({
        where: { tokenHash },
      });

      expect(session).not.toBeNull();

      try {
        await prisma.user.update({
          where: { email },
          data: { status },
        });

        const response = await request(app)
          .get("/api/v1/auth/me")
          .set("Cookie", `${sessionCookieName}=${token}`);

        expect(response.status).toBe(401);

        const remainingSession = await prisma.session.findUnique({
          where: { id: session!.id },
        });

        expect(remainingSession).toBeNull();
      } finally {
        await prisma.user.update({
          where: { email },
          data: { status: "ACTIVE" },
        });
      }
    },
  );

  it.each(["SUSPENDED", "DEACTIVATED"] as const)(
    "rejects login for a %s account",
    async (status) => {
      try {
        await prisma.user.update({
          where: { email },
          data: { status },
        });

        const response = await request(app)
          .post("/api/v1/auth/login")
          .set("Origin", trustedOrigin)
          .send({ email, password });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      } finally {
        await prisma.user.update({
          where: { email },
          data: { status: "ACTIVE" },
        });
      }
    },
  );
});
