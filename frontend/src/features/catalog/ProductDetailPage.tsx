import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { getCartError } from "../cart/cart.api";
import { useCart } from "../cart/cart.context";
import {
  catalogApi,
  formatCatalogPrice,
  getCatalogError,
  isNotFoundError,
  type CatalogProduct,
} from "./catalog.api";

export function ProductDetailPage() {
  const { storeSlug, productSlug } = useParams();
  const { addItem, isMutating } = useCart();
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<CatalogProduct[]>([]);
  const [relatedError, setRelatedError] = useState("");
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    message: string;
    isError: boolean;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadProduct() {
      setIsLoading(true);
      setLoadError("");
      setNotFound(false);
      setProduct(null);
      setRelatedProducts([]);
      setRelatedError("");
      setSelectedImageIndex(0);
      setQuantity(1);
      setActionMessage(null);

      if (!storeSlug || !productSlug) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      try {
        const nextProduct = await catalogApi.getProduct(
          storeSlug,
          productSlug,
          controller.signal,
        );

        if (cancelled) return;
        setProduct(nextProduct);
        setIsLoading(false);

        try {
          const candidates = await catalogApi.getRelatedProducts(
            nextProduct.category.slug,
            controller.signal,
          );
          if (!cancelled) {
            setRelatedProducts(
              candidates.filter((candidate) => candidate.id !== nextProduct.id),
            );
          }
        } catch {
          if (!cancelled) {
            setRelatedError(
              "Related products could not be loaded.",
            );
          }
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;

        if (isNotFoundError(error)) {
          setNotFound(true);
        } else {
          setLoadError(getCatalogError(error));
        }
        setIsLoading(false);
      }
    }

    void loadProduct();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [storeSlug, productSlug, requestVersion]);

  async function handleAddToCart() {
    if (
      !product ||
      product.availableQuantity < 1 ||
      quantity < 1 ||
      quantity > product.availableQuantity ||
      isMutating
    ) {
      return;
    }

    setIsAdding(true);
    setActionMessage(null);

    try {
      await addItem(product.id, quantity);
      setActionMessage({
        message: "Added to your cart.",
        isError: false,
      });
    } catch (error) {
      setActionMessage({
        message: getCartError(error),
        isError: true,
      });
    } finally {
      setIsAdding(false);
    }
  }

  if (isLoading) {
    return (
      <section className="product-detail-page">
        <div className="product-detail-status" role="status" aria-live="polite">
          Loading product...
        </div>
      </section>
    );
  }

  if (notFound) {
    return (
      <section className="product-detail-page">
        <section className="product-detail-state">
          <span className="eyebrow">PRODUCT UNAVAILABLE</span>
          <h1>We couldn't find that product</h1>
          <p>
            It may have been removed or is no longer available to the public.
          </p>
          <Link className="button button-primary" to="/products">
            Browse products
          </Link>
        </section>
      </section>
    );
  }

  if (loadError || !product) {
    return (
      <section className="product-detail-page">
        <section className="product-detail-state product-detail-error" role="alert">
          <h1>Product details could not be loaded</h1>
          <p>{loadError || "Please try again."}</p>
          <button
            className="button button-primary"
            type="button"
            onClick={() => setRequestVersion((version) => version + 1)}
          >
            Try again
          </button>
        </section>
      </section>
    );
  }

  const selectedImage = product.images[selectedImageIndex];
  const isOutOfStock = product.availableQuantity < 1;

  return (
    <section className="product-detail-page">
      <Link className="product-detail-back" to="/products">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to catalogue
      </Link>

      <section className="product-detail-layout">
        <div className="product-gallery">
          <div className="product-gallery-main">
            {selectedImage ? (
              <img
                src={selectedImage.imageUrl}
                alt={selectedImage.altText || product.name}
              />
            ) : (
              <div
                className="product-gallery-placeholder"
                role="img"
                aria-label="No product image available"
              >
                <ShoppingBag size={48} aria-hidden="true" />
              </div>
            )}
            {isOutOfStock && (
              <span className="product-detail-stock-badge">Out of stock</span>
            )}
          </div>

          {product.images.length > 1 && (
            <div className="product-gallery-thumbnails" aria-label="Product images">
              {product.images.map((image, index) => (
                <button
                  className={
                    index === selectedImageIndex
                      ? "product-gallery-thumbnail is-selected"
                      : "product-gallery-thumbnail"
                  }
                  key={image.id}
                  type="button"
                  onClick={() => setSelectedImageIndex(index)}
                  aria-label={`View image ${index + 1} of ${product.images.length}`}
                  aria-pressed={index === selectedImageIndex}
                >
                  <img
                    src={image.imageUrl}
                    alt={image.altText || `${product.name}, image ${index + 1}`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product-detail-copy">
          <span className="product-detail-category">
            {product.category.name}
          </span>
          <h1>{product.name}</h1>
          <p className="product-detail-seller">
            Sold by <span>{product.store.name}</span>
          </p>
          <p className="product-detail-price">
            {formatCatalogPrice(product.price, product.currency)}
          </p>
          <p
            className={
              isOutOfStock
                ? "product-detail-availability is-unavailable"
                : "product-detail-availability"
            }
            role={isOutOfStock ? "status" : undefined}
          >
            {isOutOfStock
              ? "Currently out of stock"
              : `${product.availableQuantity} available`}
          </p>

          <div className="product-detail-description">
            <h2>About this product</h2>
            <p>{product.description || "No description is available yet."}</p>
          </div>

          <div className="product-detail-purchase">
            <label htmlFor="product-quantity">Quantity</label>
            <div className="product-quantity-control">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={quantity <= 1 || isOutOfStock}
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              >
                <Minus size={16} aria-hidden="true" />
              </button>
              <input
                id="product-quantity"
                type="number"
                min={1}
                max={Math.max(1, product.availableQuantity)}
                value={quantity}
                disabled={isOutOfStock}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (Number.isInteger(parsed)) {
                    setQuantity(
                      Math.min(
                        Math.max(1, product.availableQuantity),
                        Math.max(1, parsed),
                      ),
                    );
                  }
                }}
              />
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={isOutOfStock || quantity >= product.availableQuantity}
                onClick={() =>
                  setQuantity((current) =>
                    Math.min(product.availableQuantity, current + 1),
                  )
                }
              >
                <Plus size={16} aria-hidden="true" />
              </button>
            </div>
            <button
              className="button button-primary product-detail-add"
              type="button"
              disabled={
                isOutOfStock ||
                isAdding ||
                isMutating ||
                quantity > product.availableQuantity
              }
              onClick={() => void handleAddToCart()}
            >
              <ShoppingCart size={18} aria-hidden="true" />
              {isAdding ? "Adding..." : "Add to cart"}
            </button>
          </div>

          {actionMessage && (
            <p
              className={
                actionMessage.isError
                  ? "product-detail-action is-error"
                  : "product-detail-action"
              }
              role={actionMessage.isError ? "alert" : "status"}
            >
              {actionMessage.message}
              {!actionMessage.isError && (
                <>
                  {" "}
                  <Link to="/cart">View cart</Link>
                </>
              )}
            </p>
          )}
        </div>
      </section>

      {(relatedProducts.length > 0 || relatedError) && (
        <section className="related-products" aria-labelledby="related-products-title">
          <div className="related-products-heading">
            <span className="eyebrow">MORE TO EXPLORE</span>
            <h2 id="related-products-title">Related products</h2>
          </div>
          {relatedError && (
            <p className="related-products-error" role="status">
              {relatedError}
              {" "}
              <button
                type="button"
                onClick={() => setRequestVersion((version) => version + 1)}
              >
                Retry
              </button>
            </p>
          )}
          <div className="related-product-grid">
            {relatedProducts.map((related) => {
              const image = related.images[0];
              return (
                <article className="related-product-card" key={related.id}>
                  <Link
                    className="related-product-image"
                    to={`/products/${encodeURIComponent(related.store.slug)}/${encodeURIComponent(related.slug)}`}
                  >
                    {image ? (
                      <img
                        src={image.imageUrl}
                        alt={image.altText || related.name}
                        loading="lazy"
                      />
                    ) : (
                      <ShoppingBag size={30} aria-hidden="true" />
                    )}
                  </Link>
                  <div className="related-product-copy">
                    <Link
                      className="related-product-name"
                      to={`/products/${encodeURIComponent(related.store.slug)}/${encodeURIComponent(related.slug)}`}
                    >
                      {related.name}
                    </Link>
                    <p>{formatCatalogPrice(related.price, related.currency)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
}
