import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  getSellerOrderError,
  sellerApi,
  type SellerOrder,
} from "./seller.api";

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-KE", { dateStyle: "medium" });
}

export function SellerOrdersPage() {
  const { sellerOrderId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const [retry, setRetry] = useState(0);
  const requestKey = `${sellerOrderId ?? "list"}:${page}:${retry}`;
  const [result, setResult] = useState<{
    key: string;
    order?: SellerOrder;
    orders?: SellerOrder[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    error?: string;
  } | null>(null);
  const isLoading = result?.key !== requestKey;
  const error = result?.key === requestKey ? result.error ?? "" : "";
  const order = result?.key === requestKey ? result.order ?? null : null;
  const orders = result?.key === requestKey ? result.orders ?? [] : [];
  const pagination = result?.key === requestKey
    ? result.pagination ?? null
    : null;

  useEffect(() => {
    let active = true;
    const request = sellerOrderId
      ? sellerApi.getOrder(sellerOrderId).then((order) => {
          if (active) setResult({ key: requestKey, order });
        })
      : sellerApi.listOrders(page).then((ordersResult) => {
          if (active) {
            setResult({
              key: requestKey,
              orders: ordersResult.items,
              pagination: ordersResult.pagination,
            });
          }
        });

    void request.catch((requestError: unknown) => {
      if (active) {
        setResult({
          key: requestKey,
          error: getSellerOrderError(requestError),
        });
      }
    });

    return () => {
      active = false;
    };
  }, [sellerOrderId, page, retry, requestKey]);

  if (sellerOrderId) {
    return (
      <section className="seller-orders-page" aria-labelledby="seller-order-title">
        <Link className="seller-back-link" to="/seller/orders">
          Back to orders
        </Link>
        {isLoading ? (
          <p className="seller-help" role="status">Loading order details...</p>
        ) : error ? (
          <div className="seller-message seller-message-error" role="alert">
            <p>{error}</p>
            <button
              className="button button-light"
              type="button"
              onClick={() => setRetry((current) => current + 1)}
            >
              Try again
            </button>
          </div>
        ) : order ? (
          <article className="seller-order-detail">
            <header>
              <div>
                <span className="eyebrow">SELLER ORDER</span>
                <h2 id="seller-order-title">{order.order.orderNumber}</h2>
                <p>Placed {formatDate(order.order.createdAt)}</p>
              </div>
              <div className="seller-order-statuses">
                <span>{order.status.replaceAll("_", " ")}</span>
                <small>Order {order.order.status.replaceAll("_", " ")}</small>
              </div>
            </header>
            <h3>Your items in this order</h3>
            <ul className="seller-order-items">
              {order.items.map((item) => (
                <li key={item.id}>
                  <span>{item.productNameSnapshot} × {item.quantity}</span>
                  <strong>{formatPrice(item.lineTotal)}</strong>
                </li>
              ))}
            </ul>
          </article>
        ) : null}
      </section>
    );
  }

  return (
    <section className="seller-orders-page" aria-labelledby="seller-orders-title">
      {isLoading ? (
        <p className="seller-help" role="status">Loading your orders...</p>
      ) : error ? (
        <div className="seller-message seller-message-error" role="alert">
          <p>{error}</p>
          <button
            className="button button-light"
            type="button"
            onClick={() => setRetry((current) => current + 1)}
          >
            Try again
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="seller-empty-state" role="status">
          <h2 id="seller-orders-title">No seller orders yet</h2>
          <p>Orders containing your products will appear here.</p>
        </div>
      ) : (
        <>
          <div className="seller-order-list-heading">
            <h2 id="seller-orders-title">Orders for your store</h2>
            <span>{pagination?.total ?? orders.length} total</span>
          </div>
          <div className="seller-order-list">
            {orders.map((sellerOrder) => (
              <Link
                className="seller-order-card"
                key={sellerOrder.id}
                to={`/seller/orders/${encodeURIComponent(sellerOrder.id)}`}
              >
                <span className="seller-order-number">
                  {sellerOrder.order.orderNumber}
                </span>
                <span>{formatDate(sellerOrder.order.createdAt)}</span>
                <span>{sellerOrder.status.replaceAll("_", " ")}</span>
                <span>{sellerOrder.items.length} item{sellerOrder.items.length === 1 ? "" : "s"}</span>
              </Link>
            ))}
          </div>
          {pagination && pagination.totalPages > 1 && (
            <nav className="seller-order-pagination" aria-label="Seller order pages">
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <div>
                <button
                  className="button button-light"
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    if (pagination.page <= 2) next.delete("page");
                    else next.set("page", String(pagination.page - 1));
                    setSearchParams(next);
                  }}
                >
                  Previous
                </button>
                <button
                  className="button button-light"
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set("page", String(pagination.page + 1));
                    setSearchParams(next);
                  }}
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
