import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/database.js";

export class OrderAccessError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "OrderAccessError";
  }
}

export const orderInclude = {
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      productId: true,
      storeId: true,
      productNameSnapshot: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
      store: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  },
  sellerOrders: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      store: {
        select: {
          name: true,
          slug: true,
        },
      },
      items: {
        select: {
          orderItemId: true,
        },
      },
    },
  },
  payments: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      status: true,
      initiatedAt: true,
      completedAt: true,
    },
  },
} satisfies Prisma.OrderInclude;

export function serializeOrder<
  T extends {
    subtotal: Prisma.Decimal;
    deliveryTotal: Prisma.Decimal;
    grandTotal: Prisma.Decimal;
    items: Array<{
      unitPrice: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }>;
    payments: Array<{ status: string }>;
  },
>(order: T) {
  return {
    ...order,
    subtotal: Number(order.subtotal),
    deliveryTotal: Number(order.deliveryTotal),
    grandTotal: Number(order.grandTotal),
    paymentStatus: order.payments[0]?.status ?? null,
    items: order.items.map((item) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
      currency: "KES",
    })),
  };
}

export async function listCustomerOrders(
  userId: string,
  page: number,
  limit: number,
) {
  const skip = (page - 1) * limit;
  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where: { userId },
      include: orderInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take: limit,
    }),
    prisma.order.count({ where: { userId } }),
  ]);

  return {
    items: orders.map(serializeOrder),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getCustomerOrder(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: orderInclude,
  });

  if (!order) {
    throw new OrderAccessError("Order not found.", 404);
  }

  return serializeOrder(order);
}
