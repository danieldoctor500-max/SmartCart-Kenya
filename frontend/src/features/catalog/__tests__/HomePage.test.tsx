import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { HomePage } from "../HomePage";
import { catalogApi } from "../catalog.api";

vi.mock("../catalog.api", () => ({
  catalogApi: {
    getCategories: vi.fn(),
  },
}));

describe("home page", () => {
  beforeEach(() => {
    vi.mocked(catalogApi.getCategories).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("uses live categories and links them to the catalogue filter", async () => {
    vi.mocked(catalogApi.getCategories).mockResolvedValue([
      { id: "electronics-id", name: "Electronics", slug: "electronics" },
      { id: "home-id", name: "Home & Living", slug: "home-living" },
    ]);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: /electronics/i })).toHaveAttribute(
      "href",
      "/products?category=electronics",
    );
    expect(screen.getByRole("link", { name: /home & living/i })).toHaveAttribute(
      "href",
      "/products?category=home-living",
    );
    expect(screen.getByRole("link", { name: "Shop Now" })).toHaveAttribute(
      "href",
      "/products",
    );
    expect(screen.getByRole("link", { name: "Create Account" })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("shows a retry action when categories fail to load", async () => {
    const user = userEvent.setup();
    vi.mocked(catalogApi.getCategories)
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce([
        { id: "electronics-id", name: "Electronics", slug: "electronics" },
      ]);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't load shopping categories/i,
    );
    await user.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /electronics/i })).toBeInTheDocument();
    });
    expect(catalogApi.getCategories).toHaveBeenCalledTimes(2);
  });

  it("clearly labels planned AI, M-Pesa, and price-alert features", async () => {
    vi.mocked(catalogApi.getCategories).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/no product categories are available/i)).toBeInTheDocument();
    expect(screen.getAllByText("Coming soon")).toHaveLength(3);
    expect(screen.getByText(/M-Pesa payment integration is not available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/delivery quotes are shown for destinations with configured delivery rates/i)).toBeInTheDocument();
  });
});
