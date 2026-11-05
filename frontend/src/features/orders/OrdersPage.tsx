import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PackageSearch } from "lucide-react";
import { DashboardState } from "../../components/dashboard/DashboardShell";
import { getOrdersError, ordersApi, type CustomerOrder } from "./orders.api";

function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function OrdersPage() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    let active = true;
    ordersApi.list(page)
      .then((result) => {
        if (active) {
          setOrders(result.items);
          setTotalPages(result.pagination.totalPages);
        }
      })
      .catch((requestError: unknown) => {
        if (active) setError(getOrdersError(requestError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, retry]);

  return (
    <section className="orders-page" aria-label="Your order history">
      {isLoading && <DashboardState title="Loading orders" message="Fetching your order history..." />}
      {!isLoading && error && (
        <DashboardState
          title="Orders couldn't be loaded"
          message={error}
          isError
          action={<button className="button button-primary" type="button" onClick={() => { setIsLoading(true); setError(""); setRetry((value) => value + 1); }}>Try again</button>}
        />
      )}
      {!isLoading && !error && orders.length === 0 && (
        <div className="account-state">
          <PackageSearch size={34} aria-hidden="true" />
          <h2>No orders yet</h2>
          <p>Orders you place will appear here.</p>
          <Link className="button button-primary" to="/products">Browse products</Link>
        </div>
      )}
      {!isLoading && !error && orders.length > 0 && (
        <>
          <div className="orders-list">
            {orders.map((order) => (
              <article className="order-card" key={order.id}>
                <div className="order-card-heading">
                  <div>
                    <span className="eyebrow">ORDER {order.orderNumber}</span>
                    <p>{new Date(order.createdAt).toLocaleDateString("en-KE", { dateStyle: "medium" })}</p>
                  </div>
                  <span className="order-status">{order.status.replaceAll("_", " ")}</span>
                </div>
                <div className="order-card-content">
                  <span>{order.items.length} product{order.items.length === 1 ? "" : "s"}</span>
                  <strong>{formatPrice(order.grandTotal)}</strong>
                </div>
                <Link className="button button-light" to={`/orders/${encodeURIComponent(order.id)}`}>View order</Link>
              </article>
            ))}
          </div>
          {totalPages > 1 && (
            <nav className="orders-pagination" aria-label="Order history pages">
              <button
                type="button"
                className="button button-light"
                disabled={page <= 1 || isLoading}
                onClick={() => {
                  setIsLoading(true);
                  setError("");
                  setPage((value) => Math.max(1, value - 1));
                }}
              >
                Previous
              </button>
              <span>Page {page} of {totalPages}</span>
              <button
                type="button"
                className="button button-light"
                disabled={page >= totalPages || isLoading}
                onClick={() => {
                  setIsLoading(true);
                  setError("");
                  setPage((value) => value + 1);
                }}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
