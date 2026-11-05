
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Trash2,
} from "lucide-react";

import { useCart } from "./cart.context";

function formatPrice(amount: number, currency = "KES"): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function CartPage() {
  const {
    cart,
    isLoading,
    isMutating,
    error,
    refreshCart,
    updateItem,
    removeItem,
    clearCart,
  } = useCart();

  const navigate = useNavigate();
  const [actionError, setActionError] = useState("");
  const [isClearing, setIsClearing] = useState(false);

  async function handleUpdate(itemId: string, quantity: number) {
    setActionError("");

    try {
      await updateItem(itemId, quantity);
    } catch {
      setActionError(
        "We couldn't update the quantity. Please check your connection and try again.",
      );
    }
  }

  async function handleRemove(itemId: string) {
    setActionError("");

    try {
      await removeItem(itemId);
    } catch {
      setActionError("We couldn't remove this item. Please try again.");
    }
  }

  async function handleClearCart() {
    if (!cart || cart.items.length === 0 || isMutating) {
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to remove every item from your cart?",
    );

    if (!confirmed) {
      return;
    }

    setActionError("");
    setIsClearing(true);

    try {
      await clearCart();
    } catch {
      setActionError("We couldn't clear your cart. Please try again.");
    } finally {
      setIsClearing(false);
    }
  }

  const hasItems = Boolean(cart && cart.items.length > 0);

  const hasInvalidItems = Boolean(
    cart?.items.some(
      (item) =>
        !item.productAvailable ||
        item.needsReview ||
        item.quantity > item.availableQuantity,
    ),
  );

  if (isLoading && !cart) {
    return (
      <section className="cart-page" aria-labelledby="cart-loading-title">
        <div className="cart-status" role="status" aria-live="polite">
          <ShoppingBag size={25} aria-hidden="true" />
          <p id="cart-loading-title">Loading your shopping cart...</p>
        </div>
      </section>
    );
  }

  if (!cart && error) {
    return (
      <section className="cart-page" aria-labelledby="cart-error-title">
        <div className="cart-message cart-message-error" role="alert">
          <h1 id="cart-error-title">We couldn't load your cart</h1>
          <p>{error}</p>

          <button
            className="button button-primary"
            type="button"
            disabled={isLoading}
            onClick={() => {
              setActionError("");
              void refreshCart();
            }}
          >
            {isLoading ? "Trying again..." : "Try again"}
          </button>

          <p>
            <Link to="/products">Browse products instead</Link>
          </p>
        </div>
      </section>
    );
  }

  if (!hasItems || !cart) {
    return (
      <section className="cart-page" aria-labelledby="cart-empty-title">
        <Link className="cart-back-link" to="/products">
          <ArrowLeft size={17} aria-hidden="true" />
          Continue shopping
        </Link>

        {actionError && (
          <div className="cart-message cart-message-error" role="alert">
            {actionError}
          </div>
        )}

        <div className="cart-empty">
          <div className="cart-empty-icon">
            <ShoppingBag size={32} aria-hidden="true" />
          </div>

          <span className="eyebrow">YOUR SHOPPING CART</span>

          <h1 id="cart-empty-title">Your cart is waiting</h1>

          <p>
            You haven't added any products yet. Explore SmartCart Kenya
            and find something you need.
          </p>

          <Link className="button button-primary" to="/products">
            Explore products
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="cart-page" aria-labelledby="cart-title">
      <div className="cart-heading">
        <div>
          <span className="eyebrow">YOUR SELECTION</span>

          <h1 id="cart-title">Shopping cart</h1>

          <p>
            {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"} in your cart
          </p>
        </div>

        <Link className="cart-back-link" to="/products">
          <ArrowLeft size={17} aria-hidden="true" />
          Continue shopping
        </Link>
      </div>

      {(actionError || error) && (
        <div className="cart-message cart-message-error" role="alert">
          <p>{actionError || error}</p>
        </div>
      )}

      {hasInvalidItems && (
        <div className="cart-message-warning" role="status">
          <strong>Review your cart before checkout.</strong>
          <p>
            One or more products may be unavailable, have a stock issue,
            or require review. Resolve these issues before continuing.
          </p>
        </div>
      )}

      <div className="cart-layout">
        <div className="cart-items-panel">
          <div className="cart-panel-heading">
            <div>
              <h2>Cart items</h2>
              <p>
                Review your selected products and quantities.
              </p>
            </div>

            <button
              className="cart-clear-button"
              type="button"
              disabled={isMutating || isClearing}
              onClick={() => void handleClearCart()}
            >
              <Trash2 size={15} aria-hidden="true" />
              Clear cart
            </button>
          </div>

          <div className="cart-item-list">
            {cart.items.map((item) => {
              const image = item.product.image;

              const canDecrease = item.quantity > 1;

              const canIncrease =
                item.productAvailable &&
                item.quantity < item.availableQuantity;

              return (
                <article className="cart-item" key={item.id}>
                  <div className="cart-item-image">
                    {image?.imageUrl ? (
                      <img
                        src={image.imageUrl}
                        alt={image.altText || item.product.name}
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="cart-item-image-placeholder"
                        aria-label="Product image unavailable"
                        role="img"
                      >
                        <ShoppingBag size={25} aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <div className="cart-item-details">
                    <p className="cart-item-store">
                      {item.product.store}
                    </p>

                    <h3 className="cart-item-name">
                      <Link
                        to={`/products/${encodeURIComponent(item.product.storeSlug)}/${encodeURIComponent(item.product.slug)}`}
                      >
                        {item.product.name}
                      </Link>
                    </h3>

                    <p className="cart-item-unit-price">
                      {formatPrice(item.unitPrice, item.currency)} each
                    </p>

                    {!item.productAvailable && (
                      <p className="cart-stock-warning" role="alert">
                        This product is currently unavailable.
                        Consider removing it from your cart.
                      </p>
                    )}

                    {item.productAvailable &&
                      item.quantity > item.availableQuantity && (
                        <p className="cart-stock-warning" role="alert">
                          Only {item.availableQuantity} available.
                          Reduce the quantity before checkout.
                        </p>
                      )}

                    {item.productAvailable &&
                      item.availableQuantity === 0 && (
                        <p className="cart-stock-warning" role="alert">
                          This product is currently out of stock.
                        </p>
                      )}

                    {item.needsReview && (
                      <p className="cart-stock-warning" role="status">
                        This item needs to be reviewed before checkout.
                      </p>
                    )}

                    <div className="cart-item-actions">
                      <div
                        className="cart-quantity-control"
                        role="group"
                        aria-label={`Quantity for ${item.product.name}`}
                      >
                        <button
                          type="button"
                          aria-label={`Decrease quantity of ${item.product.name}`}
                          disabled={isMutating || !canDecrease}
                          onClick={() =>
                            void handleUpdate(item.id, item.quantity - 1)
                          }
                        >
                          <Minus size={15} aria-hidden="true" />
                        </button>

                        <span aria-live="polite">
                          {item.quantity}
                        </span>

                        <button
                          type="button"
                          aria-label={`Increase quantity of ${item.product.name}`}
                          disabled={isMutating || !canIncrease}
                          onClick={() =>
                            void handleUpdate(item.id, item.quantity + 1)
                          }
                        >
                          <Plus size={15} aria-hidden="true" />
                        </button>
                      </div>

                      <button
                        className="cart-remove-button"
                        type="button"
                        disabled={isMutating}
                        onClick={() => void handleRemove(item.id)}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  </div>

                  <div
                    className="cart-item-total"
                    aria-label={`Subtotal: ${formatPrice(
                      item.subtotal,
                      item.currency,
                    )}`}
                  >
                    {formatPrice(item.subtotal, item.currency)}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="cart-summary" aria-labelledby="summary-title">
          <h2 id="summary-title">Order summary</h2>

          <div className="cart-summary-row">
            <span>Subtotal</span>
            <strong>{formatPrice(cart.subtotal, cart.currency)}</strong>
          </div>

          <div className="cart-summary-row">
            <span>Delivery</span>
            <span className="cart-summary-pending">
              Calculated at checkout
            </span>
          </div>

          <div className="cart-summary-divider" />

          <div className="cart-summary-row cart-summary-total">
            <span>Current total</span>
            <strong>{formatPrice(cart.total, cart.currency)}</strong>
          </div>

          <p className="cart-summary-note">
            Delivery charges and final stock availability will be confirmed
            during checkout. Final prices must be validated by the server.
          </p>

          <button
            className="button button-primary cart-checkout-button"
            type="button"
            disabled={isMutating || hasInvalidItems}
            onClick={() => navigate("/checkout")}
          >
            <ShoppingCart size={18} aria-hidden="true" />
            Continue to checkout
          </button>

          {hasInvalidItems && (
            <p className="field-hint" role="status">
              Resolve the product availability notices before continuing.
            </p>
          )}

          <Link className="cart-summary-continue" to="/products">
            Keep shopping
          </Link>
        </aside>
      </div>
    </section>
  );
}
