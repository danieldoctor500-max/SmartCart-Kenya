
import { useSearchParams, Link } from "react-router-dom";

export function ProductsPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim();

  return (
    <section className="empty-state">
      <span className="eyebrow">SMARTCART CATALOGUE</span>
      <h1>{query ? `Search results for “${query}”` : "Explore products"}</h1>
      <p>
        {query
          ? "The search interface is ready. Product search results will appear once the catalogue API is connected."
          : "The catalogue page is ready for product listings, category filters, sorting, and pagination."}
      </p>
      <Link className="button button-primary" to="/">
        Return to home
      </Link>
    </section>
  );
}
