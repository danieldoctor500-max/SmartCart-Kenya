
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  House,
  MapPinned,
  PackageSearch,
  Shirt,
  Smartphone,
  Sparkles,
  Tag,
} from "lucide-react";
import { catalogApi, type CatalogCategory } from "./catalog.api";

const heroPhotos = [
  {
    category: "Electronics",
    alt: "Over-ear headphones in a clean product photograph",
    src: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=82",
  },
  {
    category: "Fashion",
    alt: "Bright red everyday sneaker photographed against a simple background",
    src: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=82",
  },
  {
    category: "Home",
    alt: "Modern desk lamp for a home or study workspace",
    src: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=82",
  },
  {
    category: "Lifestyle",
    alt: "Smart watch photographed as a lifestyle accessory",
    src: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=82",
  },
];

const features = [
  {
    icon: Sparkles,
    title: "AI-powered discovery",
    status: "Coming soon",
    description:
      "Personalized recommendations are planned; product search and category browsing are available today.",
  },
  {
    icon: Smartphone,
    title: "M-Pesa checkout",
    status: "Coming soon",
    description:
      "M-Pesa payment integration is not available yet. No payment is taken through the current checkout.",
  },
  {
    icon: BellRing,
    title: "Price alerts",
    status: "Coming soon",
    description: "Price-drop notifications are planned and are not active yet.",
  },
  {
    icon: MapPinned,
    title: "Delivery options",
    status: "At checkout",
    description:
      "Delivery quotes are shown for destinations with configured delivery rates.",
  },
];

const howItWorks = [
  {
    number: "01",
    title: "Explore products",
    description: "Browse the catalogue, search, or start with a category.",
  },
  {
    number: "02",
    title: "Find what fits",
    description: "Compare product details and choose what suits your needs.",
  },
  {
    number: "03",
    title: "Checkout and follow your order",
    description:
      "Choose an available delivery option, then manage your order from your account.",
  },
];

const galleryPhotos = [
  {
    title: "Fresh market produce",
    alt: "Fresh produce displayed for shoppers at a market",
    src: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=960&q=80",
  },
  {
    title: "Shopping deals",
    alt: "Sale signs advertising discounts on retail products",
    src: "https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=960&q=80",
  },
  {
    title: "Delivery in motion",
    alt: "A motorbike rider moving through city traffic",
    src: "https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&w=960&q=80",
  },
];

function CategoryIcon({ slug }: { slug: string }) {
  const normalized = slug.toLowerCase();
  const Icon = normalized.includes("electronic")
    ? Smartphone
    : normalized.includes("fashion")
      ? Shirt
      : normalized.includes("home")
        ? House
        : normalized.includes("beauty")
          ? Sparkles
          : Tag;

  return <Icon size={24} aria-hidden="true" />;
}

export function HomePage() {
  const [unavailablePhotos, setUnavailablePhotos] = useState<Set<string>>(
    () => new Set(),
  );
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [categoryError, setCategoryError] = useState("");
  const [categoryRequestVersion, setCategoryRequestVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      setIsLoadingCategories(true);
      setCategoryError("");

      try {
        setCategories(await catalogApi.getCategories(controller.signal));
      } catch {
        if (!controller.signal.aborted) {
          setCategoryError(
            "We couldn't load shopping categories. Please try again.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingCategories(false);
        }
      }
    }

    void loadCategories();

    return () => controller.abort();
  }, [categoryRequestVersion]);

  return (
    <>
      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow">A SMARTER WAY TO SHOP IN KENYA</span>
          <h1>Online shopping,<br /><span>made easier.</span></h1>
          <p>
            Browse products from approved sellers today using search and
            categories. AI-powered recommendations are planned to make
            discovering the right product even easier.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/products">
              Shop Now <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="button button-secondary" to="/register">
              Create Account
            </Link>
          </div>
          <p className="hero-note">
            Built for shoppers in Kenya, with delivery options shown for
            configured destinations.
          </p>
        </div>

        <div className="hero-visual" aria-label="Shop across product categories">
          <div className="hero-photo-grid">
            {heroPhotos.map((photo) => (
              <figure className="hero-photo-tile" key={photo.category}>
                {unavailablePhotos.has(photo.category) ? (
                  <span className="hero-photo-fallback" aria-hidden="true">
                    {photo.category}
                  </span>
                ) : (
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    width="800"
                    height="600"
                    loading="eager"
                    onError={() => {
                      setUnavailablePhotos((current) =>
                        new Set(current).add(photo.category),
                      );
                    }}
                  />
                )}
                <figcaption>{photo.category}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="home-categories" aria-labelledby="categories-title">
        <div className="section-heading">
          <span className="eyebrow">START WITH A CATEGORY</span>
          <h2 id="categories-title">Explore the catalogue</h2>
          <p>Browse real product categories currently available on SmartCart.</p>
        </div>

        {isLoadingCategories && (
          <p className="home-category-state" role="status" aria-live="polite">
            Loading categories...
          </p>
        )}
        {!isLoadingCategories && categoryError && (
          <div className="home-category-state home-category-error" role="alert">
            <p>{categoryError}</p>
            <button
              className="button button-secondary"
              type="button"
              onClick={() =>
                setCategoryRequestVersion((version) => version + 1)
              }
            >
              Try again
            </button>
          </div>
        )}
        {!isLoadingCategories && !categoryError && categories.length === 0 && (
          <p className="home-category-state">
            No product categories are available right now.
          </p>
        )}
        {!isLoadingCategories && !categoryError && categories.length > 0 && (
          <div className="home-category-grid">
            {categories.map((category) => (
              <Link
                className="home-category-card"
                key={category.id}
                to={`/products?category=${encodeURIComponent(category.slug)}`}
              >
                <span className="home-category-icon">
                  <CategoryIcon slug={category.slug} />
                </span>
                <span className="home-category-name">{category.name}</span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="benefits-section" aria-labelledby="features-title">
        <div className="section-heading">
          <span className="eyebrow">THE SMARTCART DIFFERENCE</span>
          <h2 id="features-title">Useful tools, with honest expectations.</h2>
          <p>
            See what you can use now and what we are still working to bring to
            shoppers.
          </p>
        </div>

        <div className="benefit-grid home-feature-grid">
          {features.map(({ icon: Icon, title, status, description }) => (
            <article className="benefit-card home-feature-card" key={title}>
              <span className="benefit-icon">
                <Icon size={23} aria-hidden="true" />
              </span>
              <span
                className={`home-feature-status${status === "Coming soon" ? " is-planned" : ""}`}
              >
                {status}
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="how-it-works" aria-labelledby="how-it-works-title">
        <div className="section-heading">
          <span className="eyebrow">A SIMPLE SHOPPING JOURNEY</span>
          <h2 id="how-it-works-title">How it works</h2>
        </div>
        <ol className="how-it-works-grid">
          {howItWorks.map((step) => (
            <li className="how-it-works-card" key={step.number}>
              <span className="how-it-works-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="shopping-gallery" aria-labelledby="gallery-title">
        <div className="shopping-gallery-heading">
          <div>
            <span className="eyebrow">EVERYDAY SHOPPING</span>
            <h2 id="gallery-title">From the market to your door</h2>
          </div>
          <p>
            A look at the everyday products and delivery moments that inspire a
            more convenient way to shop.
          </p>
        </div>
        <div className="shopping-gallery-grid">
          {galleryPhotos.map((photo) => {
            const imageKey = `gallery-${photo.title}`;

            return (
              <figure className="shopping-gallery-card" key={photo.title}>
                {unavailablePhotos.has(imageKey) ? (
                  <div
                    className="shopping-gallery-fallback"
                    role="img"
                    aria-label={photo.alt}
                  >
                    <PackageSearch size={30} aria-hidden="true" />
                    <span>{photo.title}</span>
                  </div>
                ) : (
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    width="960"
                    height="720"
                    loading="lazy"
                    onError={() => {
                      setUnavailablePhotos((current) =>
                        new Set(current).add(imageKey),
                      );
                    }}
                  />
                )}
                <figcaption>{photo.title}</figcaption>
              </figure>
            );
          })}
        </div>
        <p className="shopping-gallery-credit">
          Photography from{" "}
          <a
            href="https://unsplash.com/license"
            target="_blank"
            rel="noreferrer"
          >
            Unsplash, under its free-use license
          </a>
          .
        </p>
      </section>

      <section className="catalog-callout">
        <div>
          <span className="eyebrow">START EXPLORING</span>
          <h2>Your next great find starts here.</h2>
          <p>Browse available products from approved sellers across Kenya.</p>
        </div>
        <Link className="button button-light" to="/products">
          Browse catalogue <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}
