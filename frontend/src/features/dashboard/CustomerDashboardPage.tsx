import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { DashboardState } from "../../components/dashboard/DashboardShell";
import { getOrdersError, ordersApi, type CustomerOrder } from "../orders/orders.api";

function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function CustomerDashboardPage() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    ordersApi.list(1, 5)
      .then((result) => {
        if (active) setOrders(result.items);
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
  }, [retry]);

  return (
    <>
      <div className="dashboard-section-heading">
        <div>
          <h2>Recent orders</h2>
          <p>Recent orders from your order history.</p>
        </div>
        <Link className="dashboard-text-link" to="/orders">
          All orders <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      {isLoading && (
        <DashboardState title="Loading orders" message="Fetching your recent orders..." />
      )}
      {!isLoading && error && (
        <DashboardState
          title="Orders couldn't be loaded"
          message={error}
          isError
          action={
            <button
              className="button button-light"
              type="button"
              onClick={() => {
                setIsLoading(true);
                setError("");
                setRetry((value) => value + 1);
              }}
            >
              Try again
            </button>
          }
        />
      )}
      {!isLoading && !error && orders.length === 0 && (
        <DashboardState
          title="No orders yet"
          message="Orders you place will appear here."
          action={<Link className="button button-primary" to="/products">Browse products</Link>}
        />
      )}
      {!isLoading && !error && orders.length > 0 && (
        <div className="dashboard-order-list">
          {orders.slice(0, 3).map((order) => (
            <article className="dashboard-order-card" key={order.id}>
              <div>
                <span className="eyebrow">{order.orderNumber}</span>
                <p>{new Date(order.createdAt).toLocaleDateString("en-KE", { dateStyle: "medium" })}</p>
              </div>
              <span className="order-status">{order.status.replaceAll("_", " ")}</span>
              <strong>{formatPrice(order.grandTotal)}</strong>
              <Link
                className="dashboard-order-link"
                to={`/orders/${encodeURIComponent(order.id)}`}
                aria-label={`View order ${order.orderNumber}`}
              >
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
