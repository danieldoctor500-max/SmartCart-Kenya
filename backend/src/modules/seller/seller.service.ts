
import crypto from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/database.js";

import type {
  AdjustSellerInventoryInput,
  CreateSellerProductInput,
  SubmitSellerApplicationInput,
  UpdateSellerProductInput,
} from "./seller.schemas.js";

export class SellerApplicationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "SellerApplicationError";
  }
}

export class SellerProductError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "SellerProductError";
  }
}

const sellerProductSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  price: true,
  currency: true,
  stockQuantity: true,
  reservedQuantity: true,
  status: true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  images: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      imageUrl: true,
      altText: true,
      sortOrder: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

function serializeSellerProduct<
  T extends {
    price: Prisma.Decimal;
    stockQuantity: number;
    reservedQuantity: number;
  },
>(product: T) {
  return {
    ...product,
    price: Number(product.price),
    availableQuantity: Math.max(
      0,
      product.stockQuantity - product.reservedQuantity,
    ),
  };
}

async function getSellerStore(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string,
) {
  const profile = await client.sellerProfile.findUnique({
    where: { userId },
    select: {
      applicationStatus: true,
      store: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!profile || profile.applicationStatus !== "APPROVED") {
    throw new SellerProductError(
      "An approved seller profile is required.",
      403,
    );
  }

  if (!profile.store) {
    throw new SellerProductError(
      "A store has not been created for this seller.",
      409,
    );
  }

  if (profile.store.status !== "ACTIVE") {
    const message = profile.store.status === "SUSPENDED"
      ? "Seller product and inventory changes are unavailable while the store is suspended."
      : "Seller product and inventory operations are unavailable until the store is active.";
    throw new SellerProductError(message, 403);
  }

  return profile.store;
}

async function requireActiveCategory(
  client: Prisma.TransactionClient,
  categoryId: string,
) {
  const category = await client.category.findFirst({
    where: { id: categoryId, isActive: true },
    select: { id: true },
  });

  if (!category) {
    throw new SellerProductError(
      "The selected category is unavailable.",
      400,
    );
  }
}

function productSlug(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  return `${base || "product"}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function listSellerCategories(userId: string) {
  await getSellerStore(prisma, userId);

  return prisma.category.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}

export async function listSellerProducts(userId: string) {
  const store = await getSellerStore(prisma, userId);
  const products = await prisma.product.findMany({
    where: { storeId: store.id },
    select: sellerProductSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });

  return products.map(serializeSellerProduct);
}

export async function getSellerProduct(
  userId: string,
  productId: string,
) {
  const store = await getSellerStore(prisma, userId);
  const product = await prisma.product.findFirst({
    where: { id: productId, storeId: store.id },
    select: sellerProductSelect,
  });

  if (!product) {
    throw new SellerProductError("Product not found.", 404);
  }

  return serializeSellerProduct(product);
}

export async function createSellerProduct(
  userId: string,
  input: CreateSellerProductInput,
) {
  return prisma.$transaction(async (tx) => {
    const store = await getSellerStore(tx, userId);
    await requireActiveCategory(tx, input.categoryId);

    const product = await tx.product.create({
      data: {
        storeId: store.id,
        categoryId: input.categoryId,
        name: input.name,
        slug: productSlug(input.name),
        description: input.description,
        price: input.price,
        status: "DRAFT",
        stockQuantity: input.initialStock,
        images: {
          create: input.images.map((image, sortOrder) => ({
            imageUrl: image.imageUrl,
            altText: image.altText,
            sortOrder,
          })),
        },
      },
      select: sellerProductSelect,
    });

    if (input.initialStock > 0) {
      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          quantityDelta: input.initialStock,
          reason: "RESTOCK",
          note: `actor=${userId}; initial stock on product creation`,
        },
      });
    }

    return serializeSellerProduct(product);
  });
}

export async function publishSellerProduct(
  userId: string,
  productId: string,
) {
  return prisma.$transaction(async (tx) => {
    const store = await getSellerStore(tx, userId);
    const product = await tx.product.findFirst({
      where: { id: productId, storeId: store.id },
      select: {
        id: true,
        categoryId: true,
        status: true,
        stockQuantity: true,
        reservedQuantity: true,
      },
    });

    if (!product) {
      throw new SellerProductError("Product not found.", 404);
    }

    if (product.status !== "DRAFT") {
      throw new SellerProductError(
        "Only draft products can be published.",
        409,
      );
    }

    await requireActiveCategory(tx, product.categoryId);

    if (product.stockQuantity <= product.reservedQuantity) {
      throw new SellerProductError(
        "Add available stock before publishing this product.",
        409,
      );
    }

    const updated = await tx.product.updateMany({
      where: {
        id: product.id,
        storeId: store.id,
        status: "DRAFT",
      },
      data: { status: "ACTIVE" },
    });

    if (updated.count !== 1) {
      throw new SellerProductError(
        "Product status changed during this request. Reload and try again.",
        409,
      );
    }

    const publishedProduct = await tx.product.findFirstOrThrow({
      where: { id: product.id, storeId: store.id },
      select: sellerProductSelect,
    });

    return serializeSellerProduct(publishedProduct);
  });
}

export async function updateSellerProduct(
  userId: string,
  productId: string,
  input: UpdateSellerProductInput,
) {
  return prisma.$transaction(async (tx) => {
    const store = await getSellerStore(tx, userId);
    const existing = await tx.product.findFirst({
      where: { id: productId, storeId: store.id },
      select: { id: true },
    });

    if (!existing) {
      throw new SellerProductError("Product not found.", 404);
    }

    if (input.categoryId) {
      await requireActiveCategory(tx, input.categoryId);
    }

    const { images, ...fields } = input;

    if (images !== undefined) {
      await tx.productImage.deleteMany({
        where: { productId },
      });
    }

    const product = await tx.product.update({
      where: { id: productId },
      data: {
        ...fields,
        ...(images === undefined
          ? {}
          : {
              images: {
                create: images.map((image, sortOrder) => ({
                  imageUrl: image.imageUrl,
                  altText: image.altText,
                  sortOrder,
                })),
              },
            }),
      },
      select: sellerProductSelect,
    });

    return serializeSellerProduct(product);
  });
}

export async function adjustSellerInventory(
  userId: string,
  productId: string,
  input: AdjustSellerInventoryInput,
) {
  return prisma.$transaction(async (tx) => {
    const store = await getSellerStore(tx, userId);
    const product = await tx.product.findFirst({
      where: { id: productId, storeId: store.id },
      select: {
        id: true,
        stockQuantity: true,
        reservedQuantity: true,
      },
    });

    if (!product) {
      throw new SellerProductError("Product not found.", 404);
    }

    const nextStock = product.stockQuantity + input.quantityDelta;

    if (
      !Number.isSafeInteger(nextStock) ||
      nextStock < 0 ||
      nextStock > 2147483647
    ) {
      throw new SellerProductError(
        "The adjustment would make physical stock invalid.",
        400,
      );
    }

    if (nextStock < product.reservedQuantity) {
      throw new SellerProductError(
        "Physical stock cannot be lower than reserved stock.",
        409,
      );
    }

    const updated = await tx.product.updateMany({
      where: {
        id: product.id,
        storeId: store.id,
        stockQuantity: product.stockQuantity,
        reservedQuantity: { lte: nextStock },
      },
      data: { stockQuantity: nextStock },
    });

    if (updated.count !== 1) {
      throw new SellerProductError(
        "Inventory changed during this request. Reload and try again.",
        409,
      );
    }

    const movementNote = [
      `actor=${userId}`,
      `stock=${product.stockQuantity}->${nextStock}`,
      `reserved=${product.reservedQuantity}`,
      input.note?.trim(),
    ]
      .filter(Boolean)
      .join("; ");

    await tx.inventoryMovement.create({
      data: {
        productId: product.id,
        quantityDelta: input.quantityDelta,
        reason: input.reason,
        note: movementNote,
      },
    });

    const updatedProduct = await tx.product.findFirstOrThrow({
      where: { id: product.id, storeId: store.id },
      select: sellerProductSelect,
    });

    return serializeSellerProduct(updatedProduct);
  });
}

const sellerOrderInclude = {
  order: {
    select: {
      orderNumber: true,
      status: true,
      createdAt: true,
    },
  },
  items: {
    select: {
      orderItem: {
        select: {
          id: true,
          productNameSnapshot: true,
          unitPrice: true,
          quantity: true,
          lineTotal: true,
        },
      },
    },
  },
} satisfies Prisma.SellerOrderInclude;

function serializeSellerOrder<
  T extends {
    id: string;
    status: string;
    createdAt: Date;
    order: { orderNumber: string; status: string; createdAt: Date };
    items: Array<{
      orderItem: {
        id: string;
        productNameSnapshot: string;
        unitPrice: Prisma.Decimal;
        quantity: number;
        lineTotal: Prisma.Decimal;
      };
    }>;
  },
>(sellerOrder: T) {
  return {
    id: sellerOrder.id,
    status: sellerOrder.status,
    createdAt: sellerOrder.createdAt,
    order: sellerOrder.order,
    items: sellerOrder.items.map(({ orderItem }) => ({
      ...orderItem,
      unitPrice: Number(orderItem.unitPrice),
      lineTotal: Number(orderItem.lineTotal),
    })),
  };
}

export async function listSellerOrders(
  userId: string,
  page: number,
  limit: number,
) {
  const store = await getSellerStore(prisma, userId);
  const where = { storeId: store.id };
  const skip = (page - 1) * limit;
  const [orders, total] = await prisma.$transaction([
    prisma.sellerOrder.findMany({
      where,
      include: sellerOrderInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take: limit,
    }),
    prisma.sellerOrder.count({ where }),
  ]);

  return {
    items: orders.map(serializeSellerOrder),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getSellerOrder(userId: string, sellerOrderId: string) {
  const store = await getSellerStore(prisma, userId);
  const sellerOrder = await prisma.sellerOrder.findFirst({
    where: { id: sellerOrderId, storeId: store.id },
    include: sellerOrderInclude,
  });

  if (!sellerOrder) {
    throw new SellerProductError("Order not found.", 404);
  }

  return serializeSellerOrder(sellerOrder);
}

const sellerApplicationSelect = {
  id: true,
  businessName: true,
  applicationStatus: true,
  phone: true,
  email: true,
  rejectionReason: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SellerProfileSelect;

export async function submitSellerApplication(
  userId: string,
  input: SubmitSellerApplicationInput,
) {
  const existingApplication = await prisma.sellerProfile.findUnique({
    where: { userId },
    select: {
      applicationStatus: true,
    },
  });

  if (existingApplication) {
    if (existingApplication.applicationStatus === "REJECTED") {
      throw new SellerApplicationError(
        "Your seller application was rejected. Reapplication is not available in the MVP.",
        409,
      );
    }

    throw new SellerApplicationError(
      "A seller application or profile already exists for this account.",
      409,
    );
  }

  try {
    return await prisma.sellerProfile.create({
      data: {
        userId,
        businessName: input.businessName,
        phone: input.phone,
        email: input.email,
        applicationStatus: "PENDING",
      },
      select: sellerApplicationSelect,
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new SellerApplicationError(
        "A seller application or profile already exists for this account.",
        409,
      );
    }

    throw error;
  }
}

export async function getMySellerApplication(userId: string) {
  return prisma.sellerProfile.findUnique({
    where: { userId },
    select: {
      ...sellerApplicationSelect,
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      },
    },
  });
}
