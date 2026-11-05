import { prisma } from "../../config/database.js";

export async function getAdminDashboardSummary() {
  const [sellerApplications, stores, deliveryRates] = await prisma.$transaction([
    prisma.sellerProfile.groupBy({
      by: ["applicationStatus"],
      _count: { _all: true },
    }),
    prisma.store.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.deliveryRate.groupBy({
      by: ["isActive"],
      _count: { _all: true },
    }),
  ]);

  const sellerApplicationsByStatus = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    SUSPENDED: 0,
  };
  for (const group of sellerApplications) {
    sellerApplicationsByStatus[group.applicationStatus] = group._count._all;
  }

  const storesByStatus = {
    INACTIVE: 0,
    ACTIVE: 0,
    SUSPENDED: 0,
  };
  for (const group of stores) {
    storesByStatus[group.status] = group._count._all;
  }

  const activeDeliveryRates =
    deliveryRates.find((group) => group.isActive)?._count._all ?? 0;
  const inactiveDeliveryRates =
    deliveryRates.find((group) => !group.isActive)?._count._all ?? 0;

  return {
    sellerApplications: {
      byStatus: sellerApplicationsByStatus,
      total: Object.values(sellerApplicationsByStatus).reduce(
        (total, count) => total + count,
        0,
      ),
    },
    stores: {
      byStatus: storesByStatus,
      total: Object.values(storesByStatus).reduce(
        (total, count) => total + count,
        0,
      ),
    },
    deliveryRates: {
      active: activeDeliveryRates,
      inactive: inactiveDeliveryRates,
      total: activeDeliveryRates + inactiveDeliveryRates,
    },
  };
}
