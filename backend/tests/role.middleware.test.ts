
import { createHash, randomBytes, randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { env } from "../src/config/env.js";
import { prisma } from "../src/config/database.js";
import { requireAuth } from "../src/modules/auth/auth.middleware.js";
import { requireRole } from "../src/modules/auth/role.middleware.js";

const email = `rbac-test-${randomUUID()}@example.com`;
const sessionCookieName = env.SESSION_COOKIE_NAME;

const app = express();

app.use(cookieParser());

app.get(
  "/admin-test",
  requireAuth,
  requireRole("ADMIN"),
  (_req, res) => {
    res.status(200).json({ success: true });
  },
);

app.get(
  "/seller-test",
  requireAuth,
  requireRole("SELLER", "ADMIN"),
  (_req, res) => {
    res.status(200).json({ success: true });
  },
);

describe("Role-based authorization integration tests", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        fullName: "RBAC Integration Test",
        email,
        passwordHash: "not-used-for-login",
        roles: {
          create: { role: "CUSTOMER" },
        },
      },
      select: { id: true },
    });

    userId = user.id;
  });

  beforeEach(async () => {
    // Reset roles so each test starts with a customer account.
    await prisma.roleAssignment.deleteMany({
      where: { userId },
    });

    await prisma.roleAssignment.create({
      data: {
        userId,
        role: "CUSTOMER",
      },
    });
  });

  afterAll(async () => {
    // Deleting the user also removes dependent records when the
    // database schema's foreign keys use cascading deletion.
    await prisma.user.deleteMany({
      where: { email },
    });

    await prisma.$disconnect();
  });

  async function createSessionCookie(): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    await prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    return `${sessionCookieName}=${token}`;
  }

  it("returns 401 when no session cookie is supplied", async () => {
    const response = await request(app).get("/admin-test");

    expect(response.status).toBe(401);
  });

  it("returns 403 when a customer accesses an admin-only route", async () => {
    const cookie = await createSessionCookie();

    const response = await request(app)
      .get("/admin-test")
      .set("Cookie", cookie);

    expect(response.status).toBe(403);
  });

  it("returns 403 when a customer accesses a seller route", async () => {
    const cookie = await createSessionCookie();

    const response = await request(app)
      .get("/seller-test")
      .set("Cookie", cookie);

    expect(response.status).toBe(403);
  });

  it("allows an admin to access an admin-only route", async () => {
    await prisma.roleAssignment.create({
      data: {
        userId,
        role: "ADMIN",
      },
    });

    const cookie = await createSessionCookie();

    const response = await request(app)
      .get("/admin-test")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("allows an admin to access a seller route", async () => {
    await prisma.roleAssignment.create({
      data: {
        userId,
        role: "ADMIN",
      },
    });

    const cookie = await createSessionCookie();

    const response = await request(app)
      .get("/seller-test")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
  });

  it("allows a seller to access a seller route", async () => {
    await prisma.roleAssignment.deleteMany({
      where: { userId, role: "CUSTOMER" },
    });

    await prisma.roleAssignment.create({
      data: {
        userId,
        role: "SELLER",
      },
    });

    const cookie = await createSessionCookie();

    const response = await request(app)
      .get("/seller-test")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
  });

  it("denies access after the admin role is revoked", async () => {
    await prisma.roleAssignment.create({
      data: {
        userId,
        role: "ADMIN",
      },
    });

    const cookie = await createSessionCookie();

    await prisma.roleAssignment.deleteMany({
      where: { userId, role: "ADMIN" },
    });

    const response = await request(app)
      .get("/admin-test")
      .set("Cookie", cookie);

    expect(response.status).toBe(403);
  });
});
