import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, PackageCheck } from "lucide-react";

import { useCart } from "../cart/cart.context";
import {
  checkoutApi,
  getCheckoutError,
  type CheckoutAddress,
  type CheckoutQuote,
  type DeliveryOption,
} from "./checkout.api";

function formatPrice(amount: number, currency = "KES") {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function CheckoutPage() {
  const { cart, isLoading: isCartLoading, refreshCart } = useCart();
  const navigate = useNavigate();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [addresses, setAddresses] = useState<CheckoutAddress[]>([]);
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [addressMode, setAddressMode] = useState<"saved" | "new">("new");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [county, setCounty] = useState("");
  const [town, setTown] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [addressError, setAddressError] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryQuote, setRetryQuote] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      checkoutApi.getAddresses(),
      checkoutApi.getDeliveryOptions(),
    ])
      .then(([savedAddresses, options]) => {
        if (!active) return;
        setAddresses(savedAddresses);
        setDeliveryOptions(options);
        const preferred = savedAddresses.find((address) => address.isDefault)
          ?? savedAddresses[0];
        if (preferred) {
          setIsLoadingQuote(true);
          setSelectedAddressId(preferred.id);
          setAddressMode("saved");
          setCounty(preferred.county);
          setTown(preferred.town);
          setRecipientName(preferred.recipientName);
          setPhone(preferred.phone);
          setAddressLine(preferred.addressLine);
          setDeliveryInstructions(preferred.deliveryInstructions ?? "");
        }
      })
      .catch((error: unknown) => {
        if (active) setAddressError(getCheckoutError(error));
      })
      .finally(() => {
        if (active) setIsLoadingAddresses(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedAddress = useMemo(
    () => addresses.find((address) => address.id === selectedAddressId),
    [addresses, selectedAddressId],
  );

  useEffect(() => {
    let active = true;
    const location = addressMode === "saved"
      ? selectedAddress
        ? { addressId: selectedAddress.id }
        : null
      : county.trim() && town.trim()
        ? { county: county.trim(), town: town.trim() }
        : null;

    if (!location) {
      return () => {
        active = false;
      };
    }

    checkoutApi.getQuote(location)
      .then((result) => {
        if (active) setQuote(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setQuote(null);
          setQuoteError(getCheckoutError(error));
        }
      })
      .finally(() => {
        if (active) setIsLoadingQuote(false);
      });

    return () => {
      active = false;
    };
  }, [
    addressMode,
    selectedAddress,
    county,
    town,
    cart?.itemCount,
    retryQuote,
  ]);

  function chooseAddress(value: string) {
    setQuote(null);
    setQuoteError("");
    if (value === "new") {
      setAddressMode("new");
      setSelectedAddressId("");
      setIsLoadingQuote(Boolean(county.trim() && town.trim()));
      return;
    }
    const address = addresses.find((item) => item.id === value);
    if (!address) return;
    setAddressMode("saved");
    setSelectedAddressId(address.id);
    setIsLoadingQuote(true);
    setCounty(address.county);
    setTown(address.town);
    setRecipientName(address.recipientName);
    setPhone(address.phone);
    setAddressLine(address.addressLine);
    setDeliveryInstructions(address.deliveryInstructions ?? "");
  }

  function updateCounty(value: string) {
    setCounty(value);
    setQuote(null);
    setQuoteError("");
    setIsLoadingQuote(Boolean(value.trim() && town.trim()));
  }

  function updateTown(value: string) {
    setTown(value);
    setQuote(null);
    setQuoteError("");
    setIsLoadingQuote(Boolean(county.trim() && value.trim()));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    if (!cart || cart.items.length === 0 || !quote) return;

    setIsSubmitting(true);
    try {
      const address = addressMode === "saved" && selectedAddress
        ? { type: "saved" as const, addressId: selectedAddress.id }
        : {
            type: "new" as const,
            recipientName: recipientName.trim(),
            phone: phone.trim(),
            county: county.trim(),
            town: town.trim(),
            addressLine: addressLine.trim(),
            deliveryInstructions: deliveryInstructions.trim() || undefined,
            saveAsDefault,
          };
      const order = await checkoutApi.createOrder({
        idempotencyKey: idempotencyKey.current,
        address,
      });
      void refreshCart();
      navigate(`/orders/${encodeURIComponent(order.id)}?placed=1`, {
        replace: true,
      });
    } catch (error) {
      setSubmitError(getCheckoutError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isCartLoading || isLoadingAddresses) {
    return (
      <section className="checkout-page">
        <div className="checkout-state" role="status">Loading checkout...</div>
      </section>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <section className="checkout-page">
        <div className="checkout-state">
          <h1>Your cart is empty</h1>
          <p>Add products before starting checkout.</p>
          <Link className="button button-primary" to="/products">Browse products</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="checkout-page" aria-labelledby="checkout-title">
      <Link className="checkout-back" to="/cart">
        <ArrowLeft size={17} aria-hidden="true" />
        Back to cart
      </Link>
      <header className="checkout-heading">
        <span className="eyebrow">SECURE ORDER REVIEW</span>
        <h1 id="checkout-title">Delivery and payment summary</h1>
        <p>Review your delivery details and the server-calculated total.</p>
      </header>

      {addressError && (
        <div className="checkout-alert" role="alert">
          <p>{addressError}</p>
          <button type="button" className="button button-light" onClick={() => navigate(0)}>
            Retry
          </button>
        </div>
      )}

      <form className="checkout-layout" onSubmit={(event) => void handleSubmit(event)}>
        <div className="checkout-main">
          <section className="checkout-panel" aria-labelledby="delivery-title">
            <div className="checkout-panel-heading">
              <span className="checkout-panel-icon"><MapPin size={19} /></span>
              <div>
                <h2 id="delivery-title">Delivery address</h2>
                <p>Delivery charges depend on the configured county and town rate.</p>
              </div>
            </div>

            {addresses.length > 0 && (
              <label className="checkout-field">
                Address
                <select
                  value={addressMode === "saved" ? selectedAddressId : "new"}
                  onChange={(event) => chooseAddress(event.target.value)}
                >
                  {addresses.map((address) => (
                    <option key={address.id} value={address.id}>
                      {address.recipientName} — {address.town}, {address.county}
                    </option>
                  ))}
                  <option value="new">Enter a new address</option>
                </select>
              </label>
            )}

            {(addressMode === "new" || !selectedAddress) && (
              <div className="checkout-address-fields">
                <label className="checkout-field">
                  Recipient name
                  <input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} required minLength={2} maxLength={120} autoComplete="name" />
                </label>
                <label className="checkout-field">
                  Phone number
                  <input value={phone} onChange={(event) => setPhone(event.target.value)} required minLength={7} maxLength={30} autoComplete="tel" />
                </label>
                <label className="checkout-field">
                  County
                  <input value={county} onChange={(event) => updateCounty(event.target.value)} required minLength={2} maxLength={100} list="checkout-counties" autoComplete="address-level1" />
                  <datalist id="checkout-counties">
                    {[...new Set(deliveryOptions.map((option) => option.county))].map((name) => <option key={name} value={name} />)}
                  </datalist>
                </label>
                <label className="checkout-field">
                  Town
                  <input value={town} onChange={(event) => updateTown(event.target.value)} required minLength={1} maxLength={100} list="checkout-towns" autoComplete="address-level2" />
                  <datalist id="checkout-towns">
                    {deliveryOptions.filter((option) => !county || option.county.toLowerCase() === county.toLowerCase()).map((option) => <option key={`${option.county}-${option.town}`} value={option.town} />)}
                  </datalist>
                </label>
                <label className="checkout-field checkout-field-wide">
                  Delivery address
                  <input value={addressLine} onChange={(event) => setAddressLine(event.target.value)} required minLength={4} maxLength={300} autoComplete="street-address" />
                </label>
                <label className="checkout-field checkout-field-wide">
                  Delivery instructions <span className="field-optional">(optional)</span>
                  <textarea value={deliveryInstructions} onChange={(event) => setDeliveryInstructions(event.target.value)} maxLength={500} rows={3} />
                </label>
                <label className="checkout-checkbox checkout-field-wide">
                  <input type="checkbox" checked={saveAsDefault} onChange={(event) => setSaveAsDefault(event.target.checked)} />
                  Save this address as my default
                </label>
              </div>
            )}
          </section>

          <section className="checkout-panel" aria-labelledby="items-title">
            <div className="checkout-panel-heading">
              <span className="checkout-panel-icon"><PackageCheck size={19} /></span>
              <div>
                <h2 id="items-title">Items in your order</h2>
                <p>{cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}</p>
              </div>
            </div>
            <div className="checkout-items">
              {cart.items.map((item) => (
                <div className="checkout-item" key={item.id}>
                  <div>
                    <strong>{item.product.name}</strong>
                    <span>Qty {item.quantity} · {formatPrice(item.unitPrice, item.currency)} each</span>
                  </div>
                  <strong>{formatPrice(item.subtotal, item.currency)}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="checkout-summary" aria-labelledby="checkout-summary-title">
          <h2 id="checkout-summary-title">Order summary</h2>
          <div className="checkout-total-row">
            <span>Subtotal</span>
            <strong>{formatPrice(quote?.subtotal ?? cart.subtotal)}</strong>
          </div>
          <div className="checkout-total-row">
            <span>Delivery</span>
            <strong>{quote ? formatPrice(quote.deliveryFee) : "—"}</strong>
          </div>
          {isLoadingQuote && <p className="checkout-hint" role="status">Calculating delivery and total...</p>}
          {quoteError && (
            <div className="checkout-inline-error" role="alert">
              <p>{quoteError}</p>
              <button type="button" className="checkout-retry" onClick={() => { setIsLoadingQuote(true); setRetryQuote((value) => value + 1); }}>Retry quote</button>
            </div>
          )}
          <div className="checkout-total-row checkout-grand-total">
            <span>Total</span>
            <strong>{quote ? formatPrice(quote.grandTotal) : "—"}</strong>
          </div>
          {submitError && <p className="checkout-inline-error" role="alert">{submitError}</p>}
          <p className="checkout-hint">
            Payment processing is not enabled yet. This step places the order and reserves the available stock.
          </p>
          <button
            className="button button-primary checkout-submit"
            type="submit"
            disabled={isSubmitting || isLoadingQuote || !quote || Boolean(quoteError)}
          >
            {isSubmitting ? "Placing order..." : "Place order"}
          </button>
          <Link className="checkout-edit-cart" to="/cart">Edit cart</Link>
        </aside>
      </form>
    </section>
  );
}
