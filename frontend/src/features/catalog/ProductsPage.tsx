
import { useEffect, useState, type FormEvent } from "react";
import { ShoppingBag, ShoppingCart } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../../lib/api";
import { useCart } from "../cart/cart.context";
import { getCartError } from "../cart/cart.api";
import {
  catalogApi,
  formatCatalogPrice,
  getCatalogError,
  type CatalogCategory,
  type CatalogProduct,
} from "./catalog.api";

const PAGE_SIZE = 12;
const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "name_asc", label: "Name: A to Z" },
] as const;

type CatalogSort = (typeof SORT_OPTIONS)[number]["value"];

interface CatalogResponse {
  success: boolean;
  data: CatalogProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function getCatalogSort(value: string | null): CatalogSort {
  return SORT_OPTIONS.some((option) => option.value === value)
    ? (value as CatalogSort)
    : "newest";
}

function parseOptionalPrice(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function validatePriceRange(minimum: string, maximum: string): string {
  if (minimum.trim() && parseOptionalPrice(minimum) === undefined) {
    return "Enter a valid minimum price of zero or more.";
  }
  if (maximum.trim() && parseOptionalPrice(maximum) === undefined) {
    return "Enter a valid maximum price of zero or more.";
  }

  const minPrice = parseOptionalPrice(minimum);
  const maxPrice = parseOptionalPrice(maximum);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    return "Minimum price cannot exceed maximum price.";
  }

  return "";
}

function getPageNumber(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 && page <= 100_000 ? page : 1;
}

type CatalogFilterValues = {
  search: string;
  category: string;
  minimumPrice: string;
  maximumPrice: string;
};

function CatalogFilters({
  search,
  category,
  minimumPrice,
  maximumPrice,
  sort,
  categories,
  categoryError,
  onApply,
  onSortChange,
  onClear,
}: CatalogFilterValues & {
  sort: CatalogSort;
  categories: CatalogCategory[];
  categoryError: string;
  onApply: (filters: CatalogFilterValues) => void;
  onSortChange: (value: string) => void;
  onClear: () => void;
}) {
  const [searchDraft, setSearchDraft] = useState(search);
  const [categoryDraft, setCategoryDraft] = useState(category);
  const [minimumPriceDraft, setMinimumPriceDraft] = useState(minimumPrice);
  const [maximumPriceDraft, setMaximumPriceDraft] = useState(maximumPrice);
  const [filterError, setFilterError] = useState("");
  const appliedPriceError = validatePriceRange(minimumPrice, maximumPrice);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = validatePriceRange(
      minimumPriceDraft,
      maximumPriceDraft,
    );
    setFilterError(validationMessage);
    if (validationMessage) return;

    onApply({
      search: searchDraft.trim(),
      category: categoryDraft,
      minimumPrice: minimumPriceDraft.trim(),
      maximumPrice: maximumPriceDraft.trim(),
    });
  }

  return (
    <form
      className="catalog-controls"
      aria-label="Filter and sort products"
      onSubmit={handleSubmit}
    >
      <div className="catalog-filter-fields">
        <label className="catalog-filter-field">
          Search products
          <input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            maxLength={100}
          />
        </label>
        <label className="catalog-filter-field">
          Category
          <select
            value={categoryDraft}
            onChange={(event) => setCategoryDraft(event.target.value)}
          >
            <option value="">All categories</option>
            {category &&
              !categories.some(({ slug }) => slug === category) && (
                <option value={category}>{category.replaceAll("-", " ")}</option>
              )}
            {categories.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="catalog-filter-field">
          Minimum price (KES)
          <input
            type="number"
            min="0"
            step="0.01"
            value={minimumPriceDraft}
            onChange={(event) => setMinimumPriceDraft(event.target.value)}
          />
        </label>
        <label className="catalog-filter-field">
          Maximum price (KES)
          <input
            type="number"
            min="0"
            step="0.01"
            value={maximumPriceDraft}
            onChange={(event) => setMaximumPriceDraft(event.target.value)}
          />
        </label>
        <label className="catalog-filter-field catalog-sort-field">
          Sort by
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="catalog-filter-actions">
        <button className="button button-primary" type="submit">
          Apply filters
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={onClear}
        >
          Clear filters
        </button>
      </div>
      {categoryError && (
        <p className="catalog-filter-hint" role="status">{categoryError}</p>
      )}
      {(filterError || appliedPriceError) && (
        <p className="catalog-filter-error" role="alert">
          {filterError || appliedPriceError}
        </p>
      )}
    </form>
  );
}

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const categorySlug = searchParams.get("category")?.trim() ?? "";
  const minimumPrice = searchParams.get("minPrice") ?? "";
  const maximumPrice = searchParams.get("maxPrice") ?? "";
  const priceRangeError = validatePriceRange(minimumPrice, maximumPrice);
  const hasInvalidPriceRange = Boolean(priceRangeError);
  const sort = getCatalogSort(searchParams.get("sort"));
  const page = getPageNumber(searchParams.get("page"));
  const categoryName = categorySlug
    .split("-")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
  const { addItem, isMutating } = useCart();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [pagination, setPagination] = useState<CatalogResponse["pagination"] | null>(
    null,
  );
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [categoryError, setCategoryError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);
  const [addingProductId, setAddingProductId] = useState<string | null>(
    null,
  );
  const [actionMessage, setActionMessage] = useState<{
    productId: string;
    message: string;
    isError: boolean;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    catalogApi.getCategories(controller.signal)
      .then(setCategories)
      .catch(() => {
        if (!controller.signal.aborted) {
          setCategoryError("Categories could not be loaded.");
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (hasInvalidPriceRange) {
      return () => controller.abort();
    }

    async function loadProducts() {
      setIsLoading(true);
      setLoadError("");
      setProducts([]);
      setPagination(null);
      setActionMessage(null);

      try {
        const response = await api.get<CatalogResponse>(
          "/catalog/products",
          {
            params: {
              search: query || undefined,
              category: categorySlug || undefined,
              minPrice: parseOptionalPrice(minimumPrice),
              maxPrice: parseOptionalPrice(maximumPrice),
              page,
              limit: PAGE_SIZE,
              sort,
            },
            signal: controller.signal,
          },
        );

        if (!controller.signal.aborted) {
          setProducts(response.data.data);
          setPagination(response.data.pagination);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(getCatalogError(error));
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      controller.abort();
    };
  }, [
    query,
    categorySlug,
    minimumPrice,
    maximumPrice,
    page,
    sort,
    requestVersion,
    hasInvalidPriceRange,
  ]);

  function updateSearchParams(
    updates: Record<string, string | undefined>,
    resetPage = true,
  ) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (resetPage) next.delete("page");
    setSearchParams(next);
  }

  function handleApplyFilters(filters: CatalogFilterValues) {
    updateSearchParams({
      q: filters.search || undefined,
      category: filters.category || undefined,
      minPrice: filters.minimumPrice || undefined,
      maxPrice: filters.maximumPrice || undefined,
    });
  }

  function handleSortChange(value: string) {
    updateSearchParams({ sort: value === "newest" ? undefined : value });
  }

  function handleClearFilters() {
    updateSearchParams({
      q: undefined,
      category: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      sort: undefined,
      page: undefined,
    });
  }

  async function handleAddToCart(product: CatalogProduct) {
    if (product.availableQuantity < 1 || isMutating) {
      return;
    }

    setAddingProductId(product.id);
    setActionMessage(null);

    try {
      await addItem(product.id);
      setActionMessage({
        productId: product.id,
        message: "Added to your cart.",
        isError: false,
      });
    } catch (error) {
      setActionMessage({
        productId: product.id,
        message: getCartError(error),
        isError: true,
      });
    } finally {
      setAddingProductId(null);
    }
  }

  return (
    <section className="catalog-page" aria-labelledby="catalog-title">
      <header className="catalog-heading">
        <div>
          <span className="eyebrow">SMARTCART CATALOGUE</span>
          <h1 id="catalog-title">
            {query
              ? `Search results for "${query}"`
              : categoryName
                ? `Explore ${categoryName}`
                : "Explore products"}
          </h1>
          <p>
            {query
              ? "Find the products that match your search."
              : categoryName
                ? `Browse available products in ${categoryName}.`
                : "Discover products from approved sellers across Kenya."}
          </p>
        </div>
      </header>

      <CatalogFilters
        key={`${query}|${categorySlug}|${minimumPrice}|${maximumPrice}`}
        search={query}
        category={categorySlug}
        minimumPrice={minimumPrice}
        maximumPrice={maximumPrice}
        sort={sort}
        categories={categories}
        categoryError={categoryError}
        onApply={handleApplyFilters}
        onSortChange={handleSortChange}
        onClear={handleClearFilters}
      />

      {isLoading && !hasInvalidPriceRange && (
        <div className="catalog-status" role="status" aria-live="polite">
          Loading products...
        </div>
      )}

      {!isLoading && !hasInvalidPriceRange && loadError && (
        <div className="catalog-message catalog-message-error" role="alert">
          <p>{loadError}</p>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              setRequestVersion((version) => version + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}

      {!isLoading && !hasInvalidPriceRange && !loadError && products.length === 0 && (
        <div className="catalog-status" role="status">
          <p>
            {query || categorySlug || minimumPrice || maximumPrice
              ? "No products match your current filters."
              : "No products are available right now."}
          </p>
          {(query || categorySlug || minimumPrice || maximumPrice || sort !== "newest") && (
            <button
              className="button button-secondary"
              type="button"
              onClick={handleClearFilters}
              aria-label="Clear active filters"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {!isLoading && !hasInvalidPriceRange && !loadError && products.length > 0 && (
        <div className="catalog-product-grid">
          {products.map((product) => {
            const image = product.images[0];
            const isOutOfStock = product.availableQuantity < 1;
            const isAdding = addingProductId === product.id;
            const message =
              actionMessage?.productId === product.id
                ? actionMessage
                : null;

            return (
              <article className="catalog-product-card" key={product.id}>
                <div className="catalog-product-image">
                  {image ? (
                    <Link
                      to={`/products/${encodeURIComponent(product.store.slug)}/${encodeURIComponent(product.slug)}`}
                      aria-label={`View ${product.name}`}
                    >
                      <img
                        src={image.imageUrl}
                        alt={image.altText || product.name}
                        loading="lazy"
                      />
                    </Link>
                  ) : (
                    <Link
                      className="catalog-product-image-link"
                      to={`/products/${encodeURIComponent(product.store.slug)}/${encodeURIComponent(product.slug)}`}
                      aria-label={`View ${product.name}`}
                    >
                      <ShoppingBag
                        size={34}
                        aria-hidden="true"
                        className="catalog-product-placeholder"
                      />
                    </Link>
                  )}
                  {isOutOfStock && (
                    <span className="catalog-stock-badge">
                      Out of stock
                    </span>
                  )}
                </div>

                <div className="catalog-product-details">
                  <p className="catalog-product-category">
                    {product.category.name}
                  </p>
                  <h2>
                    <Link
                      to={`/products/${encodeURIComponent(product.store.slug)}/${encodeURIComponent(product.slug)}`}
                    >
                      {product.name}
                    </Link>
                  </h2>
                  <p className="catalog-product-store">
                    Sold by {product.store.name}
                  </p>
                  <p className="catalog-product-price">
                    {formatCatalogPrice(product.price, product.currency)}
                  </p>
                  <p className="catalog-product-availability">
                    {isOutOfStock
                      ? "Currently unavailable"
                      : `${product.availableQuantity} available`}
                  </p>

                  <button
                    className="button button-primary catalog-add-button"
                    type="button"
                    disabled={
                      isOutOfStock || isMutating || isLoading || isAdding
                    }
                    onClick={() => void handleAddToCart(product)}
                  >
                    <ShoppingCart size={17} aria-hidden="true" />
                    {isAdding ? "Adding..." : "Add to cart"}
                  </button>

                  {message && (
                    <p
                      className={
                        message.isError
                          ? "catalog-action-message catalog-action-error"
                          : "catalog-action-message"
                      }
                      role={message.isError ? "alert" : "status"}
                    >
                      {message.message}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!isLoading && !hasInvalidPriceRange && !loadError && products.length > 0 && pagination && (
        <nav className="catalog-pagination" aria-label="Catalogue pages">
          <span>
            Page {pagination.page} of {pagination.totalPages}
            {" · "}
            {pagination.total} product{pagination.total === 1 ? "" : "s"}
          </span>
          <div className="catalog-pagination-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={isLoading || pagination.page <= 1}
              onClick={() =>
                updateSearchParams(
                  { page: String(Math.max(1, pagination.page - 1)) },
                  false,
                )
              }
            >
              Previous
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={isLoading || pagination.page >= pagination.totalPages}
              onClick={() =>
                updateSearchParams(
                  { page: String(pagination.page + 1) },
                  false,
                )
              }
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
