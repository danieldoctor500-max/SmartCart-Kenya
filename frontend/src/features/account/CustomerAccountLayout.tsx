import { Outlet, useLocation } from "react-router-dom";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { useAuth } from "../auth/auth.hooks";
import { customerNavigation } from "../dashboard/customer-navigation";

function getPageTitle(pathname: string) {
  if (pathname === "/account/profile") return "Profile settings";
  if (pathname === "/account/addresses") return "Address book";
  if (pathname === "/orders") return "Your orders";
  if (pathname.startsWith("/orders/")) return "Order details";
  return "Your account";
}

export function CustomerAccountLayout() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const description = pathname === "/account"
    ? `Welcome${user?.fullName ? `, ${user.fullName}` : ""}. Review your recent orders and manage your account.`
    : pathname === "/orders"
      ? "Review your order status, delivery information and totals."
      : pathname.startsWith("/orders/")
        ? "Review items, delivery details and order status."
        : "Manage your profile, delivery addresses and orders.";

  return (
    <DashboardShell
      workspace="CUSTOMER"
      title={getPageTitle(pathname)}
      description={description}
      navItems={customerNavigation}
    >
      <Outlet />
    </DashboardShell>
  );
}
