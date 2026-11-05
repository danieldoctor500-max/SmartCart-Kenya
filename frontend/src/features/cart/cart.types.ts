export interface CartProductImage {
  imageUrl: string;
  altText: string | null;
}

export interface CartProduct {
  id: string;
  name: string;
  slug: string;
  image: CartProductImage | null;
  store: string;
  storeSlug: string;
}

export interface CartItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  subtotal: number;
  availableQuantity: number;
  productAvailable: boolean;
  needsReview: boolean;
  product: CartProduct;
}

export interface Cart {
  id: string;
  currency: string;
  itemCount: number;
  subtotal: number;
  total: number;
  items: CartItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CartApiResponse {
  data: Cart;
}

export interface CartErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
}
