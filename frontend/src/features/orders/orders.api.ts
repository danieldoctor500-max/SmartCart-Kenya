import { api } from "../../lib/api";

export interface CustomerOrderItem {
  id: string;
  productId: string;
  storeId: string;
  productNameSnapshot: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  currency: string;
  store: {
    name: string;
    slug: string;
  };
}

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string | null;
  currency: string;
  subtotal: number;
  deliveryTotal: number;
  grandTotal: number;
  deliveryRecipientName: string;
  deliveryPhone: string;
  deliveryCounty: string;
  deliveryTown: string;
  deliveryAddressLine: string;
  deliveryInstructions: string | null;
  createdAt: string;
  items: CustomerOrderItem[];
  sellerOrders: Array<{
    id: string;
    status: string;
    store: { name: string; slug: string };
    items: Array<{ orderItemId: string }>;
  }>;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface OrdersListResponse {
  success: boolean;
  items: CustomerOrder[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function getOrdersError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (
      error as {
        response?: { data?: { message?: string } };
      }
    ).response;
    if (response?.data?.message) return response.data.message;
  }
  return error instanceof Error
    ? error.message
    : "Unable to load your orders. Please try again.";
}

export const ordersApi = {
  async list(page = 1, limit = 20) {
    const response = await api.get<OrdersListResponse>("/orders", {
      params: { page, limit },
    });
    return {
      items: response.data.items,
      pagination: response.data.pagination,
    };
  },

  async get(orderId: string): Promise<CustomerOrder> {
    const response = await api.get<ApiResponse<CustomerOrder>>(
      `/orders/${encodeURIComponent(orderId)}`,
    );
    return response.data.data;
  },
};
