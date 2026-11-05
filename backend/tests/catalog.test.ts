
import { randomUUID } from "node:crypto";
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

const testId = randomUUID().replaceAll("-", "");
const trustedOrigin = new URL(env.FRONTEND_URL).origin;
const createdProductIds: string[] = [];
const createdStoreIds: string[] = [];
const createdSellerProfileIds: string[] = [];
const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdCartIds: string[] = [];

describe("Public catalogue API", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  async function cleanTestRecords() {
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

    createdProductIds.length = 0;
    createdStoreIds.length = 0;
    createdSellerProfileIds.length = 0;
    createdCategoryIds.length = 0;
    createdUserIds.length = 0;
    createdCartIds.length = 0;
  }

  beforeEach(async () => {
    await cleanTestRecords();
  });

  afterAll(async () => {
    try {
      await cleanTestRecords();
    } finally {
      await prisma.$disconnect();
    }
  });

  async function createCategory(isActive = true) {
    const category = await prisma.category.create({
      data: {
        name: `Test Category ${randomUUID().slice(0, 8)}`,
        slug: `test-category-${randomUUID().slice(0, 12)}`,
        isActive,
      },
    });

    createdCategoryIds.push(category.id);
    return category;
  }

  async function createStore(options?: {
    applicationStatus?: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
    storeStatus?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
    userStatus?: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  }) {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);

    const user = await prisma.user.create({
      data: {
        fullName: `Catalogue Seller ${suffix}`,
        email: `catalog-seller-${suffix}@example.com`,
        passwordHash: "not-used-for-login",
        status: options?.userStatus ?? "ACTIVE",
        roles: {
          create: { role: "CUSTOMER" },
        },
      },
      select: { id: true },
    });

    createdUserIds.push(user.id);

    const profile = await prisma.sellerProfile.create({
      data: {
        userId: user.id,
        businessName: `Catalogue Business ${suffix}`,
        applicationStatus: options?.applicationStatus ?? "APPROVED",
        phone: "0712345678",
        email: `catalog-business-${suffix}@example.com`,
      },
      select: { id: true },
    });

    createdSellerProfileIds.push(profile.id);

    const store = await prisma.store.create({
      data: {
        sellerProfileId: profile.id,
        name: `Catalogue Store ${suffix}`,
        slug: `catalog-store-${suffix}`,
        status: options?.storeStatus ?? "ACTIVE",
      },
    });

    createdStoreIds.push(store.id);
    return store;
  }

  async function createProduct(options?: {
    name?: string;
    slug?: string;
    description?: string;
    price?: number;
    stockQuantity?: number;
    reservedQuantity?: number;
    status?: "DRAFT" | "ACTIVE" | "REJECTED" | "ARCHIVED";
    storeStatus?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
    applicationStatus?: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
    categoryId?: string;
    userStatus?: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
    categoryActive?: boolean;
  }) {
    const category = options?.categoryId
      ? null
      : await createCategory(options?.categoryActive);

    const store = await createStore({
      storeStatus: options?.storeStatus,
      applicationStatus: options?.applicationStatus,
      userStatus: options?.userStatus,
    });

    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);

    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: options?.categoryId ?? category!.id,
        name: options?.name ?? `Test Product ${suffix}`,
        slug: options?.slug ?? `test-product-${suffix}`,
        description: options?.description ?? "Catalogue integration test product",
        price: options?.price ?? 1250,
        stockQuantity: options?.stockQuantity ?? 10,
        reservedQuantity: options?.reservedQuantity ?? 2,
        status: options?.status ?? "ACTIVE",
      },
    });

    createdProductIds.push(product.id);

    return { product, store, category };
  }

  it("returns active products with pagination metadata", async () => {
    const { product } = await createProduct({
      name: "Catalogue Visible Product",
      price: 1250,
      stockQuantity: 10,
      reservedQuantity: 2,
    });

    const response = await request(app)
      .get("/api/v1/catalog/products");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: product.id,
      name: "Catalogue Visible Product",
      price: 1250,
      currency: "KES",
      availableQuantity: 8,
    });
    expect(response.body.pagination).toMatchObject({
      page: 1,
      limit: 12,
      total: 1,
      totalPages: 1,
    });
  });

  it("allows a product listed in the catalogue to be added to a guest cart", async () => {
    const { product } = await createProduct({
      name: "Catalogue Cart Product",
    });
    const agent = request.agent(app);

    const guestCart = await agent.get("/api/v1/cart");
    expect(guestCart.status).toBe(200);
    createdCartIds.push(guestCart.body.data.id);

    const catalogue = await agent.get("/api/v1/catalog/products");
    expect(catalogue.status).toBe(200);
    expect(catalogue.body.data).toContainEqual(
      expect.objectContaining({ id: product.id }),
    );

    const added = await agent
      .post("/api/v1/cart/items")
      .set("Origin", trustedOrigin)
      .send({ productId: product.id, quantity: 1 });

    expect(added.status).toBe(200);
    expect(added.body.data.id).toBe(guestCart.body.data.id);
    expect(added.body.data.items).toContainEqual(
      expect.objectContaining({
        productId: product.id,
        quantity: 1,
      }),
    );
  });

  it("does not expose draft products", async () => {
    await createProduct({
      name: "Unpublished Product",
      status: "DRAFT",
    });

    const response = await request(app)
      .get("/api/v1/catalog/products");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination.total).toBe(0);
  });

  it("does not expose products without unreserved stock", async () => {
    await createProduct({
      name: "Fully Reserved Product",
      stockQuantity: 4,
      reservedQuantity: 4,
    });

    const response = await request(app)
      .get("/api/v1/catalog/products");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination.total).toBe(0);
  });

  it("does not expose products from inactive stores", async () => {
    await createProduct({
      storeStatus: "INACTIVE",
    });

    const response = await request(app)
      .get("/api/v1/catalog/products");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("does not expose products from unapproved sellers", async () => {
    await createProduct({
      applicationStatus: "PENDING",
    });

    const response = await request(app)
      .get("/api/v1/catalog/products");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("resolves identical product slugs using the requested store", async () => {
    const category = await createCategory();
    const slug = `shared-product-${testId}`;
    const first = await createProduct({
      slug,
      name: "First store product",
      categoryId: category.id,
    });
    const second = await createProduct({
      slug,
      name: "Second store product",
      categoryId: category.id,
    });

    const firstResponse = await request(app)
      .get(`/api/v1/catalog/stores/${first.store.slug}/products/${slug}`);
    const secondResponse = await request(app)
      .get(`/api/v1/catalog/stores/${second.store.slug}/products/${slug}`);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.data).toMatchObject({
      id: first.product.id,
      name: "First store product",
      store: { slug: first.store.slug },
    });
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.data).toMatchObject({
      id: second.product.id,
      name: "Second store product",
      store: { slug: second.store.slug },
    });

    const legacyResponse = await request(app)
      .get(`/api/v1/catalog/products/${slug}`);
    expect(legacyResponse.status).toBe(409);
  });

  it("does not expose out-of-stock products through public details", async () => {
    const { product, store } = await createProduct({
      slug: `out-of-stock-${testId}`,
      stockQuantity: 3,
      reservedQuantity: 3,
    });

    const response = await request(app)
      .get(
        `/api/v1/catalog/stores/${store.slug}/products/${product.slug}`,
      );

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it("does not expose draft, inactive-store, or unapproved-seller details", async () => {
    const draft = await createProduct({
      slug: `hidden-draft-${testId}`,
      status: "DRAFT",
    });
    const inactiveStore = await createProduct({
      slug: `hidden-store-${testId}`,
      storeStatus: "INACTIVE",
    });
    const unapprovedSeller = await createProduct({
      slug: `hidden-seller-${testId}`,
      applicationStatus: "PENDING",
    });
    const inactiveUser = await createProduct({
      slug: `hidden-user-${testId}`,
      userStatus: "SUSPENDED",
    });
    const inactiveCategory = await createProduct({
      slug: `hidden-category-${testId}`,
      categoryActive: false,
    });

    const hiddenTargets = [
      { product: draft.product, store: draft.store },
      { product: inactiveStore.product, store: inactiveStore.store },
      { product: unapprovedSeller.product, store: unapprovedSeller.store },
      { product: inactiveUser.product, store: inactiveUser.store },
      { product: inactiveCategory.product, store: inactiveCategory.store },
    ];

    for (const target of hiddenTargets) {
      const response = await request(app)
        .get(
          `/api/v1/catalog/stores/${target.store.slug}/products/${target.product.slug}`,
        );
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        message: "Product not found.",
      });
    }
  });

  it("uses public catalogue visibility for related product candidates", async () => {
    const category = await createCategory();
    const current = await createProduct({
      slug: `related-current-${testId}`,
      categoryId: category.id,
    });
    const related = await createProduct({
      slug: `related-visible-${testId}`,
      categoryId: category.id,
    });
    const draft = await createProduct({
      slug: `related-draft-${testId}`,
      categoryId: category.id,
      status: "DRAFT",
    });
    const reserved = await createProduct({
      slug: `related-reserved-${testId}`,
      categoryId: category.id,
      stockQuantity: 2,
      reservedQuantity: 2,
    });

    const response = await request(app)
      .get("/api/v1/catalog/products")
      .query({ category: category.slug, limit: 50 });

    expect(response.status).toBe(200);
    const ids = response.body.data.map((item: { id: string }) => item.id);
    expect(ids).toContain(current.product.id);
    expect(ids).toContain(related.product.id);
    expect(ids).not.toContain(draft.product.id);
    expect(ids).not.toContain(reserved.product.id);
    expect(response.body.data).toHaveLength(2);
  });

  it("filters products by search term", async () => {
    const { product } = await createProduct({
      name: "Kenyan Coffee Beans",
      description: "Fresh coffee from Kenya",
    });

    await createProduct({
      name: "Cotton T-Shirt",
      description: "Casual clothing",
    });

    const response = await request(app)
      .get("/api/v1/catalog/products")
      .query({ search: "coffee" });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(product.id);
  });

  it("filters products by minimum and maximum price", async () => {
    const { product } = await createProduct({
      name: "Midrange Product",
      price: 1500,
    });

    await createProduct({
      name: "Expensive Product",
      price: 5000,
    });

    const response = await request(app)
      .get("/api/v1/catalog/products")
      .query({ minPrice: "1000", maxPrice: "2000" });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(product.id);
  });

  it("rejects invalid price ranges", async () => {
    const response = await request(app)
      .get("/api/v1/catalog/products")
      .query({ minPrice: "5000", maxPrice: "1000" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("rejects unknown query parameters", async () => {
    const response = await request(app)
      .get("/api/v1/catalog/products")
      .query({ unexpected: "value" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("returns 404 for a product that is not publicly available", async () => {
    await createProduct({
      slug: `hidden-product-${testId}`,
      status: "DRAFT",
    });

    const response = await request(app)
      .get(`/api/v1/catalog/products/hidden-product-${testId}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it("returns active categories that contain visible products", async () => {
    const category = await createCategory();

    await createProduct({
      categoryId: category.id,
    });

    const response = await request(app)
      .get("/api/v1/catalog/categories");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toContainEqual({
      id: category.id,
      name: category.name,
      slug: category.slug,
    });
  });
});
