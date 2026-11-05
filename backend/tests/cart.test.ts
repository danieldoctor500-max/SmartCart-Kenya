import { randomUUID } from "node:crypto";
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

const trustedOrigin = new URL(env.FRONTEND_URL).origin;
const createdCartIds: string[] = [];
const createdProductIds: string[] = [];
const createdStoreIds: string[] = [];
const createdSellerProfileIds: string[] = [];
const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];

describe("Shopping cart API integration tests", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    try {
      await prisma.cart.deleteMany({
        where: { id: { in: createdCartIds } },
      });
      await prisma.product.deleteMany({
        where: { id: { in: createdProductIds } },
      });
      await prisma.store.deleteMany({
        where: { id: { in: createdStoreIds } },
      });
      await prisma.sellerProfile.deleteMany({
        where: { id: { in: createdSellerProfileIds } },
      });
      await prisma.category.deleteMany({
        where: { id: { in: createdCategoryIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function createProduct(
    stockQuantity = 10,
    reservedQuantity = 2,
  ) {
    const suffix = randomUUID().replaceAll("-", "");

    const category = await prisma.category.create({
      data: {
        name: `Cart Test Category ${suffix}`,
        slug: `cart-test-category-${suffix}`,
        isActive: true,
      },
      select: { id: true },
    });
    createdCategoryIds.push(category.id);

    const seller = await prisma.user.create({
      data: {
        fullName: `Cart Test Seller ${suffix}`,
        email: `cart-test-seller-${suffix}@example.com`,
        passwordHash: "not-used-for-login",
      },
      select: { id: true },
    });
    createdUserIds.push(seller.id);

    const profile = await prisma.sellerProfile.create({
      data: {
        userId: seller.id,
        businessName: `Cart Test Business ${suffix}`,
        applicationStatus: "APPROVED",
        phone: "0712345678",
        email: `cart-test-business-${suffix}@example.com`,
      },
      select: { id: true },
    });
    createdSellerProfileIds.push(profile.id);

    const store = await prisma.store.create({
      data: {
        sellerProfileId: profile.id,
        name: `Cart Test Store ${suffix}`,
        slug: `cart-test-store-${suffix}`,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    createdStoreIds.push(store.id);

    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: category.id,
        name: `Cart Test Product ${suffix}`,
        slug: `cart-test-product-${suffix}`,
        description: "A product used by cart integration tests.",
        price: 250,
        stockQuantity,
        reservedQuantity,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    createdProductIds.push(product.id);

    return product;
  }

  it("keeps guest cart operations on the guest cookie and protects mutations", async () => {
    const product = await createProduct();
    const agent = request.agent(app);

    const initialResponse = await agent.get("/api/v1/cart");

    expect(initialResponse.status).toBe(200);
    expect(initialResponse.body.data.items).toEqual([]);
    expect(initialResponse.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^smartcart_guest=.*HttpOnly/),
      ]),
    );
    createdCartIds.push(initialResponse.body.data.id);

    const rejectedMutation = await agent
      .post("/api/v1/cart/items")
      .send({ productId: product.id, quantity: 1 });

    expect(rejectedMutation.status).toBe(403);

    const firstAdd = await agent
      .post("/api/v1/cart/items")
      .set("Origin", trustedOrigin)
      .send({ productId: product.id, quantity: 2 });

    expect(firstAdd.status).toBe(200);
    expect(firstAdd.body.data.id).toBe(initialResponse.body.data.id);
    expect(firstAdd.body.data.items).toHaveLength(1);
    expect(firstAdd.body.data.items[0]).toMatchObject({
      productId: product.id,
      quantity: 2,
    });

    const secondAdd = await agent
      .post("/api/v1/cart/items")
      .set("Origin", trustedOrigin)
      .send({ productId: product.id, quantity: 1 });

    expect(secondAdd.status).toBe(200);
    expect(secondAdd.body.data.items[0].quantity).toBe(3);

    const itemId = secondAdd.body.data.items[0].id as string;
    const rejectedUpdate = await agent
      .patch(`/api/v1/cart/items/${encodeURIComponent(itemId)}`)
      .send({ quantity: 4 });
    const rejectedRemove = await agent
      .delete(`/api/v1/cart/items/${encodeURIComponent(itemId)}`);
    const rejectedClear = await agent.delete("/api/v1/cart");

    expect(rejectedUpdate.status).toBe(403);
    expect(rejectedRemove.status).toBe(403);
    expect(rejectedClear.status).toBe(403);

    const unchanged = await agent.get("/api/v1/cart");
    expect(unchanged.body.data.items[0].quantity).toBe(3);

    const updated = await agent
      .patch(`/api/v1/cart/items/${encodeURIComponent(itemId)}`)
      .set("Origin", trustedOrigin)
      .send({ quantity: 4 });

    expect(updated.status).toBe(200);
    expect(updated.body.data.items[0].quantity).toBe(4);

    const removed = await agent
      .delete(`/api/v1/cart/items/${encodeURIComponent(itemId)}`)
      .set("Origin", trustedOrigin);

    expect(removed.status).toBe(200);
    expect(removed.body.data.items).toEqual([]);

    await agent
      .post("/api/v1/cart/items")
      .set("Origin", trustedOrigin)
      .send({ productId: product.id, quantity: 1 })
      .expect(200);

    const rejectedClearAfterAdd = await agent.delete("/api/v1/cart");
    expect(rejectedClearAfterAdd.status).toBe(403);

    const cleared = await agent
      .delete("/api/v1/cart")
      .set("Origin", trustedOrigin);

    expect(cleared.status).toBe(200);
    expect(cleared.body.data.items).toEqual([]);

    const subsequentRead = await agent.get("/api/v1/cart");

    expect(subsequentRead.status).toBe(200);
    expect(subsequentRead.body.data.id).toBe(initialResponse.body.data.id);
    expect(subsequentRead.body.data.items).toEqual([]);
  }, 30_000);

  it("rejects quantities above available stock without changing the cart", async () => {
    const product = await createProduct(4, 3);
    const agent = request.agent(app);

    const response = await agent
      .post("/api/v1/cart/items")
      .set("Origin", trustedOrigin)
      .send({ productId: product.id, quantity: 2 });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INSUFFICIENT_STOCK");
  });
});
