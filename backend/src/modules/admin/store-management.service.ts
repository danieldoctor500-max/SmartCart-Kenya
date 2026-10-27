
import { prisma } from "../../config/database.js";

export class StoreManagementError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "StoreManagementError";
  }
}

type StoreTargetStatus = "ACTIVE" | "SUSPENDED";

async function changeStoreStatus(
  storeId: string,
  adminUserId: string,
  targetStatus: StoreTargetStatus,
) {
  return prisma.$transaction(async (tx) => {
    const store = await tx.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        sellerProfile: {
          select: {
            applicationStatus: true,
          },
        },
      },
    });

    if (!store) {
      throw new StoreManagementError("Store not found.", 404);
    }

    if (store.status === targetStatus) {
      throw new StoreManagementError(
        `The store is already ${targetStatus.toLowerCase()}.`,
        409,
      );
    }

    // Only active stores can be suspended.
    if (
      targetStatus === "SUSPENDED" &&
      store.status !== "ACTIVE"
    ) {
      throw new StoreManagementError(
        "Only active stores can be suspended.",
        409,
      );
    }

    // Only inactive stores with approved seller applications can be activated.
    if (targetStatus === "ACTIVE") {
      if (store.status !== "INACTIVE") {
        throw new StoreManagementError(
          "Only inactive stores can be activated.",
          409,
        );
      }

      if (store.sellerProfile.applicationStatus !== "APPROVED") {
        throw new StoreManagementError(
          "The seller application must be approved before activating the store.",
          409,
        );
      }
    }

    const previousStatus = store.status;

    // Conditional update protects against concurrent status changes.
    const updated = await tx.store.updateMany({
      where: {
        id: storeId,
        status: previousStatus,
      },
      data: {
        status: targetStatus,
      },
    });

    if (updated.count !== 1) {
      throw new StoreManagementError(
        "The store status changed during this request. Please reload and try again.",
        409,
      );
    }

    const action =
      targetStatus === "ACTIVE"
        ? "STORE_ACTIVATED"
        : "STORE_SUSPENDED";

    // Record the status change in the same transaction.
    await tx.auditLog.create({
      data: {
        actorUserId: adminUserId,
        action,
        resourceType: "STORE",
        resourceId: storeId,
        outcome: "SUCCESS",
        metadata: {
          storeName: store.name,
          storeSlug: store.slug,
          previousStatus,
          newStatus: targetStatus,
        },
      },
    });

    return {
      id: store.id,
      name: store.name,
      slug: store.slug,
      previousStatus,
      status: targetStatus,
    };
  });
}

export function activateStore(
  storeId: string,
  adminUserId: string,
) {
  return changeStoreStatus(storeId, adminUserId, "ACTIVE");
}

export function suspendStore(
  storeId: string,
  adminUserId: string,
) {
  return changeStoreStatus(storeId, adminUserId, "SUSPENDED");
}
