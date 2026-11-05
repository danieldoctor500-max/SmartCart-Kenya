import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { ArrowRight, ClipboardList, PackageCheck, Store } from "lucide-react";
import { Link } from "react-router-dom";

import {
  DashboardShell,
  DashboardState,
  type DashboardNavItem,
} from "../../components/dashboard/DashboardShell";
import { useAuth } from "../auth/auth.hooks";
import {
  sellerApi,
  type SellerApplication,
} from "../seller/seller.api";

interface ApplicationForm {
  businessName: string;
  email: string;
  phone: string;
}

interface SellerSummary {
  productCount: number;
  activeProductCount: number;
  availableUnits: number;
  orderCount: number;
}

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? "The request could not be completed.";
  }
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export function SellerDashboardPage() {
  const { user } = useAuth();
  const [application, setApplication] = useState<SellerApplication | null>(null);
  const [hasApplication, setHasApplication] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<{ retry: number; message: string } | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loadedRetry, setLoadedRetry] = useState<number | null>(null);
  const [summaryState, setSummaryState] = useState<{
    key: string;
    data?: SellerSummary;
    error?: string;
  } | null>(null);
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [form, setForm] = useState<ApplicationForm>({
    businessName: "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
  });

  useEffect(() => {
    let active = true;
    sellerApi.getMyApplication()
      .then((result) => {
        if (!active) return;
        setApplication(result);
        setHasApplication(true);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (axios.isAxiosError(requestError) && requestError.response?.status === 404) {
          setApplication(null);
          setHasApplication(false);
          return;
        }
        setError({ retry, message: getErrorMessage(requestError) });
      })
      .finally(() => {
        if (active) setLoadedRetry(retry);
      });

    return () => {
      active = false;
    };
  }, [retry]);

  const isLoading = loadedRetry !== retry;
  const visibleError = error?.retry === retry ? error.message : "";
  const hasActiveStore =
    application?.applicationStatus === "APPROVED" &&
    application.store?.status === "ACTIVE";
  const summaryKey = `${application?.id ?? ""}:${summaryRetry}`;

  useEffect(() => {
    if (!hasActiveStore) return;
    let active = true;

    Promise.all([sellerApi.listProducts(), sellerApi.listOrders(1, 1)])
      .then(([products, orders]) => {
        if (!active) return;
        setSummaryState({
          key: summaryKey,
          data: {
            productCount: products.length,
            activeProductCount: products.filter(
              (product) => product.status === "ACTIVE",
            ).length,
            availableUnits: products.reduce(
              (total, product) => total + product.availableQuantity,
              0,
            ),
            orderCount: orders.pagination.total,
          },
        });
      })
      .catch((requestError: unknown) => {
        if (active) {
          setSummaryState({
            key: summaryKey,
            error: getErrorMessage(requestError),
          });
        }
      });

    return () => {
      active = false;
    };
  }, [hasActiveStore, summaryKey]);

  const summaryLoading = hasActiveStore && summaryState?.key !== summaryKey;
  const summaryError = summaryState?.key === summaryKey
    ? summaryState.error ?? ""
    : "";
  const summary = summaryState?.key === summaryKey
    ? summaryState.data ?? null
    : null;

  const sellerNavigation: DashboardNavItem[] = [
    { label: "Overview", to: "/seller", icon: Store, end: true },
    ...(hasActiveStore
      ? [{ label: "Products & inventory", to: "/seller/products", icon: Store }]
      : []),
    ...(hasActiveStore
      ? [{ label: "Orders", to: "/seller/orders", icon: ClipboardList }]
      : []),
  ];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    setIsSubmitting(true);

    try {
      const result = await sellerApi.submitApplication({
        businessName: form.businessName.trim(),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
      setApplication(result);
      setHasApplication(true);
    } catch (requestError: unknown) {
      setSubmitError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DashboardShell
      workspace="SELLER"
      title="Seller workspace"
      description="Manage your seller application and product catalogue."
      navItems={sellerNavigation}
    >
      {isLoading && (
        <DashboardState title="Checking your application" message="Loading seller account status..." />
      )}
      {!isLoading && visibleError && (
        <DashboardState
          title="Seller status couldn't be loaded"
          message={visibleError}
          isError
          action={
            <button
              className="button button-light"
              type="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
          }
        />
      )}
      {!isLoading && !visibleError && !hasApplication && (
        <section className="dashboard-panel seller-application-panel">
          <div className="dashboard-panel-intro">
            <span className="dashboard-panel-icon"><Store size={20} aria-hidden="true" /></span>
            <div>
              <h2>Apply to sell on SmartCart</h2>
              <p>Share your business contact details to start the seller review process.</p>
            </div>
          </div>
          {submitError && <p className="dashboard-alert" role="alert">{submitError}</p>}
          <form className="dashboard-form" onSubmit={handleSubmit}>
            <label>
              Business name
              <input
                autoComplete="organization"
                maxLength={120}
                minLength={2}
                required
                value={form.businessName}
                onChange={(event) => setForm({ ...form, businessName: event.target.value })}
              />
            </label>
            <label>
              Business email <span className="form-optional">(optional)</span>
              <input
                autoComplete="email"
                maxLength={254}
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </label>
            <label>
              Business phone <span className="form-optional">(optional)</span>
              <input
                autoComplete="tel"
                maxLength={30}
                minLength={7}
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </label>
            <button className="button button-primary" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Submitting..." : "Submit application"}
            </button>
          </form>
        </section>
      )}
      {!isLoading && !visibleError && hasApplication && application?.applicationStatus === "PENDING" && (
        <DashboardState
          title="Application under review"
          message={`Your application for ${application.businessName} was submitted on ${new Date(application.createdAt).toLocaleDateString("en-KE", { dateStyle: "medium" })}. We'll update this page when it has been reviewed.`}
        />
      )}
      {!isLoading && !visibleError && hasApplication && application?.applicationStatus === "REJECTED" && (
        <DashboardState
          title="Application not approved"
          message={
            application.rejectionReason
              ? `Reason provided: ${application.rejectionReason}. Reapplication is not currently supported. Contact SmartCart support if you need clarification.`
              : "Reapplication is not currently supported. Contact SmartCart support if you need clarification."
          }
          isError
        />
      )}
      {!isLoading && !visibleError && hasApplication && application?.applicationStatus === "APPROVED" && (
        <section className="dashboard-panel seller-status-panel">
          <span className="dashboard-panel-icon"><Store size={20} aria-hidden="true" /></span>
          <div>
            <span className="eyebrow">APPROVED SELLER</span>
            <h2>{application.store?.name ?? application.businessName}</h2>
            {application.store?.status === "ACTIVE" ? (
              <>
                <p>Your store is active. You can manage your product catalogue and inventory.</p>
                <Link className="button button-primary" to="/seller/products">
                  Open products & inventory <ArrowRight size={17} aria-hidden="true" />
                </Link>
              </>
            ) : application.store?.status === "SUSPENDED" ? (
              <p>
                Your store is suspended. Contact SmartCart support for help with the
                store review and reinstatement process.
              </p>
            ) : application.store?.status === "INACTIVE" ? (
              <p>
                Your seller application is approved, but the store is not active yet.
                An administrator must activate it before it can appear in the catalogue.
              </p>
            ) : (
              <p>
                Your seller application is approved, but store details are unavailable.
                Contact SmartCart support for assistance.
              </p>
            )}
          </div>
          {application.store?.status && (
            <span className={`status-pill status-${application.store.status.toLowerCase()}`}>
              Store {application.store.status.toLowerCase()}
            </span>
          )}
        </section>
      )}
      {!isLoading && !visibleError && hasActiveStore && (
        <section className="seller-summary" aria-label="Store summary">
          <div className="seller-summary-heading">
            <div>
              <span className="eyebrow">STORE OVERVIEW</span>
              <h2>Store activity</h2>
            </div>
            <div className="seller-summary-links">
              <Link className="button button-light" to="/seller/products">
                <PackageCheck size={16} aria-hidden="true" />
                Manage products
              </Link>
              <Link className="button button-light" to="/seller/orders">
                <ClipboardList size={16} aria-hidden="true" />
                View orders
              </Link>
            </div>
          </div>
          {summaryLoading ? (
            <p className="seller-help" role="status">Loading store summary...</p>
          ) : summaryError ? (
            <div className="seller-message seller-message-error" role="alert">
              <span>{summaryError}</span>
              <button
                className="button button-light"
                type="button"
                onClick={() => setSummaryRetry((value) => value + 1)}
              >
                Try again
              </button>
            </div>
          ) : summary ? (
            <div className="seller-summary-grid">
              <article>
                <span>Products</span>
                <strong>{summary.productCount}</strong>
              </article>
              <article>
                <span>Active listings</span>
                <strong>{summary.activeProductCount}</strong>
              </article>
              <article>
                <span>Available units</span>
                <strong>{summary.availableUnits}</strong>
              </article>
              <article>
                <span>Store orders</span>
                <strong>{summary.orderCount}</strong>
              </article>
            </div>
          ) : null}
        </section>
      )}
    </DashboardShell>
  );
}
