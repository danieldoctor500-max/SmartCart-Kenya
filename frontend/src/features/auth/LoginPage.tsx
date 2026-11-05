import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useState, type FormEvent } from "react";
import axios from "axios";
import { useAuth } from "./auth.hooks";
import { getDefaultWorkspacePath } from "../../app/workspaces";

export function LoginPage() {
  const { login, isLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const intendedLocation = (
    location.state as {
      from?: { pathname?: string; search?: string; hash?: string };
    } | null
  )?.from;
  const intendedPath =
    intendedLocation?.pathname &&
    intendedLocation.pathname.startsWith("/") &&
    !intendedLocation.pathname.startsWith("//") &&
    intendedLocation.pathname !== "/login" &&
    intendedLocation.pathname !== "/register"
      ? `${intendedLocation.pathname}${intendedLocation.search ?? ""}${intendedLocation.hash ?? ""}`
      : null;

  if (!isLoading && isAuthenticated) {
    return (
      <Navigate
        to={intendedPath ?? getDefaultWorkspacePath(user?.roles ?? [])}
        replace
      />
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const loggedInUser = await login({ email, password });
      navigate(
        intendedPath ?? getDefaultWorkspacePath(loggedInUser.roles),
        { replace: true },
      );
    } catch (caughtError: unknown) {
      const message = axios.isAxiosError(caughtError)
        ? caughtError.response?.data?.message
        : undefined;

      setError(
        typeof message === "string"
          ? message
          : "We could not sign you in. Check your details and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-card">
        <span className="eyebrow">WELCOME BACK</span>
        <h1>Sign in to SmartCart</h1>
        <p className="auth-intro">Access your account and continue shopping.</p>

        {error && <p className="form-error" role="alert">{error}</p>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <button className="button button-primary auth-submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="auth-switch">
          New to SmartCart? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </section>
  );
}
