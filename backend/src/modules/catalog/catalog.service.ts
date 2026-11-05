
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/database.js";
import type { CatalogQuery } from "./catalog.schemas.js";

const publicProductVisibilityWhere = {
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

const publicProductWhere = {
  ...publicProductVisibilityWhere,
  stockQuantity: {
    gt: prisma.product.fields.reservedQuantity,
  },
} satisfies Prisma.ProductWhereInput;

const productSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  price: true,
  currency: true,
  stockQuantity: true,
  reservedQuantity: true,
  createdAt: true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  store: {
    select: {
      name: true,
      slug: true,
    },
  },
  images: {
    orderBy: {
      sortOrder: "asc",
    },
    select: {
      id: true,
      imageUrl: true,
      altText: true,
    },
  },
} satisfies Prisma.ProductSelect;

function serializeProduct<
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

export async function listCatalogProducts(query: CatalogQuery) {
  const where: Prisma.ProductWhereInput = {
    ...publicProductWhere,
  };

  if (query.search) {
    where.OR = [
      {
        name: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: query.search,
          mode: "insensitive",
        },
      },
    ];
  }

  if (query.category) {
    where.category = {
      isActive: true,
      slug: query.category,
    };
  }

  if (
    query.minPrice !== undefined ||
    query.maxPrice !== undefined
  ) {
    where.price = {
      ...(query.minPrice !== undefined
        ? { gte: query.minPrice }
        : {}),
      ...(query.maxPrice !== undefined
        ? { lte: query.maxPrice }
        : {}),
    };
  }

  const sortOptions = {
    newest: [{ createdAt: "desc" }, { id: "asc" }],
    price_asc: [{ price: "asc" }, { id: "asc" }],
    price_desc: [{ price: "desc" }, { id: "asc" }],
    name_asc: [{ name: "asc" }, { id: "asc" }],
  } satisfies Record<
    CatalogQuery["sort"],
    Prisma.ProductOrderByWithRelationInput[]
  >;

  const orderBy = sortOptions[query.sort];
  const skip = (query.page - 1) * query.limit;

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: productSelect,
      orderBy,
      skip,
      take: query.limit,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    data: products.map(serializeProduct),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getPublicProductBySlug(slug: string) {
  const products = await prisma.product.findMany({
    where: {
      ...publicProductWhere,
      slug,
    },
    select: productSelect,
    take: 2,
  });

  if (products.length === 0) {
    return { kind: "not_found" as const };
  }

  if (products.length > 1) {
    return { kind: "ambiguous" as const };
  }

  return {
    kind: "found" as const,
    data: serializeProduct(products[0]!),
  };
}

export async function getPublicProductByStoreAndSlug(
  storeSlug: string,
  productSlug: string,
) {
  const product = await prisma.product.findFirst({
    where: {
      ...publicProductWhere,
      slug: productSlug,
      store: { ...publicProductWhere.store, slug: storeSlug },
    },
    select: productSelect,
  });

  if (!product) {
    return { kind: "not_found" as const };
  }

  return {
    kind: "found" as const,
    data: serializeProduct(product),
  };
}

export async function listCatalogCategories() {
  return prisma.category.findMany({
    where: {
      isActive: true,
      products: {
        some: {
          ...publicProductWhere,
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}
