import crypto from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/database.js";
import type {
  ListSellerApplicationsInput,
  RejectSellerApplicationInput,
} from "./seller-review.schemas.js";

export class SellerReviewError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "SellerReviewError";
  }
}

const applicationSelect = {
  id: true,
  businessName: true,
  applicationStatus: true,
  phone: true,
  email: true,
  rejectionReason: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      status: true,
    },
  },
  store: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
    },
  },
} satisfies Prisma.SellerProfileSelect;

function slugBase(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  return slug || "store";
}

export async function listSellerApplications(
  input: ListSellerApplicationsInput,
) {
  const skip = (input.page - 1) * input.limit;
  const where: Prisma.SellerProfileWhereInput = {
    applicationStatus: input.status,
    ...(input.search
      ? {
          OR: [
            {
              businessName: {
                contains: input.search,
                mode: "insensitive",
              },
            },
            {
              user: {
                is: {
                  fullName: {
                    contains: input.search,
                    mode: "insensitive",
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [applications, total] = await prisma.$transaction([
    prisma.sellerProfile.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take: input.limit,
      select: applicationSelect,
    }),
    prisma.sellerProfile.count({ where }),
  ]);

  return {
    items: applications,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export async function approveSellerApplication(
  applicationId: string,
  adminUserId: string,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const reviewedAt = new Date();

      // Conditional update prevents a second administrator from
      // approving an application already decided by another request.
      const updated = await tx.sellerProfile.updateMany({
        where: {
          id: applicationId,
          applicationStatus: "PENDING",
        },
        data: {
          applicationStatus: "APPROVED",
          reviewedById: adminUserId,
          reviewedAt,
          rejectionReason: null,
        },
      });

      if (updated.count !== 1) {
        const existing = await tx.sellerProfile.findUnique({
          where: { id: applicationId },
          select: { id: true },
        });

        if (!existing) {
          throw new SellerReviewError(
            "Seller application was not found.",
            404,
          );
        }

        throw new SellerReviewError(
          "This application has already been reviewed.",
          409,
        );
      }

      const application = await tx.sellerProfile.findUniqueOrThrow({
        where: { id: applicationId },
        select: {
          id: true,
          userId: true,
          businessName: true,
        },
      });

      const user = await tx.user.findUnique({
        where: { id: application.userId },
        select: { status: true },
      });

      if (!user || user.status !== "ACTIVE") {
        throw new SellerReviewError(
          "Only active user accounts can be approved as sellers.",
          409,
        );
      }

      await tx.roleAssignment.upsert({
        where: {
          userId_role: {
            userId: application.userId,
            role: "SELLER",
          },
        },
        create: {
          userId: application.userId,
          role: "SELLER",
        },
        update: {},
      });

      const baseSlug = slugBase(application.businessName);
      let storeSlug = baseSlug;

      // The suffix makes the slug unique even if another store has
      // the same business name. The database unique constraint remains
      // the final safeguard against concurrent collisions.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const suffix =
          attempt === 0
            ? ""
            : `-${crypto.randomUUID().slice(0, 8)}`;

        storeSlug = `${baseSlug.slice(0, 90 - suffix.length)}${suffix}`;

        const collision = await tx.store.findUnique({
          where: { slug: storeSlug },
          select: { id: true },
        });

        if (!collision) break;

        storeSlug = "";
      }

      if (!storeSlug) {
        throw new SellerReviewError(
          "A unique store address could not be generated. Please retry.",
          409,
        );
      }

      const store = await tx.store.create({
        data: {
          sellerProfileId: application.id,
          name: application.businessName,
          slug: storeSlug,
          status: "INACTIVE",
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "SELLER_APPLICATION_APPROVED",
          resourceType: "SellerProfile",
          resourceId: application.id,
          outcome: "SUCCESS",
          metadata: {
            businessName: application.businessName,
            storeId: store.id,
            storeSlug: store.slug,
          },
        },
      });

      return {
        applicationId: application.id,
        applicationStatus: "APPROVED" as const,
        reviewedAt,
        store,
      };
    });
  } catch (error: unknown) {
    if (error instanceof SellerReviewError) throw error;

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new SellerReviewError(
        "A unique store address conflict occurred. Please retry the approval.",
        409,
      );
    }

    throw error;
  }
}

export async function rejectSellerApplication(
  applicationId: string,
  adminUserId: string,
  input: RejectSellerApplicationInput,
) {
  return prisma.$transaction(async (tx) => {
    const reviewedAt = new Date();

    const updated = await tx.sellerProfile.updateMany({
      where: {
        id: applicationId,
        applicationStatus: "PENDING",
      },
      data: {
        applicationStatus: "REJECTED",
        rejectionReason: input.reason,
        reviewedById: adminUserId,
        reviewedAt,
      },
    });

    if (updated.count !== 1) {
      const existing = await tx.sellerProfile.findUnique({
        where: { id: applicationId },
        select: { id: true },
      });

      if (!existing) {
        throw new SellerReviewError(
          "Seller application was not found.",
          404,
        );
      }

      throw new SellerReviewError(
        "This application has already been reviewed.",
        409,
      );
    }

    const application = await tx.sellerProfile.findUniqueOrThrow({
      where: { id: applicationId },
      select: {
        id: true,
        businessName: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: adminUserId,
        action: "SELLER_APPLICATION_REJECTED",
        resourceType: "SellerProfile",
        resourceId: application.id,
        outcome: "SUCCESS",
        metadata: {
          businessName: application.businessName,
          rejectionReason: input.reason,
        },
      },
    });

    return {
      applicationId: application.id,
      applicationStatus: "REJECTED" as const,
      rejectionReason: input.reason,
      reviewedAt,
    };
  });
}
