import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/database.js";

const trustedOrigin = new URL(env.FRONTEND_URL).origin;
const sessionCookieName = env.SESSION_COOKIE_NAME;
const createdRateIds: string[] = [];
const createdSessionIds: string[] = [];
let adminUserId = "";
let customerUserId = "";
let databaseVerified = false;

describe("Admin delivery-rate API", () => {
  beforeAll(async () => {
    const [identity] = await prisma.$queryRaw<
      Array<{ database_name: string }>
    >`SELECT current_database() AS database_name`;
    if (identity?.database_name !== "smartcart_kenya_test") {
      throw new Error("Refusing to run delivery-rate tests outside smartcart_kenya_test.");
    }
    databaseVerified = true;

    const suffix = randomUUID();
    const admin = await prisma.user.create({
      data: {
        fullName: "Delivery Rate Test Admin",
        email: `delivery-rate-admin-${suffix}@example.com`,
        passwordHash: "not-used-for-login",
        roles: { create: { role: "ADMIN" } },
      },
      select: { id: true },
    });
    adminUserId = admin.id;

    const customer = await prisma.user.create({
      data: {
        fullName: "Delivery Rate Test Customer",
        email: `delivery-rate-customer-${suffix}@example.com`,
        passwordHash: "not-used-for-login",
        roles: { create: { role: "CUSTOMER" } },
      },
      select: { id: true },
    });
    customerUserId = customer.id;
  });

  async function cleanupRecords() {
    if (createdRateIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          resourceType: "DELIVERY_RATE",
          resourceId: { in: createdRateIds },
        },
      });
      await prisma.deliveryRate.deleteMany({
        where: { id: { in: createdRateIds } },
      });
      createdRateIds.length = 0;
    }
    if (createdSessionIds.length > 0) {
      await prisma.session.deleteMany({
        where: { id: { in: createdSessionIds } },
      });
      createdSessionIds.length = 0;
    }
  }

  afterEach(async () => {
    await cleanupRecords();
  });

  afterAll(async () => {
    try {
      if (databaseVerified) {
        await cleanupRecords();
        await prisma.roleAssignment.deleteMany({
          where: { userId: { in: [adminUserId, customerUserId] } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: [adminUserId, customerUserId] } },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  async function sessionCookie(userId: string) {
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

  async function createRate(
    cookie: string,
    input: { county: string; town: string; fee: number; isActive?: boolean },
  ) {
    const response = await request(app)
      .put("/api/v1/admin/delivery-rates")
      .set("Cookie", cookie)
      .set("Origin", trustedOrigin)
      .send(input);
    if (response.body.data?.id) createdRateIds.push(response.body.data.id);
    return response;
  }

  async function listRates(
    query: Record<string, string> = {},
    cookie?: string,
  ) {
    const call = request(app)
      .get("/api/v1/admin/delivery-rates")
      .query(query);
    if (cookie) call.set("Cookie", cookie);
    return call;
  }

  async function listRateAudit(
    rateId: string,
    query: Record<string, string> = {},
    cookie?: string,
  ) {
    const call = request(app)
      .get(`/api/v1/admin/delivery-rates/${encodeURIComponent(rateId)}/audit`)
      .query(query);
    if (cookie) call.set("Cookie", cookie);
    return call;
  }

  it("requires an administrator to list delivery rates", async () => {
    const unauthenticated = await listRates();
    expect(unauthenticated.status).toBe(401);

    const customerCookie = await sessionCookie(customerUserId);
    const nonAdmin = await listRates({}, customerCookie);
    expect(nonAdmin.status).toBe(403);

    const rateId = randomUUID();
    expect((await listRateAudit(rateId)).status).toBe(401);
    expect((await listRateAudit(rateId, {}, customerCookie)).status).toBe(403);
  });

  it("searches county and town case-insensitively and trims whitespace", async () => {
    const cookie = await sessionCookie(adminUserId);
    const token = randomUUID();
    const countyMatch = await createRate(cookie, {
      county: `Search County ${token}`,
      town: `County Match ${token}`,
      fee: 100,
    });
    const townMatch = await createRate(cookie, {
      county: `Other County ${token}`,
      town: `Search Town ${token}`,
      fee: 125,
    });
    await createRate(cookie, {
      county: `Unmatched ${token}`,
      town: `Other ${token}`,
      fee: 150,
    });

    const byCounty = await listRates(
      { search: `  search county ${token.toUpperCase()}  ` },
      cookie,
    );
    const byTown = await listRates(
      { search: `SEARCH TOWN ${token.toUpperCase()}` },
      cookie,
    );

    expect(byCounty.status).toBe(200);
    expect(byCounty.body.data.map((rate: { id: string }) => rate.id))
      .toEqual([countyMatch.body.data.id]);
    expect(byTown.status).toBe(200);
    expect(byTown.body.data.map((rate: { id: string }) => rate.id))
      .toEqual([townMatch.body.data.id]);
  });

  it("combines status and search before paging with accurate totals and stable order", async () => {
    const cookie = await sessionCookie(adminUserId);
    const county = `Stable County ${randomUUID()}`;
    const token = randomUUID();
    const zTown = await createRate(cookie, {
      county,
      town: `Z Town ${token}`,
      fee: 140,
    });
    const aTown = await createRate(cookie, {
      county,
      town: `A Town ${token}`,
      fee: 120,
    });
    const inactive = await createRate(cookie, {
      county,
      town: `M Town ${token}`,
      fee: 130,
      isActive: false,
    });

    const firstPage = await listRates(
      { search: token, status: "ACTIVE", page: "1", limit: "1" },
      cookie,
    );
    const secondPage = await listRates(
      { search: token, status: "ACTIVE", page: "2", limit: "1" },
      cookie,
    );
    const inactiveOnly = await listRates(
      { search: token, status: "INACTIVE", page: "1", limit: "10" },
      cookie,
    );

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(firstPage.body.data[0].id).toBe(aTown.body.data.id);
    expect(secondPage.body.pagination).toMatchObject({
      page: 2,
      total: 2,
      totalPages: 2,
    });
    expect(secondPage.body.data[0].id).toBe(zTown.body.data.id);
    expect(inactiveOnly.body.data.map((rate: { id: string }) => rate.id))
      .toEqual([inactive.body.data.id]);
    expect(inactiveOnly.body.pagination).toMatchObject({
      total: 1,
      totalPages: 1,
    });
  });

  it("treats omitted and blank search as unfiltered and validates pagination", async () => {
    const cookie = await sessionCookie(adminUserId);
    const omitted = await listRates({ limit: "100" }, cookie);
    const blank = await listRates({ limit: "100", search: "   " }, cookie);

    expect(omitted.status).toBe(200);
    expect(blank.status).toBe(200);
    expect(blank.body.pagination).toEqual(omitted.body.pagination);
    expect(blank.body.data.map((rate: { id: string }) => rate.id))
      .toEqual(omitted.body.data.map((rate: { id: string }) => rate.id));
    expect(await listRates({ page: "0" }, cookie)).toMatchObject({
      status: 400,
      body: { success: false },
    });
    expect(await listRates({ limit: "101" }, cookie)).toMatchObject({
      status: 400,
      body: { success: false },
    });
  });

  it("creates and normalized-location upserts rates with actor-attributed before/after audits", async () => {
    const cookie = await sessionCookie(adminUserId);
    const county = `Delivery Test County ${randomUUID()}`;
    const town = `Delivery Test Town ${randomUUID()}`;
    const created = await createRate(cookie, {
      county,
      town,
      fee: 150,
    });

    expect(created.status).toBe(200);
    expect(created.body.data).toMatchObject({
      county,
      town,
      fee: 150,
      currency: "KES",
      isActive: true,
    });
    const createdAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        actorUserId: adminUserId,
        action: "DELIVERY_RATE_UPSERTED",
        resourceId: created.body.data.id,
      },
      orderBy: { createdAt: "asc" },
    });
    expect(createdAudit).toMatchObject({
      actorUserId: adminUserId,
      resourceType: "DELIVERY_RATE",
      outcome: "SUCCESS",
      metadata: {
        before: null,
        after: {
          county,
          town,
          fee: 150,
          isActive: true,
        },
      },
    });

    const updated = await createRate(cookie, {
      county: `  ${county.toUpperCase()} `,
      town,
      fee: 185,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.id).toBe(created.body.data.id);
    expect(updated.body.data.fee).toBe(185);

    const upsertAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        actorUserId: adminUserId,
        action: "DELIVERY_RATE_UPSERTED",
        resourceId: created.body.data.id,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(upsertAudit.metadata).toMatchObject({
      before: {
        county,
        town,
        fee: 150,
        isActive: true,
      },
      after: {
        county: county.toUpperCase(),
        town,
        fee: 185,
        isActive: true,
      },
    });
  });

  it("updates and deactivates rates through PATCH and audits each change", async () => {
    const cookie = await sessionCookie(adminUserId);
    const created = await createRate(cookie, {
      county: `County ${randomUUID()}`,
      town: "Original Town",
      fee: 80,
    });
    const rateId = created.body.data.id as string;
    const update = await request(app)
      .patch(`/api/v1/admin/delivery-rates/${encodeURIComponent(rateId)}`)
      .set("Cookie", cookie)
      .set("Origin", trustedOrigin)
      .send({ town: "Updated Town", fee: 95 });
    expect(update.status).toBe(200);
    expect(update.body.data).toMatchObject({
      town: "Updated Town",
      fee: 95,
      isActive: true,
    });

    const deactivate = await request(app)
      .patch(`/api/v1/admin/delivery-rates/${encodeURIComponent(rateId)}`)
      .set("Cookie", cookie)
      .set("Origin", trustedOrigin)
      .send({ isActive: false });
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.data.isActive).toBe(false);

    const audits = await prisma.auditLog.findMany({
      where: {
        actorUserId: adminUserId,
        resourceType: "DELIVERY_RATE",
        resourceId: rateId,
      },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map(({ action }) => action)).toEqual([
      "DELIVERY_RATE_UPSERTED",
      "DELIVERY_RATE_UPDATED",
      "DELIVERY_RATE_DEACTIVATED",
    ]);
    expect(audits[1].metadata).toMatchObject({
      before: { town: "Original Town", fee: 80, isActive: true },
      after: { town: "Updated Town", fee: 95, isActive: true },
    });
    expect(audits[2].metadata).toMatchObject({
      before: { isActive: true },
      after: { isActive: false },
    });

    const history = await listRateAudit(rateId, {}, cookie);
    expect(history.status).toBe(200);
    expect(history.body.data.map((entry: { action: string }) => entry.action))
      .toEqual([
        "DELIVERY_RATE_DEACTIVATED",
        "DELIVERY_RATE_UPDATED",
        "DELIVERY_RATE_UPSERTED",
      ]);
    expect(history.body.data[0]).toMatchObject({
      actor: {
        id: adminUserId,
        fullName: "Delivery Rate Test Admin",
      },
      metadata: {
        before: { isActive: true },
        after: { isActive: false },
      },
    });
    expect(history.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
    });

    const invalidPage = await listRateAudit(rateId, { page: "0" }, cookie);
    expect(invalidPage.status).toBe(400);
  });

  it("rejects invalid locations and fees without writing rates or audit records", async () => {
    const cookie = await sessionCookie(adminUserId);
    const invalidFee = await createRate(cookie, {
      county: "Nairobi",
      town: "Invalid Fee",
      fee: -1,
    });
    expect(invalidFee.status).toBe(400);

    const invalidLocation = await createRate(cookie, {
      county: "N",
      town: "",
      fee: 20,
    });
    expect(invalidLocation.status).toBe(400);
    expect(await prisma.auditLog.count({
      where: { actorUserId: adminUserId, resourceType: "DELIVERY_RATE" },
    })).toBe(0);
  });

  it("rejects unauthorized and untrusted-origin mutations", async () => {
    const unauthenticated = await request(app)
      .put("/api/v1/admin/delivery-rates")
      .set("Origin", trustedOrigin)
      .send({ county: "Nairobi", town: "Unauthenticated", fee: 20 });
    expect(unauthenticated.status).toBe(401);

    const customerCookie = await sessionCookie(customerUserId);
    const nonAdmin = await createRate(customerCookie, {
      county: "Nairobi",
      town: "Non-admin",
      fee: 20,
    });
    expect(nonAdmin.status).toBe(403);

    const adminCookie = await sessionCookie(adminUserId);
    const untrustedOrigin = await request(app)
      .put("/api/v1/admin/delivery-rates")
      .set("Cookie", adminCookie)
      .set("Origin", "https://untrusted.example")
      .send({ county: "Nairobi", town: "Untrusted", fee: 20 });
    expect(untrustedOrigin.status).toBe(403);
    expect(await prisma.auditLog.count({
      where: { actorUserId: adminUserId, resourceType: "DELIVERY_RATE" },
    })).toBe(0);
  });

  it("rejects PATCH location collisions without changing either rate", async () => {
    const cookie = await sessionCookie(adminUserId);
    const first = await createRate(cookie, {
      county: `County ${randomUUID()}`,
      town: "First Town",
      fee: 30,
    });
    const second = await createRate(cookie, {
      county: `County ${randomUUID()}`,
      town: "Second Town",
      fee: 40,
    });
    const secondId = second.body.data.id as string;

    const collision = await request(app)
      .patch(`/api/v1/admin/delivery-rates/${encodeURIComponent(first.body.data.id)}`)
      .set("Cookie", cookie)
      .set("Origin", trustedOrigin)
      .send({ county: second.body.data.county, town: "  second   town " });
    expect(collision.status).toBe(409);

    const unchanged = await prisma.deliveryRate.findUniqueOrThrow({
      where: { id: secondId },
    });
    expect(unchanged).toMatchObject({ town: "Second Town" });
    expect(Number(unchanged.fee)).toBe(40);
    expect(await prisma.auditLog.count({
      where: {
        actorUserId: adminUserId,
        action: "DELIVERY_RATE_UPDATED",
        resourceId: first.body.data.id,
      },
    })).toBe(0);
  });
});
