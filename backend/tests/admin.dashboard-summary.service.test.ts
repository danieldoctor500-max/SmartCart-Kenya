import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
  sellerApplicationsGroupBy: vi.fn(),
  storesGroupBy: vi.fn(),
  deliveryRatesGroupBy: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  prisma: {
    sellerProfile: { groupBy: databaseMocks.sellerApplicationsGroupBy },
    store: { groupBy: databaseMocks.storesGroupBy },
    deliveryRate: { groupBy: databaseMocks.deliveryRatesGroupBy },
    $transaction: databaseMocks.transaction,
  },
}));

import { getAdminDashboardSummary } from "../src/modules/admin/dashboard-summary.service.js";

describe("admin dashboard summary service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    databaseMocks.sellerApplicationsGroupBy.mockResolvedValue([]);
    databaseMocks.storesGroupBy.mockResolvedValue([]);
    databaseMocks.deliveryRatesGroupBy.mockResolvedValue([]);
    databaseMocks.transaction.mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries),
    );
  });

  it("returns zero for every status when all categories are empty", async () => {
    await expect(getAdminDashboardSummary()).resolves.toEqual({
      sellerApplications: {
        byStatus: {
          PENDING: 0,
          APPROVED: 0,
          REJECTED: 0,
          SUSPENDED: 0,
        },
        total: 0,
      },
      stores: {
        byStatus: {
          INACTIVE: 0,
          ACTIVE: 0,
          SUSPENDED: 0,
        },
        total: 0,
      },
      deliveryRates: {
        active: 0,
        inactive: 0,
        total: 0,
      },
    });
    expect(databaseMocks.transaction).toHaveBeenCalledTimes(1);
    expect(databaseMocks.sellerApplicationsGroupBy).toHaveBeenCalledWith({
      by: ["applicationStatus"],
      _count: { _all: true },
    });
    expect(databaseMocks.storesGroupBy).toHaveBeenCalledWith({
      by: ["status"],
      _count: { _all: true },
    });
    expect(databaseMocks.deliveryRatesGroupBy).toHaveBeenCalledWith({
      by: ["isActive"],
      _count: { _all: true },
    });
  });
});
