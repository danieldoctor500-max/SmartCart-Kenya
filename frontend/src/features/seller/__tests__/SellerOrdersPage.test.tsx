import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { SellerOrdersPage } from "../SellerOrdersPage";

const sellerApiMocks = vi.hoisted(() => ({
  listOrders: vi.fn(),
  getOrder: vi.fn(),
}));

vi.mock("../seller.api", () => ({
  sellerApi: sellerApiMocks,
  getSellerOrderError: (error: unknown) =>
    error instanceof Error ? error.message : "Unable to load seller orders.",
}));

const sellerOrder = {
  id: "seller-order-1",
  status: "PENDING",
  createdAt: "2026-01-01T00:00:00.000Z",
  order: {
    orderNumber: "SC-1001",
    status: "PENDING_PAYMENT",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  items: [{
    id: "order-item-1",
    productNameSnapshot: "Coffee",
    unitPrice: 500,
    quantity: 2,
    lineTotal: 1000,
  }],
};

function renderOrdersPage(path = "/seller/orders") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/seller/orders" element={<SellerOrdersPage />} />
        <Route
          path="/seller/orders/:sellerOrderId"
          element={<SellerOrdersPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("seller orders workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("lists the seller's store orders", async () => {
    sellerApiMocks.listOrders.mockResolvedValue({
      items: [sellerOrder],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    renderOrdersPage();

    expect(await screen.findByText("SC-1001")).toBeInTheDocument();
    expect(screen.getByText("PENDING")).toBeInTheDocument();
  });

  it("shows an empty state when the store has no orders", async () => {
    sellerApiMocks.listOrders.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    renderOrdersPage();
    expect(await screen.findByText("No seller orders yet")).toBeInTheDocument();
  });

  it("shows only seller order items in the order detail view", async () => {
    sellerApiMocks.getOrder.mockResolvedValue(sellerOrder);
    renderOrdersPage("/seller/orders/seller-order-1");

    expect(await screen.findByText("SC-1001")).toBeInTheDocument();
    expect(screen.getByText("Coffee × 2")).toBeInTheDocument();
    expect(screen.getByText(/1,000/)).toBeInTheDocument();
    expect(screen.queryByText(/delivery|recipient|phone/i)).toBeNull();
  });
});
