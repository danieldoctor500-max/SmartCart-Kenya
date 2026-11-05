import { api } from "../../lib/api";

export interface SellerCategory {
  id: string;
  name: string;
  slug: string;
}

export interface SellerProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  status: "DRAFT" | "ACTIVE" | "REJECTED" | "ARCHIVED";
  category: SellerCategory;
  images: Array<{
    id: string;
    imageUrl: string;
    altText: string | null;
    sortOrder: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface SellerProductInput {
  name: string;
  categoryId: string;
  description: string | null;
  price: number;
  initialStock: number;
  images: Array<{
    imageUrl: string;
    altText?: string;
  }>;
}

export type SellerProductDetailsInput = Omit<
  SellerProductInput,
  "initialStock"
>;

export interface SellerApplication {
  id: string;
  businessName: string;
  applicationStatus: "PENDING" | "APPROVED" | "REJECTED";
  phone: string | null;
  email: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  store?: {
    id: string;
    name: string;
    slug: string;
    status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  } | null;
}

export interface SellerApplicationInput {
  businessName: string;
  phone?: string;
  email?: string;
}

export interface InventoryAdjustmentInput {
  quantityDelta: number;
  reason: "RESTOCK" | "CORRECTION" | "RETURN";
  note?: string;
}

export interface SellerOrder {
  id: string;
  status: string;
  createdAt: string;
  order: {
    orderNumber: string;
    status: string;
    createdAt: string;
  };
  items: Array<{
    id: string;
    productNameSnapshot: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
}

interface SellerOrdersResponse {
  success: boolean;
  items: SellerOrder[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function getSellerOrderError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (
      error as {
        response?: { data?: { message?: unknown } };
      }
    ).response;
    if (typeof response?.data?.message === "string") {
      return response.data.message;
    }
  }
  return error instanceof Error
    ? error.message
    : "Unable to load seller orders. Please try again.";
}

export const sellerApi = {
  async getMyApplication(): Promise<SellerApplication> {
    const response = await api.get<ApiResponse<SellerApplication>>(
      "/seller/applications/me",
    );
    return response.data.data;
  },

  async submitApplication(
    input: SellerApplicationInput,
  ): Promise<SellerApplication> {
    const response = await api.post<ApiResponse<SellerApplication>>(
      "/seller/applications",
      input,
    );
    return response.data.data;
  },

  async listProducts(): Promise<SellerProduct[]> {
    const response = await api.get<ApiResponse<SellerProduct[]>>(
      "/seller/products",
    );
    return response.data.data;
  },

  async listOrders(page = 1, limit = 20) {
    const response = await api.get<SellerOrdersResponse>("/seller/orders", {
      params: { page, limit },
    });
    return {
      items: response.data.items,
      pagination: response.data.pagination,
    };
  },

  async getOrder(sellerOrderId: string): Promise<SellerOrder> {
    const response = await api.get<ApiResponse<SellerOrder>>(
      `/seller/orders/${encodeURIComponent(sellerOrderId)}`,
    );
    return response.data.data;
  },

  async listCategories(): Promise<SellerCategory[]> {
    const response = await api.get<ApiResponse<SellerCategory[]>>(
      "/seller/categories",
    );
    return response.data.data;
  },

  async createProduct(
    input: SellerProductInput,
  ): Promise<SellerProduct> {
    const response = await api.post<ApiResponse<SellerProduct>>(
      "/seller/products",
      input,
    );
    return response.data.data;
  },

  async updateProduct(
    productId: string,
    input: Partial<SellerProductDetailsInput>,
  ): Promise<SellerProduct> {
    const response = await api.patch<ApiResponse<SellerProduct>>(
      `/seller/products/${encodeURIComponent(productId)}`,
      input,
    );
    return response.data.data;
  },

  async publishProduct(productId: string): Promise<SellerProduct> {
    const response = await api.patch<ApiResponse<SellerProduct>>(
      `/seller/products/${encodeURIComponent(productId)}/publish`,
    );
    return response.data.data;
  },

  async adjustInventory(
    productId: string,
    input: InventoryAdjustmentInput,
  ): Promise<SellerProduct> {
    const response = await api.patch<ApiResponse<SellerProduct>>(
      `/seller/products/${encodeURIComponent(productId)}/inventory`,
      input,
    );
    return response.data.data;
  },
};
