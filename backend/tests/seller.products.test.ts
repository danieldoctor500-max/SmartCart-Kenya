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

const trustedOrigin = new URL(env.FRONTEND_URL).origin;
const sessionCookieName = env.SESSION_COOKIE_NAME;
const suffix = randomUUID().replaceAll("-", "");
const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];
const createdStoreIds: string[] = [];
const createdProductIds: string[] = [];
const createdSessionIds: string[] = [];
const categoryIds: string[] = [];
const createdAddressIds: string[] = [];
const createdOrderIds: string[] = [];
const createdOrderItemIds: string[] = [];
const createdSellerOrderIds: string[] = [];

describe("Seller product and inventory API", () => {
  let sellerUserId: string;
  let otherSellerUserId: string;
  let customerUserId: string;
  let sellerStoreId: string;
  let otherSellerStoreId: string;
  let categoryId: string;
  let sellerCookie = "";
  let otherSellerCookie = "";
  let customerCookie = "";

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;

    async function createSeller(name: string) {
      const user = await prisma.user.create({
        data: {
          fullName: name,
          email: `${name.toLowerCase().replaceAll(" ", "-")}-${suffix}@example.com`,
          passwordHash: "not-used-for-login",
          roles: { create: { role: "SELLER" } },
        },
        select: { id: true },
      });
      createdUserIds.push(user.id);

      const profile = await prisma.sellerProfile.create({
        data: {
          userId: user.id,
          businessName: `${name} Business`,
          applicationStatus: "APPROVED",
        },
        select: { id: true },
      });
      createdProfileIds.push(profile.id);

      const store = await prisma.store.create({
        data: {
          sellerProfileId: profile.id,
          name: `${name} Store`,
          slug: `${name.toLowerCase().replaceAll(" ", "-")}-${suffix}`,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      createdStoreIds.push(store.id);

      return { userId: user.id, storeId: store.id };
    }

    const seller = await createSeller(`Seller ${suffix.slice(0, 7)}`);
    const otherSeller = await createSeller(`Other ${suffix.slice(0, 7)}`);
    sellerUserId = seller.userId;
    sellerStoreId = seller.storeId;
    otherSellerUserId = otherSeller.userId;
    otherSellerStoreId = otherSeller.storeId;

    const customer = await prisma.user.create({
      data: {
        fullName: `Customer ${suffix.slice(0, 7)}`,
        email: `customer-${suffix}@example.com`,
        passwordHash: "not-used-for-login",
        roles: { create: { role: "CUSTOMER" } },
      },
      select: { id: true },
    });
    customerUserId = customer.id;
    createdUserIds.push(customer.id);

    const category = await prisma.category.create({
      data: {
        name: `Seller Test Category ${suffix.slice(0, 7)}`,
        slug: `seller-test-${suffix}`,
        isActive: true,
      },
      select: { id: true },
    });
    categoryId = category.id;
    categoryIds.push(category.id);
  });

  beforeEach(async () => {
    await prisma.inventoryMovement.deleteMany({
      where: { productId: { in: createdProductIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } },
    });
    createdProductIds.length = 0;

    await prisma.store.updateMany({
      where: { id: { in: createdStoreIds } },
      data: { status: "ACTIVE" },
    });
    await prisma.sellerProfile.updateMany({
      where: { id: { in: createdProfileIds } },
      data: { applicationStatus: "APPROVED" },
    });

    await prisma.session.deleteMany({
      where: { id: { in: createdSessionIds } },
    });
    createdSessionIds.length = 0;

    sellerCookie = await createSessionCookie(sellerUserId);
    otherSellerCookie = await createSessionCookie(otherSellerUserId);
    customerCookie = await createSessionCookie(customerUserId);
  });

  afterAll(async () => {
    try {
      await prisma.sellerOrderItem.deleteMany({
        where: { sellerOrderId: { in: createdSellerOrderIds } },
      });
      await prisma.sellerOrder.deleteMany({
        where: { id: { in: createdSellerOrderIds } },
      });
      await prisma.orderItem.deleteMany({
        where: { id: { in: createdOrderItemIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
      await prisma.address.deleteMany({
        where: { id: { in: createdAddressIds } },
      });
      await prisma.inventoryMovement.deleteMany({
        where: { productId: { in: createdProductIds } },
      });
      await prisma.product.deleteMany({
        where: { id: { in: createdProductIds } },
      });
      await prisma.session.deleteMany({
        where: { id: { in: createdSessionIds } },
      });
      await prisma.store.deleteMany({
        where: { id: { in: createdStoreIds } },
      });
      await prisma.sellerProfile.deleteMany({
        where: { id: { in: createdProfileIds } },
      });
      await prisma.category.deleteMany({
        where: { id: { in: categoryIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function createSessionCookie(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    const session = await prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      },
      select: { id: true },
    });
    createdSessionIds.push(session.id);

    return `${sessionCookieName}=${token}`;
  }

  async function createProduct(
    cookie = sellerCookie,
    body: Record<string, unknown> = {
      name: "Kenyan Coffee",
      categoryId,
      description: "Freshly roasted coffee.",
      price: 850,
      initialStock: 0,
      images: [
        {
          imageUrl: "https://images.example.com/coffee.jpg",
          altText: "Coffee beans",
        },
      ],
    },
  ) {
    const response = await request(app)
      .post("/api/v1/seller/products")
      .set("Origin", trustedOrigin)
      .set("Cookie", cookie)
      .send({ initialStock: 0, ...body });

    if (typeof response.body.data?.id === "string") {
      createdProductIds.push(response.body.data.id);
    }

    return response;
  }

  it("requires authentication and blocks mutations from untrusted origins", async () => {
    const unauthenticated = await request(app)
      .get("/api/v1/seller/products");
    expect(unauthenticated.status).toBe(401);

    const nonSeller = await request(app)
      .get("/api/v1/seller/products")
      .set("Cookie", customerCookie);
    expect(nonSeller.status).toBe(403);

    const untrusted = await request(app)
      .post("/api/v1/seller/products")
      .set("Origin", "https://untrusted.example")
      .set("Cookie", sellerCookie)
      .send({
        name: "Blocked product",
        categoryId,
        description: null,
        price: 10,
        images: [],
      });
    expect(untrusted.status).toBe(403);

    const created = await createProduct();
    const untrustedInventory = await request(app)
      .patch(`/api/v1/seller/products/${created.body.data.id}/inventory`)
      .set("Cookie", sellerCookie)
      .send({ quantityDelta: 1, reason: "RESTOCK" });
    expect(untrustedInventory.status).toBe(403);
  });

  it("creates a draft under the authenticated seller's store", async () => {
    const response = await createProduct(sellerCookie, {
      name: "Kenyan Coffee",
      categoryId,
      description: "Freshly roasted coffee.",
      price: 850,
      initialStock: 3,
      images: [
        {
          imageUrl: "https://images.example.com/coffee.jpg",
          altText: "Coffee beans",
        },
      ],
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      name: "Kenyan Coffee",
      price: 850,
      stockQuantity: 3,
      reservedQuantity: 0,
      availableQuantity: 3,
      status: "DRAFT",
      category: { id: categoryId },
    });
    expect(response.body.data).not.toHaveProperty("storeId");

    const savedProduct = await prisma.product.findUnique({
      where: { id: response.body.data.id },
    });
    expect(savedProduct?.storeId).toBe(sellerStoreId);

    const image = await prisma.productImage.findFirst({
      where: { productId: response.body.data.id },
    });
    expect(image?.imageUrl).toBe("https://images.example.com/coffee.jpg");
    const movement = await prisma.inventoryMovement.findFirst({
      where: { productId: response.body.data.id },
    });
    expect(movement).toMatchObject({
      quantityDelta: 3,
      reason: "RESTOCK",
    });
  });

  it("publishes an eligible draft and exposes it in the public catalogue", async () => {
    const created = await createProduct(sellerCookie, {
      name: "Published Kenyan Coffee",
      categoryId,
      description: "Ready for customers.",
      price: 850,
      initialStock: 4,
      images: [],
    });
    const productId = created.body.data.id as string;
    expect(created.body.data.status).toBe("DRAFT");

    const hidden = await request(app)
      .get("/api/v1/catalog/products")
      .query({ search: "Published Kenyan Coffee" });
    expect(hidden.body.data).toEqual([]);

    const published = await request(app)
      .patch(`/api/v1/seller/products/${productId}/publish`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie);

    expect(published.status).toBe(200);
    expect(published.body.data).toMatchObject({
      id: productId,
      status: "ACTIVE",
      stockQuantity: 4,
      availableQuantity: 4,
    });

    const visible = await request(app)
      .get("/api/v1/catalog/products")
      .query({ search: "Published Kenyan Coffee" });
    expect(visible.status).toBe(200);
    expect(visible.body.data).toContainEqual(
      expect.objectContaining({ id: productId }),
    );

    const repeatedPublish = await request(app)
      .patch(`/api/v1/seller/products/${productId}/publish`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie);
    expect(repeatedPublish.status).toBe(409);
  });

  it("requires available stock before publishing", async () => {
    const created = await createProduct();
    const response = await request(app)
      .patch(`/api/v1/seller/products/${created.body.data.id}/publish`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie);

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("available stock");
    expect(
      await prisma.product.findUniqueOrThrow({
        where: { id: created.body.data.id },
        select: { status: true },
      }),
    ).toEqual({ status: "DRAFT" });
  });

  it("blocks publishing for an unapproved seller", async () => {
    const created = await createProduct(sellerCookie, {
      name: "Unapproved seller product",
      categoryId,
      description: null,
      price: 10,
      initialStock: 2,
      images: [],
    });

    await prisma.sellerProfile.update({
      where: { userId: sellerUserId },
      data: { applicationStatus: "PENDING" },
    });

    const response = await request(app)
      .patch(`/api/v1/seller/products/${created.body.data.id}/publish`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie);

    expect(response.status).toBe(403);
    expect(
      await prisma.product.findUniqueOrThrow({
        where: { id: created.body.data.id },
        select: { status: true },
      }),
    ).toEqual({ status: "DRAFT" });
  });

  it("allows an active approved seller to create, edit, and adjust inventory", async () => {
    const created = await createProduct();
    expect(created.status).toBe(201);
    const productId = created.body.data.id as string;

    const updated = await request(app)
      .patch(`/api/v1/seller/products/${productId}`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie)
      .send({ name: "Active store product" });
    expect(updated.status).toBe(200);

    const adjusted = await request(app)
      .patch(`/api/v1/seller/products/${productId}/inventory`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie)
      .send({ quantityDelta: 2, reason: "RESTOCK" });
    expect(adjusted.status).toBe(200);
    expect(adjusted.body.data.stockQuantity).toBe(2);
  });

  it("blocks product creation, editing, and inventory adjustment for a suspended store", async () => {
    const created = await createProduct();
    expect(created.status).toBe(201);
    const productId = created.body.data.id as string;

    await prisma.store.update({
      where: { id: sellerStoreId },
      data: { status: "SUSPENDED" },
    });

    const suspendedCreate = await createProduct(sellerCookie, {
      name: "Suspended store product",
      categoryId,
      description: null,
      price: 10,
      images: [],
    });
    expect(suspendedCreate.status).toBe(403);
    expect(suspendedCreate.body).toMatchObject({
      success: false,
      message:
        "Seller product and inventory changes are unavailable while the store is suspended.",
    });

    const suspendedUpdate = await request(app)
      .patch(`/api/v1/seller/products/${productId}`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie)
      .send({ name: "Suspended edit attempt" });
    expect(suspendedUpdate.status).toBe(403);
    expect(suspendedUpdate.body.success).toBe(false);

    const suspendedAdjustment = await request(app)
      .patch(`/api/v1/seller/products/${productId}/inventory`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie)
      .send({ quantityDelta: 1, reason: "RESTOCK" });
    expect(suspendedAdjustment.status).toBe(403);
    expect(suspendedAdjustment.body.success).toBe(false);

    const suspendedPublish = await request(app)
      .patch(`/api/v1/seller/products/${productId}/publish`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie);
    expect(suspendedPublish.status).toBe(403);

    const suspendedList = await request(app)
      .get("/api/v1/seller/products")
      .set("Cookie", sellerCookie);
    expect(suspendedList.status).toBe(403);

    const suspendedRead = await request(app)
      .get(`/api/v1/seller/products/${productId}`)
      .set("Cookie", sellerCookie);
    expect(suspendedRead.status).toBe(403);

    const unchanged = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { name: true, stockQuantity: true },
    });
    expect(unchanged).toEqual({ name: "Kenyan Coffee", stockQuantity: 0 });
  });

  it("blocks seller product and order access until an approved store is active", async () => {
    const created = await createProduct();
    const productId = created.body.data.id as string;
    await prisma.store.update({
      where: { id: sellerStoreId },
      data: { status: "INACTIVE" },
    });

    const listed = await request(app)
      .get("/api/v1/seller/products")
      .set("Cookie", sellerCookie);
    expect(listed.status).toBe(403);

    const createdWhileInactive = await createProduct();
    expect(createdWhileInactive.status).toBe(403);

    const updated = await request(app)
      .patch(`/api/v1/seller/products/${productId}`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie)
      .send({ name: "Inactive store product" });
    expect(updated.status).toBe(403);

    const adjusted = await request(app)
      .patch(`/api/v1/seller/products/${productId}/inventory`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie)
      .send({ quantityDelta: 3, reason: "RESTOCK" });
    expect(adjusted.status).toBe(403);

    const inactivePublish = await request(app)
      .patch(`/api/v1/seller/products/${productId}/publish`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie);
    expect(inactivePublish.status).toBe(403);

    const inactiveOrders = await request(app)
      .get("/api/v1/seller/orders")
      .set("Cookie", sellerCookie);
    expect(inactiveOrders.status).toBe(403);

    const unchanged = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { name: true, stockQuantity: true },
    });
    expect(unchanged).toEqual({ name: "Kenyan Coffee", stockQuantity: 0 });
  });

  it("rejects protected ownership/status fields, invalid prices, and unsafe image URLs", async () => {
    const protectedFields = await createProduct(sellerCookie, {
      name: "Attempted ownership change",
      categoryId,
      description: null,
      price: 10,
      images: [],
      storeId: otherSellerStoreId,
      status: "ACTIVE",
    });
    expect(protectedFields.status).toBe(400);

    const invalidPrice = await createProduct(sellerCookie, {
      name: "Invalid price product",
      categoryId,
      description: null,
      price: -1,
      images: [],
    });
    expect(invalidPrice.status).toBe(400);

    const invalidStock = await createProduct(sellerCookie, {
      name: "Invalid stock product",
      categoryId,
      description: null,
      price: 10,
      initialStock: -1,
      images: [],
    });
    expect(invalidStock.status).toBe(400);

    const missingStock = await createProduct(sellerCookie, {
      name: "Missing stock product",
      categoryId,
      description: null,
      price: 10,
      initialStock: undefined,
      images: [],
    });
    expect(missingStock.status).toBe(400);

    const unavailableCategory = await createProduct(sellerCookie, {
      name: "Unavailable category product",
      categoryId: "missing-category",
      description: null,
      price: 10,
      images: [],
    });
    expect(unavailableCategory.status).toBe(400);

    const unsafeImage = await createProduct(sellerCookie, {
      name: "Unsafe image product",
      categoryId,
      description: null,
      price: 10,
      images: [{ imageUrl: "javascript:alert(1)" }],
    });
    expect(unsafeImage.status).toBe(400);

    expect(
      await prisma.product.count({ where: { storeId: sellerStoreId } }),
    ).toBe(0);
  });

  it("scopes product listing, reads, and updates to the seller's own store", async () => {
    const created = await createProduct();
    const productId = created.body.data.id as string;

    const ownList = await request(app)
      .get("/api/v1/seller/products")
      .set("Cookie", sellerCookie);
    expect(ownList.status).toBe(200);
    expect(ownList.body.data.map((product: { id: string }) => product.id))
      .toContain(productId);

    const otherList = await request(app)
      .get("/api/v1/seller/products")
      .set("Cookie", otherSellerCookie);
    expect(otherList.status).toBe(200);
    expect(otherList.body.data).toEqual([]);

    const foreignRead = await request(app)
      .get(`/api/v1/seller/products/${productId}`)
      .set("Cookie", otherSellerCookie);
    expect(foreignRead.status).toBe(404);

    const foreignUpdate = await request(app)
      .patch(`/api/v1/seller/products/${productId}`)
      .set("Origin", trustedOrigin)
      .set("Cookie", otherSellerCookie)
      .send({ name: "Hijacked product" });
    expect(foreignUpdate.status).toBe(404);

    const foreignPublish = await request(app)
      .patch(`/api/v1/seller/products/${productId}/publish`)
      .set("Origin", trustedOrigin)
      .set("Cookie", otherSellerCookie);
    expect(foreignPublish.status).toBe(404);

    const customerPublish = await request(app)
      .patch(`/api/v1/seller/products/${productId}/publish`)
      .set("Origin", trustedOrigin)
      .set("Cookie", customerCookie);
    expect(customerPublish.status).toBe(403);

    const protectedUpdate = await request(app)
      .patch(`/api/v1/seller/products/${productId}`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie)
      .send({ status: "ACTIVE", storeId: otherSellerStoreId });
    expect(protectedUpdate.status).toBe(400);

    const validUpdate = await request(app)
      .patch(`/api/v1/seller/products/${productId}`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie)
      .send({ name: "Updated coffee", price: 900 });
    expect(validUpdate.status).toBe(200);
    expect(validUpdate.body.data).toMatchObject({
      name: "Updated coffee",
      price: 900,
      status: "DRAFT",
    });
  });

  it("records transactional stock adjustments and protects reserved stock", async () => {
    const created = await createProduct();
    const productId = created.body.data.id as string;

    const negative = await request(app)
      .patch(`/api/v1/seller/products/${productId}/inventory`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie)
      .send({
        quantityDelta: -1,
        reason: "CORRECTION",
      });
    expect(negative.status).toBe(400);

    const restock = await request(app)
      .patch(`/api/v1/seller/products/${productId}/inventory`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie)
      .send({
        quantityDelta: 5,
        reason: "RESTOCK",
        note: "Initial stock received",
      });
    expect(restock.status).toBe(200);
    expect(restock.body.data).toMatchObject({
      stockQuantity: 5,
      reservedQuantity: 0,
      availableQuantity: 5,
    });

    const movement = await prisma.inventoryMovement.findFirst({
      where: { productId },
    });
    expect(movement).toMatchObject({
      quantityDelta: 5,
      reason: "RESTOCK",
    });
    expect(movement?.note).toContain(`actor=${sellerUserId}`);
    expect(movement?.note).toContain("stock=0->5");
    expect(movement?.note).toContain("Initial stock received");

    await prisma.product.update({
      where: { id: productId },
      data: { reservedQuantity: 3 },
    });

    const belowReserved = await request(app)
      .patch(`/api/v1/seller/products/${productId}/inventory`)
      .set("Origin", trustedOrigin)
      .set("Cookie", sellerCookie)
      .send({
        quantityDelta: -3,
        reason: "CORRECTION",
      });
    expect(belowReserved.status).toBe(409);

    const unchanged = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { stockQuantity: true },
    });
    expect(unchanged.stockQuantity).toBe(5);
    expect(
      await prisma.inventoryMovement.count({ where: { productId } }),
    ).toBe(1);
  });

  it("does not allow inventory access to another seller's product", async () => {
    const created = await createProduct();

    const foreignRead = await request(app)
      .get(`/api/v1/seller/products/${created.body.data.id}`)
      .set("Cookie", otherSellerCookie);
    expect(foreignRead.status).toBe(404);

    const foreignEdit = await request(app)
      .patch(`/api/v1/seller/products/${created.body.data.id}`)
      .set("Origin", trustedOrigin)
      .set("Cookie", otherSellerCookie)
      .send({ name: "Foreign product edit" });
    expect(foreignEdit.status).toBe(404);

    const response = await request(app)
      .patch(`/api/v1/seller/products/${created.body.data.id}/inventory`)
      .set("Origin", trustedOrigin)
      .set("Cookie", otherSellerCookie)
      .send({ quantityDelta: 2, reason: "RESTOCK" });

    expect(response.status).toBe(404);
  });

  it("limits seller order lists and details to the authenticated seller's store", async () => {
    const ownProduct = await createProduct();
    const otherProduct = await createProduct(otherSellerCookie, {
      name: "Other store product",
      categoryId,
      description: null,
      price: 25,
      images: [],
    });

    const address = await prisma.address.create({
      data: {
        userId: customerUserId,
        recipientName: "Test Buyer",
        phone: "0712345678",
        county: "Nairobi",
        town: "Westlands",
        addressLine: "10 Test Street",
      },
      select: { id: true },
    });
    createdAddressIds.push(address.id);

    const order = await prisma.order.create({
      data: {
        userId: customerUserId,
        addressId: address.id,
        orderNumber: `SC-SELLER-${suffix}`,
        idempotencyKey: randomUUID(),
        subtotal: 50,
        deliveryTotal: 0,
        grandTotal: 50,
        deliveryRecipientName: "Test Buyer",
        deliveryPhone: "0712345678",
        deliveryCounty: "Nairobi",
        deliveryTown: "Westlands",
        deliveryAddressLine: "10 Test Street",
      },
      select: { id: true },
    });
    createdOrderIds.push(order.id);

    const ownOrderItem = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: ownProduct.body.data.id,
        storeId: sellerStoreId,
        productNameSnapshot: "Seller's own item",
        unitPrice: 25,
        quantity: 1,
        lineTotal: 25,
      },
      select: { id: true },
    });
    const otherOrderItem = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: otherProduct.body.data.id,
        storeId: otherSellerStoreId,
        productNameSnapshot: "Another seller's private item",
        unitPrice: 25,
        quantity: 1,
        lineTotal: 25,
      },
      select: { id: true },
    });
    createdOrderItemIds.push(ownOrderItem.id, otherOrderItem.id);

    const ownSellerOrder = await prisma.sellerOrder.create({
      data: {
        orderId: order.id,
        storeId: sellerStoreId,
      },
      select: { id: true },
    });
    await prisma.sellerOrderItem.create({
      data: {
        sellerOrderId: ownSellerOrder.id,
        orderItemId: ownOrderItem.id,
        orderId: order.id,
        storeId: sellerStoreId,
      },
    });
    const otherSellerOrder = await prisma.sellerOrder.create({
      data: {
        orderId: order.id,
        storeId: otherSellerStoreId,
      },
      select: { id: true },
    });
    await prisma.sellerOrderItem.create({
      data: {
        sellerOrderId: otherSellerOrder.id,
        orderItemId: otherOrderItem.id,
        orderId: order.id,
        storeId: otherSellerStoreId,
      },
    });
    createdSellerOrderIds.push(ownSellerOrder.id, otherSellerOrder.id);

    const customerAccess = await request(app)
      .get("/api/v1/seller/orders")
      .set("Cookie", customerCookie);
    expect(customerAccess.status).toBe(403);

    const ownList = await request(app)
      .get("/api/v1/seller/orders")
      .set("Cookie", sellerCookie);
    expect(ownList.status).toBe(200);
    expect(ownList.body.items).toHaveLength(1);
    expect(ownList.body.items[0]).toMatchObject({
      id: ownSellerOrder.id,
      order: { orderNumber: `SC-SELLER-${suffix}` },
      items: [{ productNameSnapshot: "Seller's own item", quantity: 1 }],
    });
    expect(JSON.stringify(ownList.body)).not.toContain(
      "Another seller's private item",
    );
    expect(JSON.stringify(ownList.body)).not.toContain("deliveryPhone");

    const foreignDetail = await request(app)
      .get(`/api/v1/seller/orders/${otherSellerOrder.id}`)
      .set("Cookie", sellerCookie);
    expect(foreignDetail.status).toBe(404);

    const ownDetail = await request(app)
      .get(`/api/v1/seller/orders/${ownSellerOrder.id}`)
      .set("Cookie", sellerCookie);
    expect(ownDetail.status).toBe(200);
    expect(ownDetail.body.data.items).toMatchObject([
      { productNameSnapshot: "Seller's own item", unitPrice: 25 },
    ]);
  });
});
