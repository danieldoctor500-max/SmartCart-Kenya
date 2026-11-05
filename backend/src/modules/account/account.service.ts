import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/database.js";
import type {
  CreateAddressInput,
  UpdateAddressInput,
} from "./account.schemas.js";
import {
  DEFAULT_ADDRESS_INDEX_NAME,
  makeCustomerAddressDefault as setDefaultAddress,
} from "./address-default.service.js";

const addressSelect = {
  id: true,
  recipientName: true,
  phone: true,
  county: true,
  town: true,
  addressLine: true,
  deliveryInstructions: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AddressSelect;

export class AddressManagementError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AddressManagementError";
  }
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  );
}

function isDefaultAddressConflict(error: unknown): boolean {
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

export async function listCustomerAddresses(userId: string) {
  return prisma.address.findMany({
    where: { userId },
    orderBy: [
      { isDefault: "desc" },
      { createdAt: "desc" },
      { id: "asc" },
    ],
    select: addressSelect,
  });
}

export async function createCustomerAddress(
  userId: string,
  input: CreateAddressInput,
) {
  return prisma.address.create({
    data: {
      userId,
      recipientName: input.recipientName,
      phone: input.phone,
      county: input.county,
      town: input.town,
      addressLine: input.addressLine,
      deliveryInstructions: input.deliveryInstructions ?? null,
      isDefault: false,
    },
    select: addressSelect,
  });
}

export async function updateCustomerAddress(
  userId: string,
  addressId: string,
  input: UpdateAddressInput,
) {
  const updated = await prisma.address.updateMany({
    where: { id: addressId, userId },
    data: input,
  });

  if (updated.count !== 1) {
    throw new AddressManagementError(
      "Address not found.",
      404,
      "ADDRESS_NOT_FOUND",
    );
  }

  return prisma.address.findFirstOrThrow({
    where: { id: addressId, userId },
    select: addressSelect,
  });
}

export async function makeCustomerAddressDefault(
  userId: string,
  addressId: string,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const address = await prisma.$transaction(
        async (tx) => setDefaultAddress(tx, userId, addressId),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      if (!address) {
        throw new AddressManagementError(
          "Address not found.",
          404,
          "ADDRESS_NOT_FOUND",
        );
      }

      return address;
    } catch (error: unknown) {
      if (error instanceof AddressManagementError) throw error;

      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || isDefaultAddressConflict(error));

      if (retryable && attempt < 2) continue;

      if (retryable) {
        throw new AddressManagementError(
          "The default address changed concurrently. Please retry.",
          409,
          "ADDRESS_DEFAULT_CONFLICT",
        );
      }

      throw error;
    }
  }

  throw new AddressManagementError(
    "The default address changed concurrently. Please retry.",
    409,
    "ADDRESS_DEFAULT_CONFLICT",
  );
}

export async function deleteCustomerAddress(
  userId: string,
  addressId: string,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const address = await tx.address.findFirst({
        where: { id: addressId, userId },
        select: { id: true },
      });

      if (!address) {
        throw new AddressManagementError(
          "Address not found.",
          404,
          "ADDRESS_NOT_FOUND",
        );
      }

      const orderCount = await tx.order.count({
        where: { addressId, userId },
      });

      if (orderCount > 0) {
        throw new AddressManagementError(
          "This address is associated with an order and cannot be deleted.",
          409,
          "ADDRESS_IN_USE",
        );
      }

      await tx.address.deleteMany({
        where: { id: addressId, userId },
      });

      return address;
    });
  } catch (error: unknown) {
    if (error instanceof AddressManagementError) throw error;

    if (isForeignKeyConstraintError(error)) {
      throw new AddressManagementError(
        "This address is associated with an order and cannot be deleted.",
        409,
        "ADDRESS_IN_USE",
      );
    }

    throw error;
  }
}
