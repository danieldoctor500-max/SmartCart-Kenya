import type { UserRole } from "../features/auth/auth.types";

const workspacePaths: Record<UserRole, string> = {
  CUSTOMER: "/account",
  SELLER: "/seller",
  ADMIN: "/admin",
};

export function getWorkspaceRoles(
  roles: Array<{ role: UserRole }>,
): UserRole[] {
  return [...new Set(roles.map(({ role }) => role))];
}

export function getDefaultWorkspacePath(
  roles: Array<{ role: UserRole }>,
): string {
  const availableRoles = getWorkspaceRoles(roles);

  if (availableRoles.length > 1) return "/workspaces";
  if (availableRoles.length === 1) return workspacePaths[availableRoles[0]!];
  return "/";
}

export function getWorkspacePath(role: UserRole): string {
  return workspacePaths[role];
}
