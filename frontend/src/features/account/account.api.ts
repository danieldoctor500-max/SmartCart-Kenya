import { api } from "../../lib/api";

export interface CustomerAddress {
  id: string;
  recipientName: string;
  phone: string;
  county: string;
  town: string;
  addressLine: string;
  deliveryInstructions: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddressInput {
  recipientName: string;
  phone: string;
  county: string;
  town: string;
  addressLine: string;
  deliveryInstructions?: string | null;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export function getAccountError(
  error: unknown,
  fallback: string,
): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as {
        response?: {
          status?: number;
          data?: { code?: string; message?: string };
        };
      }
    ).response;

    if (
      response?.status === 409 &&
      response.data?.code === "ADDRESS_IN_USE"
    ) {
      return "This address is linked to an existing order and cannot be deleted.";
    }

    if (response?.status && response.status >= 500) return fallback;
    if (response?.data?.message) return response.data.message;
  }

  return error instanceof Error && !("isAxiosError" in error)
    ? error.message
    : fallback;
}

export function getAddressValidationErrors(
  error: unknown,
): Record<string, string> {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return {};
  }

  const response = (
    error as {
      response?: {
        data?: {
          code?: string;
          errors?: Array<{ field?: string; message?: string }>;
        };
      };
    }
  ).response;
  if (response?.data?.code !== "VALIDATION_ERROR") return {};

  return Object.fromEntries(
    (response.data.errors ?? [])
      .filter(
        (issue): issue is { field: string; message: string } =>
          typeof issue.field === "string" &&
          typeof issue.message === "string",
      )
      .map(({ field, message }) => [field, message]),
  );
}

export const accountApi = {
  async listAddresses(): Promise<CustomerAddress[]> {
    const response = await api.get<ApiResponse<CustomerAddress[]>>(
      "/account/addresses",
    );
    return response.data.data;
  },

  async createAddress(input: AddressInput): Promise<CustomerAddress> {
    const response = await api.post<ApiResponse<CustomerAddress>>(
      "/account/addresses",
      input,
    );
    return response.data.data;
  },

  async updateAddress(
    addressId: string,
    input: AddressInput,
  ): Promise<CustomerAddress> {
    const response = await api.patch<ApiResponse<CustomerAddress>>(
      `/account/addresses/${encodeURIComponent(addressId)}`,
      input,
    );
    return response.data.data;
  },

  async setDefaultAddress(addressId: string): Promise<CustomerAddress> {
    const response = await api.patch<ApiResponse<CustomerAddress>>(
      `/account/addresses/${encodeURIComponent(addressId)}/default`,
    );
    return response.data.data;
  },

  async deleteAddress(addressId: string): Promise<void> {
    await api.delete<ApiResponse<never>>(
      `/account/addresses/${encodeURIComponent(addressId)}`,
    );
  },
};
