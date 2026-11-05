import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SellerProductsPage } from "../SellerProductsPage";

const sellerApiMocks = vi.hoisted(() => ({
  listProducts: vi.fn(),
  listCategories: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  adjustInventory: vi.fn(),
}));

vi.mock("../seller.api", () => ({
  sellerApi: sellerApiMocks,
}));

const category = { id: "category-1", name: "Pantry", slug: "pantry" };
const product = (index: number) => ({
  id: `product-${index}`,
  name: `Product ${index}`,
  slug: `product-${index}`,
  description: null,
  price: 250,
  currency: "KES",
  stockQuantity: 8,
  reservedQuantity: 2,
  availableQuantity: 6,
  status: index === 1 ? "ACTIVE" : "DRAFT",
  category,
  images: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

function renderPage() {
  return render(
    <MemoryRouter>
      <SellerProductsPage />
    </MemoryRouter>,
  );
}

describe("seller product workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sellerApiMocks.listProducts.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => product(index + 1)),
    );
    sellerApiMocks.listCategories.mockResolvedValue([category]);
  });

  afterEach(cleanup);

  it("searches, filters by status, and paginates the seller's products", async () => {
    renderPage();

    expect(await screen.findByText("Product 1")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.queryByText("Product 11")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Product 11")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "ACTIVE" },
    });
    expect(await screen.findByText("Product 1")).toBeInTheDocument();
    expect(screen.queryByText("Product 11")).toBeNull();
    expect(screen.queryByText("Page 1 of 2")).toBeNull();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search products"), {
      target: { value: "not found" },
    });
    expect(await screen.findByText("No products match this search and status."))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear product filters" }));
    expect(await screen.findByText("Product 1")).toBeInTheDocument();
  });

  it("creates a draft through the validated product form", async () => {
    sellerApiMocks.createProduct.mockResolvedValue({
      ...product(13),
      name: "New tea",
      status: "DRAFT",
    });
    renderPage();

    await screen.findByText("Product 1");
    fireEvent.change(screen.getByLabelText("Product name"), {
      target: { value: "New tea" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "category-1" },
    });
    fireEvent.change(screen.getByLabelText("Price (KES)"), {
      target: { value: "120" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

    await waitFor(() => {
      expect(sellerApiMocks.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New tea",
          categoryId: "category-1",
          price: 120,
          description: null,
          images: [],
        }),
      );
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Product created as a draft.",
    );
  });

  it("shows a loading state while the product request is pending", async () => {
    let resolveProducts!: (value: ReturnType<typeof product>[]) => void;
    sellerApiMocks.listProducts.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProducts = resolve;
        }),
    );
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("Loading your products...");
    resolveProducts([product(1)]);
    expect(await screen.findByText("Product 1")).toBeInTheDocument();
  });

  it("shows a recoverable error and retries product loading", async () => {
    sellerApiMocks.listProducts
      .mockRejectedValueOnce(new Error("Seller products unavailable."))
      .mockResolvedValueOnce([product(1)]);
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Seller products unavailable.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Product 1")).toBeInTheDocument();
  });
});
