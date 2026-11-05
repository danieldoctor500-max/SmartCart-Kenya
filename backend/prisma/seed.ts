
import { prisma } from "../src/config/database.js";

const DEMO_SELLER_EMAIL = "demo-seller@smartcart.co.ke";
const DEMO_STORE_SLUG = "smartcart-demo-store";

const categories = [
  { name: "Electronics", slug: "electronics" },
  { name: "Fashion", slug: "fashion" },
  { name: "Home & Living", slug: "home-living" },
  { name: "Beauty & Personal Care", slug: "beauty-personal-care" },
];

const products = [
  {
    name: "Wireless Bluetooth Headphones",
    slug: "demo-wireless-bluetooth-headphones",
    categorySlug: "electronics",
    description:
      "Comfortable wireless headphones for music, calls and everyday listening.",
    price: "2499.00",
    stockQuantity: 25,
    imageUrl:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop",
  },
  {
    name: "Smart Fitness Watch",
    slug: "demo-smart-fitness-watch",
    categorySlug: "electronics",
    description:
      "A modern smartwatch for everyday activity tracking and notifications.",
    price: "3999.00",
    stockQuantity: 18,
    imageUrl:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop",
  },
  {
    name: "Classic Everyday Sneakers",
    slug: "demo-classic-everyday-sneakers",
    categorySlug: "fashion",
    description:
      "Versatile everyday sneakers suitable for casual outings.",
    price: "3200.00",
    stockQuantity: 20,
    imageUrl:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop",
  },
  {
    name: "Casual Travel Backpack",
    slug: "demo-casual-travel-backpack",
    categorySlug: "fashion",
    description:
      "A practical backpack for commuting, school and short trips.",
    price: "1850.00",
    stockQuantity: 30,
    imageUrl:
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop",
  },
  {
    name: "Insulated Water Bottle",
    slug: "demo-insulated-water-bottle",
    categorySlug: "home-living",
    description:
      "A reusable bottle for carrying water to work, school or the gym.",
    price: "950.00",
    stockQuantity: 40,
    imageUrl:
      "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&auto=format&fit=crop",
  },
  {
    name: "Minimal Desk Lamp",
    slug: "demo-minimal-desk-lamp",
    categorySlug: "home-living",
    description:
      "A clean, modern desk lamp for a study or home workspace.",
    price: "1650.00",
    stockQuantity: 15,
    imageUrl:
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop",
  },
  {
    name: "Daily Skincare Essentials",
    slug: "demo-daily-skincare-essentials",
    categorySlug: "beauty-personal-care",
    description:
      "A demo skincare product listing for the personal-care category.",
    price: "1400.00",
    stockQuantity: 22,
    imageUrl:
      "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=800&auto=format&fit=crop",
  },
  {
    name: "Personal Care Gift Set",
    slug: "demo-personal-care-gift-set",
    categorySlug: "beauty-personal-care",
    description:
      "A sample personal-care gift set for the SmartCart demo catalogue.",
    price: "2100.00",
    stockQuantity: 12,
    imageUrl:
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&auto=format&fit=crop",
  },
];

async function main() {
  console.log("Starting SmartCart Kenya demo seed...");

  const user = await prisma.user.upsert({
    where: { email: DEMO_SELLER_EMAIL },
    update: {
      fullName: "SmartCart Demo Seller",
      status: "ACTIVE",
    },
    create: {
      email: DEMO_SELLER_EMAIL,
      passwordHash: "DEMO_ACCOUNT_CANNOT_AUTHENTICATE",
      fullName: "SmartCart Demo Seller",
      status: "ACTIVE",
    },
  });

  await prisma.roleAssignment.upsert({
    where: {
      userId_role: {
        userId: user.id,
        role: "SELLER",
      },
    },
    update: {},
    create: {
      userId: user.id,
      role: "SELLER",
    },
  });

  const seller = await prisma.sellerProfile.upsert({
    where: { userId: user.id },
    update: {
      businessName: "SmartCart Demo Marketplace",
      applicationStatus: "APPROVED",
      email: DEMO_SELLER_EMAIL,
    },
    create: {
      userId: user.id,
      businessName: "SmartCart Demo Marketplace",
      applicationStatus: "APPROVED",
      email: DEMO_SELLER_EMAIL,
    },
  });

  const store = await prisma.store.upsert({
    where: { sellerProfileId: seller.id },
    update: {
      name: "SmartCart Demo Store",
      slug: DEMO_STORE_SLUG,
      description:
        "Demonstration store featuring sample products for SmartCart Kenya.",
      status: "ACTIVE",
    },
    create: {
      sellerProfileId: seller.id,
      name: "SmartCart Demo Store",
      slug: DEMO_STORE_SLUG,
      description:
        "Demonstration store featuring sample products for SmartCart Kenya.",
      status: "ACTIVE",
    },
  });

  const categoryBySlug = new Map<string, string>();

  for (const category of categories) {
    const savedCategory = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        isActive: true,
      },
      create: {
        name: category.name,
        slug: category.slug,
        isActive: true,
      },
    });

    categoryBySlug.set(category.slug, savedCategory.id);
  }

  for (const product of products) {
    const categoryId = categoryBySlug.get(product.categorySlug);

    if (!categoryId) {
      throw new Error(`Missing category: ${product.categorySlug}`);
    }

    const savedProduct = await prisma.product.upsert({
      where: {
        storeId_slug: {
          storeId: store.id,
          slug: product.slug,
        },
      },
      update: {
        categoryId,
        name: product.name,
        description: product.description,
        price: product.price,
        currency: "KES",
        stockQuantity: product.stockQuantity,
        reservedQuantity: 0,
        status: "ACTIVE",
      },
      create: {
        storeId: store.id,
        categoryId,
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: product.price,
        currency: "KES",
        stockQuantity: product.stockQuantity,
        reservedQuantity: 0,
        status: "ACTIVE",
      },
    });

    await prisma.productImage.upsert({
      where: { id: `demo-image-${savedProduct.id}` },
      update: {
        imageUrl: product.imageUrl,
        altText: product.name,
        sortOrder: 0,
      },
      create: {
        id: `demo-image-${savedProduct.id}`,
        productId: savedProduct.id,
        imageUrl: product.imageUrl,
        altText: product.name,
        sortOrder: 0,
      },
    });

    console.log(`Seeded: ${product.name}`);
  }

  const total = await prisma.product.count({
    where: {
      storeId: store.id,
      status: "ACTIVE",
    },
  });

  console.log(`Demo seed complete. Active products in demo store: ${total}`);
}

main()
  .catch((error: unknown) => {
    console.error("SmartCart demo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
