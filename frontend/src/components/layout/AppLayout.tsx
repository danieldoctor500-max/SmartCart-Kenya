
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  Search,
  LogOut,
  UserRound,
} from "lucide-react";

import { useAuth } from "../../features/auth/auth.hooks";
import { useCart } from "../../features/cart/cart.context";

export function AppLayout() {
  const { user, isAuthenticated, logout } = useAuth();
  const { itemCount, isLoading } = useCart();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isDashboardRoute =
    pathname === "/workspaces" ||
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    pathname === "/orders" ||
    pathname.startsWith("/orders/") ||
    pathname === "/seller" ||
    pathname.startsWith("/seller/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/");
  const roles = user?.roles.map(({ role }) => role) ?? [];
  const accountDestination = roles.includes("CUSTOMER")
    ? "/account"
    : roles.includes("SELLER")
      ? "/seller"
      : roles.includes("ADMIN")
        ? "/admin"
        : "/workspaces";
  const accountLabel = roles.includes("CUSTOMER")
    ? "My account"
    : roles.includes("SELLER")
      ? "Seller workspace"
      : roles.includes("ADMIN")
        ? "Admin workspace"
        : "Workspaces";

  async function handleLogout() {
    try {
      await logout();
      navigate("/", { replace: true });
    } catch {
      navigate("/", { replace: true });
    }
  }

  return (
    <div className="app-shell">
      {!isDashboardRoute && <header className="site-header">
        <div className="header-inner">
          <Link
            className="brand"
            to="/"
            aria-label="SmartCart Kenya home"
          >
            <span className="brand-mark">S</span>
            <span>
              SmartCart <strong>Kenya</strong>
            </span>
          </Link>

          <form
            className="search-form"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();

              const formData = new FormData(event.currentTarget);
              const query = String(formData.get("q") ?? "").trim();

              navigate(
                query
                  ? `/products?q=${encodeURIComponent(query)}`
                  : "/products",
              );
            }}
          >
            <Search size={18} aria-hidden="true" />

            <input
              name="q"
              type="search"
              placeholder="Search products..."
              aria-label="Search products"
            />

            <button type="submit">Search</button>
          </form>

          <nav
            className="header-actions"
            aria-label="Main navigation"
          >
            <NavLink to="/products">Shop</NavLink>

            {isAuthenticated ? (
              <>
                {user?.roles.some(({ role }) => role === "SELLER") && (
                  <NavLink to="/seller">Seller workspace</NavLink>
                )}
                {user?.roles.some(({ role }) => role === "CUSTOMER") &&
                  !user.roles.some(({ role }) => role === "SELLER") && (
                    <NavLink to="/seller">Become a seller</NavLink>
                  )}
                {(user?.roles.some(({ role }) => role === "CUSTOMER") ||
                  user?.roles.some(({ role }) => role === "SELLER")) && (
                  <NavLink
                    to={user?.roles.some(({ role }) => role === "CUSTOMER") ? "/account" : "/seller"}
                    className="account-link"
                  >
                    <UserRound size={18} aria-hidden="true" />
                    {user?.roles.some(({ role }) => role === "CUSTOMER") ? "Account" : "Seller"}
                  </NavLink>
                )}
                {user?.roles.some(({ role }) => role === "ADMIN") && (
                  <NavLink to="/admin">Admin workspace</NavLink>
                )}
                {roles.length > 1 && <NavLink to="/workspaces">Workspaces</NavLink>}
                {user?.roles.some(({ role }) => role === "CUSTOMER") && (
                  <NavLink to="/orders">Orders</NavLink>
                )}

                <button
                  className="text-button"
                  type="button"
                  onClick={() => void handleLogout()}
                >
                  <LogOut size={17} aria-hidden="true" />
                  Sign out
                </button>
              </>
            ) : (
              <NavLink to="/login">Sign in</NavLink>
            )}

            <button
              className="cart-button"
              type="button"
              onClick={() => navigate("/cart")}
              aria-label={
                isLoading
                  ? "Open shopping cart, loading item count"
                  : `Open shopping cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`
              }
            >
              <span className="cart-button-icon">
                <ShoppingCart size={19} aria-hidden="true" />

                {itemCount > 0 && (
                  <span
                    className="cart-count-badge"
                    aria-label={`${itemCount} items`}
                  >
                    {itemCount > 99 ? "99+" : itemCount}
                  </span>
                )}
              </span>

              <span>Cart</span>
            </button>
          </nav>
        </div>
      </header>}

      {isDashboardRoute ? (
        <div className="page-content dashboard-layout-content">
          <Outlet />
        </div>
      ) : (
        <main className="page-content">
          <Outlet />
        </main>
      )}

      {!isDashboardRoute && <footer className="site-footer">
        <div className="footer-inner">
          <div>
            <Link className="brand footer-brand" to="/">
              <span className="brand-mark">S</span>
              <span>
                SmartCart <strong>Kenya</strong>
              </span>
            </Link>

            <p>Thoughtful shopping, built for Kenya.</p>
          </div>

          <nav className="footer-navigation" aria-label="Footer navigation">
            <Link to="/products">Shop</Link>
            <Link to="/cart">Cart</Link>
            <Link to={isAuthenticated ? accountDestination : "/login"}>
              {isAuthenticated ? accountLabel : "Sign in"}
            </Link>
            <Link to="/register">Create account</Link>
          </nav>

          <p>© 2026 SmartCart Kenya</p>
        </div>
      </footer>}
    </div>
  );
}
