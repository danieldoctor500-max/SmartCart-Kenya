import type { Prisma } from "../../generated/prisma/client.js";

export const DEFAULT_ADDRESS_INDEX_NAME =
  "addresses_one_default_per_user_idx";

export async function makeCustomerAddressDefault(
  client: Prisma.TransactionClient,
  userId: string,
  addressId: string,
) {
  const address = await client.address.findFirst({
    where: { id: addressId, userId },
    select: { id: true },
  });

  if (!address) return null;

  await client.address.updateMany({
    where: {
      userId,
      isDefault: true,
      id: { not: addressId },
    },
    data: { isDefault: false },
  });

  await client.address.updateMany({
    where: { id: addressId, userId, isDefault: false },
    data: { isDefault: true },
  });

  return client.address.findFirstOrThrow({
    where: { id: addressId, userId },
    select: {
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
    },
  });
}
