import { api } from "../../lib/api";
import type {
  Cart,
  CartApiResponse,
} from "./cart.types";

export function getCartError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            message?: string;
            error?: {
              message?: string;
            };
          };
        };
      }
    ).response;

    if (response?.data?.error?.message) {
      return response.data.error.message;
    }

    if (response?.data?.message) {
      return response.data.message;
    }
  }

  return error instanceof Error
    ? error.message
    : "Unable to update your cart. Please try again.";
}

export const cartApi = {
  async getCart(): Promise<Cart> {
    const response = await api.get<CartApiResponse>("/cart");
    return response.data.data;
  },

  async addItem(
    productId: string,
    quantity = 1,
  ): Promise<Cart> {
    const response = await api.post<CartApiResponse>(
      "/cart/items",
      { productId, quantity },
    );

    return response.data.data;
  },

  async updateItem(
    itemId: string,
    quantity: number,
  ): Promise<Cart> {
    const response = await api.patch<CartApiResponse>(
      `/cart/items/${encodeURIComponent(itemId)}`,
      { quantity },
    );

    return response.data.data;
  },

  async removeItem(itemId: string): Promise<Cart> {
    const response = await api.delete<CartApiResponse>(
      `/cart/items/${encodeURIComponent(itemId)}`,
    );

    return response.data.data;
  },

  async clearCart(): Promise<Cart> {
    const response = await api.delete<CartApiResponse>("/cart");
    return response.data.data;
  },
};
