
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/database.js";

import type { SubmitSellerApplicationInput } from "./seller.schemas.js";

export class SellerApplicationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "SellerApplicationError";
  }
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
