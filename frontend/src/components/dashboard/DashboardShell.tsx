import { useState, type MouseEvent, type ReactNode } from "react";
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  ShoppingCart,
  Store,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../../features/auth/auth.hooks";
import type { UserRole } from "../../features/auth/auth.types";
import { useCart } from "../../features/cart/cart.context";

export interface DashboardNavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

interface DashboardShellProps {
  workspace: UserRole;
  title: string;
  description?: string;
  navItems: DashboardNavItem[];
  children: ReactNode;
}

const workspaceInfo: Record<
  UserRole,
  { label: string; path: string; icon: LucideIcon }
> = {
  CUSTOMER: {
    label: "Customer workspace",
    path: "/account",
    icon: UserRound,
  },
  SELLER: {
    label: "Seller workspace",
    path: "/seller",
    icon: Store,
  },
  ADMIN: {
    label: "Admin workspace",
    path: "/admin",
    icon: LayoutDashboard,
  },
};

export function DashboardShell({
  workspace,
  title,
  description,
  navItems,
  children,
}: DashboardShellProps) {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState("");
  const roles = user?.roles.map(({ role }) => role) ?? [];
  const selectableRoles = [...new Set([...roles, workspace])];
  const currentWorkspace = workspaceInfo[workspace];

  async function handleLogout() {
    setLogoutError("");
    try {
      await logout();
      navigate("/", { replace: true });
    } catch {
      setLogoutError("We couldn't sign you out. Please try again.");
    }
  }

  function closeMobileNavigation(
    event: MouseEvent<HTMLAnchorElement>,
  ) {
    event.currentTarget.closest("details")?.removeAttribute("open");
  }

  const navigation = (
    <nav className="dashboard-nav" aria-label={`${currentWorkspace.label} navigation`}>
      {navItems.map(({ label, to, icon: Icon, end }) => (
        <NavLink
          className={({ isActive }) =>
            `dashboard-nav-link${isActive ? " is-active" : ""}`
          }
          end={end}
          key={to}
          onClick={closeMobileNavigation}
          to={to}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <section className="dashboard-page">
      <header className="dashboard-topbar">
        <Link className="dashboard-brand" to="/">
          <span className="brand-mark">S</span>
          <span>SmartCart <strong>Kenya</strong></span>
        </Link>

        <div className="dashboard-topbar-actions">
          <Link className="dashboard-cart-link" to="/cart">
            <ShoppingCart size={17} aria-hidden="true" />
            <span>Cart</span>
            {itemCount > 0 && <span className="dashboard-cart-count">{itemCount > 99 ? "99+" : itemCount}</span>}
          </Link>
          {roles.length > 1 && (
            <label className="dashboard-workspace-select">
              <span className="sr-only">Switch workspace</span>
              <select
                aria-label="Switch workspace"
                value={workspace}
                onChange={(event) => {
                  const role = selectableRoles.find(
                    (availableRole) => availableRole === event.currentTarget.value,
                  );
                  if (role) navigate(workspaceInfo[role].path);
                }}
              >
                {selectableRoles.map((role) => (
                  <option key={role} value={role}>
                    {workspaceInfo[role].label}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </label>
          )}

          <details className="dashboard-account-menu">
            <summary aria-label="Open account menu">
              <span className="dashboard-avatar" aria-hidden="true">
                {user?.fullName.trim().slice(0, 1).toUpperCase() ?? "U"}
              </span>
              <span className="dashboard-account-name">{user?.fullName}</span>
              <ChevronDown size={15} aria-hidden="true" />
            </summary>
            <div className="dashboard-account-popover">
              <strong>{user?.fullName}</strong>
              <span>{user?.email}</span>
              {roles.includes("CUSTOMER") && (
                <Link to="/account">Customer account</Link>
              )}
              {roles.length > 1 && (
                <Link to="/workspaces">All workspaces</Link>
              )}
              <button type="button" onClick={() => void handleLogout()}>
                <LogOut size={15} aria-hidden="true" />
                Sign out
              </button>
            </div>
          </details>

          <details className="dashboard-mobile-menu">
            <summary aria-label="Open workspace navigation">
              <Menu size={21} aria-hidden="true" />
              <span>Menu</span>
            </summary>
            {navigation}
          </details>
        </div>
      </header>

      <div className="dashboard-frame">
        <aside className="dashboard-sidebar" aria-label="Workspace sidebar">
          <div className="dashboard-workspace-label">
            <span className="eyebrow">{workspace} WORKSPACE</span>
            <strong>{currentWorkspace.label}</strong>
          </div>
          {navigation}
          {roles.length > 1 && (
            <div className="dashboard-switcher">
              <span>Switch workspace</span>
              {roles
                .filter((role) => role !== workspace)
                .map((role) => {
                  const info = workspaceInfo[role];
                  const Icon = info.icon;
                  return (
                    <Link key={role} to={info.path}>
                      <Icon size={16} aria-hidden="true" />
                      {info.label}
                    </Link>
                  );
                })}
            </div>
          )}
        </aside>

        <main className="dashboard-content">
          <div className="dashboard-page-heading">
            <div>
              <span className="dashboard-breadcrumb">
                <Link to={currentWorkspace.path}>{currentWorkspace.label}</Link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{title}</span>
              </span>
              <h1>{title}</h1>
              {description && <p>{description}</p>}
            </div>
          </div>
          {logoutError && <p className="dashboard-alert" role="alert">{logoutError}</p>}
          {children}
        </main>
      </div>
    </section>
  );
}

export function DashboardState({
  title,
  message,
  isError = false,
  action,
}: {
  title: string;
  message: string;
  isError?: boolean;
  action?: ReactNode;
}) {
  return (
    <div
      className={`dashboard-state${isError ? " dashboard-state-error" : ""}`}
      role={isError ? "alert" : "status"}
    >
      <h2>{title}</h2>
      <p>{message}</p>
      {action}
    </div>
  );
}
