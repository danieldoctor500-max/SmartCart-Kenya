import { createHash, randomBytes, randomUUID } from "node:crypto";
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

const password = "SmartCart-Test-Password-2026!";
const email = `auth-test-${randomUUID()}@example.com`;
const trustedOrigin = new URL(env.FRONTEND_URL).origin;
const sessionCookieName = "smartcart_session";

function getSetCookieHeaders(
  headers: string | string[] | undefined,
): string[] {
  if (!headers) {
    return [];
  }

  return typeof headers === "string" ? [headers] : headers;
}

function getSessionToken(
  setCookieHeaders: string | string[] | undefined,
): string {
  const headers = getSetCookieHeaders(setCookieHeaders);
  const cookiePrefix = `${sessionCookieName}=`;

  const cookieHeader = headers.find((header) =>
    header.startsWith(cookiePrefix),
  );

  if (!cookieHeader) {
    throw new Error("Expected session cookie was not found.");
  }

  const rawValue = cookieHeader
    .slice(cookiePrefix.length)
    .split(";")[0];

  if (!rawValue) {
    throw new Error("Session cookie was empty.");
  }

  return decodeURIComponent(rawValue);
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

describe("Authentication API integration tests", () => {
  async function getRegisteredUserCookie(): Promise<string> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true },
    });
    const token = randomBytes(32).toString("base64url");
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    return `${sessionCookieName}=${token}`;
  }

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email },
    });

    await prisma.$disconnect();
  });

  it("registers a customer without exposing the password hash", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", trustedOrigin)
      .send({
        fullName: "SmartCart Test Customer",
        email,
        password,
        phone: "0712345678",
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      success: true,
      message: "If you have an account with this email, you can sign in.",
    });

    const savedUser = await prisma.user.findUnique({
      where: { email },
      select: {
        passwordHash: true,
        roles: {
          select: { role: true },
        },
      },
    });

    expect(savedUser).not.toBeNull();
    expect(savedUser!.passwordHash).not.toBe(password);
    expect(savedUser!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(savedUser!.roles).toContainEqual({ role: "CUSTOMER" });
  });

  it("rejects registration with invalid input", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", trustedOrigin)
      .send({
        fullName: "A",
        email: "not-an-email",
        password: "short",
      });

    expect(response.status).toBe(400);
  });

  it("rejects duplicate email registration", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", trustedOrigin)
      .send({
        fullName: "Duplicate Test Customer",
        email,
        password,
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      success: true,
      message: "If you have an account with this email, you can sign in.",
    });
  });

  it("rejects access to the current-user endpoint without a session", async () => {
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
  });

  it("rejects profile updates without an authenticated session", async () => {
    const response = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", trustedOrigin)
      .send({ fullName: "Unauthenticated Update" });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      message: "Authentication is required.",
    });
  });

  it("updates the authenticated customer's full name and returns only safe profile fields", async () => {
    const cookie = await getRegisteredUserCookie();
    const response = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", trustedOrigin)
      .set("Cookie", cookie)
      .send({ fullName: "Updated Test Customer" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user).toMatchObject({
      fullName: "Updated Test Customer",
      email,
      phone: "0712345678",
      roles: [{ role: "CUSTOMER" }],
    });
    for (const field of [
      "passwordHash",
      "password",
      "token",
      "tokenHash",
      "session",
      "sessionId",
      "userAgent",
      "ipAddress",
    ]) {
      expect(response.body.data.user).not.toHaveProperty(field);
    }

    const savedUser = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { fullName: true, phone: true },
    });
    expect(savedUser).toEqual({
      fullName: "Updated Test Customer",
      phone: "0712345678",
    });
  });

  it("updates phone partially while preserving the name and accepts clearing the phone", async () => {
    const cookie = await getRegisteredUserCookie();
    const phoneResponse = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", trustedOrigin)
      .set("Cookie", cookie)
      .send({ phone: "0722222222" });

    expect(phoneResponse.status).toBe(200);
    expect(phoneResponse.body.data.user).toMatchObject({
      fullName: "Updated Test Customer",
      phone: "0722222222",
    });

    const clearPhoneResponse = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", trustedOrigin)
      .set("Cookie", cookie)
      .send({ phone: null });
    expect(clearPhoneResponse.status).toBe(200);
    expect(clearPhoneResponse.body.data.user.phone).toBeNull();
    expect(clearPhoneResponse.body.data.user.fullName).toBe("Updated Test Customer");
  });

  it("rejects empty or invalid profile updates", async () => {
    const cookie = await getRegisteredUserCookie();
    const empty = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", trustedOrigin)
      .set("Cookie", cookie)
      .send({});
    expect(empty.status).toBe(400);

    const shortName = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", trustedOrigin)
      .set("Cookie", cookie)
      .send({ fullName: "A" });
    expect(shortName.status).toBe(400);

    const shortPhone = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", trustedOrigin)
      .set("Cookie", cookie)
      .send({ phone: "123" });
    expect(shortPhone.status).toBe(400);
  });

  it("rejects protected, unknown, and supplied identity fields without modifying the profile", async () => {
    const cookie = await getRegisteredUserCookie();
    const protectedFields = [
      "email",
      "role",
      "status",
      "passwordHash",
      "password",
      "session",
      "sessionId",
      "userId",
      "unknownField",
    ];

    for (const field of protectedFields) {
      const body = {
        fullName: "Should Not Be Saved",
        [field]: "attacker-controlled",
      };
      const response = await request(app)
        .patch("/api/v1/auth/me")
        .set("Origin", trustedOrigin)
        .set("Cookie", cookie)
        .send(body);

      expect(response.status, `field ${field} must be rejected`).toBe(400);
    }

    const unchanged = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { fullName: true, phone: true },
    });
    expect(unchanged).toEqual({
      fullName: "Updated Test Customer",
      phone: null,
    });
  });

  it("requires the trusted origin for profile mutations", async () => {
    const cookie = await getRegisteredUserCookie();
    const response = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", "https://untrusted.example")
      .set("Cookie", cookie)
      .send({ fullName: "Untrusted Update" });

    expect(response.status).toBe(403);
  });

  it("logs in, validates the session, and logs out", async () => {
    const agent = request.agent(app);
    const guestSessionId = randomUUID().replaceAll("-", "");

    // Create a guest cart before login to verify the authentication merge.
    const guestCart = await prisma.cart.create({
      data: {
        guestSessionId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });

    const loginResponse = await agent
      .post("/api/v1/auth/login")
      .set("Origin", trustedOrigin)
      .set("Cookie", `smartcart_guest=${guestSessionId}`)
      .send({ email, password });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.success).toBe(true);
    expect(loginResponse.body.data.user.email).toBe(email);
    expect(loginResponse.body.data.cartMerge).toMatchObject({
      mergedItemCount: 0,
      adjustments: [],
      unavailableItems: [],
      expired: false,
    });

    const guestCookieClearingHeader = getSetCookieHeaders(
      loginResponse.headers["set-cookie"],
    ).find((header) => header.startsWith("smartcart_guest="));

    expect(guestCookieClearingHeader).toBeDefined();
    expect(guestCookieClearingHeader).toContain("Expires=");
    expect(guestCookieClearingHeader).toContain("HttpOnly");

    const removedGuestCart = await prisma.cart.findUnique({
      where: { id: guestCart.id },
    });
    expect(removedGuestCart).toBeNull();

    const setCookie = getSetCookieHeaders(
      loginResponse.headers["set-cookie"],
    );

    expect(setCookie.length).toBeGreaterThan(0);

    const sessionCookie = setCookie.find((header) =>
      header.startsWith(`${sessionCookieName}=`),
    );

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(sessionCookie).toContain("Path=/");

    if (process.env.NODE_ENV !== "production") {
      expect(sessionCookie).not.toContain("; Secure");
    }

    const currentUserResponse = await agent.get("/api/v1/auth/me");

    expect(currentUserResponse.status).toBe(200);
    expect(currentUserResponse.body.data.user.email).toBe(email);

    const logoutResponse = await agent
      .post("/api/v1/auth/logout")
      .set("Origin", trustedOrigin);

    expect(logoutResponse.status).toBe(200);

    const logoutCookies = getSetCookieHeaders(
      logoutResponse.headers["set-cookie"],
    );

    expect(
      logoutCookies.some((header) =>
        header.startsWith("smartcart_session="),
      ),
    ).toBe(true);

    expect(
      logoutCookies.some((header) =>
        header.startsWith("smartcart_guest="),
      ),
    ).toBe(true);

    const afterLogoutResponse = await agent.get("/api/v1/auth/me");

    expect(afterLogoutResponse.status).toBe(401);
  });

  it("transfers real guest-cart items into the account during login", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const guestSessionId = randomUUID().replaceAll("-", "");

    let sellerUserId = "";
    let sellerProfileId = "";
    let categoryId = "";
    let storeId = "";
    let productId = "";
    let guestCartId = "";
    let accountCartId = "";
    let accountUserId = "";

    try {
      const seller = await prisma.user.create({
        data: {
          fullName: "Auth Cart Test Seller",
          email: `auth-cart-seller-${suffix}@example.com`,
          passwordHash: "not-used-for-login",
        },
        select: { id: true },
      });
      sellerUserId = seller.id;

      const category = await prisma.category.create({
        data: {
          name: `Auth Cart Category ${suffix}`,
          slug: `auth-cart-category-${suffix}`,
          isActive: true,
        },
        select: { id: true },
      });
      categoryId = category.id;

      const profile = await prisma.sellerProfile.create({
        data: {
          userId: sellerUserId,
          businessName: `Auth Cart Business ${suffix}`,
          applicationStatus: "APPROVED",
          phone: "0712345678",
          email: `auth-cart-business-${suffix}@example.com`,
        },
        select: { id: true },
      });
      sellerProfileId = profile.id;

      const store = await prisma.store.create({
        data: {
          sellerProfileId,
          name: `Auth Cart Store ${suffix}`,
          slug: `auth-cart-store-${suffix}`,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      storeId = store.id;

      const product = await prisma.product.create({
        data: {
          storeId,
          categoryId,
          name: `Auth Cart Product ${suffix}`,
          slug: `auth-cart-product-${suffix}`,
          description: "Product used by the login cart-merge integration test.",
          price: 500,
          stockQuantity: 10,
          reservedQuantity: 2,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      productId = product.id;

      const customer = await prisma.user.findUniqueOrThrow({
        where: { email },
        select: { id: true },
      });
      accountUserId = customer.id;

      const existingAccountCart = await prisma.cart.findUnique({
        where: { userId: accountUserId },
        select: { id: true },
      });

      if (existingAccountCart) {
        accountCartId = existingAccountCart.id;
        await prisma.cartItem.create({
          data: {
            cartId: accountCartId,
            productId,
            quantity: 2,
          },
        });
      } else {
        const accountCart = await prisma.cart.create({
          data: {
            userId: accountUserId,
            items: {
              create: {
                productId,
                quantity: 2,
              },
            },
          },
          select: { id: true },
        });
        accountCartId = accountCart.id;
      }

      const guestCart = await prisma.cart.create({
        data: {
          guestSessionId,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          items: {
            create: {
              productId,
              quantity: 3,
            },
          },
        },
        select: { id: true },
      });
      guestCartId = guestCart.id;

      const agent = request.agent(app);
      const loginResponse = await agent
        .post("/api/v1/auth/login")
        .set("Origin", trustedOrigin)
        .set("Cookie", `smartcart_guest=${guestSessionId}`)
        .send({ email, password });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.data.cartMerge).toMatchObject({
        mergedItemCount: 1,
        adjustments: [],
        unavailableItems: [],
        expired: false,
      });

      const customerAfterLogin = await prisma.user.findUniqueOrThrow({
        where: { email },
        select: { id: true },
      });

      const accountCartAfterLogin = await prisma.cart.findUnique({
        where: { userId: customerAfterLogin.id },
        include: { items: true },
      });

      expect(accountCartAfterLogin).not.toBeNull();
      expect(accountCartAfterLogin!.id).toBe(accountCartId);
      expect(accountCartAfterLogin!.items).toHaveLength(1);
      expect(accountCartAfterLogin!.items[0]).toMatchObject({
        productId,
        quantity: 5,
      });

      const authenticatedCartResponse = await agent.get(
        "/api/v1/cart",
      );

      expect(authenticatedCartResponse.status).toBe(200);
      expect(authenticatedCartResponse.body.data.id).toBe(
        accountCartId,
      );
      expect(
        authenticatedCartResponse.body.data.items,
      ).toHaveLength(1);
      expect(
        authenticatedCartResponse.body.data.items[0],
      ).toMatchObject({
        productId,
        quantity: 5,
      });

      const remainingGuestCart = await prisma.cart.findUnique({
        where: { id: guestCartId },
      });
      expect(remainingGuestCart).toBeNull();
    } finally {
      if (guestCartId) {
        await prisma.cart.deleteMany({
          where: { id: guestCartId },
        });
      }

      if (accountCartId) {
        await prisma.cart.deleteMany({
          where: { id: accountCartId },
        });
      }

      if (productId) {
        await prisma.cartItem.deleteMany({
          where: { productId },
        });

        await prisma.product.deleteMany({
          where: { id: productId },
        });
      }

      if (storeId) {
        await prisma.store.deleteMany({
          where: { id: storeId },
        });
      }

      if (sellerProfileId) {
        await prisma.sellerProfile.deleteMany({
          where: { id: sellerProfileId },
        });
      }

      if (categoryId) {
        await prisma.category.deleteMany({
          where: { id: categoryId },
        });
      }

      if (sellerUserId) {
        await prisma.user.deleteMany({
          where: { id: sellerUserId },
        });
      }
    }
  });

  it("rejects an incorrect password", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", trustedOrigin)
      .send({
        email,
        password: "Incorrect-Test-Password-2026!",
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("rejects login requests without an Origin header", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("rejects login requests from an untrusted origin", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "https://untrusted.example")
      .send({ email, password });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("rejects registration requests from an untrusted origin", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", "https://untrusted.example")
      .send({
        fullName: "Untrusted Test Customer",
        email: `untrusted-${randomUUID()}@example.com`,
        password,
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("rejects logout requests without an Origin header", async () => {
    const response = await request(app)
      .post("/api/v1/auth/logout");

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("rejects an expired session and deletes it", async () => {
    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", trustedOrigin)
      .send({ email, password });

    expect(loginResponse.status).toBe(200);

    const token = getSessionToken(
      loginResponse.headers["set-cookie"],
    );

    const tokenHash = hashSessionToken(token);

    const session = await prisma.session.findUnique({
      where: { tokenHash },
    });

    expect(session).not.toBeNull();

    await prisma.session.update({
      where: { id: session!.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", `${sessionCookieName}=${token}`);

    expect(response.status).toBe(401);

    const remainingSession = await prisma.session.findUnique({
      where: { id: session!.id },
    });

    expect(remainingSession).toBeNull();
  });

  it.each(["SUSPENDED", "DEACTIVATED"] as const)(
    "rejects an existing session for a %s account and deletes it",
    async (status) => {
      const loginResponse = await request(app)
        .post("/api/v1/auth/login")
        .set("Origin", trustedOrigin)
        .send({ email, password });

      expect(loginResponse.status).toBe(200);

      const token = getSessionToken(
        loginResponse.headers["set-cookie"],
      );

      const tokenHash = hashSessionToken(token);

      const session = await prisma.session.findUnique({
        where: { tokenHash },
      });

      expect(session).not.toBeNull();

      try {
        await prisma.user.update({
          where: { email },
          data: { status },
        });

        const response = await request(app)
          .get("/api/v1/auth/me")
          .set("Cookie", `${sessionCookieName}=${token}`);

        expect(response.status).toBe(401);

        const remainingSession = await prisma.session.findUnique({
          where: { id: session!.id },
        });

        expect(remainingSession).toBeNull();
      } finally {
        await prisma.user.update({
          where: { email },
          data: { status: "ACTIVE" },
        });
      }
    },
  );

  it.each(["SUSPENDED", "DEACTIVATED"] as const)(
    "rejects login for a %s account",
    async (status) => {
      try {
        await prisma.user.update({
          where: { email },
          data: { status },
        });

        const response = await request(app)
          .post("/api/v1/auth/login")
          .set("Origin", trustedOrigin)
          .send({ email, password });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      } finally {
        await prisma.user.update({
          where: { email },
          data: { status: "ACTIVE" },
        });
      }
    },
  );
});
