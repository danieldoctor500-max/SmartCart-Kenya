import { api } from "../../lib/api";

export interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  availableQuantity: number;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  store: {
    name: string;
    slug: string;
  };
  images: Array<{
    id: string;
    imageUrl: string;
    altText: string | null;
  }>;
}

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
}

interface ProductResponse {
  success: boolean;
  data: CatalogProduct;
}

interface ProductsResponse {
  success: boolean;
  data: CatalogProduct[];
}

interface CategoriesResponse {
  success: boolean;
  data: CatalogCategory[];
}

export const catalogApi = {
  async getCategories(signal?: AbortSignal): Promise<CatalogCategory[]> {
    const response = await api.get<CategoriesResponse>(
      "/catalog/categories",
      { signal },
    );
    return response.data.data;
  },

  async getProduct(
    storeSlug: string,
    productSlug: string,
    signal?: AbortSignal,
  ): Promise<CatalogProduct> {
    const response = await api.get<ProductResponse>(
      `/catalog/stores/${encodeURIComponent(storeSlug)}/products/${encodeURIComponent(productSlug)}`,
      { signal },
    );
    return response.data.data;
  },

  async getRelatedProducts(
    categorySlug: string,
    signal?: AbortSignal,
  ): Promise<CatalogProduct[]> {
    const response = await api.get<ProductsResponse>(
      "/catalog/products",
      {
        params: {
          category: categorySlug,
          page: 1,
          limit: 8,
          sort: "newest",
        },
        signal,
      },
    );
    return response.data.data;
  },
};

export function getCatalogError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            message?: unknown;
          };
        };
      }
    ).response;

    if (typeof response?.data?.message === "string") {
      return response.data.message;
    }
  }

  return "We couldn't load this product. Please try again.";
}

export function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    (error as { response?: { status?: number } }).response?.status === 404
  );
}

export function formatCatalogPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}
