import { ArrowRight, LayoutDashboard, Store, UserRound } from "lucide-react";
import { Link, Navigate } from "react-router-dom";

import { useAuth } from "../features/auth/auth.hooks";
import type { UserRole } from "../features/auth/auth.types";
import { getWorkspaceRoles, getWorkspacePath } from "./workspaces";

const workspaceDescription: Record<UserRole, string> = {
  CUSTOMER: "View your orders and manage your shopping experience.",
  SELLER: "Continue to your seller application or product workspace.",
  ADMIN: "Review seller applications, stores and delivery rates.",
};

const workspaceIcon = {
  CUSTOMER: UserRound,
  SELLER: Store,
  ADMIN: LayoutDashboard,
} satisfies Record<UserRole, typeof UserRound>;

export function WorkspaceSelectionPage() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  const roles = getWorkspaceRoles(user.roles);

  return (
    <section className="workspace-selection">
      <span className="eyebrow">SMARTCART KENYA</span>
      <h1>Choose a workspace</h1>
      <p>Select where you want to continue.</p>
      <div className="workspace-selection-grid">
        {roles.map((role) => {
          const Icon = workspaceIcon[role];
          return (
            <Link
              className="workspace-choice"
              key={role}
              to={getWorkspacePath(role)}
            >
              <span className="workspace-choice-icon">
                <Icon size={21} aria-hidden="true" />
              </span>
              <span>
                <strong>
                  {role === "CUSTOMER"
                    ? "Customer workspace"
                    : role === "SELLER"
                      ? "Seller workspace"
                      : "Admin workspace"}
                </strong>
                <small>{workspaceDescription[role]}</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
