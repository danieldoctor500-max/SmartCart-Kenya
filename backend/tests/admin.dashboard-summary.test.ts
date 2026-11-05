import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/database.js";

const sessionCookieName = env.SESSION_COOKIE_NAME;
const createdUserIds: string[] = [];
const createdSessionIds: string[] = [];
const createdSellerProfileIds: string[] = [];
const createdStoreIds: string[] = [];
const createdDeliveryRateIds: string[] = [];
let adminUserId = "";
let customerUserId = "";
let databaseVerified = false;

describe("Admin dashboard summary API", () => {
  beforeAll(async () => {
    const [identity] = await prisma.$queryRaw<
      Array<{ database_name: string }>
    >`SELECT current_database() AS database_name`;
    if (identity?.database_name !== "smartcart_kenya_test") {
      throw new Error("Refusing to run dashboard summary tests outside smartcart_kenya_test.");
    }
    databaseVerified = true;

    const suffix = randomUUID();
    const admin = await prisma.user.create({
      data: {
        fullName: "Dashboard Summary Admin",
        email: `dashboard-summary-admin-${suffix}@example.com`,
        passwordHash: "not-used-for-login",
        roles: { create: { role: "ADMIN" } },
      },
      select: { id: true },
    });
    adminUserId = admin.id;
    createdUserIds.push(admin.id);

    const customer = await prisma.user.create({
      data: {
        fullName: "Dashboard Summary Customer",
        email: `dashboard-summary-customer-${suffix}@example.com`,
        passwordHash: "not-used-for-login",
        roles: { create: { role: "CUSTOMER" } },
      },
      select: { id: true },
    });
    customerUserId = customer.id;
    createdUserIds.push(customer.id);
  });

  afterAll(async () => {
    try {
      if (databaseVerified) {
        if (createdDeliveryRateIds.length > 0) {
          await prisma.deliveryRate.deleteMany({
            where: { id: { in: createdDeliveryRateIds } },
          });
        }
        if (createdStoreIds.length > 0) {
          await prisma.store.deleteMany({
            where: { id: { in: createdStoreIds } },
          });
        }
        if (createdSellerProfileIds.length > 0) {
          await prisma.sellerProfile.deleteMany({
            where: { id: { in: createdSellerProfileIds } },
          });
        }
        if (createdSessionIds.length > 0) {
          await prisma.session.deleteMany({
            where: { id: { in: createdSessionIds } },
          });
        }
        if (createdUserIds.length > 0) {
          await prisma.user.deleteMany({
            where: { id: { in: createdUserIds } },
          });
        }
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  async function createSessionCookie(userId: string) {
    const token = randomBytes(32).toString("base64url");
    const session = await prisma.session.create({
      data: {
        userId,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
      },
      select: { id: true },
    });
    createdSessionIds.push(session.id);
    return `${sessionCookieName}=${token}`;
  }

  it("requires authentication and denies non-admin users", async () => {
    const unauthenticated = await request(app)
      .get("/api/v1/admin/dashboard/summary");
    expect(unauthenticated.status).toBe(401);

    const customerCookie = await createSessionCookie(customerUserId);
    const nonAdmin = await request(app)
      .get("/api/v1/admin/dashboard/summary")
      .set("Cookie", customerCookie);
    expect(nonAdmin.status).toBe(403);
  });

  it("returns all status counts, accurate totals and zero categories for an admin", async () => {
    const [baselineApplications, baselineStores, baselineRates] =
      await Promise.all([
        prisma.sellerProfile.groupBy({
          by: ["applicationStatus"],
          _count: { _all: true },
        }),
        prisma.store.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        prisma.deliveryRate.groupBy({
          by: ["isActive"],
          _count: { _all: true },
        }),
      ]);

    const baselineApplicationCounts = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      SUSPENDED: 0,
    };
    for (const group of baselineApplications) {
      baselineApplicationCounts[group.applicationStatus] = group._count._all;
    }
    const baselineStoreCounts = {
      INACTIVE: 0,
      ACTIVE: 0,
      SUSPENDED: 0,
    };
    for (const group of baselineStores) {
      baselineStoreCounts[group.status] = group._count._all;
    }
    const baselineActiveRates =
      baselineRates.find((group) => group.isActive)?._count._all ?? 0;
    const baselineInactiveRates =
      baselineRates.find((group) => !group.isActive)?._count._all ?? 0;

    const applicationStatuses = [
      "PENDING",
      "APPROVED",
      "REJECTED",
      "SUSPENDED",
    ] as const;
    const storeStatuses = ["INACTIVE", "ACTIVE", "SUSPENDED"] as const;
    const suffix = randomUUID();

    for (const [index, applicationStatus] of applicationStatuses.entries()) {
      const user = await prisma.user.create({
        data: {
          fullName: `Summary Fixture ${index}`,
          email: `dashboard-summary-fixture-${suffix}-${index}@example.com`,
          passwordHash: "not-used-for-login",
        },
        select: { id: true },
      });
      createdUserIds.push(user.id);

      const profile = await prisma.sellerProfile.create({
        data: {
          userId: user.id,
          businessName: `Summary Business ${suffix} ${index}`,
          applicationStatus,
          phone: "0712345678",
          email: `summary-business-${suffix}-${index}@example.com`,
        },
        select: { id: true },
      });
      createdSellerProfileIds.push(profile.id);

      if (index < storeStatuses.length) {
        const store = await prisma.store.create({
          data: {
            sellerProfileId: profile.id,
            name: `Summary Store ${suffix} ${index}`,
            slug: `summary-store-${suffix}-${index}`,
            status: storeStatuses[index],
          },
          select: { id: true },
        });
        createdStoreIds.push(store.id);
      }
    }

    for (const isActive of [true, false]) {
      const locationKey = `summary-${suffix}-${isActive ? "active" : "inactive"}`;
      const rate = await prisma.deliveryRate.create({
        data: {
          county: `Summary County ${suffix}`,
          countyKey: `${locationKey}-county`,
          town: `Summary Town ${isActive ? "Active" : "Inactive"}`,
          townKey: `${locationKey}-town`,
          fee: 100,
          isActive,
        },
        select: { id: true },
      });
      createdDeliveryRateIds.push(rate.id);
    }

    const adminCookie = await createSessionCookie(adminUserId);
    const response = await request(app)
      .get("/api/v1/admin/dashboard/summary")
      .query({ status: "PENDING", page: 1, limit: 1 })
      .set("Cookie", adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({
      sellerApplications: {
        byStatus: {
          PENDING: baselineApplicationCounts.PENDING + 1,
          APPROVED: baselineApplicationCounts.APPROVED + 1,
          REJECTED: baselineApplicationCounts.REJECTED + 1,
          SUSPENDED: baselineApplicationCounts.SUSPENDED + 1,
        },
        total: Object.values(baselineApplicationCounts).reduce(
          (total, count) => total + count,
          0,
        ) + applicationStatuses.length,
      },
      stores: {
        byStatus: {
          INACTIVE: baselineStoreCounts.INACTIVE + 1,
          ACTIVE: baselineStoreCounts.ACTIVE + 1,
          SUSPENDED: baselineStoreCounts.SUSPENDED + 1,
        },
        total: Object.values(baselineStoreCounts).reduce(
          (total, count) => total + count,
          0,
        ) + storeStatuses.length,
      },
      deliveryRates: {
        active: baselineActiveRates + 1,
        inactive: baselineInactiveRates + 1,
        total: baselineActiveRates + baselineInactiveRates + 2,
      },
    });
    expect(response.body.data.sellerApplications).not.toHaveProperty("items");
    expect(response.body.data.stores).not.toHaveProperty("items");
  });
});
