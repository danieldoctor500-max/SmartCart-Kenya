import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/database.js";

const GUEST_CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const publicProductWhere = {
  status: "ACTIVE",
  store: {
    status: "ACTIVE",
    sellerProfile: {
      applicationStatus: "APPROVED",
      user: {
        status: "ACTIVE",
      },
    },
  },
  category: {
    isActive: true,
  },
} satisfies Prisma.ProductWhereInput;

const cartInclude = {
  items: {
    orderBy: {
      createdAt: "asc",
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          currency: true,
          stockQuantity: true,
          reservedQuantity: true,
          status: true,
          category: {
            select: {
              isActive: true,
            },
          },
          store: {
            select: {
              name: true,
              slug: true,
              status: true,
              sellerProfile: {
                select: {
                  applicationStatus: true,
                  user: {
                    select: {
                      status: true,
                    },
                  },
                },
              },
            },
          },
          images: {
            orderBy: {
              sortOrder: "asc",
            },
            take: 1,
            select: {
              imageUrl: true,
              altText: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CartIdentity =
  | { kind: "user"; userId: string }
  | { kind: "guest"; guestSessionId: string };

export class CartServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_IDENTITY"
      | "PRODUCT_UNAVAILABLE"
      | "INSUFFICIENT_STOCK"
      | "CART_ITEM_NOT_FOUND"
      | "INVALID_CART_STATE",
  ) {
    super(message);
    this.name = "CartServiceError";
  }
}

function assertIdentity(identity: CartIdentity): void {
  if (
    identity.kind === "user" &&
    !identity.userId.trim()
  ) {
    throw new CartServiceError(
      "A valid user identity is required.",
      "INVALID_IDENTITY",
    );
  }

  if (
    identity.kind === "guest" &&
    !identity.guestSessionId.trim()
  ) {
    throw new CartServiceError(
      "A valid guest session is required.",
      "INVALID_IDENTITY",
    );
  }
}

function guestExpiry(): Date {
  return new Date(Date.now() + GUEST_CART_TTL_MS);
}

function serializeCart<
  T extends {
    id: string;
    userId: string | null;
    guestSessionId: string | null;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    items: Array<{
      id: string;
      productId: string;
      quantity: number;
      product: {
        id: string;
        name: string;
        slug: string;
        price: Prisma.Decimal;
        currency: string;
        stockQuantity: number;
        reservedQuantity: number;
        status: string;
        category: { isActive: boolean };
        store: {
          name: string;
          slug: string;
          status: string;
          sellerProfile: {
            applicationStatus: string;
            user: { status: string };
          };
        };
        images: Array<{
          imageUrl: string;
          altText: string | null;
        }>;
      };
    }>;
  },
>(cart: T) {
  const items = cart.items.map((item) => {
    const availableQuantity = Math.max(
      0,
      item.product.stockQuantity -
        item.product.reservedQuantity,
    );

    const productAvailable =
      item.product.status === "ACTIVE" &&
      item.product.category.isActive &&
      item.product.store.status === "ACTIVE" &&
      item.product.store.sellerProfile.applicationStatus ===
        "APPROVED" &&
      item.product.store.sellerProfile.user.status ===
        "ACTIVE";

    return {
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: Number(item.product.price),
      currency: item.product.currency,
      subtotal: Number(
        (
          Number(item.product.price) * item.quantity
        ).toFixed(2),
      ),
      availableQuantity,
      productAvailable,
      needsReview:
        !productAvailable ||
        item.quantity > availableQuantity,
      product: {
        id: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        image: item.product.images[0] ?? null,
        store: item.product.store.name,
        storeSlug: item.product.store.slug,
      },
    };
  });

  const total = Number(
    items
      .reduce((sum, item) => sum + item.subtotal, 0)
      .toFixed(2),
  );

  return {
    id: cart.id,
    currency: "KES",
    itemCount: items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    ),
    subtotal: total,
    total,
    items,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
}

async function resolveCart(
  identity: CartIdentity,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  assertIdentity(identity);

  if (identity.kind === "guest") {
    await tx.cart.deleteMany({
      where: {
        guestSessionId: identity.guestSessionId,
        expiresAt: { lte: new Date() },
      },
    });

    return tx.cart.upsert({
      where: { guestSessionId: identity.guestSessionId },
      create: {
        guestSessionId: identity.guestSessionId,
        expiresAt: guestExpiry(),
      },
      update: {
        expiresAt: guestExpiry(),
      },
      include: cartInclude,
    });
  }

  return tx.cart.upsert({
    where: { userId: identity.userId },
    create: { userId: identity.userId },
    update: {},
    include: cartInclude,
  });
}

export async function getCart(identity: CartIdentity) {
  const cart = await resolveCart(identity);
  return serializeCart(cart);
}

export async function addCartItem(
  identity: CartIdentity,
  productId: string,
  quantity: number,
) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: {
        ...publicProductWhere,
        id: productId,
      },
      select: {
        id: true,
        stockQuantity: true,
        reservedQuantity: true,
      },
    });

    if (!product) {
      throw new CartServiceError(
        "This product is unavailable.",
        "PRODUCT_UNAVAILABLE",
      );
    }

    const availableQuantity = Math.max(
      0,
      product.stockQuantity - product.reservedQuantity,
    );

    if (availableQuantity < 1) {
      throw new CartServiceError(
        "This product is currently out of stock.",
        "INSUFFICIENT_STOCK",
      );
    }

    const cart = await resolveCart(identity, tx);
    const existing = cart.items.find(
      (item) => item.productId === productId,
    );

    const requestedQuantity =
      (existing?.quantity ?? 0) + quantity;

    if (requestedQuantity > availableQuantity) {
      throw new CartServiceError(
        `Only ${availableQuantity} unit(s) are currently available.`,
        "INSUFFICIENT_STOCK",
      );
    }

    if (existing) {
      await tx.cartItem.update({
        where: { id: existing.id },
        data: { quantity: requestedQuantity },
      });
    } else {
      await tx.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          quantity,
        },
      });
    }

    const updated = await tx.cart.findUniqueOrThrow({
      where: { id: cart.id },
      include: cartInclude,
    });

    return serializeCart(updated);
  });
}

export async function updateCartItem(
  identity: CartIdentity,
  cartItemId: string,
  quantity: number,
) {
  return prisma.$transaction(async (tx) => {
    const cart = await resolveCart(identity, tx);

    const item = cart.items.find(
      (candidate) => candidate.id === cartItemId,
    );

    if (!item) {
      throw new CartServiceError(
        "This item was not found in your cart.",
        "CART_ITEM_NOT_FOUND",
      );
    }

    const availableQuantity = Math.max(
      0,
      item.product.stockQuantity -
        item.product.reservedQuantity,
    );

    const productAvailable =
      item.product.status === "ACTIVE" &&
      item.product.category.isActive &&
      item.product.store.status === "ACTIVE" &&
      item.product.store.sellerProfile.applicationStatus ===
        "APPROVED" &&
      item.product.store.sellerProfile.user.status ===
        "ACTIVE";

    if (!productAvailable) {
      throw new CartServiceError(
        "This product is no longer available.",
        "PRODUCT_UNAVAILABLE",
      );
    }

    if (quantity > availableQuantity) {
      throw new CartServiceError(
        `Only ${availableQuantity} unit(s) are currently available.`,
        "INSUFFICIENT_STOCK",
      );
    }

    await tx.cartItem.update({
      where: { id: item.id },
      data: { quantity },
    });

    const updated = await tx.cart.findUniqueOrThrow({
      where: { id: cart.id },
      include: cartInclude,
    });

    return serializeCart(updated);
  });
}

export async function removeCartItem(
  identity: CartIdentity,
  cartItemId: string,
) {
  return prisma.$transaction(async (tx) => {
    const cart = await resolveCart(identity, tx);

    const item = cart.items.find(
      (candidate) => candidate.id === cartItemId,
    );

    if (!item) {
      throw new CartServiceError(
        "This item was not found in your cart.",
        "CART_ITEM_NOT_FOUND",
      );
    }

    await tx.cartItem.delete({
      where: { id: item.id },
    });

    const updated = await tx.cart.findUniqueOrThrow({
      where: { id: cart.id },
      include: cartInclude,
    });

    return serializeCart(updated);
  });
}

export async function clearCart(identity: CartIdentity) {
  return prisma.$transaction(async (tx) => {
    const cart = await resolveCart(identity, tx);

    await tx.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    const updated = await tx.cart.findUniqueOrThrow({
      where: { id: cart.id },
      include: cartInclude,
    });

    return serializeCart(updated);
  });
}

export async function deleteExpiredGuestCarts() {
  const result = await prisma.cart.deleteMany({
    where: {
      userId: null,
      guestSessionId: { not: null },
      expiresAt: { lte: new Date() },
    },
  });

  return { deletedCount: result.count };
}

export type GuestCartMergeResult = {
  mergedItemCount: number;
  adjustments: Array<{
    productId: string;
    productName: string;
    requestedQuantity: number;
    mergedQuantity: number;
    reason: string;
  }>;
  unavailableItems: Array<{
    productId: string;
    productName: string;
    quantity: number;
    reason: string;
  }>;
  expired: boolean;
};

/**
 * Merge a guest cart into an authenticated customer's cart.
 * Quantities are capped at current available stock.
 * Guest-cart deletion occurs only after all merge operations succeed.
 */
export async function mergeGuestCart(
  userId: string,
  guestSessionId: string,
): Promise<GuestCartMergeResult> {
  if (!userId.trim() || !guestSessionId.trim()) {
    throw new CartServiceError(
      "A valid user and guest identity are required.",
      "INVALID_IDENTITY",
    );
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();

    const guestCart = await tx.cart.findUnique({
      where: { guestSessionId },
      include: cartInclude,
    });

    const result: GuestCartMergeResult = {
      mergedItemCount: 0,
      adjustments: [],
      unavailableItems: [],
      expired: false,
    };

    if (!guestCart) {
      return result;
    }

    if (
      guestCart.userId !== null ||
      !guestCart.expiresAt ||
      guestCart.expiresAt <= now
    ) {
      if (
        guestCart.userId === null &&
        guestCart.expiresAt &&
        guestCart.expiresAt <= now
      ) {
        await tx.cart.delete({
          where: { id: guestCart.id },
        });
        result.expired = true;
      }

      return result;
    }

    const userCart = await resolveCart(
      { kind: "user", userId },
      tx,
    );

    for (const guestItem of guestCart.items) {
      const product = guestItem.product;
      const availableQuantity = Math.max(
        0,
        product.stockQuantity - product.reservedQuantity,
      );

      const productAvailable =
        product.status === "ACTIVE" &&
        product.category.isActive &&
        product.store.status === "ACTIVE" &&
        product.store.sellerProfile.applicationStatus ===
          "APPROVED" &&
        product.store.sellerProfile.user.status === "ACTIVE";

      if (!productAvailable || availableQuantity < 1) {
        result.unavailableItems.push({
          productId: guestItem.productId,
          productName: product.name,
          quantity: guestItem.quantity,
          reason: !productAvailable
            ? "The product or seller is no longer available."
            : "The product is out of stock.",
        });
        continue;
      }

      const existing = await tx.cartItem.findUnique({
        where: {
          cartId_productId: {
            cartId: userCart.id,
            productId: guestItem.productId,
          },
        },
      });

      const existingQuantity = existing?.quantity ?? 0;
      const requestedQuantity =
        existingQuantity + guestItem.quantity;
      const mergedQuantity = Math.min(
        requestedQuantity,
        availableQuantity,
      );

      if (mergedQuantity > existingQuantity) {
        if (existing) {
          await tx.cartItem.update({
            where: { id: existing.id },
            data: { quantity: mergedQuantity },
          });
        } else {
          await tx.cartItem.create({
            data: {
              cartId: userCart.id,
              productId: guestItem.productId,
              quantity: mergedQuantity,
            },
          });
        }

        result.mergedItemCount += 1;
      }

      if (mergedQuantity < requestedQuantity) {
        result.adjustments.push({
          productId: guestItem.productId,
          productName: product.name,
          requestedQuantity,
          mergedQuantity,
          reason:
            "The quantity was capped at currently available stock.",
        });
      }
    }

    await tx.cart.delete({
      where: { id: guestCart.id },
    });

    return result;
  });
}
