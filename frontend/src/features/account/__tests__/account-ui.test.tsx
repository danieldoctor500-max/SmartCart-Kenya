import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthContext, type AuthContextValue } from "../../auth/auth.context-core";
import type { AuthUser } from "../../auth/auth.types";
import { accountApi } from "../account.api";
import { AddressBookPage } from "../AddressBookPage";
import { ProfileSettingsPage } from "../ProfileSettingsPage";

vi.mock("../account.api", () => ({
  accountApi: {
    listAddresses: vi.fn(),
    createAddress: vi.fn(),
    updateAddress: vi.fn(),
    setDefaultAddress: vi.fn(),
    deleteAddress: vi.fn(),
  },
  getAccountError: (error: unknown, fallback: string) => {
    if (typeof error === "object" && error !== null && "response" in error) {
      const response = (error as { response?: { status?: number; data?: { code?: string; message?: string } } }).response;
      if (response?.status === 409 && response.data?.code === "ADDRESS_IN_USE") {
        return "This address is linked to an existing order and cannot be deleted.";
      }
      if (response?.data?.message) return response.data.message;
    }
    return fallback;
  },
  getAddressValidationErrors: () => ({}),
}));

const mockUser: AuthUser = {
  id: "user-1",
  fullName: "Jane Doe",
  email: "jane@example.com",
  phone: "0712345678",
  status: "ACTIVE",
  roles: [{ role: "CUSTOMER" }],
};

function renderWithAuth(ui: ReactElement, overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    user: mockUser,
    isLoading: false,
    isAuthenticated: true,
    refreshUser: vi.fn(),
    login: vi.fn(),
    updateProfile: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };

  return render(<AuthContext.Provider value={value}>{ui}</AuthContext.Provider>);
}

describe("customer account UI", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the authenticated profile and keeps email read-only", () => {
    renderWithAuth(<ProfileSettingsPage />);

    expect(screen.getByLabelText(/full name/i)).toHaveValue("Jane Doe");
    expect(screen.getByLabelText(/email address/i)).toHaveValue("jane@example.com");
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/phone number/i)).toHaveValue("0712345678");
  });

  it("updates only supported profile fields and shows validation feedback", async () => {
    const user = userEvent.setup();
    const updateProfile = vi.fn().mockResolvedValue({
      ...mockUser,
      fullName: "Jane Smith",
      phone: "0711223344",
    });

    renderWithAuth(<ProfileSettingsPage />, { updateProfile });

    const nameInput = screen.getByLabelText(/full name/i);
    const phoneInput = screen.getByLabelText(/phone number/i);

    await user.clear(nameInput);
    await user.type(nameInput, "Jane Smith");
    await user.clear(phoneInput);
    await user.type(phoneInput, "0711223344");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith({
        fullName: "Jane Smith",
        phone: "0711223344",
      });
    });

    expect(screen.getByText(/your profile details have been saved/i)).toBeInTheDocument();

    await user.clear(phoneInput);
    await user.type(phoneInput, "1");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(screen.getByText(/between 7 and 30 characters/i)).toBeInTheDocument();
  });

  it("loads addresses, creates sanitized payloads, and supports default updates", async () => {
    const user = userEvent.setup();
    const addressList = [
      {
        id: "address-1",
        recipientName: "Alice Smith",
        phone: "0710000001",
        county: "Nairobi",
        town: "Westlands",
        addressLine: "1 Test Road",
        deliveryInstructions: "Gate code 101",
        isDefault: true,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "address-2",
        recipientName: "Bob Smith",
        phone: "0710000002",
        county: "Kiambu",
        town: "Ruiru",
        addressLine: "2 Other Road",
        deliveryInstructions: null,
        isDefault: false,
        createdAt: "2024-01-02T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      },
    ];

    const listAddresses = vi.mocked(accountApi.listAddresses);
    listAddresses.mockResolvedValue(addressList);
    const createAddress = vi.mocked(accountApi.createAddress);
    createAddress.mockResolvedValue({
      ...addressList[1],
      id: "address-3",
      recipientName: "New Customer",
      phone: "0719999999",
      county: "Mombasa",
      town: "Nyali",
      addressLine: "12 Coast Avenue",
      deliveryInstructions: "Call on arrival",
      isDefault: false,
    });
    const updateAddress = vi.mocked(accountApi.updateAddress);
    updateAddress.mockResolvedValue({
      ...addressList[0],
      county: "Nakuru",
      town: "Naivasha",
    });
    const setDefaultAddress = vi.mocked(accountApi.setDefaultAddress);
    setDefaultAddress.mockResolvedValue({
      ...addressList[1],
      isDefault: true,
    });

    render(<AddressBookPage />);

    expect(await screen.findByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText(/default address/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add address/i }));
    await user.type(screen.getByLabelText(/^Recipient name$/i), "New Customer");
    await user.type(screen.getByLabelText(/^Phone number$/i), "0719999999");
    await user.type(screen.getByLabelText(/^County$/i), "Mombasa");
    await user.type(screen.getByLabelText(/^Town$/i), "Nyali");
    await user.type(screen.getByLabelText(/^Street \/ address line$/i), "12 Coast Avenue");
    await user.type(screen.getByLabelText(/delivery instructions/i), "Call on arrival");
    await user.click(screen.getByRole("button", { name: /^add address$/i }));

    await waitFor(() =>
      expect(createAddress).toHaveBeenCalledWith({
        recipientName: "New Customer",
        phone: "0719999999",
        county: "Mombasa",
        town: "Nyali",
        addressLine: "12 Coast Avenue",
        deliveryInstructions: "Call on arrival",
      }),
    );

    const editButtons = screen.getAllByRole("button", { name: /edit address for Alice Smith/i });
    await user.click(editButtons[0]);
    await user.clear(screen.getByLabelText(/^County$/i));
    await user.type(screen.getByLabelText(/^County$/i), "Nakuru");
    await user.clear(screen.getByLabelText(/^Town$/i));
    await user.type(screen.getByLabelText(/^Town$/i), "Naivasha");
    await user.click(screen.getByRole("button", { name: /save address/i }));

    await waitFor(() =>
      expect(updateAddress).toHaveBeenCalledWith("address-1", {
        recipientName: "Alice Smith",
        phone: "0710000001",
        county: "Nakuru",
        town: "Naivasha",
        addressLine: "1 Test Road",
        deliveryInstructions: "Gate code 101",
      }),
    );

    const setDefaultButtons = screen.getAllByRole("button", { name: /set as default/i });
    await user.click(setDefaultButtons[0]);

    await waitFor(() => expect(setDefaultAddress).toHaveBeenCalledWith("address-2"));
  }, 15000);

  it("requires confirmation before deleting and keeps the address on ADDRESS_IN_USE errors", async () => {
    const user = userEvent.setup();
    const listAddresses = vi.mocked(accountApi.listAddresses);
    listAddresses.mockResolvedValue([
      {
        id: "address-1",
        recipientName: "Alice Smith",
        phone: "0710000001",
        county: "Nairobi",
        town: "Westlands",
        addressLine: "1 Test Road",
        deliveryInstructions: null,
        isDefault: false,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ]);
    const deleteAddress = vi.mocked(accountApi.deleteAddress);
    deleteAddress.mockRejectedValue({
      response: {
        status: 409,
        data: { code: "ADDRESS_IN_USE", message: "Address is in use" },
      },
    });

    render(<AddressBookPage />);

    expect(await screen.findByText("Alice Smith")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /delete address for Alice Smith/i }));
    await user.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => expect(screen.getByText(/linked to an existing order/i)).toBeInTheDocument());
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  });

  it("renders empty and error states without crashing", async () => {
    const listAddresses = vi.mocked(accountApi.listAddresses);
    listAddresses.mockResolvedValue([]);
    const { unmount } = render(<AddressBookPage />);

    await waitFor(() => expect(listAddresses).toHaveBeenCalled());
    expect(await screen.findByText(/no saved addresses yet/i)).toBeInTheDocument();

    unmount();
    listAddresses.mockRejectedValueOnce({
      response: { status: 500, data: { message: "The server is unavailable." } },
    });

    render(<AddressBookPage />);
    expect(await screen.findByText(/addresses couldn't be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
