
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

const testId = randomUUID();
const fixtureSearchTag = randomUUID().replaceAll("-", "").slice(0, 12);
const adminEmail = `store-listing-admin-${testId}@example.com`;
const customerEmail = `store-listing-customer-${testId}@example.com`;

const trustedOrigin = new URL(env.FRONTEND_URL).origin;
const sessionCookieName = env.SESSION_COOKIE_NAME;

const sellerUserIds: string[] = [];
const sellerProfileIds: string[] = [];
const storeIds: string[] = [];

describe("Admin store listing API", () => {
  let adminUserId: string;
  let customerUserId: string;

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;

    const admin = await prisma.user.create({
      data: {
        fullName: "Store Listing Admin",
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
        fullName: "Store Listing Customer",
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
    await prisma.store.deleteMany({
      where: {
        id: { in: storeIds },
      },
    });

    await prisma.sellerProfile.deleteMany({
      where: {
        id: { in: sellerProfileIds },
      },
    });

    await prisma.session.deleteMany({
      where: {
        userId: {
          in: [
            ...(adminUserId ? [adminUserId] : []),
            ...(customerUserId ? [customerUserId] : []),
            ...sellerUserIds,
          ],
        },
      },
    });

    await prisma.roleAssignment.deleteMany({
      where: {
        userId: {
          in: [
            ...(adminUserId ? [adminUserId] : []),
            ...(customerUserId ? [customerUserId] : []),
            ...sellerUserIds,
          ],
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: { in: sellerUserIds },
      },
    });

    sellerUserIds.length = 0;
    sellerProfileIds.length = 0;
    storeIds.length = 0;
  }

  beforeEach(async () => {
    await cleanTestRecords();

    await prisma.session.deleteMany({
      where: {
        userId: { in: [adminUserId, customerUserId] },
      },
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
    name?: string;
    slug?: string;
    sellerFullName?: string;
    sellerBusinessName?: string;
    sellerEmail?: string;
    sellerPhone?: string;
    applicationStatus?: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
    storeStatus?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  }) {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);

    const seller = await prisma.user.create({
      data: {
        fullName: options?.sellerFullName ?? `Listing Seller ${suffix}`,
        email: options?.sellerEmail ?? `listing-seller-${suffix}@example.com`,
        passwordHash: "not-used-for-login",
        phone: options?.sellerPhone ?? "0712345678",
        roles: {
          create: { role: "CUSTOMER" },
        },
      },
      select: { id: true },
    });

    sellerUserIds.push(seller.id);

    const profile = await prisma.sellerProfile.create({
      data: {
        userId: seller.id,
        businessName: options?.sellerBusinessName ?? `Listing Business ${suffix}`,
        phone: options?.sellerPhone ?? "0712345678",
        email: options?.sellerEmail ?? `business-${suffix}@example.com`,
        applicationStatus: options?.applicationStatus ?? "APPROVED",
      },
      select: { id: true },
    });

    sellerProfileIds.push(profile.id);

    const store = await prisma.store.create({
      data: {
        sellerProfileId: profile.id,
        name: `${options?.name ?? `Listing Store ${suffix}`} ${fixtureSearchTag}`,
        slug: `${options?.slug ?? `listing-store-${suffix}`}-${fixtureSearchTag}`,
        status: options?.storeStatus ?? "INACTIVE",
        description: "Store listing integration test",
      },
    });

    storeIds.push(store.id);

    return store;
  }

  async function listStores(
    query: Record<string, string> = {},
    cookie?: string,
  ) {
    const call = request(app)
      .get("/api/v1/admin/stores")
      .set("Origin", trustedOrigin)
      .query(query);

    if (cookie) {
      call.set("Cookie", cookie);
    }

    return call;
  }

  it("requires authentication", async () => {
    const response = await listStores();

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("denies customers access to store listings", async () => {
    const cookie = await createSessionCookie(customerUserId);

    const response = await listStores({}, cookie);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("returns stores and pagination metadata to an admin", async () => {
    const fixtures = [
      await createStore({ name: "Listing Alpha", slug: "listing-alpha" }),
      await createStore({ name: "Listing Beta", slug: "listing-beta" }),
    ];

    const cookie = await createSessionCookie(adminUserId);
    const response = await listStores({ search: fixtureSearchTag }, cookie);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(2);
    expect(
      response.body.data.map((store: { id: string }) => store.id).sort(),
    ).toEqual(fixtures.map((store) => store.id).sort());
    expect(response.body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it("paginates store results", async () => {
    const fixtures = [
      await createStore({ name: "Page Store A", slug: "page-store-a" }),
      await createStore({ name: "Page Store B", slug: "page-store-b" }),
      await createStore({ name: "Page Store C", slug: "page-store-c" }),
    ];

    const cookie = await createSessionCookie(adminUserId);

    const firstPage = await listStores(
      { search: fixtureSearchTag, page: "1", limit: "2" },
      cookie,
    );
    const secondPage = await listStores(
      { search: fixtureSearchTag, page: "2", limit: "2" },
      cookie,
    );

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data).toHaveLength(1);
    expect(secondPage.body.pagination).toMatchObject({
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    expect(
      [
        ...firstPage.body.data,
        ...secondPage.body.data,
      ].map((store: { id: string }) => store.id).sort(),
    ).toEqual(fixtures.map((store) => store.id).sort());
  });

  it("filters stores by status", async () => {
    await createStore({
      name: "Filter Inactive",
      slug: "filter-inactive",
      storeStatus: "INACTIVE",
    });
    const activeStore = await createStore({
      name: "Filter Active",
      slug: "filter-active",
      storeStatus: "ACTIVE",
    });
    await createStore({
      name: "Filter Suspended",
      slug: "filter-suspended",
      storeStatus: "SUSPENDED",
    });

    const cookie = await createSessionCookie(adminUserId);

    const response = await listStores(
      { status: "ACTIVE", search: fixtureSearchTag },
      cookie,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(activeStore.id);
    expect(response.body.data[0].name).toBe(
      `Filter Active ${fixtureSearchTag}`,
    );
    expect(response.body.data[0].status).toBe("ACTIVE");
    expect(response.body.pagination.total).toBe(1);
  });

  it("searches store names without case sensitivity", async () => {
    const matchingStore = await createStore({
      name: "Kenya Fresh Market",
      slug: "kenya-fresh-market",
    });
    await createStore({
      name: "Another Shop",
      slug: "another-shop",
    });

    const cookie = await createSessionCookie(adminUserId);

    const response = await listStores(
      { search: `KENYA FRESH MARKET ${fixtureSearchTag.toUpperCase()}` },
      cookie,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(matchingStore.id);
    expect(response.body.data[0].name).toBe(
      `Kenya Fresh Market ${fixtureSearchTag}`,
    );
  });

  it("searches store slugs without case sensitivity", async () => {
    const matchingStore = await createStore({
      name: "Market One",
      slug: "kenya-market-one",
    });
    await createStore({
      name: "Market Two",
      slug: "market-two",
    });

    const cookie = await createSessionCookie(adminUserId);

    const response = await listStores(
      { search: `KENYA-MARKET-ONE-${fixtureSearchTag.toUpperCase()}` },
      cookie,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(matchingStore.id);
    expect(response.body.data[0].slug).toBe(
      `kenya-market-one-${fixtureSearchTag}`,
    );
  });

  it("searches seller business names case-insensitively and trims whitespace", async () => {
    const token = randomUUID().replaceAll("-", "");
    const matchingStore = await createStore({
      name: "Unrelated Store Name",
      slug: "unrelated-store",
      sellerBusinessName: `Fresh Business ${token}`,
    });
    await createStore({
      name: "Another Unrelated Store",
      slug: "another-unrelated-store",
      sellerBusinessName: `Different Business ${fixtureSearchTag}`,
    });

    const cookie = await createSessionCookie(adminUserId);
    const response = await listStores(
      { search: `  fresh business ${token.toUpperCase()}  ` },
      cookie,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.map((store: { id: string }) => store.id))
      .toEqual([matchingStore.id]);
  });

  it("searches seller full names without case sensitivity", async () => {
    const token = randomUUID().replaceAll("-", "");
    const matchingStore = await createStore({
      name: "Unrelated Name Search Store",
      slug: "unrelated-name-search",
      sellerFullName: `Applicant ${token}`,
    });
    await createStore({
      name: "Another Unrelated Name Store",
      slug: "another-unrelated-name",
      sellerFullName: `Different Seller ${fixtureSearchTag}`,
    });

    const cookie = await createSessionCookie(adminUserId);
    const response = await listStores(
      { search: `APPLICANT ${token.toUpperCase()}` },
      cookie,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.map((store: { id: string }) => store.id))
      .toEqual([matchingStore.id]);
  });

  it("combines seller search and status before pagination and counts filtered rows", async () => {
    const token = randomUUID().replaceAll("-", "");
    const firstActive = await createStore({
      sellerBusinessName: `Shared Business ${token} first`,
      storeStatus: "ACTIVE",
    });
    const secondActive = await createStore({
      sellerBusinessName: `Shared Business ${token} second`,
      storeStatus: "ACTIVE",
    });
    await createStore({
      sellerBusinessName: `Shared Business ${token} inactive`,
      storeStatus: "INACTIVE",
    });

    const cookie = await createSessionCookie(adminUserId);
    const firstPage = await listStores(
      { search: token, status: "ACTIVE", page: "1", limit: "1" },
      cookie,
    );
    const secondPage = await listStores(
      { search: token, status: "ACTIVE", page: "2", limit: "1" },
      cookie,
    );

    expect(firstPage.status).toBe(200);
    expect(secondPage.status).toBe(200);
    expect(firstPage.body.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(secondPage.body.pagination).toMatchObject({
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect([firstActive.id, secondActive.id]).toContain(firstPage.body.data[0].id);
    expect([firstActive.id, secondActive.id]).toContain(secondPage.body.data[0].id);
    expect(firstPage.body.data[0].id).not.toBe(secondPage.body.data[0].id);
  });

  it("does not match seller contact email or phone values", async () => {
    const contactToken = randomUUID().replaceAll("-", "");
    await createStore({
      name: "Contact Privacy Store",
      slug: "contact-privacy-store",
      sellerEmail: `private-${contactToken}@example.com`,
      sellerPhone: `07${contactToken.slice(0, 8)}`,
    });

    const cookie = await createSessionCookie(adminUserId);
    const emailResponse = await listStores(
      { search: contactToken },
      cookie,
    );
    const phoneResponse = await listStores(
      { search: `07${contactToken.slice(0, 8)}` },
      cookie,
    );

    expect(emailResponse.status).toBe(200);
    expect(emailResponse.body.data).toEqual([]);
    expect(phoneResponse.status).toBe(200);
    expect(phoneResponse.body.data).toEqual([]);
  });

  it("treats omitted and whitespace-only search as no search filter", async () => {
    await createStore({ name: "Blank Search One" });
    await createStore({ name: "Blank Search Two" });
    const cookie = await createSessionCookie(adminUserId);

    const omittedResponse = await listStores({}, cookie);
    const blankResponse = await listStores({ search: "   " }, cookie);

    expect(omittedResponse.status).toBe(200);
    expect(blankResponse.status).toBe(200);
    expect(blankResponse.body.pagination).toEqual(omittedResponse.body.pagination);
    expect(blankResponse.body.data.map((store: { id: string }) => store.id))
      .toEqual(omittedResponse.body.data.map((store: { id: string }) => store.id));
  });

  it("returns seller details without exposing password hashes", async () => {
    const fixture = await createStore({
      name: "Privacy Check Store",
      slug: "privacy-check-store",
    });

    const cookie = await createSessionCookie(adminUserId);
    const response = await listStores({ search: fixtureSearchTag }, cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);

    const store = response.body.data[0];
    expect(store.id).toBe(fixture.id);

    expect(store.sellerProfile).toMatchObject({
      businessName: expect.stringContaining("Listing Business"),
      applicationStatus: "APPROVED",
      user: {
        fullName: expect.stringContaining("Listing Seller"),
      },
    });

    expect(store.sellerProfile.user).not.toHaveProperty("passwordHash");
    expect(store.sellerProfile).not.toHaveProperty("user.passwordHash");
  });

  it("rejects invalid pagination and status filters", async () => {
    const cookie = await createSessionCookie(adminUserId);

    const invalidPage = await listStores(
      { page: "0" },
      cookie,
    );

    expect(invalidPage.status).toBe(400);
    expect(invalidPage.body.success).toBe(false);

    const invalidStatus = await listStores(
      { status: "UNKNOWN" },
      cookie,
    );

    expect(invalidStatus.status).toBe(400);
    expect(invalidStatus.body.success).toBe(false);
  });

  it("rejects unknown query parameters", async () => {
    const cookie = await createSessionCookie(adminUserId);

    const response = await listStores(
      { unexpected: "value" },
      cookie,
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("returns an empty list when no stores match", async () => {
    const cookie = await createSessionCookie(adminUserId);

    const response = await listStores(
      { search: "no-matching-store-should-exist" },
      cookie,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination).toMatchObject({
      total: 0,
      totalPages: 0,
    });
  });
});
