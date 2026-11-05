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
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/database.js";
import { releaseExpiredReservations } from "../src/modules/checkout/checkout.service.js";

const trustedOrigin = new URL(env.FRONTEND_URL).origin;
const sessionCookieName = env.SESSION_COOKIE_NAME;
const createdOrderIds: string[] = [];
const createdProductIds: string[] = [];
const createdStoreIds: string[] = [];
const createdSellerProfileIds: string[] = [];
const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdSessionIds: string[] = [];
const createdAddressIds: string[] = [];
const createdDeliveryRateIds: string[] = [];
let testDatabaseAvailable = false;

type Scenario = {
  customerId: string;
  otherCustomerId: string;
  customerCookie: string;
  otherCustomerCookie: string;
  addressId: string;
  foreignAddressId: string;
  productId: string;
  storeId: string;
  county: string;
  town: string;
};

describe("Checkout and customer order APIs", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
    testDatabaseAvailable = true;
  });

  async function cleanup() {
    if (createdOrderIds.length > 0) {
      await prisma.payment.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.sellerOrderItem.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.inventoryReservation.deleteMany({
        where: { orderItem: { orderId: { in: createdOrderIds } } },
      });
      await prisma.sellerOrder.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
      createdOrderIds.length = 0;
    }

    if (createdProductIds.length > 0) {
      await prisma.inventoryMovement.deleteMany({
        where: { productId: { in: createdProductIds } },
      });
      await prisma.inventoryReservation.deleteMany({
        where: { productId: { in: createdProductIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.cart.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.session.deleteMany({
        where: { id: { in: createdSessionIds } },
      });
      await prisma.address.deleteMany({
        where: { id: { in: createdAddressIds } },
      });
    }

    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } },
    });
    await prisma.deliveryRate.deleteMany({
      where: { id: { in: createdDeliveryRateIds } },
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
    createdUserIds.length = 0;
    createdCategoryIds.length = 0;
    createdSessionIds.length = 0;
    createdAddressIds.length = 0;
    createdDeliveryRateIds.length = 0;
  }

  beforeEach(cleanup);
  afterEach(cleanup);

  afterAll(async () => {
    try {
      if (testDatabaseAvailable) {
        await cleanup();
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  async function createCustomer(name: string) {
    const suffix = randomUUID().replaceAll("-", "");
    const user = await prisma.user.create({
      data: {
        fullName: `${name} ${suffix.slice(0, 6)}`,
        email: `${name.toLowerCase()}-${suffix}@example.com`,
        passwordHash: "checkout-test-password-hash",
        roles: { create: { role: "CUSTOMER" } },
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const rawToken = randomBytes(32).toString("base64url");
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(rawToken).digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
      },
      select: { id: true },
    });
    createdSessionIds.push(session.id);
    return {
      id: user.id,
      cookie: `${sessionCookieName}=${rawToken}`,
    };
  }

  async function createScenario(
    stockQuantity = 8,
    reservedQuantity = 0,
  ): Promise<Scenario> {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const [customer, otherCustomer, seller] = await Promise.all([
      createCustomer("buyer"),
      createCustomer("other-buyer"),
      prisma.user.create({
        data: {
          fullName: `Checkout Seller ${suffix}`,
          email: `checkout-seller-${suffix}@example.com`,
          passwordHash: "not-used",
        },
        select: { id: true },
      }),
    ]);
    createdUserIds.push(seller.id);

    const profile = await prisma.sellerProfile.create({
      data: {
        userId: seller.id,
        businessName: `Checkout Business ${suffix}`,
        applicationStatus: "APPROVED",
      },
      select: { id: true },
    });
    createdSellerProfileIds.push(profile.id);

    const store = await prisma.store.create({
      data: {
        sellerProfileId: profile.id,
        name: `Checkout Store ${suffix}`,
        slug: `checkout-store-${suffix}`,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    createdStoreIds.push(store.id);

    const category = await prisma.category.create({
      data: {
        name: `Checkout Category ${suffix}`,
        slug: `checkout-category-${suffix}`,
        isActive: true,
      },
      select: { id: true },
    });
    createdCategoryIds.push(category.id);

    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: category.id,
        name: `Checkout Product ${suffix}`,
        slug: `checkout-product-${suffix}`,
        description: "A checkout test product.",
        price: 125,
        stockQuantity,
        reservedQuantity,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    createdProductIds.push(product.id);

    const county = `Test County ${suffix}`;
    const town = `Test Town ${suffix}`;
    const rate = await prisma.deliveryRate.create({
      data: {
        county,
        countyKey: county.toLowerCase(),
        town,
        townKey: town.toLowerCase(),
        fee: 45,
        isActive: true,
      },
      select: { id: true },
    });
    createdDeliveryRateIds.push(rate.id);

    const [address, foreignAddress] = await Promise.all([
      prisma.address.create({
        data: {
          userId: customer.id,
          recipientName: "Checkout Buyer",
          phone: "0712345678",
          county,
          town,
          addressLine: "10 Test Street",
          isDefault: true,
        },
        select: { id: true },
      }),
      prisma.address.create({
        data: {
          userId: otherCustomer.id,
          recipientName: "Other Buyer",
          phone: "0712345679",
          county,
          town,
          addressLine: "11 Test Street",
        },
        select: { id: true },
      }),
    ]);
    createdAddressIds.push(address.id, foreignAddress.id);

    return {
      customerId: customer.id,
      otherCustomerId: otherCustomer.id,
      customerCookie: customer.cookie,
      otherCustomerCookie: otherCustomer.cookie,
      addressId: address.id,
      foreignAddressId: foreignAddress.id,
      productId: product.id,
      storeId: store.id,
      county,
      town,
    };
  }

  function addToCart(
    cookie: string,
    productId: string,
    quantity: number,
  ) {
    return request(app)
      .post("/api/v1/cart/items")
      .set("Cookie", cookie)
      .set("Origin", trustedOrigin)
      .send({ productId, quantity });
  }

  function checkoutRequest(
    cookie: string,
    idempotencyKey = randomUUID(),
    addressId?: string,
  ) {
    return request(app)
      .post("/api/v1/checkout")
      .set("Cookie", cookie)
      .set("Origin", trustedOrigin)
      .send({
        idempotencyKey,
        address: { type: "saved", addressId },
      });
  }

  function checkoutNewAddressRequest(
    cookie: string,
    idempotencyKey: string,
    scenario: Scenario,
    saveAsDefault: boolean,
  ) {
    return request(app)
      .post("/api/v1/checkout")
      .set("Cookie", cookie)
      .set("Origin", trustedOrigin)
      .send({
        idempotencyKey,
        address: {
          type: "new",
          recipientName: "New Checkout Recipient",
          phone: "0712345680",
          county: scenario.county,
          town: scenario.town,
          addressLine: "12 Checkout Avenue",
          saveAsDefault,
        },
      });
  }

  it("requires authentication and rejects empty carts and foreign addresses", async () => {
    const scenario = await createScenario();

    const unauthenticated = await request(app)
      .post("/api/v1/checkout")
      .set("Origin", trustedOrigin)
      .send({ idempotencyKey: randomUUID(), address: { type: "saved", addressId: scenario.addressId } });
    expect(unauthenticated.status).toBe(401);

    const empty = await checkoutRequest(scenario.customerCookie, randomUUID(), scenario.addressId);
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe("EMPTY_CART");

    await addToCart(scenario.customerCookie, scenario.productId, 1).expect(200);
    const foreign = await checkoutRequest(
      scenario.customerCookie,
      randomUUID(),
      scenario.foreignAddressId,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe("ADDRESS_NOT_FOUND");
  });

  it("keeps authenticated cart operations scoped to the logged-in customer", async () => {
    const scenario = await createScenario();
    const added = await addToCart(
      scenario.customerCookie,
      scenario.productId,
      1,
    ).expect(200);
    const itemId = added.body.data.items[0].id as string;

    const customerCart = await request(app)
      .get("/api/v1/cart")
      .set("Cookie", scenario.customerCookie);
    const otherCustomerCart = await request(app)
      .get("/api/v1/cart")
      .set("Cookie", scenario.otherCustomerCookie);

    expect(customerCart.body.data.items).toHaveLength(1);
    expect(customerCart.body.data.items[0].productId).toBe(scenario.productId);
    expect(otherCustomerCart.body.data.items).toEqual([]);

    await request(app)
      .delete(`/api/v1/cart/items/${encodeURIComponent(itemId)}`)
      .set("Cookie", scenario.otherCustomerCookie)
      .set("Origin", trustedOrigin)
      .expect(404);

    expect((await request(app)
      .get("/api/v1/cart")
      .set("Cookie", scenario.customerCookie)).body.data.items).toHaveLength(1);
  }, 30_000);

  it("rejects unconfigured delivery and preserves the cart", async () => {
    const scenario = await createScenario();
    await addToCart(scenario.customerCookie, scenario.productId, 2).expect(200);

    const quote = await request(app)
      .get("/api/v1/checkout/quote")
      .query({ county: "No Configured County", town: "Unknown Town" })
      .set("Cookie", scenario.customerCookie);
    expect(quote.status).toBe(422);
    expect(quote.body.code).toBe("DELIVERY_UNAVAILABLE");

    const result = await request(app)
      .post("/api/v1/checkout")
      .set("Cookie", scenario.customerCookie)
      .set("Origin", trustedOrigin)
      .send({
        idempotencyKey: randomUUID(),
        address: {
          type: "new",
          recipientName: "Checkout Buyer",
          phone: "0712345678",
          county: "No Configured County",
          town: "Unknown Town",
          addressLine: "10 Test Street",
          saveAsDefault: false,
        },
      });
    expect(result.status).toBe(422);
    expect(result.body.code).toBe("DELIVERY_UNAVAILABLE");
    expect(await prisma.cartItem.count({
      where: { cart: { userId: scenario.customerId } },
    })).toBe(1);
    expect(await prisma.order.count({
      where: { userId: scenario.customerId },
    })).toBe(0);
  });

  it("uses server prices, reserves stock, groups seller orders, clears carts and is idempotent", async () => {
    const scenario = await createScenario();
    await addToCart(scenario.customerCookie, scenario.productId, 2).expect(200);

    const quote = await request(app)
      .get("/api/v1/checkout/quote")
      .query({ addressId: scenario.addressId })
      .set("Cookie", scenario.customerCookie);
    expect(quote.status).toBe(200);
    expect(quote.body.data).toMatchObject({
      subtotal: 250,
      deliveryFee: 45,
      grandTotal: 295,
    });

    const idempotencyKey = randomUUID();
    const first = await checkoutRequest(
      scenario.customerCookie,
      idempotencyKey,
      scenario.addressId,
    );
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      subtotal: 250,
      deliveryTotal: 45,
      grandTotal: 295,
      deliveryCounty: scenario.county,
      deliveryTown: scenario.town,
    });
    expect(first.body.data.items).toHaveLength(1);
    expect(first.body.data.sellerOrders).toHaveLength(1);
    createdOrderIds.push(first.body.data.id);

    const second = await checkoutRequest(
      scenario.customerCookie,
      idempotencyKey,
      scenario.addressId,
    );
    expect(second.status).toBe(200);
    expect(second.body.reused).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);

    const scenarioRate = await prisma.deliveryRate.findUniqueOrThrow({
      where: {
        countyKey_townKey: {
          countyKey: scenario.county.toLowerCase(),
          townKey: scenario.town.toLowerCase(),
        },
      },
    });
    await prisma.deliveryRate.update({
      where: { id: scenarioRate.id },
      data: { fee: 95 },
    });
    await addToCart(
      scenario.customerCookie,
      scenario.productId,
      1,
    ).expect(200);
    const updatedQuote = await request(app)
      .get("/api/v1/checkout/quote")
      .query({ addressId: scenario.addressId })
      .set("Cookie", scenario.customerCookie);
    expect(updatedQuote.status).toBe(200);
    expect(updatedQuote.body.data).toMatchObject({
      deliveryFee: 95,
      grandTotal: 220,
    });

    const orderSnapshot = await prisma.order.findUniqueOrThrow({
      where: { id: first.body.data.id },
      select: { deliveryTotal: true, grandTotal: true },
    });
    expect(Number(orderSnapshot.deliveryTotal)).toBe(45);
    expect(Number(orderSnapshot.grandTotal)).toBe(295);
    await prisma.cartItem.deleteMany({
      where: { cart: { userId: scenario.customerId } },
    });

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: scenario.productId },
      select: { reservedQuantity: true },
    });
    expect(product.reservedQuantity).toBe(2);
    expect(await prisma.inventoryReservation.count({
      where: { productId: scenario.productId, status: "ACTIVE" },
    })).toBe(1);
    expect(await prisma.inventoryMovement.count({
      where: { productId: scenario.productId, reason: "RESERVATION" },
    })).toBe(1);
    expect(await prisma.cartItem.count({
      where: { cart: { userId: scenario.customerId } },
    })).toBe(0);

    const orderList = await request(app)
      .get("/api/v1/orders")
      .set("Cookie", scenario.customerCookie);
    expect(orderList.status).toBe(200);
    expect(orderList.body.items).toHaveLength(1);

    const otherList = await request(app)
      .get("/api/v1/orders")
      .set("Cookie", scenario.otherCustomerCookie);
    expect(otherList.status).toBe(200);
    expect(otherList.body.items).toEqual([]);

    const privateOrder = await request(app)
      .get(`/api/v1/orders/${encodeURIComponent(first.body.data.id)}`)
      .set("Cookie", scenario.otherCustomerCookie);
    expect(privateOrder.status).toBe(404);

    await prisma.inventoryReservation.updateMany({
      where: { productId: scenario.productId, status: "ACTIVE" },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect(await releaseExpiredReservations()).toBe(1);
    expect(await prisma.product.findUniqueOrThrow({
      where: { id: scenario.productId },
      select: { reservedQuantity: true },
    })).toMatchObject({ reservedQuantity: 0 });
    expect(await prisma.inventoryMovement.count({
      where: {
        productId: scenario.productId,
        reason: { in: ["RESERVATION", "RESERVATION_RELEASE"] },
      },
    })).toBe(2);
  });

  it("uses configured rates and server prices for multiple products and locations", async () => {
    const scenario = await createScenario();
    const secondCategory = await prisma.category.create({
      data: {
        name: `Second Checkout Category ${randomUUID()}`,
        slug: `second-checkout-category-${randomUUID()}`,
        isActive: true,
      },
      select: { id: true },
    });
    createdCategoryIds.push(secondCategory.id);

    const secondProduct = await prisma.product.create({
      data: {
        storeId: scenario.storeId,
        categoryId: secondCategory.id,
        name: `Second Checkout Product ${randomUUID()}`,
        slug: `second-checkout-product-${randomUUID()}`,
        description: "Second item for controlled checkout coverage.",
        price: 275,
        stockQuantity: 7,
        reservedQuantity: 1,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    createdProductIds.push(secondProduct.id);

    const secondCounty = `Second Test County ${randomUUID()}`;
    const secondTown = `Second Test Town ${randomUUID()}`;
    const secondRate = await prisma.deliveryRate.create({
      data: {
        county: secondCounty,
        countyKey: secondCounty.toLowerCase(),
        town: secondTown,
        townKey: secondTown.toLowerCase(),
        fee: 95,
        isActive: true,
      },
      select: { id: true },
    });
    createdDeliveryRateIds.push(secondRate.id);

    const firstAdd = await addToCart(
      scenario.customerCookie,
      scenario.productId,
      1,
    ).expect(200);
    expect(firstAdd.body.data.subtotal).toBe(125);
    const secondAdd = await addToCart(
      scenario.customerCookie,
      secondProduct.id,
      2,
    ).expect(200);
    expect(secondAdd.body.data.subtotal).toBe(675);

    const options = await request(app)
      .get("/api/v1/checkout/delivery-options")
      .set("Cookie", scenario.customerCookie);
    expect(options.status).toBe(200);
    expect(options.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          county: scenario.county,
          town: scenario.town,
          fee: 45,
        }),
        expect.objectContaining({
          county: secondCounty,
          town: secondTown,
          fee: 95,
        }),
      ]),
    );

    const quote = await request(app)
      .get("/api/v1/checkout/quote")
      .query({ county: secondCounty, town: secondTown })
      .set("Cookie", scenario.customerCookie);
    expect(quote.status).toBe(200);
    expect(quote.body.data).toMatchObject({
      subtotal: 675,
      deliveryFee: 95,
      grandTotal: 770,
      items: expect.arrayContaining([
        expect.objectContaining({
          productId: scenario.productId,
          unitPrice: 125,
          quantity: 1,
        }),
        expect.objectContaining({
          productId: secondProduct.id,
          unitPrice: 275,
          quantity: 2,
        }),
      ]),
    });

    const idempotencyKey = randomUUID();
    const tampered = await request(app)
      .post("/api/v1/checkout")
      .set("Cookie", scenario.customerCookie)
      .set("Origin", trustedOrigin)
      .send({
        idempotencyKey,
        deliveryFee: 0,
        address: {
          type: "new",
          recipientName: "Checkout Buyer",
          phone: "0712345678",
          county: secondCounty,
          town: secondTown,
          addressLine: "20 Second Test Street",
          saveAsDefault: false,
        },
      });
    expect(tampered.status).toBe(400);
    expect(await prisma.order.count({
      where: { userId: scenario.customerId },
    })).toBe(0);
    expect(await prisma.cartItem.count({
      where: { cart: { userId: scenario.customerId } },
    })).toBe(2);

    const placed = await request(app)
      .post("/api/v1/checkout")
      .set("Cookie", scenario.customerCookie)
      .set("Origin", trustedOrigin)
      .send({
        idempotencyKey,
        address: {
          type: "new",
          recipientName: "Checkout Buyer",
          phone: "0712345678",
          county: secondCounty,
          town: secondTown,
          addressLine: "20 Second Test Street",
          saveAsDefault: false,
        },
      });
    expect(placed.status).toBe(201);
    createdOrderIds.push(placed.body.data.id);
    expect(placed.body.data).toMatchObject({
      subtotal: 675,
      deliveryTotal: 95,
      grandTotal: 770,
    });
    expect(placed.body.data.items).toHaveLength(2);
    expect(await prisma.inventoryReservation.count({
      where: {
        orderItem: { orderId: placed.body.data.id },
        status: "ACTIVE",
      },
    })).toBe(2);
    expect(await prisma.cartItem.count({
      where: { cart: { userId: scenario.customerId } },
    })).toBe(0);
  });

  it("does not release an expired reservation for a succeeded payment", async () => {
    const scenario = await createScenario();
    await addToCart(
      scenario.customerCookie,
      scenario.productId,
      2,
    ).expect(200);

    const placed = await checkoutRequest(
      scenario.customerCookie,
      randomUUID(),
      scenario.addressId,
    );
    expect(placed.status).toBe(201);
    createdOrderIds.push(placed.body.data.id);

    await prisma.payment.create({
      data: {
        orderId: placed.body.data.id,
        provider: "MOCK",
        status: "SUCCEEDED",
        amount: 295,
        currency: "KES",
        completedAt: new Date(),
      },
    });
    await prisma.inventoryReservation.updateMany({
      where: {
        orderItem: { orderId: placed.body.data.id },
        status: "ACTIVE",
      },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    expect(await releaseExpiredReservations()).toBe(0);
    expect(await prisma.inventoryReservation.count({
      where: {
        orderItem: { orderId: placed.body.data.id },
        status: "ACTIVE",
      },
    })).toBe(1);
    expect(await prisma.product.findUniqueOrThrow({
      where: { id: scenario.productId },
      select: { reservedQuantity: true },
    })).toMatchObject({ reservedQuantity: 2 });
    expect(await prisma.inventoryMovement.count({
      where: {
        productId: scenario.productId,
        reason: "RESERVATION_RELEASE",
      },
    })).toBe(0);
  });

  it("atomically makes a checkout address the only default when requested", async () => {
    const scenario = await createScenario();
    await addToCart(scenario.customerCookie, scenario.productId, 1).expect(200);

    const result = await checkoutNewAddressRequest(
      scenario.customerCookie,
      randomUUID(),
      scenario,
      true,
    );
    expect(result.status).toBe(201);
    createdOrderIds.push(result.body.data.id);
    const savedAddress = await prisma.address.findFirstOrThrow({
      where: {
        userId: scenario.customerId,
        addressLine: "12 Checkout Avenue",
      },
      select: { id: true },
    });
    createdAddressIds.push(savedAddress.id);

    const addresses = await prisma.address.findMany({
      where: { userId: scenario.customerId },
      select: { id: true, isDefault: true, addressLine: true },
    });
    expect(addresses).toHaveLength(2);
    expect(addresses.filter(({ isDefault }) => isDefault)).toEqual([
      expect.objectContaining({
        isDefault: true,
        addressLine: "12 Checkout Avenue",
      }),
    ]);
    expect(addresses.find(({ id }) => id === scenario.addressId)?.isDefault)
      .toBe(false);
  });

  it("leaves the existing default unchanged when checkout saveAsDefault is false", async () => {
    const scenario = await createScenario();
    await addToCart(scenario.customerCookie, scenario.productId, 1).expect(200);

    const result = await checkoutNewAddressRequest(
      scenario.customerCookie,
      randomUUID(),
      scenario,
      false,
    );
    expect(result.status).toBe(201);
    createdOrderIds.push(result.body.data.id);
    const savedAddress = await prisma.address.findFirstOrThrow({
      where: {
        userId: scenario.customerId,
        addressLine: "12 Checkout Avenue",
      },
      select: { id: true },
    });
    createdAddressIds.push(savedAddress.id);

    const addresses = await prisma.address.findMany({
      where: { userId: scenario.customerId },
      select: { id: true, isDefault: true, addressLine: true },
    });
    expect(addresses.find(({ id }) => id === scenario.addressId)?.isDefault)
      .toBe(true);
    expect(addresses.find(({ addressLine }) =>
      addressLine === "12 Checkout Avenue",
    )?.isDefault).toBe(false);
  });

  it("rolls back and retains the cart when stock becomes insufficient", async () => {
    const scenario = await createScenario(4, 0);
    await addToCart(scenario.customerCookie, scenario.productId, 3).expect(200);
    await prisma.product.update({
      where: { id: scenario.productId },
      data: { reservedQuantity: 2 },
    });

    const result = await checkoutRequest(
      scenario.customerCookie,
      randomUUID(),
      scenario.addressId,
    );
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("INSUFFICIENT_STOCK");
    expect(await prisma.order.count({
      where: { userId: scenario.customerId },
    })).toBe(0);
    expect(await prisma.cartItem.count({
      where: { cart: { userId: scenario.customerId } },
    })).toBe(1);
    expect(await prisma.inventoryReservation.count({
      where: { productId: scenario.productId },
    })).toBe(0);
  });

  it("does not oversell when two customers check out concurrently", async () => {
    const scenario = await createScenario(2, 0);
    await addToCart(scenario.customerCookie, scenario.productId, 2).expect(200);
    await addToCart(scenario.otherCustomerCookie, scenario.productId, 2).expect(200);

    const outcomes = await Promise.all([
      checkoutRequest(scenario.customerCookie, randomUUID(), scenario.addressId),
      checkoutRequest(scenario.otherCustomerCookie, randomUUID(), scenario.foreignAddressId),
    ]);
    const successful = outcomes.filter((response) => response.status === 201);
    const rejected = outcomes.filter((response) => response.status === 409);

    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    createdOrderIds.push(successful[0]!.body.data.id);
    const losingUserId = successful[0]!.body.data.userId === scenario.customerId
      ? scenario.otherCustomerId
      : scenario.customerId;
    expect(await prisma.order.count({ where: { userId: losingUserId } })).toBe(0);
    expect(await prisma.cartItem.count({
      where: { cart: { userId: losingUserId } },
    })).toBe(1);
    expect(await prisma.product.findUniqueOrThrow({
      where: { id: scenario.productId },
      select: { reservedQuantity: true },
    })).toMatchObject({ reservedQuantity: 2 });
  });
});
