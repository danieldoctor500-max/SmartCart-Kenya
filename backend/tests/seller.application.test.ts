
import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/database.js";

const email = `seller-test-${randomUUID()}@example.com`;
const trustedOrigin = new URL(env.FRONTEND_URL).origin;
const sessionCookieName = env.SESSION_COOKIE_NAME;

const validApplication = {
  businessName: "Nairobi Test Supplies",
  phone: "0712345678",
  email: "business@example.com",
};

describe("Seller application API integration tests", () => {
  let userId: string;

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;

    const user = await prisma.user.create({
      data: {
        fullName: "Seller Application Test User",
        email,
        passwordHash: "not-used-for-login",
        roles: {
          create: {
            role: "CUSTOMER",
          },
        },
      },
      select: {
        id: true,
      },
    });

    userId = user.id;
  });

  beforeEach(async () => {
    await prisma.sellerProfile.deleteMany({
      where: { userId },
    });

    await prisma.session.deleteMany({
      where: { userId },
    });

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
    await prisma.sellerProfile.deleteMany({
      where: { userId },
    });

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

  async function submitApplication(
    cookie: string,
    body: Record<string, unknown> = validApplication,
  ) {
    return request(app)
      .post("/api/v1/seller/applications")
      .set("Origin", trustedOrigin)
      .set("Cookie", cookie)
      .send(body);
  }

  it("requires authentication to submit an application", async () => {
    const response = await request(app)
      .post("/api/v1/seller/applications")
      .set("Origin", trustedOrigin)
      .send(validApplication);

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("rejects submissions from an untrusted origin", async () => {
    const cookie = await createSessionCookie();

    const response = await request(app)
      .post("/api/v1/seller/applications")
      .set("Origin", "https://untrusted.example")
      .set("Cookie", cookie)
      .send(validApplication);

    expect(response.status).toBe(403);
  });

  it("creates a pending application without granting the seller role", async () => {
    const cookie = await createSessionCookie();

    const response = await submitApplication(cookie);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.businessName).toBe(
      validApplication.businessName,
    );
    expect(response.body.data.applicationStatus).toBe("PENDING");
    expect(response.body.data).not.toHaveProperty("userId");

    const savedProfile = await prisma.sellerProfile.findUnique({
      where: { userId },
    });

    expect(savedProfile).not.toBeNull();
    expect(savedProfile!.applicationStatus).toBe("PENDING");

    const roles = await prisma.roleAssignment.findMany({
      where: { userId },
      select: { role: true },
    });

    expect(roles).toEqual([{ role: "CUSTOMER" }]);
  });

  it("rejects invalid input and unexpected fields", async () => {
    const cookie = await createSessionCookie();

    const invalidNameResponse = await submitApplication(cookie, {
      ...validApplication,
      businessName: "X",
    });

    expect(invalidNameResponse.status).toBe(400);

    const unexpectedFieldResponse = await submitApplication(cookie, {
      ...validApplication,
      userId: "another-user",
    });

    expect(unexpectedFieldResponse.status).toBe(400);

    const savedProfile = await prisma.sellerProfile.findUnique({
      where: { userId },
    });

    expect(savedProfile).toBeNull();
  });

  it("rejects a second application for the same account", async () => {
    const cookie = await createSessionCookie();

    const firstResponse = await submitApplication(cookie);
    expect(firstResponse.status).toBe(201);

    const secondResponse = await submitApplication(cookie, {
      ...validApplication,
      businessName: "Another Business",
    });

    expect(secondResponse.status).toBe(409);

    const profileCount = await prisma.sellerProfile.count({
      where: { userId },
    });

    expect(profileCount).toBe(1);
  });

  it("returns the authenticated user's application status", async () => {
    const cookie = await createSessionCookie();

    await submitApplication(cookie);

    const response = await request(app)
      .get("/api/v1/seller/applications/me")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.applicationStatus).toBe("PENDING");
    expect(response.body.data.businessName).toBe(
      validApplication.businessName,
    );
  });

  it("returns 404 when the user has no seller application", async () => {
    const cookie = await createSessionCookie();

    const response = await request(app)
      .get("/api/v1/seller/applications/me")
      .set("Cookie", cookie);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it("requires authentication to retrieve application status", async () => {
    const response = await request(app)
      .get("/api/v1/seller/applications/me");

    expect(response.status).toBe(401);
  });

  it("does not allow rejected applicants to reapply", async () => {
    await prisma.sellerProfile.create({
      data: {
        userId,
        businessName: validApplication.businessName,
        applicationStatus: "REJECTED",
        rejectionReason: "The submitted business information could not be verified.",
      },
    });

    const cookie = await createSessionCookie();
    const response = await submitApplication(cookie);

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain(
      "Reapplication is not available in the MVP",
    );

    const profile = await prisma.sellerProfile.findUnique({
      where: { userId },
    });

    expect(profile?.applicationStatus).toBe("REJECTED");
  });
});
