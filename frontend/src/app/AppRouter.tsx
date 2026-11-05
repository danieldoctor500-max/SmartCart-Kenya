
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { AppLayout } from "../components/layout/AppLayout";

import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";

import { HomePage } from "../features/catalog/HomePage";
import { ProductDetailPage } from "../features/catalog/ProductDetailPage";
import { ProductsPage } from "../features/catalog/ProductsPage";

import { CartPage } from "../features/cart/CartPage";
import { CheckoutPage } from "../features/checkout/CheckoutPage";
import { OrdersPage } from "../features/orders/OrdersPage";
import { OrderDetailPage } from "../features/orders/OrderDetailPage";
import { SellerProductsPage } from "../features/seller/SellerProductsPage";
import { SellerOrdersPage } from "../features/seller/SellerOrdersPage";
import { CustomerDashboardPage } from "../features/dashboard/CustomerDashboardPage";
import { SellerDashboardPage } from "../features/dashboard/SellerDashboardPage";
import { AdminDashboardPage } from "../features/dashboard/AdminDashboardPage";
import { CustomerAccountLayout } from "../features/account/CustomerAccountLayout";
import { ProfileSettingsPage } from "../features/account/ProfileSettingsPage";
import { AddressBookPage } from "../features/account/AddressBookPage";

import { ProtectedRoute } from "./ProtectedRoute";
import { WorkspaceSelectionPage } from "./WorkspaceSelectionPage";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          {/* Public storefront */}
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route
            path="/products/:storeSlug/:productSlug"
            element={<ProductDetailPage />}
          />

          {/* Authentication */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/workspaces" element={<WorkspaceSelectionPage />} />
          </Route>

          {/* Shopping cart supports guest access */}
          <Route path="/cart" element={<CartPage />} />

          {/* Authenticated customer routes */}
          <Route element={<ProtectedRoute allowedRoles={["CUSTOMER"]} />}>
            <Route element={<CustomerAccountLayout />}>
              <Route path="/account" element={<CustomerDashboardPage />} />
              <Route path="/account/profile" element={<ProfileSettingsPage />} />
              <Route path="/account/addresses" element={<AddressBookPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:orderId" element={<OrderDetailPage />} />
            </Route>
            <Route path="/checkout" element={<CheckoutPage />} />
          </Route>

          {/* Customers can apply to sell; approved seller actions remain role protected. */}
          <Route element={<ProtectedRoute allowedRoles={["CUSTOMER", "SELLER"]} />}>
            <Route path="/seller" element={<SellerDashboardPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={["SELLER"]} />}>
            <Route path="/seller/products" element={<SellerProductsPage />} />
            <Route path="/seller/orders" element={<SellerOrdersPage />} />
            <Route path="/seller/orders/:sellerOrderId" element={<SellerOrdersPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/seller-applications" element={<AdminDashboardPage />} />
            <Route path="/admin/stores" element={<AdminDashboardPage />} />
            <Route path="/admin/delivery-rates" element={<AdminDashboardPage />} />
          </Route>

          {/* Unknown routes return to the storefront */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
