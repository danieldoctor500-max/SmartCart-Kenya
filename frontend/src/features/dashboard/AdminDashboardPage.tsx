import { useEffect, useRef, useState, type FormEvent } from "react";
import axios from "axios";
import {
  Building2,
  ClipboardList,
  MapPinned,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import {
  DashboardShell,
  DashboardState,
  type DashboardNavItem,
} from "../../components/dashboard/DashboardShell";
import {
  adminDashboardApi,
  type AdminApplicationStatus,
  type AdminDashboardSummary,
  type AdminDeliveryRateAudit,
  type AdminDeliveryRate,
  type AdminDeliveryRateSnapshot,
  type AdminSellerApplication,
  type AdminStore,
  type AdminStoreStatus,
} from "./admin.api";

const adminNavigation: DashboardNavItem[] = [
  { label: "Overview", to: "/admin", icon: ClipboardList, end: true },
  { label: "Seller applications", to: "/admin/seller-applications", icon: ClipboardList },
  { label: "Stores", to: "/admin/stores", icon: Building2 },
  { label: "Delivery rates", to: "/admin/delivery-rates", icon: MapPinned },
];

type AdminSection = "overview" | "seller-applications" | "stores" | "delivery-rates";

function getSection(pathname: string): AdminSection {
  if (pathname.endsWith("/seller-applications")) return "seller-applications";
  if (pathname.endsWith("/stores")) return "stores";
  if (pathname.endsWith("/delivery-rates")) return "delivery-rates";
  return "overview";
}

function sectionTitle(section: AdminSection) {
  switch (section) {
    case "seller-applications":
      return "Seller applications";
    case "stores":
      return "Store management";
    case "delivery-rates":
      return "Delivery rates";
    default:
      return "Admin dashboard";
  }
}

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDeliveryRateSnapshot(snapshot: AdminDeliveryRateSnapshot) {
  return `${snapshot.town}, ${snapshot.county} · ${formatPrice(snapshot.fee, "KES")} · ${
    snapshot.isActive ? "Active" : "Inactive"
  }`;
}

function getAdminError(error: unknown): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? "The admin request could not be completed.";
  }
  return error instanceof Error
    ? error.message
    : "The admin request could not be completed.";
}

const APPLICATION_STATUSES: Array<{
  value: AdminApplicationStatus;
  label: string;
}> = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "SUSPENDED", label: "Suspended" },
];

const STORE_STATUSES: Array<{
  value: AdminStoreStatus | "";
  label: string;
}> = [
  { value: "", label: "All statuses" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
];

const STORE_SUMMARY_STATUSES: Array<{
  value: AdminStoreStatus;
  label: string;
}> = [
  { value: "INACTIVE", label: "Inactive" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
];

export function AdminDashboardPage() {
  const { pathname } = useLocation();
  const section = getSection(pathname);
  const [applications, setApplications] = useState<AdminSellerApplication[]>([]);
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [rates, setRates] = useState<AdminDeliveryRate[]>([]);
  const [expandedRateAuditId, setExpandedRateAuditId] = useState<string | null>(null);
  const [rateAuditEntries, setRateAuditEntries] = useState<AdminDeliveryRateAudit[]>([]);
  const [rateAuditPagination, setRateAuditPagination] = useState<{
    page: number;
    totalPages: number;
    total: number;
  } | null>(null);
  const [rateAuditPage, setRateAuditPage] = useState(1);
  const [rateAuditLoading, setRateAuditLoading] = useState(false);
  const [rateAuditError, setRateAuditError] = useState("");
  const rateAuditRequestId = useRef(0);
  const [rateAuditRequestKey, setRateAuditRequestKey] = useState("");
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [pageBySection, setPageBySection] = useState<
    Record<"seller-applications" | "stores" | "delivery-rates", number>
  >({ "seller-applications": 1, stores: 1, "delivery-rates": 1 });
  const [applicationStatus, setApplicationStatus] =
    useState<AdminApplicationStatus>("PENDING");
  const [applicationSearchDraft, setApplicationSearchDraft] = useState("");
  const [applicationSearch, setApplicationSearch] = useState("");
  const [storeStatus, setStoreStatus] = useState<AdminStoreStatus | "">("");
  const [storeSearch, setStoreSearch] = useState("");
  const [deliveryRateStatus, setDeliveryRateStatus] =
    useState<"ACTIVE" | "INACTIVE" | "">("");
  const [deliveryRateSearchDraft, setDeliveryRateSearchDraft] = useState("");
  const [deliveryRateSearch, setDeliveryRateSearch] = useState("");
  const [pagination, setPagination] = useState<{
    page: number;
    totalPages: number;
    total: number;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [expandedApplicationId, setExpandedApplicationId] = useState<string | null>(null);
  const [rejectingApplicationId, setRejectingApplicationId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [deliveryRateForm, setDeliveryRateForm] = useState<{
    id: string | null;
    county: string;
    town: string;
    fee: string;
  }>({ id: null, county: "", town: "", fee: "" });
  const [deliveryRateValidation, setDeliveryRateValidation] = useState("");
  const page =
    section === "seller-applications" ||
    section === "stores" ||
    section === "delivery-rates"
      ? pageBySection[section]
      : 1;
  const requestKey = section === "seller-applications"
    ? `${section}:${page}:${applicationStatus}:${applicationSearch}:${retry}`
    : section === "stores"
      ? `${section}:${page}:${storeStatus}:${storeSearch.trim()}:${retry}`
      : section === "delivery-rates"
        ? `${section}:${page}:${deliveryRateStatus}:${deliveryRateSearch}:${retry}`
      : `${section}:${page}:${retry}`;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setApplicationSearch(applicationSearchDraft.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [applicationSearchDraft]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDeliveryRateSearch(deliveryRateSearchDraft.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [deliveryRateSearchDraft]);

  useEffect(() => {
    let active = true;

    async function loadAdminData() {
      try {
        if (section === "overview") {
          const result = await adminDashboardApi.getDashboardSummary();
          if (active) {
            setSummary(result);
            setError(null);
          }
        } else if (section === "seller-applications") {
          const result = applicationSearch
            ? await adminDashboardApi.listSellerApplications(
                page,
                applicationStatus,
                applicationSearch,
              )
            : await adminDashboardApi.listSellerApplications(
                page,
                applicationStatus,
              );
          if (active) {
            setApplications(result.data);
            setPagination(result.pagination);
            setError(null);
          }
        } else if (section === "stores") {
          const result = await adminDashboardApi.listStores(page, {
            status: storeStatus || undefined,
            search: storeSearch,
          });
          if (active) {
            setStores(result.data);
            setPagination(result.pagination);
            setError(null);
          }
        } else {
          const result = await adminDashboardApi.listDeliveryRates(page, {
            status: deliveryRateStatus || undefined,
            search: deliveryRateSearch,
          });
          if (active) {
            setRates(result.data);
            setPagination(result.pagination);
            setError(null);
          }
        }
      } catch (requestError: unknown) {
        if (active) setError({ key: requestKey, message: getAdminError(requestError) });
      } finally {
        if (active) setLoadedKey(requestKey);
      }
    }

    void loadAdminData();
    return () => {
      active = false;
      rateAuditRequestId.current += 1;
    };
  }, [
    applicationStatus,
    applicationSearch,
    deliveryRateSearch,
    deliveryRateStatus,
    page,
    requestKey,
    section,
    storeSearch,
    storeStatus,
  ]);

  const isLoading = loadedKey !== requestKey;
  const visibleError = error?.key === requestKey ? error.message : "";
  const description =
    section === "overview"
      ? "Review and manage seller operations across the platform."
      : "Review records and actions available to administrators.";

  async function runMutation(
    actionKey: string,
    confirmation: string,
    mutation: () => Promise<unknown>,
  ) {
    if (!window.confirm(confirmation)) return;
    setBusyAction(actionKey);
    setMutationError("");
    setSuccessMessage("");
    setValidationMessage("");

    try {
      await mutation();
      setSuccessMessage("The change was saved successfully.");
      setRetry((current) => current + 1);
      setRejectingApplicationId(null);
      setRejectionReason("");
      setExpandedApplicationId(null);
    } catch (requestError: unknown) {
      setMutationError(getAdminError(requestError));
    } finally {
      setBusyAction(null);
    }
  }

  async function loadRateAudit(rateId: string, auditPage = 1) {
    const requestId = ++rateAuditRequestId.current;
    setRateAuditRequestKey(requestKey);
    setExpandedRateAuditId(rateId);
    setRateAuditPage(auditPage);
    setRateAuditEntries([]);
    setRateAuditPagination(null);
    setRateAuditError("");
    setRateAuditLoading(true);
    try {
      const result = await adminDashboardApi.listDeliveryRateAudit(rateId, auditPage);
      if (requestId === rateAuditRequestId.current) {
        setRateAuditEntries(result.data);
        setRateAuditPagination(result.pagination);
      }
    } catch (requestError: unknown) {
      if (requestId === rateAuditRequestId.current) {
        setRateAuditError(getAdminError(requestError));
      }
    } finally {
      if (requestId === rateAuditRequestId.current) {
        setRateAuditLoading(false);
      }
    }
  }

  function toggleRateAudit(rateId: string) {
    if (rateAuditRequestKey === requestKey && expandedRateAuditId === rateId) {
      rateAuditRequestId.current += 1;
      setExpandedRateAuditId(null);
      setRateAuditEntries([]);
      setRateAuditPagination(null);
      setRateAuditError("");
      setRateAuditLoading(false);
      return;
    }
    void loadRateAudit(rateId);
  }

  async function handleReject(event: FormEvent<HTMLFormElement>, applicationId: string) {
    event.preventDefault();
    const reason = rejectionReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setValidationMessage("The rejection reason must contain between 5 and 500 characters.");
      return;
    }
    await runMutation(
      `reject:${applicationId}`,
      "Reject this seller application? This action cannot be undone.",
      () => adminDashboardApi.rejectSellerApplication(applicationId, reason),
    );
  }

  async function handleDeliveryRateSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction !== null) return;

    const county = deliveryRateForm.county.trim();
    const town = deliveryRateForm.town.trim();
    const fee = Number(deliveryRateForm.fee);
    if (county.length < 2 || county.length > 100) {
      setDeliveryRateValidation("County must contain between 2 and 100 characters.");
      return;
    }
    if (town.length < 1 || town.length > 100) {
      setDeliveryRateValidation("Town must contain between 1 and 100 characters.");
      return;
    }
    if (!Number.isFinite(fee) || fee < 0.01 || fee > 9999999999.99) {
      setDeliveryRateValidation("Delivery fee must be between KES 0.01 and KES 9,999,999,999.99.");
      return;
    }

    setBusyAction("save-delivery-rate");
    setMutationError("");
    setSuccessMessage("");
    setDeliveryRateValidation("");
    try {
      if (deliveryRateForm.id) {
        await adminDashboardApi.updateDeliveryRate(deliveryRateForm.id, {
          county,
          town,
          fee,
        });
      } else {
        await adminDashboardApi.saveDeliveryRate({
          county,
          town,
          fee,
          isActive: true,
        });
      }
      setDeliveryRateForm({ id: null, county: "", town: "", fee: "" });
      setSuccessMessage("Delivery rate saved successfully.");
      setRetry((current) => current + 1);
    } catch (requestError: unknown) {
      setMutationError(getAdminError(requestError));
    } finally {
      setBusyAction(null);
    }
  }

  function editDeliveryRate(rate: AdminDeliveryRate) {
    setDeliveryRateForm({
      id: rate.id,
      county: rate.county,
      town: rate.town,
      fee: String(rate.fee),
    });
    setDeliveryRateValidation("");
    setMutationError("");
    setSuccessMessage("");
  }

  function changeApplicationStatus(value: AdminApplicationStatus) {
    setApplicationStatus(value);
    setPageBySection((pages) => ({ ...pages, "seller-applications": 1 }));
    setExpandedApplicationId(null);
    setRejectingApplicationId(null);
  }

  function changeApplicationSearch(value: string) {
    setApplicationSearchDraft(value);
    setPageBySection((pages) => ({ ...pages, "seller-applications": 1 }));
    setExpandedApplicationId(null);
    setRejectingApplicationId(null);
  }

  function clearApplicationSearch() {
    setApplicationSearchDraft("");
    setApplicationSearch("");
    setPageBySection((pages) => ({ ...pages, "seller-applications": 1 }));
    setExpandedApplicationId(null);
    setRejectingApplicationId(null);
  }

  function changeStoreFilters(
    next: { status?: AdminStoreStatus | ""; search?: string },
  ) {
    if (next.status !== undefined) setStoreStatus(next.status);
    if (next.search !== undefined) setStoreSearch(next.search);
    setPageBySection((pages) => ({ ...pages, stores: 1 }));
  }

  function changeDeliveryRateFilters(next: {
    status?: "ACTIVE" | "INACTIVE" | "";
    search?: string;
  }) {
    if (next.status !== undefined) setDeliveryRateStatus(next.status);
    if (next.search !== undefined) setDeliveryRateSearchDraft(next.search);
    setPageBySection((pages) => ({ ...pages, "delivery-rates": 1 }));
  }

  function clearDeliveryRateSearch() {
    setDeliveryRateSearchDraft("");
    setDeliveryRateSearch("");
    setPageBySection((pages) => ({ ...pages, "delivery-rates": 1 }));
  }

  return (
    <DashboardShell
      workspace="ADMIN"
      title={sectionTitle(section)}
      description={description}
      navItems={adminNavigation}
    >
      {section === "overview" && (
        <>
          {!isLoading && !visibleError && summary && (
            <section className="admin-dashboard-summary" aria-label="Operational summary">
              <div className="admin-summary-grid">
                <article className="admin-summary-card">
                  <h2>Seller applications</h2>
                  <p className="admin-summary-total">
                    <strong>{summary.sellerApplications.total}</strong>
                    <span>Total applications</span>
                  </p>
                  <dl>
                    {APPLICATION_STATUSES.map(({ value, label }) => (
                      <div key={value}>
                        <dt>{label}</dt>
                        <dd>{summary.sellerApplications.byStatus[value]}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
                <article className="admin-summary-card">
                  <h2>Stores</h2>
                  <p className="admin-summary-total">
                    <strong>{summary.stores.total}</strong>
                    <span>Total stores</span>
                  </p>
                  <dl>
                    {STORE_SUMMARY_STATUSES.map(({ value, label }) => (
                      <div key={value}>
                        <dt>{label}</dt>
                        <dd>{summary.stores.byStatus[value]}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
                <article className="admin-summary-card">
                  <h2>Delivery rates</h2>
                  <p className="admin-summary-total">
                    <strong>{summary.deliveryRates.total}</strong>
                    <span>Total rates</span>
                  </p>
                  <dl>
                    <div><dt>Active</dt><dd>{summary.deliveryRates.active}</dd></div>
                    <div><dt>Inactive</dt><dd>{summary.deliveryRates.inactive}</dd></div>
                  </dl>
                </article>
              </div>
              {summary.sellerApplications.total === 0 &&
                summary.stores.total === 0 &&
                summary.deliveryRates.total === 0 && (
                  <p className="admin-summary-empty" role="status">
                    No operational records are available yet. All counts above are zero.
                  </p>
                )}
            </section>
          )}
          {isLoading && (
            <DashboardState
              title="Loading dashboard summary"
              message="Calculating current operational totals..."
            />
          )}
          {!isLoading && visibleError && (
            <DashboardState
              title="Dashboard summary couldn't be loaded"
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
          <div className="admin-section-grid">
            {adminNavigation.slice(1).map(({ label, to, icon: Icon }) => (
              <Link className="admin-section-card" key={to} to={to}>
                <span className="dashboard-panel-icon"><Icon size={20} aria-hidden="true" /></span>
                <span>
                  <strong>{label}</strong>
                  <small>Open the existing {label.toLowerCase()} view</small>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {successMessage && (
        <p className="admin-action-feedback admin-action-success" role="status">
          {successMessage}
        </p>
      )}
      {mutationError && (
        <p className="admin-action-feedback admin-action-error" role="alert">
          {mutationError}
        </p>
      )}

      {section !== "overview" && isLoading && (
        <DashboardState title="Loading admin data" message="Fetching the latest information..." />
      )}
      {section !== "overview" && !isLoading && visibleError && (
        <DashboardState
          title="Admin data couldn't be loaded"
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

      {!isLoading && !visibleError && section === "seller-applications" && (
        <section className="admin-management-section" aria-label="Seller applications">
          <div className="admin-filter-bar admin-application-filters">
            <label>
              Search applications
              <input
                type="search"
                maxLength={100}
                value={applicationSearchDraft}
                onChange={(event) => changeApplicationSearch(event.target.value)}
                placeholder="Business or applicant name"
              />
            </label>
            <label>
              Application status
              <select
                value={applicationStatus}
                onChange={(event) =>
                  changeApplicationStatus(event.target.value as AdminApplicationStatus)
                }
              >
                {APPLICATION_STATUSES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <button
              className="button button-light"
              type="button"
              onClick={clearApplicationSearch}
              disabled={!applicationSearchDraft && !applicationSearch}
            >
              Clear search
            </button>
          </div>
          {applications.length === 0 ? (
            <DashboardState
              title={applicationSearch
                ? "No matching applications"
                : `No ${applicationStatus.toLowerCase()} applications`}
              message={applicationSearch
                ? "No applications match this search and status."
                : "There are no seller applications in this status."}
            />
          ) : (
            <div className="dashboard-record-list">
              {applications.map((application) => (
                <article className="dashboard-record-card admin-record-card" key={application.id}>
                  <div>
                    <strong>{application.businessName}</strong>
                    <span>{application.user.fullName} · {application.user.email}</span>
                    <time dateTime={application.createdAt}>
                      Submitted {new Date(application.createdAt).toLocaleDateString("en-KE", { dateStyle: "medium" })}
                    </time>
                  </div>
                  <span className={`status-pill status-${application.applicationStatus.toLowerCase()}`}>
                    {application.applicationStatus.toLowerCase()}
                  </span>
                  <div className="admin-record-actions">
                    <button
                      className="button button-light"
                      type="button"
                      aria-expanded={expandedApplicationId === application.id}
                      onClick={() => {
                        setExpandedApplicationId((current) =>
                          current === application.id ? null : application.id,
                        );
                        setRejectingApplicationId(null);
                        setValidationMessage("");
                      }}
                    >
                      {expandedApplicationId === application.id ? "Hide details" : "Details"}
                    </button>
                    {application.applicationStatus === "PENDING" && (
                      <>
                        <button
                          className="button button-primary"
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => void runMutation(
                            `approve:${application.id}`,
                            "Approve this seller application? The store will remain inactive until separately activated.",
                            () => adminDashboardApi.approveSellerApplication(application.id),
                          )}
                        >
                          {busyAction === `approve:${application.id}` ? "Approving..." : "Approve"}
                        </button>
                        <button
                          className="button button-danger"
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => {
                            setRejectingApplicationId(application.id);
                            setRejectionReason("");
                            setValidationMessage("");
                            setExpandedApplicationId(application.id);
                          }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                  {expandedApplicationId === application.id && (
                    <div className="admin-application-details">
                      <dl>
                        <div><dt>Applicant</dt><dd>{application.user.fullName}</dd></div>
                        <div><dt>Account email</dt><dd>{application.user.email}</dd></div>
                        <div><dt>Business email</dt><dd>{application.email || "Not provided"}</dd></div>
                        <div><dt>Business phone</dt><dd>{application.phone || "Not provided"}</dd></div>
                        <div><dt>Account status</dt><dd>{application.user.status.toLowerCase()}</dd></div>
                        <div>
                          <dt>Store</dt>
                          <dd>{application.store
                            ? `${application.store.name} · ${application.store.status.toLowerCase()}`
                            : "Not created"}
                          </dd>
                        </div>
                        {application.rejectionReason && (
                          <div><dt>Review note</dt><dd>{application.rejectionReason}</dd></div>
                        )}
                      </dl>
                      {rejectingApplicationId === application.id && (
                        <form
                          className="admin-rejection-form"
                          onSubmit={(event) => void handleReject(event, application.id)}
                        >
                          <label>
                            Rejection reason
                            <textarea
                              required
                              minLength={5}
                              maxLength={500}
                              rows={3}
                              value={rejectionReason}
                              onChange={(event) => {
                                setRejectionReason(event.target.value);
                                setValidationMessage("");
                              }}
                            />
                          </label>
                          {validationMessage && (
                            <p className="admin-action-error" role="alert">
                              {validationMessage}
                            </p>
                          )}
                          <button
                            className="button button-danger"
                            type="submit"
                            disabled={busyAction !== null}
                          >
                            {busyAction === `reject:${application.id}` ? "Rejecting..." : "Confirm rejection"}
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {!isLoading && !visibleError && section === "stores" && (
        <section className="admin-management-section" aria-label="Store management">
          <div className="admin-filter-bar admin-store-filters">
            <label>
              Search stores
              <input
                type="search"
                maxLength={100}
                value={storeSearch}
                onChange={(event) => changeStoreFilters({ search: event.target.value })}
                placeholder="Store, slug, business, or seller name"
              />
            </label>
            <label>
              Store status
              <select
                value={storeStatus}
                onChange={(event) =>
                  changeStoreFilters({ status: event.target.value as AdminStoreStatus | "" })
                }
              >
                {STORE_STATUSES.map(({ value, label }) => (
                  <option key={value || "all"} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
          {stores.length === 0 ? (
            <DashboardState title="No stores found" message="No stores match the selected filters." />
          ) : (
            <div className="dashboard-record-list">
              {stores.map((store) => {
                const canActivate =
                  store.status === "INACTIVE" &&
                  store.sellerProfile.applicationStatus === "APPROVED";
                return (
                  <article className="dashboard-record-card admin-record-card" key={store.id}>
                    <div>
                      <strong>{store.name}</strong>
                      <span>{store.sellerProfile.businessName} · {store.sellerProfile.user.fullName}</span>
                      <time dateTime={store.createdAt}>
                        Created {new Date(store.createdAt).toLocaleDateString("en-KE", { dateStyle: "medium" })}
                      </time>
                    </div>
                    <span className={`status-pill status-${store.status.toLowerCase()}`}>
                      {store.status.toLowerCase()}
                    </span>
                    <div className="admin-record-actions">
                      <span className="admin-store-owner">{store.sellerProfile.user.email}</span>
                      {canActivate && (
                        <button
                          className="button button-primary"
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => void runMutation(
                            `activate:${store.id}`,
                            `Activate ${store.name}? Only approved seller stores may be activated.`,
                            () => adminDashboardApi.activateStore(store.id),
                          )}
                        >
                          {busyAction === `activate:${store.id}` ? "Activating..." : "Activate"}
                        </button>
                      )}
                      {store.status === "ACTIVE" && (
                        <button
                          className="button button-danger"
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => void runMutation(
                            `suspend:${store.id}`,
                            `Suspend ${store.name}? Seller product and inventory operations will be blocked.`,
                            () => adminDashboardApi.suspendStore(store.id),
                          )}
                        >
                          {busyAction === `suspend:${store.id}` ? "Suspending..." : "Suspend"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {!isLoading && !visibleError && section === "delivery-rates" && (
        <section className="admin-management-section" aria-label="Delivery-rate management">
          <div className="admin-filter-bar admin-delivery-rate-filters">
            <label>
              Search county or town
              <input
                type="search"
                maxLength={100}
                value={deliveryRateSearchDraft}
                onChange={(event) =>
                  changeDeliveryRateFilters({ search: event.target.value })
                }
                placeholder="County or town"
              />
            </label>
            <label>
              Delivery-rate status
              <select
                value={deliveryRateStatus}
                onChange={(event) =>
                  changeDeliveryRateFilters({
                    status: event.target.value as "ACTIVE" | "INACTIVE" | "",
                  })
                }
              >
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <button
              className="button button-light"
              type="button"
              onClick={clearDeliveryRateSearch}
              disabled={!deliveryRateSearchDraft && !deliveryRateSearch}
            >
              Clear search
            </button>
          </div>
          {pagination && (
            <p className="admin-filter-result-count" role="status">
              {pagination.total} delivery {pagination.total === 1 ? "rate" : "rates"} found
            </p>
          )}
          <form className="admin-rate-form" onSubmit={(event) => void handleDeliveryRateSave(event)}>
            <h2>{deliveryRateForm.id ? "Edit delivery rate" : "Add or update delivery rate"}</h2>
            <div className="admin-rate-fields">
              <label>
                County
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={deliveryRateForm.county}
                  onChange={(event) => setDeliveryRateForm((form) => ({ ...form, county: event.target.value }))}
                />
              </label>
              <label>
                Town
                <input
                  required
                  minLength={1}
                  maxLength={100}
                  value={deliveryRateForm.town}
                  onChange={(event) => setDeliveryRateForm((form) => ({ ...form, town: event.target.value }))}
                />
              </label>
              <label>
                Delivery fee (KES)
                <input
                  required
                  type="number"
                  min="0.01"
                  max="9999999999.99"
                  step="0.01"
                  value={deliveryRateForm.fee}
                  onChange={(event) => setDeliveryRateForm((form) => ({ ...form, fee: event.target.value }))}
                />
              </label>
            </div>
            {deliveryRateValidation && (
              <p className="admin-action-error" role="alert">{deliveryRateValidation}</p>
            )}
            <div className="admin-rate-form-actions">
              <button
                className="button button-primary"
                type="submit"
                disabled={busyAction !== null}
              >
                {busyAction === "save-delivery-rate"
                  ? "Saving..."
                  : deliveryRateForm.id ? "Save changes" : "Save delivery rate"}
              </button>
              {deliveryRateForm.id && (
                <button
                  className="button button-light"
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => {
                    setDeliveryRateForm({ id: null, county: "", town: "", fee: "" });
                    setDeliveryRateValidation("");
                  }}
                >
                  Cancel edit
                </button>
              )}
            </div>
          </form>

          {rates.length === 0 ? (
            <DashboardState
              title={deliveryRateSearch || deliveryRateStatus
                ? "No matching delivery rates"
                : "No delivery rates configured"}
              message={deliveryRateSearch || deliveryRateStatus
                ? "No rates match the selected search and status."
                : "Add the first county and town delivery rate above."}
            />
          ) : (
            <div className="dashboard-record-list">
              {rates.map((rate) => (
                <article className="dashboard-record-card admin-rate-card" key={rate.id}>
                  <div>
                    <strong>{rate.town}, {rate.county}</strong>
                    <span>Delivery fee</span>
                  </div>
                  <span className={`status-pill ${rate.isActive ? "status-active" : "status-inactive"}`}>
                    {rate.isActive ? "Active" : "Inactive"}
                  </span>
                  <strong>{formatPrice(rate.fee, rate.currency)}</strong>
                  <div className="admin-record-actions">
                    <button
                      className="button button-light"
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => editDeliveryRate(rate)}
                    >
                      Edit
                    </button>
                    {rate.isActive && (
                      <button
                        className="button button-danger"
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => void runMutation(
                          `deactivate-rate:${rate.id}`,
                          `Deactivate delivery for ${rate.town}, ${rate.county}? Existing orders will not change.`,
                          () => adminDashboardApi.updateDeliveryRate(rate.id, { isActive: false }),
                        )}
                      >
                        {busyAction === `deactivate-rate:${rate.id}` ? "Deactivating..." : "Deactivate"}
                      </button>
                    )}
                    <button
                      className="button button-light"
                      type="button"
                      aria-expanded={rateAuditRequestKey === requestKey && expandedRateAuditId === rate.id}
                      disabled={rateAuditRequestKey === requestKey && rateAuditLoading && expandedRateAuditId !== rate.id}
                      onClick={() => toggleRateAudit(rate.id)}
                    >
                      {rateAuditRequestKey === requestKey && expandedRateAuditId === rate.id
                        ? "Hide history"
                        : "View history"}
                    </button>
                  </div>
                  {rateAuditRequestKey === requestKey && expandedRateAuditId === rate.id && (
                    <div
                      className="admin-rate-audit"
                      role="region"
                      aria-label="Delivery-rate change history"
                    >
                      <h3>Change history</h3>
                      {rateAuditLoading && (
                        <p role="status">Loading delivery-rate history...</p>
                      )}
                      {rateAuditError && (
                        <div role="alert" className="admin-rate-audit-error">
                          <p>{rateAuditError}</p>
                          <button
                            className="button button-light"
                            type="button"
                            onClick={() => void loadRateAudit(rate.id, rateAuditPage)}
                          >
                            Try again
                          </button>
                        </div>
                      )}
                      {!rateAuditLoading && !rateAuditError && rateAuditEntries.length === 0 && (
                        <p role="status">No changes have been recorded for this rate.</p>
                      )}
                      {!rateAuditLoading && !rateAuditError && rateAuditEntries.length > 0 && (
                        <>
                          <ol className="admin-rate-audit-list">
                            {rateAuditEntries.map((entry) => (
                              <li key={entry.id}>
                                <div>
                                  <strong>{entry.action.replaceAll("_", " ").toLowerCase()}</strong>
                                  <span>
                                    {entry.actor?.fullName ?? "Administrator account unavailable"}
                                    {entry.actor ? ` · ${entry.actor.email}` : ""}
                                  </span>
                                  <time dateTime={entry.createdAt}>
                                    {new Date(entry.createdAt).toLocaleString("en-KE", {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    })}
                                  </time>
                                </div>
                                <dl>
                                  {entry.metadata?.before && (
                                    <div>
                                      <dt>Before</dt>
                                      <dd>{formatDeliveryRateSnapshot(entry.metadata.before)}</dd>
                                    </div>
                                  )}
                                  {entry.metadata?.after && (
                                    <div>
                                      <dt>{entry.metadata.before ? "After" : "Created"}</dt>
                                      <dd>{formatDeliveryRateSnapshot(entry.metadata.after)}</dd>
                                    </div>
                                  )}
                                </dl>
                                {!entry.metadata?.before && !entry.metadata?.after && (
                                  <p>Change details are unavailable.</p>
                                )}
                              </li>
                            ))}
                          </ol>
                          {rateAuditPagination && rateAuditPagination.totalPages > 1 && (
                            <div className="admin-rate-audit-pagination">
                              <span>
                                Page {rateAuditPagination.page} of {rateAuditPagination.totalPages}
                                {" · "}
                                {rateAuditPagination.total} changes
                              </span>
                              <div>
                                <button
                                  className="button button-light"
                                  type="button"
                                  disabled={rateAuditLoading || rateAuditPagination.page <= 1}
                                  onClick={() => void loadRateAudit(
                                    rate.id,
                                    rateAuditPagination.page - 1,
                                  )}
                                >
                                  Previous history page
                                </button>
                                <button
                                  className="button button-light"
                                  type="button"
                                  disabled={rateAuditLoading || rateAuditPagination.page >= rateAuditPagination.totalPages}
                                  onClick={() => void loadRateAudit(
                                    rate.id,
                                    rateAuditPagination.page + 1,
                                  )}
                                >
                                  Next history page
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {!isLoading && !visibleError && pagination && pagination.totalPages > 1 && (
        <div className="dashboard-pagination">
          <span>
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} records
          </span>
          <div>
            <button
              className="button button-light"
              disabled={page <= 1}
              onClick={() =>
                setPageBySection((pages) => ({
                  ...pages,
                  [section]: Math.max(1, page - 1),
                }))
              }
              type="button"
            >
              Previous
            </button>
            <button
              className="button button-light"
              disabled={page >= pagination.totalPages}
              onClick={() =>
                setPageBySection((pages) => ({
                  ...pages,
                  [section]: Math.min(pagination.totalPages, page + 1),
                }))
              }
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
