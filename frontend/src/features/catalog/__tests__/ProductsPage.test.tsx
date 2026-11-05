import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";

import { api } from "../../../lib/api";
import { useCart } from "../../cart/cart.context";
import type { Cart } from "../../cart/cart.types";
import { catalogApi } from "../catalog.api";
import { ProductsPage } from "../ProductsPage";

vi.mock("../../../lib/api", () => ({
  api: {
    get: vi.fn(),
  },
}));

vi.mock("../../cart/cart.context", () => ({
  useCart: vi.fn(),
}));

vi.mock("../catalog.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../catalog.api")>();
  return {
    ...actual,
    catalogApi: {
      ...actual.catalogApi,
      getCategories: vi.fn(),
    },
  };
});

const product = {
  id: "product-1",
  name: "Headphones",
  slug: "headphones",
  description: "Wireless headphones",
  price: 2500,
  currency: "KES",
  availableQuantity: 3,
  category: { id: "category-1", name: "Electronics", slug: "electronics" },
  store: { name: "Example Store", slug: "example-store" },
  images: [],
};

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

function LocationSearch() {
  const location = useLocation();
  return <span aria-label="Current catalogue URL">{location.search}</span>;
}

function NavigateToInvalidPriceRange() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/products?minPrice=200&maxPrice=100")}
    >
      Navigate to invalid price range
    </button>
  );
}

function renderProductsPage(entry = "/products") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ProductsPage />
      <LocationSearch />
    </MemoryRouter>,
  );
}

describe("catalogue category filtering", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(catalogApi.getCategories).mockReset().mockResolvedValue([]);
    vi.mocked(useCart).mockReturnValue({
      cart: null,
      itemCount: 0,
      isLoading: false,
      addItem: vi.fn(),
      updateItem: vi.fn().mockResolvedValue(emptyCart),
      removeItem: vi.fn().mockResolvedValue(emptyCart),
      clearCart: vi.fn().mockResolvedValue(emptyCart),
      refreshCart: vi.fn().mockResolvedValue(undefined),
      isMutating: false,
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads the selected category from the catalogue API", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        data: [product],
        pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
      },
    });

    renderProductsPage("/products?category=electronics");

    expect(
      await screen.findByRole("heading", { name: "Explore Electronics" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Headphones" })).toBeInTheDocument();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/catalog/products",
        expect.objectContaining({
          params: expect.objectContaining({ category: "electronics" }),
        }),
      );
    });
  });

  it("adds an available product to the cart and confirms the result", async () => {
    const user = userEvent.setup();
    const addItem = vi.fn().mockResolvedValue(emptyCart);
    vi.mocked(useCart).mockReturnValue({
      cart: emptyCart,
      itemCount: 0,
      isLoading: false,
      addItem,
      updateItem: vi.fn().mockResolvedValue(emptyCart),
      removeItem: vi.fn().mockResolvedValue(emptyCart),
      clearCart: vi.fn().mockResolvedValue(emptyCart),
      refreshCart: vi.fn().mockResolvedValue(undefined),
      isMutating: false,
      error: null,
    });
    vi.mocked(api.get).mockResolvedValue({
      data: {
        data: [product],
        pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
      },
    });

    render(
      <MemoryRouter initialEntries={["/products"]}>
        <ProductsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /add to cart/i }));

    expect(addItem).toHaveBeenCalledWith("product-1");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Added to your cart.",
    );
  });

  it("disables adding an out-of-stock product", async () => {
    const addItem = vi.fn();
    vi.mocked(useCart).mockReturnValue({
      cart: emptyCart,
      itemCount: 0,
      isLoading: false,
      addItem,
      updateItem: vi.fn().mockResolvedValue(emptyCart),
      removeItem: vi.fn().mockResolvedValue(emptyCart),
      clearCart: vi.fn().mockResolvedValue(emptyCart),
      refreshCart: vi.fn().mockResolvedValue(undefined),
      isMutating: false,
      error: null,
    });
    vi.mocked(api.get).mockResolvedValue({
      data: {
        data: [{ ...product, availableQuantity: 0 }],
        pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
      },
    });

    renderProductsPage();

    expect(
      await screen.findByRole("button", { name: /add to cart/i }),
    ).toBeDisabled();
    expect(addItem).not.toHaveBeenCalled();
  });

  it("combines search, category, price and sorting, and resets pagination on apply", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get)
      .mockResolvedValueOnce({
        data: {
          data: [product],
          pagination: { page: 3, limit: 12, total: 30, totalPages: 3 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [product],
          pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
        },
      });

    renderProductsPage(
      "/products?q=headphones&category=electronics&minPrice=100&page=3&sort=price_desc",
    );

    await screen.findByRole("link", { name: "Headphones" });
    expect(api.get).toHaveBeenNthCalledWith(
      1,
      "/catalog/products",
      expect.objectContaining({
        params: expect.objectContaining({
          search: "headphones",
          category: "electronics",
          minPrice: 100,
          page: 3,
          sort: "price_desc",
        }),
      }),
    );

    await user.clear(screen.getByLabelText("Maximum price (KES)"));
    await user.type(screen.getByLabelText("Maximum price (KES)"), "5000");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
    expect(api.get).toHaveBeenNthCalledWith(
      2,
      "/catalog/products",
      expect.objectContaining({
        params: expect.objectContaining({
          search: "headphones",
          category: "electronics",
          minPrice: 100,
          maxPrice: 5000,
          page: 1,
          sort: "price_desc",
        }),
      }),
    );
    expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(
      /q=headphones.*category=electronics.*minPrice=100.*sort=price_desc.*maxPrice=5000/,
    );
  });

  it("rejects negative values and minimum prices above the maximum", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({
      data: {
        data: [product],
        pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
      },
    });
    renderProductsPage();
    await screen.findByRole("link", { name: "Headphones" });

    await user.type(screen.getByLabelText("Minimum price (KES)"), "300");
    await user.type(screen.getByLabelText("Maximum price (KES)"), "100");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Minimum price cannot exceed maximum price.",
    );
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("hides previously loaded products when URL prices become invalid", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({
      data: {
        data: [product],
        pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
      },
    });
    render(
      <MemoryRouter initialEntries={["/products"]}>
        <ProductsPage />
        <NavigateToInvalidPriceRange />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Headphones" }))
      .toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Navigate to invalid price range" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Minimum price cannot exceed maximum price.",
    );
    expect(screen.queryByRole("link", { name: "Headphones" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Catalogue pages" }))
      .toBeNull();
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["price_asc", "Price: low to high"],
    ["price_desc", "Price: high to low"],
    ["newest", "Newest first"],
    ["name_asc", "Name: A to Z"],
  ] as const)("requests the %s sort order", async (sort, label) => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({
      data: {
        data: [product],
        pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
      },
    });
    const initialSort = sort === "price_asc" ? "price_desc" : "price_asc";
    renderProductsPage(`/products?sort=${initialSort}`);
    await screen.findByRole("link", { name: "Headphones" });

    await user.selectOptions(screen.getByLabelText("Sort by"), sort);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
    expect(api.get).toHaveBeenLastCalledWith(
      "/catalog/products",
      expect.objectContaining({
        params: expect.objectContaining({
          sort,
          page: 1,
          limit: 12,
        }),
      }),
    );
    expect(screen.getByLabelText("Sort by")).toHaveDisplayValue(label);
  });

  it("navigates pages using returned pagination metadata", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get)
      .mockResolvedValueOnce({
        data: {
          data: [product],
          pagination: { page: 1, limit: 12, total: 25, totalPages: 3 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [{ ...product, id: "product-2", name: "Second page item" }],
          pagination: { page: 2, limit: 12, total: 25, totalPages: 3 },
        },
      });
    renderProductsPage();

    expect(
      await screen.findByRole("navigation", { name: "Catalogue pages" }),
    ).toHaveTextContent(/Page\s+1\s+of\s+3/);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Second page item")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Catalogue pages" }))
      .toHaveTextContent(/Page\s+2\s+of\s+3/);
    expect(api.get).toHaveBeenLastCalledWith(
      "/catalog/products",
      expect.objectContaining({
        params: expect.objectContaining({ page: 2 }),
      }),
    );
    expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(
      "page=2",
    );
  });

  it("clears every catalogue filter and shows a clear action for empty results", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get)
      .mockResolvedValueOnce({
        data: {
          data: [],
          pagination: { page: 2, limit: 12, total: 0, totalPages: 0 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [product],
          pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
        },
      });
    renderProductsPage(
      "/products?q=missing&category=electronics&minPrice=100&maxPrice=200&sort=price_asc&page=2",
    );

    expect(await screen.findByText("No products match your current filters."))
      .toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Clear active filters" }),
    );

    expect(await screen.findByRole("link", { name: "Headphones" })).toBeInTheDocument();
    expect(api.get).toHaveBeenLastCalledWith(
      "/catalog/products",
      expect.objectContaining({
        params: expect.objectContaining({
          search: undefined,
          category: undefined,
          minPrice: undefined,
          maxPrice: undefined,
          page: 1,
          sort: "newest",
        }),
      }),
    );
    expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent("");
  });

  it("shows loading state and recovers from catalogue API errors", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (value: { data: unknown }) => void;
    vi.mocked(api.get)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          }) as never,
      )
      .mockRejectedValueOnce({
        response: { data: { message: "Catalogue is temporarily unavailable." } },
      })
      .mockResolvedValueOnce({
        data: {
          data: [product],
          pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
        },
      });
    renderProductsPage();

    expect(screen.getByRole("status")).toHaveTextContent("Loading products...");
    await act(async () => {
      resolveRequest({
        data: {
          data: [product],
          pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
        },
      });
    });
    await screen.findByRole("link", { name: "Headphones" });

    await user.selectOptions(screen.getByLabelText("Sort by"), "price_asc");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Catalogue is temporarily unavailable.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Headphones" })).toBeInTheDocument();
  });
});
