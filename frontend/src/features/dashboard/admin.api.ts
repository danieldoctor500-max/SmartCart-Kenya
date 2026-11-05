import { api } from "../../lib/api";

interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export type AdminApplicationStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED";

export type AdminStoreStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface AdminSellerApplication {
  id: string;
  businessName: string;
  applicationStatus: AdminApplicationStatus;
  phone: string | null;
  email: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  store: {
    id: string;
    name: string;
    slug: string;
    status: AdminStoreStatus;
  } | null;
  user: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    status: string;
  };
}

export interface AdminStore {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: AdminStoreStatus;
  createdAt: string;
  updatedAt: string;
  sellerProfile: {
    id: string;
    businessName: string;
    applicationStatus: AdminApplicationStatus;
    user: {
      id: string;
      fullName: string;
      email: string;
      phone: string | null;
      status: string;
    };
  };
}

export interface AdminDeliveryRate {
  id: string;
  county: string;
  town: string;
  fee: number;
  currency: "KES";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDeliveryRateSnapshot {
  county: string;
  town: string;
  fee: number;
  isActive: boolean;
}

export interface AdminDeliveryRateAudit {
  id: string;
  action: string;
  outcome: string;
  metadata: {
    before?: AdminDeliveryRateSnapshot | null;
    after?: AdminDeliveryRateSnapshot;
  } | null;
  createdAt: string;
  actor: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}

export interface AdminDeliveryRateInput {
  county: string;
  town: string;
  fee: number;
  isActive?: boolean;
}

export interface AdminDashboardSummary {
  sellerApplications: {
    byStatus: Record<AdminApplicationStatus, number>;
    total: number;
  };
  stores: {
    byStatus: Record<AdminStoreStatus, number>;
    total: number;
  };
  deliveryRates: {
    active: number;
    inactive: number;
    total: number;
  };
}

export interface AdminListResult<T> {
  data: T[];
  pagination: ApiListResponse<T>["pagination"];
}

function getAdminListResult<T>(
  response: { data: ApiListResponse<T> },
): AdminListResult<T> {
  return {
    data: response.data.data,
    pagination: response.data.pagination,
  };
}

export const adminDashboardApi = {
  async getDashboardSummary() {
    const response = await api.get<ApiResponse<AdminDashboardSummary>>(
      "/admin/dashboard/summary",
    );
    return response.data.data;
  },

  async listSellerApplications(
    page = 1,
    status: AdminApplicationStatus = "PENDING",
    search?: string,
  ) {
    const response = await api.get<ApiListResponse<AdminSellerApplication>>(
      "/admin/seller-applications",
      {
        params: {
          page,
          status,
          ...(search?.trim() ? { search: search.trim() } : {}),
        },
      },
    );
    return getAdminListResult(response);
  },

  async approveSellerApplication(applicationId: string) {
    const response = await api.patch<ApiResponse<{
      applicationId: string;
      applicationStatus: "APPROVED";
      store: NonNullable<AdminSellerApplication["store"]>;
    }>>(
      `/admin/seller-applications/${encodeURIComponent(applicationId)}/approve`,
    );
    return response.data.data;
  },

  async rejectSellerApplication(applicationId: string, reason: string) {
    const response = await api.patch<ApiResponse<{
      applicationId: string;
      applicationStatus: "REJECTED";
      rejectionReason: string;
    }>>(
      `/admin/seller-applications/${encodeURIComponent(applicationId)}/reject`,
      { reason },
    );
    return response.data.data;
  },

  async listStores(
    page = 1,
    filters: {
      status?: AdminStoreStatus;
      search?: string;
    } = {},
  ) {
    const response = await api.get<ApiListResponse<AdminStore>>(
      "/admin/stores",
      {
        params: {
          page,
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.search?.trim()
            ? { search: filters.search.trim() }
            : {}),
        },
      },
    );
    return getAdminListResult(response);
  },

  async activateStore(storeId: string) {
    const response = await api.patch<ApiResponse<{
      id: string;
      status: "ACTIVE";
      previousStatus: "INACTIVE";
    }>>(`/admin/stores/${encodeURIComponent(storeId)}/activate`);
    return response.data.data;
  },

  async suspendStore(storeId: string) {
    const response = await api.patch<ApiResponse<{
      id: string;
      status: "SUSPENDED";
      previousStatus: "ACTIVE";
    }>>(`/admin/stores/${encodeURIComponent(storeId)}/suspend`);
    return response.data.data;
  },

  async listDeliveryRates(
    page = 1,
    filters: {
      status?: "ACTIVE" | "INACTIVE";
      search?: string;
    } = {},
  ) {
    const response = await api.get<ApiListResponse<AdminDeliveryRate>>(
      "/admin/delivery-rates",
      {
        params: {
          page,
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.search?.trim()
            ? { search: filters.search.trim() }
            : {}),
        },
      },
    );
    return getAdminListResult(response);
  },

  async listDeliveryRateAudit(rateId: string, page = 1) {
    const response = await api.get<ApiListResponse<AdminDeliveryRateAudit>>(
      `/admin/delivery-rates/${encodeURIComponent(rateId)}/audit`,
      { params: { page } },
    );
    return getAdminListResult(response);
  },

  async saveDeliveryRate(input: AdminDeliveryRateInput) {
    const response = await api.put<ApiResponse<AdminDeliveryRate>>(
      "/admin/delivery-rates",
      input,
    );
    return response.data.data;
  },

  async updateDeliveryRate(
    rateId: string,
    input: Partial<AdminDeliveryRateInput>,
  ) {
    const response = await api.patch<ApiResponse<AdminDeliveryRate>>(
      `/admin/delivery-rates/${encodeURIComponent(rateId)}`,
      input,
    );
    return response.data.data;
  },
};
