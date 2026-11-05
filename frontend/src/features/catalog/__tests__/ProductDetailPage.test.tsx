import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { useCart } from "../../cart/cart.context";
import type { Cart } from "../../cart/cart.types";
import { catalogApi } from "../catalog.api";
import { ProductDetailPage } from "../ProductDetailPage";

vi.mock("../../cart/cart.context", () => ({
  useCart: vi.fn(),
}));

vi.mock("../catalog.api", () => ({
  catalogApi: {
    getProduct: vi.fn(),
    getRelatedProducts: vi.fn(),
  },
  formatCatalogPrice: (amount: number) => `KES ${amount}`,
  getCatalogError: () => "Could not load product.",
  isNotFoundError: (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    (error as { response?: { status?: number } }).response?.status === 404,
}));

const emptyCart: Cart = {
  id: "cart-1",
  currency: "KES",
  itemCount: 0,
  subtotal: 0,
  total: 0,
  items: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const product = {
  id: "product-1",
  name: "Kenyan Tea",
  slug: "kenyan-tea",
  description: "Loose-leaf tea",
  price: 250,
  currency: "KES",
  availableQuantity: 3,
  category: { id: "category-1", name: "Groceries", slug: "groceries" },
  store: { name: "Tea Store", slug: "tea-store" },
  images: [],
};

describe("product detail shopping actions", () => {
  beforeEach(() => {
    vi.mocked(catalogApi.getProduct).mockReset();
    vi.mocked(catalogApi.getRelatedProducts).mockReset();
    vi.mocked(useCart).mockReturnValue({
      cart: emptyCart,
      itemCount: 0,
      isLoading: false,
      isMutating: false,
      error: null,
      refreshCart: vi.fn().mockResolvedValue(undefined),
      addItem: vi.fn().mockResolvedValue(emptyCart),
      updateItem: vi.fn().mockResolvedValue(emptyCart),
      removeItem: vi.fn().mockResolvedValue(emptyCart),
      clearCart: vi.fn().mockResolvedValue(emptyCart),
    });
  });

  afterEach(() => {
    cleanup();
  });

  function renderProductDetail() {
    return render(
      <MemoryRouter initialEntries={["/products/tea-store/kenyan-tea"]}>
        <Routes>
          <Route
            path="/products/:storeSlug/:productSlug"
            element={<ProductDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("bounds quantity by stock and adds the selected quantity", async () => {
    const user = userEvent.setup();
    const addItem = vi.fn().mockResolvedValue(emptyCart);
    vi.mocked(useCart).mockReturnValue({
      cart: emptyCart,
      itemCount: 0,
      isLoading: false,
      isMutating: false,
      error: null,
      refreshCart: vi.fn().mockResolvedValue(undefined),
      addItem,
      updateItem: vi.fn().mockResolvedValue(emptyCart),
      removeItem: vi.fn().mockResolvedValue(emptyCart),
      clearCart: vi.fn().mockResolvedValue(emptyCart),
    });
    vi.mocked(catalogApi.getProduct).mockResolvedValue(product);
    vi.mocked(catalogApi.getRelatedProducts).mockResolvedValue([]);

    renderProductDetail();
    await screen.findByRole("heading", { name: "Kenyan Tea" });
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(screen.getByLabelText("Quantity")).toHaveValue(3);
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /add to cart/i }));

    expect(addItem).toHaveBeenCalledWith("product-1", 3);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Added to your cart.",
    );
  });

  it("does not allow adding an out-of-stock product", async () => {
    vi.mocked(catalogApi.getProduct).mockResolvedValue({
      ...product,
      availableQuantity: 0,
    });
    vi.mocked(catalogApi.getRelatedProducts).mockResolvedValue([]);

    renderProductDetail();

    expect(await screen.findByText("Currently out of stock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add to cart/i })).toBeDisabled();
    expect(screen.getByLabelText("Quantity")).toBeDisabled();
  });
});
