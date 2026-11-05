import { api } from "../../lib/api";

export interface CheckoutAddress {
  id: string;
  recipientName: string;
  phone: string;
  county: string;
  town: string;
  addressLine: string;
  deliveryInstructions: string | null;
  isDefault: boolean;
}

export interface DeliveryOption {
  county: string;
  town: string;
  fee: number;
  currency: string;
}

export interface CheckoutQuote {
  items: Array<{
    productId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    availableStock: number;
    currency: string;
  }>;
  subtotal: number;
  deliveryFee: number;
  grandTotal: number;
  currency: string;
  delivery: {
    county: string;
    town: string;
  };
}

export interface NewCheckoutAddress {
  type: "new";
  recipientName: string;
  phone: string;
  county: string;
  town: string;
  addressLine: string;
  deliveryInstructions?: string;
  saveAsDefault: boolean;
}

export interface SavedCheckoutAddress {
  type: "saved";
  addressId: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export function getCheckoutError(error: unknown): string {
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
    : "Checkout could not be completed. Please try again.";
}

export const checkoutApi = {
  async getAddresses(): Promise<CheckoutAddress[]> {
    const response = await api.get<ApiResponse<CheckoutAddress[]>>(
      "/checkout/addresses",
    );
    return response.data.data;
  },

  async getDeliveryOptions(): Promise<DeliveryOption[]> {
    const response = await api.get<ApiResponse<DeliveryOption[]>>(
      "/checkout/delivery-options",
    );
    return response.data.data;
  },

  async getQuote(location: { addressId: string } | { county: string; town: string }) {
    const response = await api.get<ApiResponse<CheckoutQuote>>(
      "/checkout/quote",
      { params: location },
    );
    return response.data.data;
  },

  async createOrder(input: {
    idempotencyKey: string;
    address: SavedCheckoutAddress | NewCheckoutAddress;
  }) {
    const response = await api.post<ApiResponse<import("../orders/orders.api").CustomerOrder>>(
      "/checkout",
      input,
    );
    return response.data.data;
  },
};
