
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../features/auth/auth.hooks";

interface ProtectedRouteProps {
  allowedRoles?: string[];
}

export function ProtectedRoute({
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <main className="route-loading">Checking your session...</main>;
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  if (
    allowedRoles &&
    !user.roles.some(({ role }) => allowedRoles.includes(role))
  ) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
