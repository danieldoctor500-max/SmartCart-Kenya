
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { ShoppingCart, Search, LogOut, UserRound } from "lucide-react";
import { useAuth } from "../../features/auth/auth.hooks";

export function AppLayout() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

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
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" to="/" aria-label="SmartCart Kenya home">
            <span className="brand-mark">S</span>
            <span>SmartCart <strong>Kenya</strong></span>
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

          <nav className="header-actions" aria-label="Main navigation">
            <NavLink to="/products">Shop</NavLink>

            {isAuthenticated ? (
              <>
                <NavLink to="/account" className="account-link">
                  <UserRound size={18} aria-hidden="true" />
                  Account
                </NavLink>

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
              aria-label="Open shopping cart"
            >
              <ShoppingCart size={19} aria-hidden="true" />
              <span>Cart</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="page-content">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div>
            <Link className="brand footer-brand" to="/">
              <span className="brand-mark">S</span>
              <span>SmartCart <strong>Kenya</strong></span>
            </Link>
            <p>Thoughtful shopping, built for Kenya.</p>
          </div>
          <p>© 2026 SmartCart Kenya</p>
        </div>
      </footer>
    </div>
  );
}
