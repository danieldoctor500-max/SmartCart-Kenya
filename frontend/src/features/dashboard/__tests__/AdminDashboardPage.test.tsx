import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";

import { AdminDashboardPage } from "../AdminDashboardPage";

const adminApiMocks = vi.hoisted(() => ({
  getDashboardSummary: vi.fn(),
  listSellerApplications: vi.fn(),
  approveSellerApplication: vi.fn(),
  rejectSellerApplication: vi.fn(),
  listStores: vi.fn(),
  activateStore: vi.fn(),
  suspendStore: vi.fn(),
  listDeliveryRates: vi.fn(),
  listDeliveryRateAudit: vi.fn(),
  saveDeliveryRate: vi.fn(),
  updateDeliveryRate: vi.fn(),
}));

vi.mock("../admin.api", () => ({
  adminDashboardApi: adminApiMocks,
}));

vi.mock("../../../components/dashboard/DashboardShell", () => ({
  DashboardShell: ({
    title,
    children,
    navItems,
  }: {
    title: string;
    children: React.ReactNode;
    navItems: Array<{ label: string; to: string }>;
  }) => (
    <main>
      <h1>{title}</h1>
      <nav aria-label="Admin navigation">
        {navItems.map(({ label, to }) => <Link key={to} to={to}>{label}</Link>)}
      </nav>
      {children}
    </main>
  ),
  DashboardState: ({
    title,
    message,
    action,
    isError,
  }: {
    title: string;
    message: string;
    action?: React.ReactNode;
    isError?: boolean;
  }) => (
    <section role={isError ? "alert" : "status"}>
      <h2>{title}</h2>
      <p>{message}</p>
      {action}
    </section>
  ),
}));

const pagination = { page: 1, limit: 20, total: 1, totalPages: 1 };
const dashboardSummary = {
  sellerApplications: {
    byStatus: { PENDING: 4, APPROVED: 3, REJECTED: 2, SUSPENDED: 1 },
    total: 10,
  },
  stores: {
    byStatus: { INACTIVE: 2, ACTIVE: 5, SUSPENDED: 1 },
    total: 8,
  },
  deliveryRates: { active: 6, inactive: 2, total: 8 },
};
const application = {
  id: "application-1",
  businessName: "Nairobi Coffee",
  applicationStatus: "PENDING" as const,
  phone: "0712345678",
  email: "business@example.com",
  rejectionReason: null,
  reviewedAt: null,
  createdAt: "2026-01-02T00:00:00.000Z",
  store: null,
  user: {
    id: "user-1",
    fullName: "Amina Wanjiku",
    email: "amina@example.com",
    phone: "0712345678",
    status: "ACTIVE",
  },
};

const inactiveApprovedStore = {
  id: "store-inactive",
  name: "Nairobi Coffee",
  slug: "nairobi-coffee",
  description: null,
  status: "INACTIVE" as const,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  sellerProfile: {
    id: "profile-1",
    businessName: "Nairobi Coffee",
    applicationStatus: "APPROVED" as const,
    user: {
      id: "user-1",
      fullName: "Amina Wanjiku",
      email: "amina@example.com",
      phone: null,
      status: "ACTIVE",
    },
  },
};

const activeStore = {
  ...inactiveApprovedStore,
  id: "store-active",
  name: "Mombasa Spices",
  status: "ACTIVE" as const,
};

const deliveryRate = {
  id: "rate-1",
  county: "Nairobi",
  town: "Westlands",
  fee: 150,
  currency: "KES" as const,
  isActive: true,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

function renderAdminPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/seller-applications" element={<AdminDashboardPage />} />
        <Route path="/admin/stores" element={<AdminDashboardPage />} />
        <Route path="/admin/delivery-rates" element={<AdminDashboardPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("admin seller and store management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn(() => true));
    adminApiMocks.getDashboardSummary.mockResolvedValue(dashboardSummary);
    adminApiMocks.listSellerApplications.mockResolvedValue({
      data: [application],
      pagination,
    });
    adminApiMocks.listStores.mockResolvedValue({
      data: [inactiveApprovedStore, activeStore],
      pagination,
    });
    adminApiMocks.listDeliveryRates.mockResolvedValue({
      data: [],
      pagination,
    });
    adminApiMocks.listDeliveryRateAudit.mockResolvedValue({
      data: [],
      pagination: { ...pagination, total: 0 },
    });
    adminApiMocks.approveSellerApplication.mockResolvedValue({
      applicationId: application.id,
      applicationStatus: "APPROVED",
    });
    adminApiMocks.rejectSellerApplication.mockResolvedValue({
      applicationId: application.id,
      applicationStatus: "REJECTED",
    });
    adminApiMocks.activateStore.mockResolvedValue({
      id: inactiveApprovedStore.id,
      status: "ACTIVE",
    });
    adminApiMocks.suspendStore.mockResolvedValue({
      id: activeStore.id,
      status: "SUSPENDED",
    });
    adminApiMocks.saveDeliveryRate.mockResolvedValue(deliveryRate);
    adminApiMocks.updateDeliveryRate.mockResolvedValue(deliveryRate);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders backend summary values and retains working navigation links", async () => {
    renderAdminPage("/admin");

    expect(await screen.findByText("Total applications")).toBeInTheDocument();
    expect(screen.getByText("Total stores")).toBeInTheDocument();
    expect(screen.getByText("Total rates")).toBeInTheDocument();
    const applicationCard = screen.getByRole("heading", { name: "Seller applications" }).closest("article")!;
    const storeCard = screen.getByRole("heading", { name: "Stores" }).closest("article")!;
    const deliveryCard = screen.getByRole("heading", { name: "Delivery rates" }).closest("article")!;
    expect(within(applicationCard).getByText("Pending").parentElement).toHaveTextContent("4");
    expect(within(applicationCard).getByText("Approved").parentElement).toHaveTextContent("3");
    expect(within(applicationCard).getByText("Rejected").parentElement).toHaveTextContent("2");
    expect(within(applicationCard).getByText("Suspended").parentElement).toHaveTextContent("1");
    expect(within(storeCard).getByText("Inactive").parentElement).toHaveTextContent("2");
    expect(within(storeCard).getByText("Active").parentElement).toHaveTextContent("5");
    expect(within(storeCard).getByText("Suspended").parentElement).toHaveTextContent("1");
    expect(within(deliveryCard).getByText("Active").parentElement).toHaveTextContent("6");
    expect(within(deliveryCard).getByText("Inactive").parentElement).toHaveTextContent("2");

    fireEvent.click(screen.getByRole("link", { name: "Seller applications" }));
    expect(await screen.findByRole("heading", { name: "Seller applications" }))
      .toBeInTheDocument();
    expect(adminApiMocks.listSellerApplications).toHaveBeenCalledWith(
      1,
      "PENDING",
    );
  });

  it("shows a loading state while the dashboard summary is requested", async () => {
    let resolveSummary: ((value: typeof dashboardSummary) => void) | undefined;
    adminApiMocks.getDashboardSummary.mockReturnValue(new Promise((resolve) => {
      resolveSummary = resolve;
    }));
    renderAdminPage("/admin");

    expect(screen.getByRole("status")).toHaveTextContent(
      "Calculating current operational totals",
    );
    resolveSummary?.(dashboardSummary);
    expect(await screen.findByText("Total applications")).toBeInTheDocument();
  });

  it("shows summary API errors and retries successfully", async () => {
    adminApiMocks.getDashboardSummary
      .mockRejectedValueOnce(new Error("Summary service unavailable"))
      .mockResolvedValueOnce(dashboardSummary);
    renderAdminPage("/admin");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Summary service unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Total applications")).toBeInTheDocument();
    expect(adminApiMocks.getDashboardSummary).toHaveBeenCalledTimes(2);
  });

  it("renders zero values and a clear empty state", async () => {
    adminApiMocks.getDashboardSummary.mockResolvedValue({
      sellerApplications: {
        byStatus: { PENDING: 0, APPROVED: 0, REJECTED: 0, SUSPENDED: 0 },
        total: 0,
      },
      stores: {
        byStatus: { INACTIVE: 0, ACTIVE: 0, SUSPENDED: 0 },
        total: 0,
      },
      deliveryRates: { active: 0, inactive: 0, total: 0 },
    });
    renderAdminPage("/admin");

    expect(await screen.findByText(/No operational records are available yet/))
      .toHaveAttribute("role", "status");
    expect(screen.getAllByText("0")).toHaveLength(12);
  });

  it("lists applications, filters by supported status, and shows application details", async () => {
    renderAdminPage("/admin/seller-applications");

    expect(await screen.findByText("Nairobi Coffee")).toBeInTheDocument();
    expect(screen.getByText(/Amina Wanjiku · amina@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/Submitted/)).toBeInTheDocument();
    expect(adminApiMocks.listSellerApplications).toHaveBeenCalledWith(
      1,
      "PENDING",
    );

    fireEvent.change(screen.getByLabelText("Application status"), {
      target: { value: "APPROVED" },
    });
    await waitFor(() => {
      expect(adminApiMocks.listSellerApplications).toHaveBeenLastCalledWith(
        1,
        "APPROVED",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(await screen.findByText("business@example.com")).toBeInTheDocument();
    expect(screen.getByText("Business phone")).toBeInTheDocument();
  });

  it("searches applications with the selected status and resets pagination", async () => {
    adminApiMocks.listSellerApplications.mockResolvedValue({
      data: [application],
      pagination: { ...pagination, total: 40, totalPages: 2 },
    });
    renderAdminPage("/admin/seller-applications");
    expect(await screen.findByText("Nairobi Coffee")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(adminApiMocks.listSellerApplications).toHaveBeenLastCalledWith(
        2,
        "PENDING",
      );
    });

    const search = screen.getByRole("searchbox", { name: "Search applications" });
    fireEvent.change(search, { target: { value: "  Amina Wanjiku  " } });
    await waitFor(() => {
      expect(adminApiMocks.listSellerApplications).toHaveBeenLastCalledWith(
        1,
        "PENDING",
        "Amina Wanjiku",
      );
    });

    fireEvent.change(screen.getByLabelText("Application status"), {
      target: { value: "APPROVED" },
    });
    await waitFor(() => {
      expect(adminApiMocks.listSellerApplications).toHaveBeenLastCalledWith(
        1,
        "APPROVED",
        "Amina Wanjiku",
      );
    });
    expect(await screen.findByText("Nairobi Coffee")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(await screen.findByRole("searchbox", { name: "Search applications" }))
      .toHaveValue("");
    await waitFor(() => {
      expect(adminApiMocks.listSellerApplications).toHaveBeenLastCalledWith(
        1,
        "APPROVED",
      );
    });
  });

  it("shows a clear empty state when an application search has no matches", async () => {
    renderAdminPage("/admin/seller-applications");
    expect(await screen.findByText("Nairobi Coffee")).toBeInTheDocument();
    adminApiMocks.listSellerApplications.mockResolvedValueOnce({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search applications" }), {
      target: { value: "No such applicant" },
    });

    expect(await screen.findByText("No matching applications")).toBeInTheDocument();
    expect(screen.getByText("No applications match this search and status."))
      .toBeInTheDocument();
  });

  it("shows search API errors and retries the same search", async () => {
    renderAdminPage("/admin/seller-applications");
    expect(await screen.findByText("Nairobi Coffee")).toBeInTheDocument();
    adminApiMocks.listSellerApplications.mockRejectedValueOnce(
      new Error("Search service unavailable"),
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search applications" }), {
      target: { value: "Amina" },
    });

    expect(await screen.findByRole("alert"))
      .toHaveTextContent("Search service unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Nairobi Coffee")).toBeInTheDocument();
    expect(adminApiMocks.listSellerApplications).toHaveBeenLastCalledWith(
      1,
      "PENDING",
      "Amina",
    );
  });

  it("does not allow an older search response to replace newer results", async () => {
    renderAdminPage("/admin/seller-applications");
    expect(await screen.findByText("Nairobi Coffee")).toBeInTheDocument();

    let resolveOlderRequest!: (value: {
      data: typeof application[];
      pagination: typeof pagination;
    }) => void;
    const olderApplication = {
      ...application,
      id: "older-application",
      businessName: "Older result",
    };
    adminApiMocks.listSellerApplications.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveOlderRequest = resolve;
      }),
    );
    const search = screen.getByRole("searchbox", { name: "Search applications" });
    fireEvent.change(search, { target: { value: "older query" } });

    await waitFor(() => {
      expect(adminApiMocks.listSellerApplications).toHaveBeenCalledWith(
        1,
        "PENDING",
        "older query",
      );
    });

    fireEvent.click(screen.getByRole("link", { name: "Stores" }));
    expect(await screen.findByText("Nairobi Coffee")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Seller applications" }));
    expect(await screen.findByText("Nairobi Coffee")).toBeInTheDocument();
    resolveOlderRequest({ data: [olderApplication], pagination });
    await waitFor(() => {
      expect(screen.queryByText("Older result")).not.toBeInTheDocument();
      expect(screen.getByText("Nairobi Coffee")).toBeInTheDocument();
    });
  });

  it("requires confirmation to approve and refreshes with success feedback", async () => {
    renderAdminPage("/admin/seller-applications");
    await screen.findByText("Nairobi Coffee");

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(window.confirm).toHaveBeenCalledWith(
      "Approve this seller application? The store will remain inactive until separately activated.",
    );
    await waitFor(() => {
      expect(adminApiMocks.approveSellerApplication)
        .toHaveBeenCalledWith(application.id);
      expect(adminApiMocks.listSellerApplications).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole("status"))
      .toHaveTextContent("The change was saved successfully.");
  });

  it("validates rejection reason and confirms before sending the rejection", async () => {
    renderAdminPage("/admin/seller-applications");
    await screen.findByText("Nairobi Coffee");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    const form = screen.getByLabelText("Rejection reason").closest("form");
    expect(form).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "No" },
    });
    fireEvent.submit(form!);
    expect(await screen.findByRole("alert"))
      .toHaveTextContent("between 5 and 500 characters");
    expect(adminApiMocks.rejectSellerApplication).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "Business details could not be verified." },
    });
    fireEvent.submit(form!);
    expect(window.confirm).toHaveBeenCalledWith(
      "Reject this seller application? This action cannot be undone.",
    );
    await waitFor(() => {
      expect(adminApiMocks.rejectSellerApplication).toHaveBeenCalledWith(
        application.id,
        "Business details could not be verified.",
      );
    });
  });

  it("only offers eligible store transitions and confirms both actions", async () => {
    adminApiMocks.listStores.mockResolvedValue({
      data: [inactiveApprovedStore, activeStore],
      pagination: { ...pagination, total: 40, totalPages: 2 },
    });
    renderAdminPage("/admin/stores");
    expect(await screen.findByText("Nairobi Coffee")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suspend" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Activate" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Suspend" })).toHaveLength(1);
    expect(screen.getByRole("searchbox", { name: "Search stores" }))
      .toHaveAttribute(
        "placeholder",
        "Store, slug, business, or seller name",
      );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(adminApiMocks.listStores).toHaveBeenLastCalledWith(
        2,
        { status: undefined, search: "" },
      );
    });

    fireEvent.change(screen.getByLabelText("Store status"), {
      target: { value: "INACTIVE" },
    });
    await waitFor(() => {
      expect(adminApiMocks.listStores).toHaveBeenLastCalledWith(
        1,
        { status: "INACTIVE", search: "" },
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(adminApiMocks.listStores).toHaveBeenLastCalledWith(
        2,
        { status: "INACTIVE", search: "" },
      );
    });

    fireEvent.change(screen.getByLabelText("Search stores"), {
      target: { value: "Nairobi" },
    });
    await waitFor(() => {
      expect(adminApiMocks.listStores).toHaveBeenLastCalledWith(
        1,
        { status: "INACTIVE", search: "Nairobi" },
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    expect(window.confirm).toHaveBeenCalledWith(
      "Activate Nairobi Coffee? Only approved seller stores may be activated.",
    );
    await waitFor(() => {
      expect(adminApiMocks.activateStore)
        .toHaveBeenCalledWith(inactiveApprovedStore.id);
    });

    await screen.findByRole("button", { name: "Suspend" });
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    expect(window.confirm).toHaveBeenCalledWith(
      "Suspend Mombasa Spices? Seller product and inventory operations will be blocked.",
    );
    await waitFor(() => {
      expect(adminApiMocks.suspendStore).toHaveBeenCalledWith(activeStore.id);
    });
  });

  it("creates or upserts a delivery rate and refreshes the list", async () => {
    renderAdminPage("/admin/delivery-rates");
    expect(await screen.findByText("No delivery rates configured")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("County"), { target: { value: "Nairobi" } });
    fireEvent.change(screen.getByLabelText("Town"), { target: { value: "Westlands" } });
    fireEvent.change(screen.getByLabelText("Delivery fee (KES)"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Save delivery rate" }));

    await waitFor(() => {
      expect(adminApiMocks.saveDeliveryRate).toHaveBeenCalledWith({
        county: "Nairobi",
        town: "Westlands",
        fee: 150,
        isActive: true,
      });
      expect(adminApiMocks.listDeliveryRates).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Delivery rate saved successfully.")).toBeInTheDocument();
  });

  it("searches, filters, paginates, and clears delivery-rate filters", async () => {
    adminApiMocks.listDeliveryRates.mockResolvedValue({
      data: [deliveryRate],
      pagination: { ...pagination, total: 45, totalPages: 3 },
    });
    renderAdminPage("/admin/delivery-rates");

    expect(await screen.findByText("Westlands, Nairobi")).toBeInTheDocument();
    expect(screen.getByText("45 delivery rates found")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search county or town" }))
      .toHaveAttribute("placeholder", "County or town");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(adminApiMocks.listDeliveryRates).toHaveBeenLastCalledWith(
        2,
        { status: undefined, search: "" },
      );
    });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search county or town" }), {
      target: { value: "  Westlands  " },
    });
    await waitFor(() => {
      expect(adminApiMocks.listDeliveryRates).toHaveBeenLastCalledWith(
        1,
        { status: undefined, search: "Westlands" },
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(adminApiMocks.listDeliveryRates).toHaveBeenLastCalledWith(
        2,
        { status: undefined, search: "Westlands" },
      );
    });
    fireEvent.change(screen.getByLabelText("Delivery-rate status"), {
      target: { value: "ACTIVE" },
    });
    await waitFor(() => {
      expect(adminApiMocks.listDeliveryRates).toHaveBeenLastCalledWith(
        1,
        { status: "ACTIVE", search: "Westlands" },
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(await screen.findByRole("searchbox", { name: "Search county or town" }))
      .toHaveValue("");
    await waitFor(() => {
      expect(adminApiMocks.listDeliveryRates).toHaveBeenLastCalledWith(
        1,
        { status: "ACTIVE", search: "" },
      );
    });
    fireEvent.change(screen.getByLabelText("Delivery-rate status"), {
      target: { value: "INACTIVE" },
    });
    await waitFor(() => {
      expect(adminApiMocks.listDeliveryRates).toHaveBeenLastCalledWith(
        1,
        { status: "INACTIVE", search: "" },
      );
    });
  });

  it("does not allow stale delivery-rate results to replace newer results", async () => {
    adminApiMocks.listDeliveryRates.mockResolvedValue({
      data: [deliveryRate],
      pagination,
    });
    renderAdminPage("/admin/delivery-rates");
    expect(await screen.findByText("Westlands, Nairobi")).toBeInTheDocument();

    let resolveOlderRequest!: (value: {
      data: typeof deliveryRate[];
      pagination: typeof pagination;
    }) => void;
    adminApiMocks.listDeliveryRates.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveOlderRequest = resolve;
      }),
    );
    const search = screen.getByRole("searchbox", { name: "Search county or town" });
    fireEvent.change(search, { target: { value: "older query" } });
    await waitFor(() => {
      expect(adminApiMocks.listDeliveryRates).toHaveBeenLastCalledWith(
        1,
        { status: undefined, search: "older query" },
      );
    });

    fireEvent.click(screen.getByRole("link", { name: "Seller applications" }));
    expect(await screen.findByText("Nairobi Coffee")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Delivery rates" }));
    expect(await screen.findByText("Westlands, Nairobi")).toBeInTheDocument();

    resolveOlderRequest({
      data: [{ ...deliveryRate, id: "stale-rate", town: "Stale Town" }],
      pagination,
    });
    await waitFor(() => {
      expect(screen.queryByText("Stale Town, Nairobi")).not.toBeInTheDocument();
      expect(screen.getByText("Westlands, Nairobi")).toBeInTheDocument();
    });
  });

  it("validates delivery-rate fees before submitting", async () => {
    renderAdminPage("/admin/delivery-rates");
    await screen.findByText("No delivery rates configured");
    fireEvent.change(screen.getByLabelText("County"), { target: { value: "Nairobi" } });
    fireEvent.change(screen.getByLabelText("Town"), { target: { value: "Westlands" } });
    fireEvent.change(screen.getByLabelText("Delivery fee (KES)"), { target: { value: "-1" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save delivery rate" }).closest("form")!);

    expect(await screen.findByRole("alert"))
      .toHaveTextContent("Delivery fee must be between KES 0.01");
    expect(adminApiMocks.saveDeliveryRate).not.toHaveBeenCalled();
  });

  it("edits a rate and confirms deactivation", async () => {
    adminApiMocks.listDeliveryRates.mockResolvedValue({
      data: [deliveryRate],
      pagination,
    });
    renderAdminPage("/admin/delivery-rates");
    expect(await screen.findByText("Westlands, Nairobi")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Delivery fee (KES)"), { target: { value: "175" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      expect(adminApiMocks.updateDeliveryRate).toHaveBeenCalledWith("rate-1", {
        county: "Nairobi",
        town: "Westlands",
        fee: 175,
      });
    });

    fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));
    expect(window.confirm).toHaveBeenCalledWith(
      "Deactivate delivery for Westlands, Nairobi? Existing orders will not change.",
    );
    await waitFor(() => {
      expect(adminApiMocks.updateDeliveryRate).toHaveBeenLastCalledWith(
        "rate-1",
        { isActive: false },
      );
    });
  });

  it("loads and displays delivery-rate audit history", async () => {
    adminApiMocks.listDeliveryRates.mockResolvedValue({
      data: [deliveryRate],
      pagination,
    });
    adminApiMocks.listDeliveryRateAudit.mockResolvedValue({
      data: [{
        id: "audit-1",
        action: "DELIVERY_RATE_UPDATED",
        outcome: "SUCCESS",
        createdAt: "2026-01-03T12:00:00.000Z",
        actor: { id: "admin-1", fullName: "Admin User", email: "admin@example.test" },
        metadata: {
          before: { county: "Nairobi", town: "Westlands", fee: 150, isActive: true },
          after: { county: "Nairobi", town: "Westlands", fee: 175, isActive: true },
        },
      }],
      pagination,
    });

    renderAdminPage("/admin/delivery-rates");
    await screen.findByText("Westlands, Nairobi");
    fireEvent.click(screen.getByRole("button", { name: "View history" }));

    expect(await screen.findByText("delivery rate updated")).toBeInTheDocument();
    expect(screen.getByText("Admin User · admin@example.test")).toBeInTheDocument();
    expect(screen.getByText(/150\.00.*Active/)).toBeInTheDocument();
    expect(screen.getByText(/175\.00.*Active/)).toBeInTheDocument();
    expect(adminApiMocks.listDeliveryRateAudit).toHaveBeenCalledWith("rate-1", 1);
  });

  it("shows the loading state while delivery rates are requested", async () => {
    let resolveRates: ((value: {
      data: typeof deliveryRate[];
      pagination: typeof pagination;
    }) => void) | undefined;
    adminApiMocks.listDeliveryRates.mockReturnValue(new Promise((resolve) => {
      resolveRates = resolve;
    }));
    renderAdminPage("/admin/delivery-rates");
    expect(screen.getByRole("status")).toHaveTextContent("Fetching the latest information");

    resolveRates?.({ data: [], pagination });
    expect(await screen.findByText("No delivery rates configured")).toBeInTheDocument();
  });

  it("shows delivery-rate API failures and allows retry", async () => {
    adminApiMocks.listDeliveryRates.mockRejectedValueOnce(new Error("Rate service unavailable"));
    renderAdminPage("/admin/delivery-rates");
    expect(await screen.findByRole("alert")).toHaveTextContent("Rate service unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No delivery rates configured")).toBeInTheDocument();
  });
  it("shows loading and recoverable API failure states", async () => {
    let resolveApplications!: (value: {
      data: typeof application[];
      pagination: typeof pagination;
    }) => void;
    adminApiMocks.listSellerApplications.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveApplications = resolve;
      }),
    );
    const { unmount } = renderAdminPage("/admin/seller-applications");
    expect(screen.getByRole("status")).toHaveTextContent("Loading admin data");
    resolveApplications({ data: [application], pagination });
    expect(await screen.findByText("Nairobi Coffee")).toBeInTheDocument();
    unmount();

    adminApiMocks.listSellerApplications.mockRejectedValueOnce(
      new Error("Admin service unavailable."),
    );
    renderAdminPage("/admin/seller-applications");
    expect(await screen.findByRole("alert"))
      .toHaveTextContent("Admin service unavailable.");
  });
});
