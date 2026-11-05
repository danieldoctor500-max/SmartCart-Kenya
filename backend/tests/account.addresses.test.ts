import { createHash, randomBytes, randomUUID } from "node:crypto";
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

const trustedOrigin = new URL(env.FRONTEND_URL).origin;
const sessionCookieName = env.SESSION_COOKIE_NAME;
const suffix = randomUUID().replaceAll("-", "");
const createdUserIds: string[] = [];
const createdSessionIds: string[] = [];
const createdAddressIds: string[] = [];
const createdOrderIds: string[] = [];

describe("Customer address API", () => {
  let ownerUserId: string;
  let otherUserId: string;
  let ownerCookie = "";
  let otherCookie = "";

  async function createSession(userId: string) {
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

  async function cleanup() {
    if (createdOrderIds.length > 0) {
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
      createdOrderIds.length = 0;
    }

    if (createdAddressIds.length > 0) {
      await prisma.address.deleteMany({
        where: { id: { in: createdAddressIds } },
      });
      createdAddressIds.length = 0;
    }

    if (createdSessionIds.length > 0) {
      await prisma.session.deleteMany({
        where: { id: { in: createdSessionIds } },
      });
      createdSessionIds.length = 0;
    }
  }

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
    const [owner, other] = await Promise.all([
      prisma.user.create({
        data: {
          fullName: "Address API Owner",
          email: `address-owner-${suffix}@example.com`,
          passwordHash: "not-used-for-login",
          roles: { create: { role: "CUSTOMER" } },
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          fullName: "Address API Other",
          email: `address-other-${suffix}@example.com`,
          passwordHash: "not-used-for-login",
          roles: { create: { role: "CUSTOMER" } },
        },
        select: { id: true },
      }),
    ]);
    ownerUserId = owner.id;
    otherUserId = other.id;
    createdUserIds.push(owner.id, other.id);
  });

  beforeEach(async () => {
    await cleanup();
    ownerCookie = await createSession(ownerUserId);
    otherCookie = await createSession(otherUserId);
  });

  afterAll(async () => {
    try {
      await cleanup();
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function createAddress(
    cookie = ownerCookie,
    body: Record<string, unknown> = {
      recipientName: "Address Owner",
      phone: "0712345678",
      county: "Nairobi",
      town: "Westlands",
      addressLine: "10 Example Street",
      deliveryInstructions: "Call on arrival",
    },
  ) {
    const response = await request(app)
      .post("/api/v1/account/addresses")
      .set("Origin", trustedOrigin)
      .set("Cookie", cookie)
      .send(body);

    if (typeof response.body.data?.id === "string") {
      createdAddressIds.push(response.body.data.id);
    }
    return response;
  }

  it("requires authentication on every address endpoint", async () => {
    const unauthenticated = await Promise.all([
      request(app).get("/api/v1/account/addresses"),
      request(app)
        .post("/api/v1/account/addresses")
        .set("Origin", trustedOrigin)
        .send({ recipientName: "No Session" }),
      request(app)
        .patch("/api/v1/account/addresses/address-id")
        .set("Origin", trustedOrigin)
        .send({ town: "Nairobi" }),
      request(app)
        .patch("/api/v1/account/addresses/address-id/default")
        .set("Origin", trustedOrigin),
      request(app)
        .delete("/api/v1/account/addresses/address-id")
        .set("Origin", trustedOrigin),
    ]);

    expect(unauthenticated.map(({ status }) => status)).toEqual([
      401,
      401,
      401,
      401,
      401,
    ]);
  });

  it("lists only the authenticated user's addresses in deterministic order", async () => {
    const first = await createAddress();
    const second = await createAddress(ownerCookie, {
      recipientName: "Second Recipient",
      phone: "0712345679",
      county: "Kiambu",
      town: "Ruiru",
      addressLine: "22 Example Road",
    });
    const foreign = await createAddress(otherCookie, {
      recipientName: "Other Recipient",
      phone: "0712345670",
      county: "Mombasa",
      town: "Nyali",
      addressLine: "5 Ocean Road",
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(foreign.status).toBe(201);

    const response = await request(app)
      .get("/api/v1/account/addresses")
      .set("Cookie", ownerCookie);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.map((address: { id: string }) => address.id))
      .toEqual([second.body.data.id, first.body.data.id]);
    expect(response.body.data[0]).not.toHaveProperty("userId");
    expect(response.body.data[0]).not.toHaveProperty("passwordHash");
  });

  it("creates an address for the session user and never defaults it implicitly", async () => {
    const response = await createAddress(ownerCookie, {
      recipientName: "Created Recipient",
      phone: "0712345678",
      county: "Nairobi",
      town: "Kilimani",
      addressLine: "33 Sample Avenue",
      deliveryInstructions: "Use the side entrance",
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      recipientName: "Created Recipient",
      phone: "0712345678",
      county: "Nairobi",
      town: "Kilimani",
      addressLine: "33 Sample Avenue",
      deliveryInstructions: "Use the side entrance",
      isDefault: false,
    });
    expect(response.body.data).not.toHaveProperty("userId");

    const saved = await prisma.address.findUniqueOrThrow({
      where: { id: response.body.data.id },
      select: { userId: true, isDefault: true },
    });
    expect(saved).toEqual({ userId: ownerUserId, isDefault: false });
  });

  it("updates only the authenticated user's address", async () => {
    const created = await createAddress();
    const response = await request(app)
      .patch(`/api/v1/account/addresses/${created.body.data.id}`)
      .set("Origin", trustedOrigin)
      .set("Cookie", ownerCookie)
      .send({ town: "Kileleshwa", deliveryInstructions: null });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: created.body.data.id,
      town: "Kileleshwa",
      deliveryInstructions: null,
    });
    const saved = await prisma.address.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });
    expect(saved.userId).toBe(ownerUserId);
    expect(saved.county).toBe("Nairobi");
  });

  it("sets one owned address as default and safely allows selecting it again", async () => {
    const first = await createAddress();
    const second = await createAddress(ownerCookie, {
      recipientName: "Second Recipient",
      phone: "0712345679",
      county: "Kiambu",
      town: "Ruiru",
      addressLine: "22 Example Road",
    });

    const setFirst = await request(app)
      .patch(`/api/v1/account/addresses/${first.body.data.id}/default`)
      .set("Origin", trustedOrigin)
      .set("Cookie", ownerCookie);
    expect(setFirst.status).toBe(200);
    expect(setFirst.body.data).toMatchObject({
      id: first.body.data.id,
      isDefault: true,
    });

    const setSecond = await request(app)
      .patch(`/api/v1/account/addresses/${second.body.data.id}/default`)
      .set("Origin", trustedOrigin)
      .set("Cookie", ownerCookie);
    expect(setSecond.status).toBe(200);
    expect(setSecond.body.data).toMatchObject({
      id: second.body.data.id,
      isDefault: true,
    });
    expect(await prisma.address.findMany({
      where: { userId: ownerUserId, isDefault: true },
      select: { id: true },
    })).toEqual([{ id: second.body.data.id }]);

    const repeat = await request(app)
      .patch(`/api/v1/account/addresses/${second.body.data.id}/default`)
      .set("Origin", trustedOrigin)
      .set("Cookie", ownerCookie);
    expect(repeat.status).toBe(200);
    expect(repeat.body.data.isDefault).toBe(true);
  });

  it("keeps the one-default invariant during concurrent selections", async () => {
    const first = await createAddress();
    const second = await createAddress(ownerCookie, {
      recipientName: "Concurrent Recipient",
      phone: "0712345679",
      county: "Kiambu",
      town: "Ruiru",
      addressLine: "22 Example Road",
    });

    const results = await Promise.all([
      request(app)
        .patch(`/api/v1/account/addresses/${first.body.data.id}/default`)
        .set("Origin", trustedOrigin)
        .set("Cookie", ownerCookie),
      request(app)
        .patch(`/api/v1/account/addresses/${second.body.data.id}/default`)
        .set("Origin", trustedOrigin)
        .set("Cookie", ownerCookie),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([200, 200]);
    expect(await prisma.address.count({
      where: { userId: ownerUserId, isDefault: true },
    })).toBe(1);
  });

  it("does not allow setting another customer's address as default or overriding protected fields", async () => {
    const foreign = await createAddress(otherCookie, {
      recipientName: "Other Recipient",
      phone: "0712345670",
      county: "Mombasa",
      town: "Nyali",
      addressLine: "5 Ocean Road",
    });

    const forbidden = await request(app)
      .patch(`/api/v1/account/addresses/${foreign.body.data.id}/default`)
      .set("Origin", trustedOrigin)
      .set("Cookie", ownerCookie);
    expect(forbidden.status).toBe(404);
    expect(forbidden.body.code).toBe("ADDRESS_NOT_FOUND");

    const protectedBody = await request(app)
      .patch(`/api/v1/account/addresses/${foreign.body.data.id}/default`)
      .set("Origin", trustedOrigin)
      .set("Cookie", ownerCookie)
      .send({ userId: ownerUserId, isDefault: true });
    expect(protectedBody.status).toBe(400);

    const missing = await request(app)
      .patch("/api/v1/account/addresses/not-an-address/default")
      .set("Origin", trustedOrigin)
      .set("Cookie", ownerCookie);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("ADDRESS_NOT_FOUND");
    expect(await prisma.address.findUniqueOrThrow({
      where: { id: foreign.body.data.id },
      select: { userId: true, isDefault: true },
    })).toEqual({ userId: otherUserId, isDefault: false });
  });

  it("requires a trusted origin for selecting the default address", async () => {
    const created = await createAddress();
    const response = await request(app)
      .patch(`/api/v1/account/addresses/${created.body.data.id}/default`)
      .set("Origin", "https://untrusted.example")
      .set("Cookie", ownerCookie);
    expect(response.status).toBe(403);
    expect(await prisma.address.findUniqueOrThrow({
      where: { id: created.body.data.id },
      select: { isDefault: true },
    })).toEqual({ isDefault: false });
  });

  it("enforces one default address per customer in PostgreSQL", async () => {
    const ownerDefault = await prisma.address.create({
      data: {
        userId: ownerUserId,
        recipientName: "Owner Default",
        phone: "0712345678",
        county: "Nairobi",
        town: "Westlands",
        addressLine: "10 Example Street",
        isDefault: true,
      },
    });
    createdAddressIds.push(ownerDefault.id);

    await expect(prisma.address.create({
      data: {
        userId: ownerUserId,
        recipientName: "Duplicate Default",
        phone: "0712345678",
        county: "Nairobi",
        town: "Kilimani",
        addressLine: "20 Example Street",
        isDefault: true,
      },
    })).rejects.toMatchObject({ code: "P2002" });

    const otherDefault = await prisma.address.create({
      data: {
        userId: otherUserId,
        recipientName: "Other Default",
        phone: "0712345679",
        county: "Mombasa",
        town: "Nyali",
        addressLine: "5 Ocean Road",
        isDefault: true,
      },
    });
    createdAddressIds.push(otherDefault.id);
    expect(otherDefault.isDefault).toBe(true);
  });

  it("does not allow reading, updating, or deleting another user's address", async () => {
    const foreign = await createAddress(otherCookie, {
      recipientName: "Private Recipient",
      phone: "0712345670",
      county: "Mombasa",
      town: "Nyali",
      addressLine: "5 Ocean Road",
    });
    const addressId = foreign.body.data.id as string;

    const list = await request(app)
      .get("/api/v1/account/addresses")
      .set("Cookie", ownerCookie);
    expect(list.body.data).toEqual([]);

    const update = await request(app)
      .patch(`/api/v1/account/addresses/${addressId}`)
      .set("Origin", trustedOrigin)
      .set("Cookie", ownerCookie)
      .send({ town: "Changed Town" });
    expect(update.status).toBe(404);
    expect(update.body.code).toBe("ADDRESS_NOT_FOUND");

    const remove = await request(app)
      .delete(`/api/v1/account/addresses/${addressId}`)
      .set("Origin", trustedOrigin)
      .set("Cookie", ownerCookie);
    expect(remove.status).toBe(404);
    expect(remove.body.code).toBe("ADDRESS_NOT_FOUND");

    const unchanged = await prisma.address.findUniqueOrThrow({
      where: { id: addressId },
    });
    expect(unchanged).toMatchObject({
      userId: otherUserId,
      town: "Nyali",
    });
  });

  it("rejects invalid create data, unknown fields, and client-supplied ownership/default fields", async () => {
    const invalid = await createAddress(ownerCookie, {
      recipientName: "A",
      phone: "123",
      county: "X",
      town: "",
      addressLine: "abc",
    });
    expect(invalid.status).toBe(400);

    const protectedFields = await createAddress(ownerCookie, {
      recipientName: "Protected Recipient",
      phone: "0712345678",
      county: "Nairobi",
      town: "Parklands",
      addressLine: "44 Secure Way",
      userId: otherUserId,
    });
    expect(protectedFields.status).toBe(400);

    const defaultField = await createAddress(ownerCookie, {
      recipientName: "Default Recipient",
      phone: "0712345678",
      county: "Nairobi",
      town: "Parklands",
      addressLine: "44 Secure Way",
      isDefault: true,
    });
    expect(defaultField.status).toBe(400);
    expect(
      await prisma.address.count({ where: { userId: ownerUserId } }),
    ).toBe(0);
  });

  it("rejects empty, invalid, unknown, and protected address updates", async () => {
    const created = await createAddress();
    const addressId = created.body.data.id as string;
    const requests = [
      {},
      { town: "" },
      { deliveryInstructions: "x".repeat(501) },
      { unknownField: "not allowed" },
      { userId: otherUserId },
      { isDefault: true },
    ];

    for (const body of requests) {
      const response = await request(app)
        .patch(`/api/v1/account/addresses/${addressId}`)
        .set("Origin", trustedOrigin)
        .set("Cookie", ownerCookie)
        .send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }

    const unchanged = await prisma.address.findUniqueOrThrow({
      where: { id: addressId },
    });
    expect(unchanged).toMatchObject({
      userId: ownerUserId,
      town: "Westlands",
      isDefault: false,
    });
  });

  it("requires a trusted origin for address mutations", async () => {
    const untrustedCreate = await request(app)
      .post("/api/v1/account/addresses")
      .set("Origin", "https://untrusted.example")
      .set("Cookie", ownerCookie)
      .send({
        recipientName: "Recipient",
        phone: "0712345678",
        county: "Nairobi",
        town: "Westlands",
        addressLine: "10 Example Street",
      });
    expect(untrustedCreate.status).toBe(403);

    const created = await createAddress();
    const untrustedUpdate = await request(app)
      .patch(`/api/v1/account/addresses/${created.body.data.id}`)
      .set("Origin", "https://untrusted.example")
      .set("Cookie", ownerCookie)
      .send({ town: "Changed" });
    expect(untrustedUpdate.status).toBe(403);

    const untrustedDefault = await request(app)
      .patch(`/api/v1/account/addresses/${created.body.data.id}/default`)
      .set("Origin", "https://untrusted.example")
      .set("Cookie", ownerCookie);
    expect(untrustedDefault.status).toBe(403);

    const untrustedDelete = await request(app)
      .delete(`/api/v1/account/addresses/${created.body.data.id}`)
      .set("Origin", "https://untrusted.example")
      .set("Cookie", ownerCookie);
    expect(untrustedDelete.status).toBe(403);
  });

  it("rejects deletion of an address referenced by an order and preserves both records", async () => {
    const created = await createAddress();
    const addressId = created.body.data.id as string;
    const order = await prisma.order.create({
      data: {
        userId: ownerUserId,
        addressId,
        orderNumber: `SC-ADDRESS-${suffix}`,
        idempotencyKey: randomUUID(),
        subtotal: 100,
        deliveryTotal: 20,
        grandTotal: 120,
        deliveryRecipientName: "Historical Recipient",
        deliveryPhone: "0712345678",
        deliveryCounty: "Nairobi",
        deliveryTown: "Westlands",
        deliveryAddressLine: "10 Example Street",
      },
      select: { id: true },
    });
    createdOrderIds.push(order.id);

    const response = await request(app)
      .delete(`/api/v1/account/addresses/${addressId}`)
      .set("Origin", trustedOrigin)
      .set("Cookie", ownerCookie);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      code: "ADDRESS_IN_USE",
      message: "This address is associated with an order and cannot be deleted.",
    });
    expect(await prisma.address.findUnique({ where: { id: addressId } }))
      .not.toBeNull();
    expect(await prisma.order.findUnique({ where: { id: order.id } }))
      .not.toBeNull();
  });

  it("deletes an unreferenced address without affecting other addresses", async () => {
    const created = await createAddress();
    const second = await createAddress(ownerCookie, {
      recipientName: "Keep Recipient",
      phone: "0712345679",
      county: "Nairobi",
      town: "Lavington",
      addressLine: "20 Example Lane",
    });

    const response = await request(app)
      .delete(`/api/v1/account/addresses/${created.body.data.id}`)
      .set("Origin", trustedOrigin)
      .set("Cookie", ownerCookie);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(await prisma.address.findUnique({
      where: { id: created.body.data.id },
    })).toBeNull();
    expect(await prisma.address.findUnique({
      where: { id: second.body.data.id },
    })).not.toBeNull();
  });
});
