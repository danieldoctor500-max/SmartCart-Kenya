import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { DashboardState } from "../../components/dashboard/DashboardShell";
import { getOrdersError, ordersApi, type CustomerOrder } from "./orders.api";

function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    ordersApi.get(orderId)
      .then((result) => {
        if (active) setOrder(result);
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
  }, [orderId, retry]);

  if (isLoading) {
    return <DashboardState title="Loading order" message="Fetching order details..." />;
  }

  if (error || !order) {
    return (
      <section className="orders-page">
        <div className="account-state account-state-error" role="alert">
          <h2>We couldn't load this order</h2>
          <p>{error || "Order not found."}</p>
          <button className="button button-primary" type="button" onClick={() => { setIsLoading(true); setError(""); setRetry((value) => value + 1); }}>Try again</button>
          <Link to="/orders">Back to orders</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="orders-page order-detail-page" aria-label="Order details">
      <Link className="checkout-back" to="/orders"><ArrowLeft size={17} aria-hidden="true" />Back to orders</Link>
      {searchParams.get("placed") === "1" && (
        <div className="order-success" role="status">
          <CheckCircle2 size={21} aria-hidden="true" />
          <span>Your order was placed successfully.</span>
        </div>
      )}
      <header className="orders-heading">
        <span className="eyebrow">ORDER {order.orderNumber}</span>
        <p>Placed {new Date(order.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</p>
      </header>

      <div className="order-detail-grid">
        <div className="checkout-panel">
          <h2>Items</h2>
          <div className="checkout-items">
            {order.items.map((item) => (
              <div className="checkout-item" key={item.id}>
                <div>
                  <strong>{item.productNameSnapshot}</strong>
                  <span>{item.store.name} · Qty {item.quantity} · {formatPrice(item.unitPrice)} each</span>
                </div>
                <strong>{formatPrice(item.lineTotal)}</strong>
              </div>
            ))}
          </div>
          <div className="checkout-total-row"><span>Subtotal</span><strong>{formatPrice(order.subtotal)}</strong></div>
          <div className="checkout-total-row"><span>Delivery</span><strong>{formatPrice(order.deliveryTotal)}</strong></div>
          <div className="checkout-total-row checkout-grand-total"><span>Total</span><strong>{formatPrice(order.grandTotal)}</strong></div>
        </div>

        <aside className="checkout-panel order-delivery-panel">
          <h2>Delivery</h2>
          <p><strong>{order.deliveryRecipientName}</strong></p>
          <p>{order.deliveryPhone}</p>
          <p>{order.deliveryAddressLine}</p>
          <p>{order.deliveryTown}, {order.deliveryCounty}</p>
          {order.deliveryInstructions && <p>{order.deliveryInstructions}</p>}
          <h2>Order status</h2>
          <p className="order-status">{order.status.replaceAll("_", " ")}</p>
          <p>Payment: {order.paymentStatus?.replaceAll("_", " ") ?? "Not initiated"}</p>
          {order.sellerOrders.map((sellerOrder) => (
            <p key={sellerOrder.id}>{sellerOrder.store.name}: {sellerOrder.status.replaceAll("_", " ")}</p>
          ))}
        </aside>
      </div>
    </section>
  );
}
