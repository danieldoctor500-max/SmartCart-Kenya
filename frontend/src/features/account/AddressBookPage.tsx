import { useEffect, useState, type FormEvent } from "react";
import {
  Check,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  accountApi,
  getAccountError,
  getAddressValidationErrors,
  type AddressInput,
  type CustomerAddress,
} from "./account.api";

interface AddressFormValues {
  recipientName: string;
  phone: string;
  county: string;
  town: string;
  addressLine: string;
  deliveryInstructions: string;
}

const emptyAddress: AddressFormValues = {
  recipientName: "",
  phone: "",
  county: "",
  town: "",
  addressLine: "",
  deliveryInstructions: "",
};

function addressToForm(address: CustomerAddress): AddressFormValues {
  return {
    recipientName: address.recipientName,
    phone: address.phone,
    county: address.county,
    town: address.town,
    addressLine: address.addressLine,
    deliveryInstructions: address.deliveryInstructions ?? "",
  };
}

function validateAddress(values: AddressFormValues) {
  const errors: Record<string, string> = {};
  const checks: Array<[keyof AddressFormValues, string, number, number]> = [
    ["recipientName", "Recipient name", 2, 120],
    ["phone", "Phone number", 7, 30],
    ["county", "County", 2, 100],
    ["town", "Town", 1, 100],
    ["addressLine", "Street or address line", 4, 300],
  ];

  for (const [field, label, min, max] of checks) {
    const length = values[field].trim().length;
    if (length < min || length > max) {
      errors[field] = `Enter ${label.toLowerCase()} using ${min} to ${max} characters.`;
    }
  }

  if (values.deliveryInstructions.trim().length > 500) {
    errors.deliveryInstructions = "Delivery instructions must be 500 characters or fewer.";
  }
  return errors;
}

function toAddressInput(values: AddressFormValues): AddressInput {
  return {
    recipientName: values.recipientName.trim(),
    phone: values.phone.trim(),
    county: values.county.trim(),
    town: values.town.trim(),
    addressLine: values.addressLine.trim(),
    deliveryInstructions: values.deliveryInstructions.trim() || null,
  };
}

export function AddressBookPage() {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formValues, setFormValues] = useState(emptyAddress);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    accountApi.listAddresses()
      .then((result) => {
        if (!active) return;
        setAddresses(result);
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            getAccountError(error, "Your saved addresses couldn't be loaded."),
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [retry]);

  function openCreateForm() {
    setEditingAddressId(null);
    setFormValues(emptyAddress);
    setFieldErrors({});
    setFormError("");
    setFeedback("");
    setIsFormOpen(true);
  }

  function openEditForm(address: CustomerAddress) {
    setEditingAddressId(address.id);
    setFormValues(addressToForm(address));
    setFieldErrors({});
    setFormError("");
    setFeedback("");
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingAddressId(null);
    setFormValues(emptyAddress);
    setFieldErrors({});
    setFormError("");
  }

  function updateField(field: keyof AddressFormValues, value: string) {
    setFormValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
    setFormError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setFormError("");
    const errors = validateAddress(formValues);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const actionId = editingAddressId ?? "create";
    setPendingAction(actionId);
    try {
      const input = toAddressInput(formValues);
      let savedAddress: CustomerAddress;
      if (editingAddressId) {
        savedAddress = await accountApi.updateAddress(editingAddressId, input);
        setAddresses((current) =>
          sortAddresses(current.map((address) =>
            address.id === savedAddress.id ? savedAddress : address,
          )),
        );
      } else {
        savedAddress = await accountApi.createAddress(input);
        setAddresses((current) => sortAddresses([...current, savedAddress]));
      }
      closeForm();
      setFeedback(editingAddressId ? "Address updated." : "Address added.");
      setFeedbackError(false);
    } catch (error: unknown) {
      setFieldErrors(getAddressValidationErrors(error));
      setFormError(
        getAccountError(error, "The address couldn't be saved. Please try again."),
      );
    } finally {
      setPendingAction("");
    }
  }

  async function handleSetDefault(addressId: string) {
    setFeedback("");
    setPendingAction(`default:${addressId}`);
    try {
      const updatedAddress = await accountApi.setDefaultAddress(addressId);
      setAddresses((current) =>
        sortAddresses(current.map((address) => ({
          ...address,
          isDefault: address.id === updatedAddress.id && updatedAddress.isDefault,
        }))),
      );
      setFeedback("Default delivery address updated.");
      setFeedbackError(false);
    } catch (error: unknown) {
      setFeedback(getAccountError(error, "The default address couldn't be updated."));
      setFeedbackError(true);
    } finally {
      setPendingAction("");
    }
  }

  async function handleDelete(addressId: string) {
    setFeedback("");
    setPendingAction(`delete:${addressId}`);
    try {
      await accountApi.deleteAddress(addressId);
      setAddresses((current) => current.filter(({ id }) => id !== addressId));
      setConfirmDeleteId(null);
      setFeedback("Address deleted.");
      setFeedbackError(false);
    } catch (error: unknown) {
      setFeedback(getAccountError(error, "The address couldn't be deleted."));
      setFeedbackError(true);
    } finally {
      setPendingAction("");
    }
  }

  if (isLoading) {
    return <div className="account-state" role="status">Loading your saved addresses...</div>;
  }

  if (loadError && addresses.length === 0) {
    return (
      <div className="account-state account-state-error" role="alert">
        <h2>Addresses couldn't be loaded</h2>
        <p>{loadError}</p>
        <button
          className="button button-light"
          onClick={() => {
            setIsLoading(true);
            setRetry((current) => current + 1);
          }}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <section className="address-book" aria-label="Saved delivery addresses">
      <div className="account-section-heading">
        <div>
          <h2>Saved addresses</h2>
          <p>Manage the delivery details available during checkout.</p>
        </div>
        {!isFormOpen && (
          <button className="button button-primary" onClick={openCreateForm} type="button">
            <Plus size={17} aria-hidden="true" />
            Add address
          </button>
        )}
      </div>

      {feedback && (
        <p
          className={`account-feedback ${feedbackError ? "account-feedback-error" : "account-feedback-success"}`}
          role={feedbackError ? "alert" : "status"}
        >
          {feedback}
        </p>
      )}
      {loadError && <p className="account-feedback account-feedback-error" role="alert">{loadError}</p>}

      {isFormOpen && (
        <section className="account-panel address-form-panel" aria-labelledby="address-form-title">
          <div className="account-panel-heading">
            <div>
              <h2 id="address-form-title">{editingAddressId ? "Edit address" : "Add a delivery address"}</h2>
              <p>Enter the recipient and delivery location details.</p>
            </div>
            <button
              aria-label="Cancel address form"
              className="account-icon-button"
              disabled={Boolean(pendingAction)}
              onClick={closeForm}
              type="button"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {formError && <p className="account-feedback account-feedback-error" role="alert">{formError}</p>}

          <form className="account-form address-form-grid" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <AddressField
              autoComplete="name"
              error={fieldErrors.recipientName}
              id="address-recipient"
              label="Recipient name"
              maxLength={120}
              onChange={(value) => updateField("recipientName", value)}
              required
              value={formValues.recipientName}
            />
            <AddressField
              autoComplete="tel"
              error={fieldErrors.phone}
              id="address-phone"
              label="Phone number"
              maxLength={30}
              minLength={7}
              onChange={(value) => updateField("phone", value)}
              required
              type="tel"
              value={formValues.phone}
            />
            <AddressField
              autoComplete="address-level1"
              error={fieldErrors.county}
              id="address-county"
              label="County"
              maxLength={100}
              onChange={(value) => updateField("county", value)}
              required
              value={formValues.county}
            />
            <AddressField
              autoComplete="address-level2"
              error={fieldErrors.town}
              id="address-town"
              label="Town"
              maxLength={100}
              onChange={(value) => updateField("town", value)}
              required
              value={formValues.town}
            />
            <AddressField
              autoComplete="street-address"
              error={fieldErrors.addressLine}
              id="address-line"
              label="Street / address line"
              maxLength={300}
              minLength={4}
              onChange={(value) => updateField("addressLine", value)}
              required
              value={formValues.addressLine}
            />
            <div className="account-form-field address-instructions-field">
              <label htmlFor="address-instructions">Delivery instructions <span>(optional)</span></label>
              <textarea
                aria-describedby={fieldErrors.deliveryInstructions ? "address-instructions-error" : undefined}
                aria-invalid={Boolean(fieldErrors.deliveryInstructions)}
                id="address-instructions"
                maxLength={500}
                onChange={(event) => updateField("deliveryInstructions", event.currentTarget.value)}
                rows={3}
                value={formValues.deliveryInstructions}
              />
              {fieldErrors.deliveryInstructions && <span className="account-field-error" id="address-instructions-error">{fieldErrors.deliveryInstructions}</span>}
            </div>
            <div className="account-form-actions address-form-actions">
              <button
                className="button button-light"
                disabled={Boolean(pendingAction)}
                onClick={closeForm}
                type="button"
              >
                Cancel
              </button>
              <button className="button button-primary" disabled={Boolean(pendingAction)} type="submit">
                <Check size={16} aria-hidden="true" />
                {pendingAction ? "Saving..." : editingAddressId ? "Save address" : "Add address"}
              </button>
            </div>
          </form>
        </section>
      )}

      {!isFormOpen && addresses.length === 0 && (
        <div className="account-state">
          <MapPin size={28} aria-hidden="true" />
          <h2>No saved addresses yet</h2>
          <p>Add a delivery address to make checkout quicker.</p>
          <button className="button button-primary" onClick={openCreateForm} type="button">
            <Plus size={17} aria-hidden="true" />
            Add address
          </button>
        </div>
      )}

      {!isFormOpen && addresses.length > 0 && (
        <div className="address-card-list">
          {addresses.map((address) => {
            const isDeleting = pendingAction === `delete:${address.id}`;
            const isSettingDefault = pendingAction === `default:${address.id}`;
            return (
              <article className="address-card" key={address.id}>
                <div className="address-card-heading">
                  <div className="address-recipient">
                    <span className="address-icon"><MapPin size={18} aria-hidden="true" /></span>
                    <div>
                      <h3>{address.recipientName}</h3>
                      {address.isDefault && (
                        <span className="address-default-badge">
                          <Star size={13} aria-hidden="true" />
                          Default address
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="address-phone">{address.phone}</span>
                </div>

                <address className="address-details">
                  <span>{address.addressLine}</span>
                  <span>{address.town}, {address.county}</span>
                  {address.deliveryInstructions && <span>Instructions: {address.deliveryInstructions}</span>}
                </address>

                {confirmDeleteId === address.id ? (
                  <div className="address-delete-confirm" role="group" aria-label={`Confirm deleting address for ${address.recipientName}`}>
                    <span>Delete this saved address?</span>
                    <button
                      className="button button-danger"
                      disabled={Boolean(pendingAction)}
                      onClick={() => void handleDelete(address.id)}
                      type="button"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      {isDeleting ? "Deleting..." : "Confirm delete"}
                    </button>
                    <button
                      className="button button-light"
                      disabled={Boolean(pendingAction)}
                      onClick={() => setConfirmDeleteId(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="address-actions">
                    {!address.isDefault && (
                      <button
                        className="button button-light"
                        disabled={Boolean(pendingAction)}
                        onClick={() => void handleSetDefault(address.id)}
                        type="button"
                      >
                        <Star size={15} aria-hidden="true" />
                        {isSettingDefault ? "Updating..." : "Set as default"}
                      </button>
                    )}
                    <button
                      aria-label={`Edit address for ${address.recipientName}`}
                      className="button button-light"
                      disabled={Boolean(pendingAction)}
                      onClick={() => openEditForm(address)}
                      type="button"
                    >
                      <Pencil size={15} aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      aria-label={`Delete address for ${address.recipientName}`}
                      className="button button-light"
                      disabled={Boolean(pendingAction)}
                      onClick={() => {
                        setFeedback("");
                        setConfirmDeleteId(address.id);
                      }}
                      type="button"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function sortAddresses(addresses: CustomerAddress[]) {
  return [...addresses].sort((first, second) =>
    Number(second.isDefault) - Number(first.isDefault) ||
    second.createdAt.localeCompare(first.createdAt) ||
    first.id.localeCompare(second.id),
  );
}

function AddressField({
  autoComplete,
  error,
  id,
  label,
  maxLength,
  minLength,
  onChange,
  required = false,
  type = "text",
  value,
}: {
  autoComplete?: string;
  error?: string;
  id: string;
  label: string;
  maxLength: number;
  minLength?: number;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <div className="account-form-field">
      <label htmlFor={id}>{label}</label>
      <input
        autoComplete={autoComplete}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={Boolean(error)}
        id={id}
        maxLength={maxLength}
        minLength={minLength}
        onChange={(event) => onChange(event.currentTarget.value)}
        required={required}
        type={type}
        value={value}
      />
      {error && <span className="account-field-error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}
