
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

const adminEmail = `store-admin-${randomUUID()}@example.com`;
const customerEmail = `store-customer-${randomUUID()}@example.com`;

const trustedOrigin = new URL(env.FRONTEND_URL).origin;
const sessionCookieName = env.SESSION_COOKIE_NAME;

const sellerData = {
  businessName: "Store Management Test Supplies",
  phone: "0712345678",
  email: "store-management@example.com",
};

describe("Admin store management API", () => {
  let adminUserId: string;
  let customerUserId: string;

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;

    const admin = await prisma.user.create({
      data: {
        fullName: "Store Management Admin",
        email: adminEmail,
        passwordHash: "not-used-for-login",
        roles: {
          create: { role: "ADMIN" },
        },
      },
      select: { id: true },
    });

    adminUserId = admin.id;

    const customer = await prisma.user.create({
      data: {
        fullName: "Store Management Customer",
        email: customerEmail,
        passwordHash: "not-used-for-login",
        roles: {
          create: { role: "CUSTOMER" },
        },
      },
      select: { id: true },
    });

    customerUserId = customer.id;
  });

  async function cleanTestRecords() {
    const profiles = await prisma.sellerProfile.findMany({
      where: { userId: customerUserId },
      select: { id: true },
    });

    const profileIds = profiles.map((profile) => profile.id);

    if (profileIds.length > 0) {
      await prisma.store.deleteMany({
        where: {
          sellerProfileId: { in: profileIds },
        },
      });

      await prisma.sellerProfile.deleteMany({
        where: { id: { in: profileIds } },
      });
    }
  }

  beforeEach(async () => {
    await cleanTestRecords();

    await prisma.session.deleteMany({
      where: {
        userId: { in: [adminUserId, customerUserId] },
      },
    });

    await prisma.auditLog.deleteMany({
      where: { actorUserId: adminUserId },
    });

    await prisma.roleAssignment.deleteMany({
      where: {
        userId: { in: [adminUserId, customerUserId] },
      },
    });

    await prisma.roleAssignment.createMany({
      data: [
        { userId: adminUserId, role: "ADMIN" },
        { userId: customerUserId, role: "CUSTOMER" },
      ],
    });

    await prisma.user.updateMany({
      where: {
        id: { in: [adminUserId, customerUserId] },
      },
      data: { status: "ACTIVE" },
    });
  });

  afterAll(async () => {
    await cleanTestRecords();

    await prisma.session.deleteMany({
      where: {
        userId: { in: [adminUserId, customerUserId] },
      },
    });

    await prisma.auditLog.deleteMany({
      where: { actorUserId: adminUserId },
    });

    await prisma.roleAssignment.deleteMany({
      where: {
        userId: { in: [adminUserId, customerUserId] },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: { in: [adminUserId, customerUserId] },
      },
    });

    await prisma.$disconnect();
  });

  async function createSessionCookie(userId: string): Promise<string> {
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

  async function createStore(options?: {
    applicationStatus?: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
    storeStatus?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  }) {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const applicationStatus = options?.applicationStatus ?? "APPROVED";
    const storeStatus = options?.storeStatus ?? "INACTIVE";

    const profile = await prisma.sellerProfile.create({
      data: {
        userId: customerUserId,
        ...sellerData,
        applicationStatus,
      },
      select: { id: true },
    });

    return prisma.store.create({
      data: {
        sellerProfileId: profile.id,
        name: `Test Store ${suffix}`,
        slug: `test-store-${suffix}`,
        status: storeStatus,
      },
    });
  }

  async function updateStore(
    storeId: string,
    action: "activate" | "suspend",
    cookie?: string,
    origin = trustedOrigin,
  ) {
    const call = request(app)
      .patch(`/api/v1/admin/stores/${storeId}/${action}`)
      .set("Origin", origin);

    if (cookie) {
      call.set("Cookie", cookie);
    }

    return call;
  }

  it("requires authentication to activate a store", async () => {
    const store = await createStore();

    const response = await updateStore(store.id, "activate");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("denies customers access to store management", async () => {
    const store = await createStore();
    const cookie = await createSessionCookie(customerUserId);

    const response = await updateStore(
      store.id,
      "activate",
      cookie,
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    const unchanged = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { status: true },
    });

    expect(unchanged.status).toBe("INACTIVE");
  });

  it("activates an inactive store belonging to an approved seller and records an audit log", async () => {
    const store = await createStore({
      applicationStatus: "APPROVED",
      storeStatus: "INACTIVE",
    });

    const cookie = await createSessionCookie(adminUserId);

    const response = await updateStore(
      store.id,
      "activate",
      cookie,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: store.id,
        previousStatus: "INACTIVE",
        status: "ACTIVE",
      },
    });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        actorUserId: adminUserId,
        action: "STORE_ACTIVATED",
        resourceId: store.id,
      },
    });

    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.metadata).toMatchObject({
      previousStatus: "INACTIVE",
      newStatus: "ACTIVE",
    });
  });

  it("rejects activation when the seller application is not approved", async () => {
    const store = await createStore({
      applicationStatus: "PENDING",
      storeStatus: "INACTIVE",
    });

    const cookie = await createSessionCookie(adminUserId);

    const response = await updateStore(
      store.id,
      "activate",
      cookie,
    );

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(
      /application must be approved/i,
    );

    const unchanged = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { status: true },
    });

    expect(unchanged.status).toBe("INACTIVE");

    const auditCount = await prisma.auditLog.count({
      where: {
        actorUserId: adminUserId,
        resourceId: store.id,
      },
    });

    expect(auditCount).toBe(0);
  });

  it("rejects activation when the store is already active", async () => {
    const store = await createStore({
      storeStatus: "ACTIVE",
    });

    const cookie = await createSessionCookie(adminUserId);

    const response = await updateStore(
      store.id,
      "activate",
      cookie,
    );

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/already active/i);
  });

  it("suspends an active store and records an audit log", async () => {
    const store = await createStore({
      storeStatus: "ACTIVE",
    });

    const cookie = await createSessionCookie(adminUserId);

    const response = await updateStore(
      store.id,
      "suspend",
      cookie,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: store.id,
        previousStatus: "ACTIVE",
        status: "SUSPENDED",
      },
    });

    const updatedStore = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { status: true },
    });

    expect(updatedStore.status).toBe("SUSPENDED");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        actorUserId: adminUserId,
        action: "STORE_SUSPENDED",
        resourceId: store.id,
      },
    });

    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.metadata).toMatchObject({
      previousStatus: "ACTIVE",
      newStatus: "SUSPENDED",
    });
  });

  it("rejects suspending a store that is already suspended", async () => {
    const store = await createStore({
      storeStatus: "SUSPENDED",
    });

    const cookie = await createSessionCookie(adminUserId);

    const response = await updateStore(
      store.id,
      "suspend",
      cookie,
    );

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/already suspended/i);
  });

  it("rejects suspending an inactive store without changing its status or creating an audit log", async () => {
    const store = await createStore({
      applicationStatus: "APPROVED",
      storeStatus: "INACTIVE",
    });

    const cookie = await createSessionCookie(adminUserId);

    const response = await updateStore(
      store.id,
      "suspend",
      cookie,
    );

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(
      /only active stores can be suspended/i,
    );

    const unchanged = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { status: true },
    });

    expect(unchanged.status).toBe("INACTIVE");

    const auditCount = await prisma.auditLog.count({
      where: {
        actorUserId: adminUserId,
        action: "STORE_SUSPENDED",
        resourceId: store.id,
        outcome: "SUCCESS",
      },
    });

    expect(auditCount).toBe(0);
  });

  it("returns 404 when the store does not exist", async () => {
    const cookie = await createSessionCookie(adminUserId);

    const response = await updateStore(
      randomUUID(),
      "activate",
      cookie,
    );

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Store not found.");
  });

  it("rejects requests from an untrusted origin without changing the store", async () => {
    const store = await createStore();
    const cookie = await createSessionCookie(adminUserId);

    const response = await updateStore(
      store.id,
      "activate",
      cookie,
      "https://untrusted.example",
    );

    expect(response.status).toBe(403);

    const unchanged = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { status: true },
    });

    expect(unchanged.status).toBe("INACTIVE");

    const auditCount = await prisma.auditLog.count({
      where: {
        actorUserId: adminUserId,
        resourceId: store.id,
      },
    });

    expect(auditCount).toBe(0);
  });

  it("rejects an invalid store ID", async () => {
    const cookie = await createSessionCookie(adminUserId);

    const response = await updateStore(
      " ",
      "activate",
      cookie,
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});
