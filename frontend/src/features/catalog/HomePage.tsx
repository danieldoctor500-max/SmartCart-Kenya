
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Truck, Headphones } from "lucide-react";

const benefits = [
  {
    icon: ShieldCheck,
    title: "Shopping with confidence",
    description: "A clear, dependable shopping experience from browsing to checkout.",
  },
  {
    icon: Truck,
    title: "Kenya-focused shopping",
    description: "A storefront designed around the needs of shoppers in Kenya.",
  },
  {
    icon: Headphones,
    title: "Helpful assistance",
    description: "An AI shopping assistant is planned to help customers find products.",
  },
];

export function HomePage() {
  return (
    <>
      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow">YOUR EVERYDAY SHOPPING DESTINATION</span>
          <h1>Find what you need.<br /><span>Shop with confidence.</span></h1>
          <p>
            Discover a simpler way to shop online, with a shopping experience
            designed for customers across Kenya.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/products">
              Explore products <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="button button-secondary" to="/register">
              Create an account
            </Link>
          </div>
          <p className="hero-note">Kenya-first shopping, with a customer-focused experience.</p>
        </div>

        <div className="hero-art" aria-label="SmartCart Kenya shopping illustration">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="shopping-card">
            <div className="shopping-card-top">
              <span className="brand-mark">S</span>
              <span>SMARTCART PICKS</span>
            </div>
            <div className="shopping-bag">
              <div className="bag-handle" />
              <div className="bag-body">
                <span>S</span>
              </div>
            </div>
            <div className="card-caption">
              <span>Everyday essentials</span>
              <strong>One convenient place</strong>
            </div>
          </div>
          <div className="floating-tag tag-top">Made for Kenya</div>
          <div className="floating-tag tag-bottom">Shop smarter</div>
        </div>
      </section>

      <section className="benefits-section">
        <div className="section-heading">
          <span className="eyebrow">THE SMARTCART DIFFERENCE</span>
          <h2>Shopping, made more straightforward.</h2>
          <p>Designed to make discovering and buying products feel simple.</p>
        </div>

        <div className="benefit-grid">
          {benefits.map(({ icon: Icon, title, description }) => (
            <article className="benefit-card" key={title}>
              <span className="benefit-icon">
                <Icon size={23} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="catalog-callout">
        <div>
          <span className="eyebrow">START EXPLORING</span>
          <h2>Your next great find starts here.</h2>
          <p>The product catalogue will show available items as catalogue APIs are connected.</p>
        </div>
        <Link className="button button-light" to="/products">
          Browse catalogue <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}
