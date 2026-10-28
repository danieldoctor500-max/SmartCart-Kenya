
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { HomePage } from "../features/catalog/HomePage";
import { ProductsPage } from "../features/catalog/ProductsPage";
import { ProtectedRoute } from "./ProtectedRoute";

function AccountPage() {
  return (
    <section className="empty-state">
      <span className="eyebrow">YOUR ACCOUNT</span>
      <h1>Account dashboard</h1>
      <p>Your profile, orders, and account settings will be added here.</p>
    </section>
  );
}

function SellerPage() {
  return (
    <section className="empty-state">
      <span className="eyebrow">SELLER WORKSPACE</span>
      <h1>Seller dashboard</h1>
      <p>Seller tools will be connected to the seller API.</p>
    </section>
  );
}

function AdminPage() {
  return (
    <section className="empty-state">
      <span className="eyebrow">ADMINISTRATION</span>
      <h1>Admin dashboard</h1>
      <p>Administrative tools will be connected to the protected admin API.</p>
    </section>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/account" element={<AccountPage />} />
            <Route path="/cart" element={<AccountPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["SELLER", "ADMIN"]} />}>
            <Route path="/seller" element={<SellerPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
