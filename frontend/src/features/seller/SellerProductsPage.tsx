import { useEffect, useState, type FormEvent } from "react";
import { PackagePlus, Pencil, Save, X } from "lucide-react";

import {
  sellerApi,
  type InventoryAdjustmentInput,
  type SellerCategory,
  type SellerProductDetailsInput,
  type SellerProduct,
} from "./seller.api";

interface ProductFormState {
  name: string;
  categoryId: string;
  price: string;
  initialStock: string;
  description: string;
  imageUrls: string;
}

const emptyProductForm: ProductFormState = {
  name: "",
  categoryId: "",
  price: "",
  initialStock: "0",
  description: "",
  imageUrls: "",
};

const SELLER_PRODUCT_PAGE_SIZE = 10;

function getSellerError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            message?: unknown;
          };
        };
      }
    ).response;

    if (typeof response?.data?.message === "string") {
      return response.data.message;
    }
  }

  return error instanceof Error
    ? error.message
    : "The seller request could not be completed.";
}

function toProductInput(form: ProductFormState): SellerProductDetailsInput {
  const imageUrls = form.imageUrls
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);

  return {
    name: form.name.trim(),
    categoryId: form.categoryId,
    price: Number(form.price),
    description: form.description.trim() || null,
    images: imageUrls.map((imageUrl) => ({
      imageUrl,
      altText: form.name.trim(),
    })),
  };
}

function formFromProduct(product: SellerProduct): ProductFormState {
  return {
    name: product.name,
    categoryId: product.category.id,
    price: String(product.price),
    initialStock: String(product.stockQuantity),
    description: product.description ?? "",
    imageUrls: product.images.map((image) => image.imageUrl).join("\n"),
  };
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function SellerProductsPage() {
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [categories, setCategories] = useState<SellerCategory[]>([]);
  const [form, setForm] = useState<ProductFormState>(emptyProductForm);
  const [editingProductId, setEditingProductId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyInventoryId, setBusyInventoryId] = useState<string | null>(
    null,
  );
  const [busyPublishId, setBusyPublishId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [actionMessage, setActionMessage] = useState<{
    message: string;
    isError: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSellerData() {
      setIsLoading(true);
      setLoadError("");

      try {
        const [nextProducts, nextCategories] = await Promise.all([
          sellerApi.listProducts(),
          sellerApi.listCategories(),
        ]);

        if (!cancelled) {
          setProducts(nextProducts);
          setCategories(nextCategories);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(getSellerError(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSellerData();

    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const filteredProducts = products.filter((product) => {
    const matchesSearch = `${product.name} ${product.slug} ${product.category.name}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase());
    return matchesSearch &&
      (statusFilter === "ALL" || product.status === statusFilter);
  });
  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / SELLER_PRODUCT_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const visibleProducts = filteredProducts.slice(
    (currentPage - 1) * SELLER_PRODUCT_PAGE_SIZE,
    currentPage * SELLER_PRODUCT_PAGE_SIZE,
  );

  function beginEdit(product: SellerProduct) {
    setEditingProductId(product.id);
    setForm(formFromProduct(product));
    setActionMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingProductId(null);
    setForm(emptyProductForm);
    setActionMessage(null);
  }

  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setActionMessage(null);

    try {
      const input = toProductInput(form);

      if (editingProductId) {
        const updated = await sellerApi.updateProduct(
          editingProductId,
          input,
        );
        setProducts((current) =>
          current.map((product) =>
            product.id === updated.id ? updated : product,
          ),
        );
        setActionMessage({
          message: "Product details saved.",
          isError: false,
        });
      } else {
        const created = await sellerApi.createProduct({
          ...input,
          initialStock: Number(form.initialStock),
        });
        setProducts((current) => [created, ...current]);
        setActionMessage({
          message:
            "Product created as a draft. Publish it when its details and stock are ready.",
          isError: false,
        });
      }

      setEditingProductId(null);
      setForm(emptyProductForm);
    } catch (error) {
      setActionMessage({
        message: getSellerError(error),
        isError: true,
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePublishProduct(productId: string) {
    setBusyPublishId(productId);
    setActionMessage(null);

    try {
      const published = await sellerApi.publishProduct(productId);
      setProducts((current) =>
        current.map((product) =>
          product.id === published.id ? published : product,
        ),
      );
      setActionMessage({
        message: `${published.name} is now published in the catalogue.`,
        isError: false,
      });
    } catch (error) {
      setActionMessage({
        message: getSellerError(error),
        isError: true,
      });
    } finally {
      setBusyPublishId(null);
    }
  }

  async function handleInventoryAdjustment(
    event: FormEvent<HTMLFormElement>,
    productId: string,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const quantityDelta = Number(formData.get("quantityDelta"));
    const reason = String(formData.get("reason")) as
      InventoryAdjustmentInput["reason"];
    const note = String(formData.get("note") ?? "").trim();

    setBusyInventoryId(productId);
    setActionMessage(null);

    try {
      const updated = await sellerApi.adjustInventory(productId, {
        quantityDelta,
        reason,
        ...(note ? { note } : {}),
      });

      setProducts((current) =>
        current.map((product) =>
          product.id === updated.id ? updated : product,
        ),
      );
      formElement.reset();
      setActionMessage({
        message: `Inventory updated for ${updated.name}.`,
        isError: false,
      });
    } catch (error) {
      setActionMessage({
        message: getSellerError(error),
        isError: true,
      });
    } finally {
      setBusyInventoryId(null);
    }
  }

  return (
    <section className="seller-page" aria-labelledby="seller-products-title">
      <header className="seller-heading">
        <div>
          <span className="eyebrow">SELLER WORKSPACE</span>
          <h1 id="seller-products-title">Products and inventory</h1>
          <p>
            Manage product details and stock. Products start as drafts and
            appear in the catalogue only after you publish them.
          </p>
        </div>
      </header>

      {actionMessage && (
        <p
          className={
            actionMessage.isError
              ? "seller-message seller-message-error"
              : "seller-message"
          }
          role={actionMessage.isError ? "alert" : "status"}
        >
          {actionMessage.message}
        </p>
      )}

      {loadError && (
        <div className="seller-message seller-message-error" role="alert">
          {loadError}
          <button
            className="button button-light"
            type="button"
            onClick={() => setLoadAttempt((current) => current + 1)}
          >
            Try again
          </button>
        </div>
      )}

      <div className="seller-layout">
        <section className="seller-panel" aria-labelledby="product-form-title">
          <div className="seller-panel-heading">
            <h2 id="product-form-title">
              {editingProductId ? "Edit product" : "Add a product"}
            </h2>
          </div>

          <form className="seller-product-form" onSubmit={(event) => void handleSaveProduct(event)}>
            <label>
              Product name
              <input
                required
                minLength={2}
                maxLength={160}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Category
              <select
                required
                value={form.categoryId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    categoryId: event.target.value,
                  }))
                }
              >
                <option value="">Choose a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Price (KES)
              <input
                required
                type="number"
                min="0.01"
                max="9999999999.99"
                step="0.01"
                value={form.price}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }
              />
            </label>

            {!editingProductId && (
              <label>
                Initial stock
                <input
                  required
                  type="number"
                  min="0"
                  max="2147483647"
                  step="1"
                  value={form.initialStock}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      initialStock: event.target.value,
                    }))
                  }
                />
              </label>
            )}

            <label>
              Description
              <textarea
                rows={4}
                maxLength={5000}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Image URLs (one HTTP or HTTPS URL per line)
              <textarea
                rows={3}
                maxLength={18000}
                placeholder="https://example.com/product-image.jpg"
                value={form.imageUrls}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    imageUrls: event.target.value,
                  }))
                }
              />
            </label>

            <p className="seller-help">
              New products start as drafts. Set up their details and stock, then
              publish them explicitly to the catalogue.
            </p>

            <div className="seller-form-actions">
              <button
                className="button button-primary"
                type="submit"
                disabled={
                  isSaving ||
                  categories.length === 0 ||
                  isLoading
                }
              >
                {editingProductId ? (
                  <Save size={16} aria-hidden="true" />
                ) : (
                  <PackagePlus size={16} aria-hidden="true" />
                )}
                {isSaving
                  ? "Saving..."
                  : editingProductId
                    ? "Save changes"
                    : "Create draft"}
              </button>
              {editingProductId && (
                <button
                  className="button button-light"
                  type="button"
                  onClick={cancelEdit}
                  disabled={isSaving}
                >
                  <X size={16} aria-hidden="true" />
                  Cancel
                </button>
              )}
            </div>
          </form>

          {categories.length === 0 && !isLoading && !loadError && (
            <p className="seller-help">
              No active categories are available. Contact an administrator
              before creating products.
            </p>
          )}
        </section>

        <section className="seller-panel" aria-labelledby="seller-products-list-title">
          <div className="seller-panel-heading">
            <h2 id="seller-products-list-title">Your products</h2>
            <span>{filteredProducts.length} of {products.length}</span>
          </div>

          {!isLoading && !loadError && products.length > 0 && (
            <div className="seller-product-filters">
              <label>
                Search products
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Name or category"
                />
              </label>
              <label>
                Status
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
            </div>
          )}

          {isLoading ? (
            <p className="seller-help" role="status">Loading your products...</p>
          ) : loadError ? null : (
            products.length === 0 ? (
              <p className="seller-help">
                You have not created any products yet.
              </p>
            ) : filteredProducts.length === 0 ? (
              <div className="seller-empty-state" role="status">
                <p>No products match this search and status.</p>
                <button
                  className="button button-light"
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("ALL");
                    setPage(1);
                  }}
                >
                  Clear product filters
                </button>
              </div>
            ) : (
              <div className="seller-product-list">
                {visibleProducts.map((product) => (
                  <article className="seller-product" key={product.id}>
                    <div className="seller-product-top">
                      <div className="seller-product-copy">
                        <span className="seller-product-status">
                          {product.status}
                        </span>
                        <h3>{product.name}</h3>
                        <p>
                          {product.category.name} ·{" "}
                          {formatPrice(product.price, product.currency)}
                        </p>
                      </div>
                      <button
                        className="button button-light seller-edit-button"
                        type="button"
                        onClick={() => beginEdit(product)}
                      >
                        <Pencil size={15} aria-hidden="true" />
                        Edit
                      </button>
                      {product.status === "DRAFT" && (
                        <button
                          className="button button-primary seller-edit-button"
                          type="button"
                          onClick={() => void handlePublishProduct(product.id)}
                          disabled={
                            product.availableQuantity < 1 ||
                            busyPublishId !== null
                          }
                          title={
                            product.availableQuantity < 1
                              ? "Add available stock before publishing."
                              : undefined
                          }
                        >
                          {busyPublishId === product.id
                            ? "Publishing..."
                            : "Publish"}
                        </button>
                      )}
                    </div>

                    <p className="seller-stock-summary">
                      Physical stock: <strong>{product.stockQuantity}</strong>
                      {" · "}Reserved: <strong>{product.reservedQuantity}</strong>
                      {" · "}Available: <strong>{product.availableQuantity}</strong>
                    </p>

                    <form
                      className="seller-inventory-form"
                      onSubmit={(event) =>
                        void handleInventoryAdjustment(event, product.id)
                      }
                    >
                      <label>
                        Stock change
                        <input
                          required
                          name="quantityDelta"
                          type="number"
                          min="-1000000"
                          max="1000000"
                          step="1"
                          placeholder="e.g. 10 or -2"
                        />
                      </label>
                      <label>
                        Reason
                        <select name="reason" defaultValue="RESTOCK">
                          <option value="RESTOCK">Restock</option>
                          <option value="CORRECTION">Correction</option>
                          <option value="RETURN">Return</option>
                        </select>
                      </label>
                      <label className="seller-inventory-note">
                        Note (optional)
                        <input
                          name="note"
                          maxLength={500}
                          placeholder="Reference or adjustment details"
                        />
                      </label>
                      <button
                        className="button button-light"
                        type="submit"
                        disabled={busyInventoryId !== null}
                      >
                        {busyInventoryId === product.id
                          ? "Updating..."
                          : "Adjust stock"}
                      </button>
                    </form>
                  </article>
                ))}
              </div>
            )
          )}
          {!isLoading && !loadError && filteredProducts.length > 0 && (
            <nav className="seller-product-pagination" aria-label="Seller product pages">
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <div>
                <button
                  className="button button-light"
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </button>
                <button
                  className="button button-light"
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </section>
      </div>
    </section>
  );
}
