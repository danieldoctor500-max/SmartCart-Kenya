import {
  MapPin,
  PackageSearch,
  ShoppingBag,
  Settings,
} from "lucide-react";
import type { DashboardNavItem } from "../../components/dashboard/DashboardShell";

export const customerNavigation: DashboardNavItem[] = [
  { label: "Overview", to: "/account", icon: PackageSearch, end: true },
  { label: "Profile settings", to: "/account/profile", icon: Settings },
  { label: "Address book", to: "/account/addresses", icon: MapPin },
  { label: "Orders", to: "/orders", icon: ShoppingBag },
];
