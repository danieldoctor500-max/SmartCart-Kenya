import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import type { Prisma as PrismaNamespace } from "../../generated/prisma/client.js";
import { prisma } from "../../config/database.js";
import {
  DeliveryRateError,
  findActiveDeliveryRate,
  listActiveDeliveryOptions,
} from "../delivery-rates/delivery-rates.service.js";
import {
  DEFAULT_ADDRESS_INDEX_NAME,
  makeCustomerAddressDefault,
} from "../account/address-default.service.js";
import {
  orderInclude,
  serializeOrder,
} from "../orders/orders.service.js";
import type {
  CheckoutAddressInput,
  CheckoutQuoteQuery,
  CreateCheckoutInput,
} from "./checkout.schemas.js";

const RESERVATION_MINUTES = 30;
const PRODUCT_SELECT = {
  id: true,
  storeId: true,
  name: true,
  price: true,
  stockQuantity: true,
  reservedQuantity: true,
  status: true,
  category: { select: { isActive: true } },
  store: {
    select: {
      status: true,
      sellerProfile: {
        select: {
          applicationStatus: true,
          user: { select: { status: true } },
        },
      },
    },
  },
} satisfies Prisma.ProductSelect;

type CartWithProducts = PrismaNamespace.CartGetPayload<{
  include: {
    items: {
      include: { product: { select: typeof PRODUCT_SELECT } };
    };
  };
}>;

type CheckoutTx = PrismaNamespace.TransactionClient;

async function requireDeliveryRate(
  county: string,
  town: string,
  client: CheckoutTx | typeof prisma = prisma,
) {
  try {
    return await findActiveDeliveryRate(county, town, client);
  } catch (error) {
    if (error instanceof DeliveryRateError) {
      throw new CheckoutError(
        "Delivery is not configured for this county and town.",
        422,
        "DELIVERY_UNAVAILABLE",
      );
    }
    throw error;
  }
}

export class CheckoutError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

function isPubliclyAvailableProduct(product: CartWithProducts["items"][number]["product"]) {
  return (
    product.status === "ACTIVE" &&
    product.category.isActive &&
    product.store.status === "ACTIVE" &&
    product.store.sellerProfile.applicationStatus === "APPROVED" &&
    product.store.sellerProfile.user.status === "ACTIVE"
  );
}

function isDefaultAddressUniqueConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  return (
    target === DEFAULT_ADDRESS_INDEX_NAME ||
    (Array.isArray(target) && target.includes("userId"))
  );
}

async function loadCart(client: CheckoutTx | typeof prisma, userId: string) {
  return client.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: { select: PRODUCT_SELECT },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

async function resolveAddress(
  client: CheckoutTx | typeof prisma,
  userId: string,
  address: CheckoutAddressInput,
) {
  if (address.type === "saved") {
    const saved = await client.address.findFirst({
      where: { id: address.addressId, userId },
    });
    if (!saved) {
      throw new CheckoutError("Delivery address not found.", 404, "ADDRESS_NOT_FOUND");
    }

    return {
      addressId: saved.id,
      recipientName: saved.recipientName,
      phone: saved.phone,
      county: saved.county,
      town: saved.town,
      addressLine: saved.addressLine,
      deliveryInstructions: saved.deliveryInstructions,
      saveAsDefault: false,
    };
  }

  return {
    addressId: null,
    recipientName: address.recipientName,
    phone: address.phone,
    county: address.county,
    town: address.town,
    addressLine: address.addressLine,
    deliveryInstructions: address.deliveryInstructions ?? null,
    saveAsDefault: address.saveAsDefault,
  };
}

async function calculateQuote(
  cart: CartWithProducts | null,
  county: string,
  town: string,
  client: CheckoutTx | typeof prisma = prisma,
) {
  if (!cart || cart.items.length === 0) {
    throw new CheckoutError("Your cart is empty.", 400, "EMPTY_CART");
  }

  let subtotal = new Prisma.Decimal(0);
  const items = cart.items.map((item) => {
    const product = item.product;
    if (!isPubliclyAvailableProduct(product)) {
      throw new CheckoutError(
        `${product.name} is no longer available for purchase.`,
        409,
        "PRODUCT_UNAVAILABLE",
      );
    }

    const available = product.stockQuantity - product.reservedQuantity;
    if (available < item.quantity) {
      throw new CheckoutError(
        `${product.name} has insufficient available stock.`,
        409,
        "INSUFFICIENT_STOCK",
      );
    }

    const lineTotal = product.price.mul(item.quantity);
    subtotal = subtotal.add(lineTotal);
    return {
      productId: product.id,
      name: product.name,
      unitPrice: Number(product.price),
      quantity: item.quantity,
      lineTotal: Number(lineTotal),
      availableStock: available,
      currency: "KES",
    };
  });

  const rate = await requireDeliveryRate(county, town, client);

  const grandTotal = subtotal.add(rate.fee);
  return {
    items,
    subtotal: Number(subtotal),
    deliveryFee: Number(rate.fee),
    grandTotal: Number(grandTotal),
    currency: "KES",
    delivery: {
      county: rate.county,
      town: rate.town,
    },
  };
}

export async function listCheckoutAddresses(userId: string) {
  const addresses = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return addresses;
}

export async function getCheckoutDeliveryOptions() {
  return listActiveDeliveryOptions();
}

export async function getCheckoutQuote(
  userId: string,
  query: CheckoutQuoteQuery,
) {
  let county: string;
  let town: string;

  if ("addressId" in query) {
    const address = await prisma.address.findFirst({
      where: { id: query.addressId, userId },
      select: { county: true, town: true },
    });
    if (!address) {
      throw new CheckoutError("Delivery address not found.", 404, "ADDRESS_NOT_FOUND");
    }
    county = address.county;
    town = address.town;
  } else {
    county = query.county;
    town = query.town;
  }

  const cart = await loadCart(prisma, userId);
  return calculateQuote(cart, county, town);
}

async function findExistingOrder(
  client: CheckoutTx | typeof prisma,
  userId: string,
  idempotencyKey: string,
) {
  return client.order.findUnique({
    where: {
      userId_idempotencyKey: { userId, idempotencyKey },
    },
    include: orderInclude,
  });
}

async function lockCart(client: CheckoutTx, cartId: string) {
  await client.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "carts" WHERE "id" = ${cartId} FOR UPDATE`,
  );
}

async function createOrderTransaction(
  userId: string,
  input: CreateCheckoutInput,
) {
  return prisma.$transaction(
    async (tx) => {
      const priorOrder = await findExistingOrder(
        tx,
        userId,
        input.idempotencyKey,
      );
      if (priorOrder) {
        return { order: serializeOrder(priorOrder), reused: true };
      }

      const cart = await loadCart(tx, userId);
      if (!cart) {
        throw new CheckoutError("Your cart is empty.", 400, "EMPTY_CART");
      }

      await lockCart(tx, cart.id);
      const afterLockOrder = await findExistingOrder(
        tx,
        userId,
        input.idempotencyKey,
      );
      if (afterLockOrder) {
        return { order: serializeOrder(afterLockOrder), reused: true };
      }

      const lockedCart = await loadCart(tx, userId);
      const address = await resolveAddress(tx, userId, input.address);
      if (!lockedCart || lockedCart.items.length === 0) {
        throw new CheckoutError("Your cart is empty.", 400, "EMPTY_CART");
      }
      await calculateQuote(
        lockedCart,
        address.county,
        address.town,
        tx,
      );
      const rate = await requireDeliveryRate(address.county, address.town, tx);
      const subtotal = lockedCart.items.reduce(
        (sum, item) =>
          sum.add(item.product.price.mul(item.quantity)),
        new Prisma.Decimal(0),
      );
      const grandTotal = subtotal.add(rate.fee);

      const now = new Date();
      const reservationExpiresAt = new Date(
        now.getTime() + RESERVATION_MINUTES * 60 * 1000,
      );

      if (input.address.type === "new") {
        const newAddress = await tx.address.create({
          data: {
            userId,
            recipientName: address.recipientName,
            phone: address.phone,
            county: address.county,
            town: address.town,
            addressLine: address.addressLine,
            deliveryInstructions: address.deliveryInstructions,
            isDefault: false,
          },
        });
        if (address.saveAsDefault) {
          await makeCustomerAddressDefault(tx, userId, newAddress.id);
        }
        address.addressId = newAddress.id;
      }
      if (!address.addressId) {
        throw new CheckoutError(
          "A delivery address is required.",
          400,
          "ADDRESS_REQUIRED",
        );
      }

      const orderNumber = `SC-${now.getTime()}-${randomUUID()
        .replaceAll("-", "")
        .slice(0, 8)
        .toUpperCase()}`;
      const order = await tx.order.create({
        data: {
          userId,
          orderNumber,
          idempotencyKey: input.idempotencyKey,
          addressId: address.addressId,
          status: "PENDING_PAYMENT",
          subtotal,
          deliveryTotal: rate.fee,
          grandTotal,
          deliveryRecipientName: address.recipientName,
          deliveryPhone: address.phone,
          deliveryCounty: address.county,
          deliveryTown: address.town,
          deliveryAddressLine: address.addressLine,
          deliveryInstructions: address.deliveryInstructions,
          items: {
            create: lockedCart.items.map((item) => ({
              productId: item.productId,
              storeId: item.product.storeId,
              productNameSnapshot: item.product.name,
              unitPrice: item.product.price,
              quantity: item.quantity,
              lineTotal: item.product.price.mul(item.quantity),
            })),
          },
        },
        include: { items: true },
      });

      const itemsByStore = new Map<string, typeof order.items>();
      const cartItemsByProductId = new Map(
        lockedCart.items.map((item) => [item.productId, item]),
      );
      for (const orderItem of order.items) {
        const cartItem = cartItemsByProductId.get(orderItem.productId);
        if (!cartItem) {
          throw new CheckoutError(
            "The cart changed while your order was being prepared.",
            409,
            "CART_CHANGED",
          );
        }

        const group = itemsByStore.get(orderItem.storeId) ?? [];
        group.push(orderItem);
        itemsByStore.set(orderItem.storeId, group);

        const product = cartItem.product;
        const available = product.stockQuantity - product.reservedQuantity;
        if (available < cartItem.quantity) {
          throw new CheckoutError(
            `${product.name} has insufficient available stock.`,
            409,
            "INSUFFICIENT_STOCK",
          );
        }

        const updated = await tx.product.updateMany({
          where: {
            id: product.id,
            stockQuantity: product.stockQuantity,
            reservedQuantity: product.reservedQuantity,
            status: "ACTIVE",
          },
          data: { reservedQuantity: { increment: cartItem.quantity } },
        });
        if (updated.count !== 1) {
          throw new CheckoutError(
            `${product.name} stock changed. Please review your cart and try again.`,
            409,
            "STOCK_CHANGED",
          );
        }

        const reservation = await tx.inventoryReservation.create({
          data: {
            orderItemId: orderItem.id,
            productId: product.id,
            quantity: cartItem.quantity,
            expiresAt: reservationExpiresAt,
          },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            quantityDelta: -cartItem.quantity,
            reason: "RESERVATION",
            referenceId: reservation.id,
            note: `Reserved for order ${order.orderNumber}`,
          },
        });
      }

      for (const [storeId, storeItems] of itemsByStore) {
        const sellerOrder = await tx.sellerOrder.create({
          data: {
            orderId: order.id,
            storeId,
            status: "PENDING",
          },
        });
        await tx.sellerOrderItem.createMany({
          data: storeItems.map((item) => ({
            sellerOrderId: sellerOrder.id,
            orderItemId: item.id,
            orderId: order.id,
            storeId,
          })),
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: lockedCart.id } });
      const savedOrder = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: orderInclude,
      });

      return { order: serializeOrder(savedOrder), reused: false };
    },
    {
      maxWait: 10_000,
      timeout: 30_000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export async function createCheckout(
  userId: string,
  input: CreateCheckoutInput,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await createOrderTransaction(userId, input);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await findExistingOrder(
          prisma,
          userId,
          input.idempotencyKey,
        );
        if (existing) {
          return { order: serializeOrder(existing), reused: true };
        }
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue;
      }
      if (
        isDefaultAddressUniqueConflict(error) &&
        input.address.type === "new" &&
        input.address.saveAsDefault &&
        attempt < 2
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new CheckoutError(
    "Checkout is busy. Please try again.",
    409,
    "CHECKOUT_BUSY",
  );
}

export async function releaseExpiredReservations() {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const reservations = await tx.inventoryReservation.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: { lte: now },
        orderItem: {
          order: {
            payments: {
              none: { status: "SUCCEEDED" },
            },
          },
        },
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    if (reservations.length === 0) return 0;

    const productIds = [...new Set(reservations.map((item) => item.productId))].sort();
    for (const productId of productIds) {
      await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "products" WHERE "id" = ${productId} FOR UPDATE`,
      );
    }

    let released = 0;
    for (const reservation of reservations) {
      const marked = await tx.inventoryReservation.updateMany({
        where: {
          id: reservation.id,
          status: "ACTIVE",
          expiresAt: { lte: now },
        },
        data: { status: "EXPIRED" },
      });
      if (marked.count === 0) continue;

      const product = await tx.product.findUnique({
        where: { id: reservation.productId },
        select: { reservedQuantity: true },
      });
      if (!product || product.reservedQuantity < reservation.quantity) {
        throw new Error(
          `Reservation ${reservation.id} cannot be released: reserved stock is inconsistent.`,
        );
      }

      await tx.product.update({
        where: { id: reservation.productId },
        data: { reservedQuantity: { decrement: reservation.quantity } },
      });
      await tx.inventoryMovement.create({
        data: {
          productId: reservation.productId,
          quantityDelta: reservation.quantity,
          reason: "RESERVATION_RELEASE",
          referenceId: reservation.id,
          note: "Expired checkout reservation released",
        },
      });
      released += 1;
    }
    return released;
  });
}
