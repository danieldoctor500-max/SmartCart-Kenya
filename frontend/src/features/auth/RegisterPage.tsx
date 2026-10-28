
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { authApi } from "./auth.api";

export function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const result = await authApi.register({
        fullName,
        email,
        password,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });

      setMessage(result.message);
      navigate("/login", {
        replace: true,
        state: { registrationMessage: result.message },
      });
    } catch (caughtError: unknown) {
      const serverMessage = axios.isAxiosError(caughtError)
        ? caughtError.response?.data?.message
        : undefined;

      setError(
        typeof serverMessage === "string"
          ? serverMessage
          : "We could not create your account. Check your details and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-card">
        <span className="eyebrow">JOIN SMARTCART</span>
        <h1>Create your account</h1>
        <p className="auth-intro">Set up your account to get started.</p>

        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="register-name">Full name</label>
          <input
            id="register-name"
            autoComplete="name"
            minLength={2}
            maxLength={100}
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />

          <label htmlFor="register-email">Email address</label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="register-phone">Phone number (optional)</label>
          <input
            id="register-phone"
            type="tel"
            autoComplete="tel"
            maxLength={30}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />

          <label htmlFor="register-password">Password</label>
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="field-hint">Use at least 12 characters.</p>

          <button className="button button-primary auth-submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="auth-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </section>
  );
}
