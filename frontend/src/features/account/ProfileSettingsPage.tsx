import { useState, type FormEvent } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { useAuth } from "../auth/auth.hooks";

function getProfileError(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as { response?: { status?: number; data?: { message?: string } } }
    ).response;
    if (response?.status && response.status >= 500) {
      return "We couldn't save your profile. Please try again.";
    }
    if (response?.data?.message) return response.data.message;
  }
  return "We couldn't save your profile. Please try again.";
}

export function ProfileSettingsPage() {
  const { user, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const name = fullName.trim();
    const normalizedPhone = phone.trim();
    const nextFieldErrors: Record<string, string> = {};
    if (name.length < 2 || name.length > 100) {
      nextFieldErrors.fullName = "Enter a name between 2 and 100 characters.";
    }
    if (
      normalizedPhone.length > 0 &&
      (normalizedPhone.length < 7 || normalizedPhone.length > 30)
    ) {
      nextFieldErrors.phone = "Enter a phone number between 7 and 30 characters.";
    }

    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setIsSaving(true);
    try {
      await updateProfile({
        fullName: name,
        phone: normalizedPhone || null,
      });
      setSuccess("Your profile details have been saved.");
    } catch (requestError: unknown) {
      setError(getProfileError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="account-panel" aria-labelledby="profile-settings-title">
      <div className="account-panel-heading">
        <div>
          <h2 id="profile-settings-title">Personal details</h2>
          <p>Update the name and phone number used on your account.</p>
        </div>
      </div>

      {success && (
        <p className="account-feedback account-feedback-success" role="status">
          <CheckCircle2 size={17} aria-hidden="true" />
          {success}
        </p>
      )}
      {error && <p className="account-feedback account-feedback-error" role="alert">{error}</p>}

      <form className="account-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="account-form-field">
          <label htmlFor="profile-full-name">Full name</label>
          <input
            autoComplete="name"
            id="profile-full-name"
            maxLength={100}
            minLength={2}
            aria-describedby={fieldErrors.fullName ? "profile-full-name-error" : undefined}
            aria-invalid={Boolean(fieldErrors.fullName)}
            onChange={(event) => {
              setFullName(event.currentTarget.value);
              setFieldErrors((current) => ({ ...current, fullName: "" }));
              setSuccess("");
            }}
            required
            value={fullName}
          />
          {fieldErrors.fullName && <span className="account-field-error" id="profile-full-name-error">{fieldErrors.fullName}</span>}
        </div>

        <div className="account-form-field">
          <label htmlFor="profile-email">Email address</label>
          <input
            autoComplete="email"
            id="profile-email"
            readOnly
            value={user?.email ?? ""}
          />
          <span className="account-field-hint">Email changes aren't available here.</span>
        </div>

        <div className="account-form-field">
          <label htmlFor="profile-phone">Phone number <span>(optional)</span></label>
          <input
            autoComplete="tel"
            id="profile-phone"
            aria-describedby={fieldErrors.phone ? "profile-phone-error" : undefined}
            aria-invalid={Boolean(fieldErrors.phone)}
            maxLength={30}
            minLength={7}
            onChange={(event) => {
              setPhone(event.currentTarget.value);
              setFieldErrors((current) => ({ ...current, phone: "" }));
              setSuccess("");
            }}
            type="tel"
            value={phone}
          />
          {fieldErrors.phone && <span className="account-field-error" id="profile-phone-error">{fieldErrors.phone}</span>}
        </div>

        <div className="account-form-actions">
          <button className="button button-primary" disabled={isSaving} type="submit">
            <Save size={16} aria-hidden="true" />
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
