import React from "react";
import Icon from "./Icon";

export const FALLBACK_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"><rect width="100%" height="100%" fill="#eef0ee"/><text x="50%" y="50%" fill="#9aa39f" font-family="sans-serif" font-size="15" text-anchor="middle" dominant-baseline="middle">Image unavailable</text></svg>'
  );

export const formatCount = (n = 0) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`);

export default function ServiceCard({ service, onBook, onView }) {
  const reviewCount = service.ratingCount || 0;

  return (
    <article
      className="card service-card"
      onClick={() => onView && onView(service)}
      role={onView ? "link" : undefined}
      tabIndex={onView ? 0 : undefined}
      aria-label={onView ? `View details for ${service.name}` : undefined}
      onKeyDown={(e) => {
        if (onView && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onView(service);
        }
      }}
    >
      <div className="service-card-media">
        <img
          src={service.imageUrl || service.image || FALLBACK_IMAGE}
          alt={service.imageAlt || service.name}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = FALLBACK_IMAGE;
          }}
        />
        <span className="service-card-tag">{service.category}</span>
      </div>

      <div className="service-card-body">
        <h3>{service.name}</h3>

        <div className="service-card-meta">
          {service.rating ? (
            <span className="rating-pill">
              <Icon name="star" size={16} filled />
              {Number(service.rating).toFixed(1)}
              <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>
                ({formatCount(reviewCount)} {reviewCount === 1 ? "review" : "reviews"})
              </span>
            </span>
          ) : (
            <span className="rating-pill" style={{ color: "var(--brand)" }}>New</span>
          )}
          {service.duration && (
            <>
              <span className="dot" />
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="schedule" size={15} /> {service.duration}
              </span>
            </>
          )}
        </div>

        <p className="service-card-desc">{service.description}</p>

        {service.products?.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.78rem", color: "var(--brand)", fontWeight: 600 }}>
            <Icon name="inventory_2" size={15} /> {service.products.length} package{service.products.length > 1 ? "s" : ""} available
          </span>
        )}

        <div className="service-card-foot">
          <div className="price">
            <small>Starts at</small>₹{service.price}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: 40, padding: "0 18px", borderColor: "var(--brand)", color: "var(--brand)" }}
            onClick={(e) => {
              e.stopPropagation();
              onBook(service);
            }}
          >
            Book
            <Icon name="arrow_forward" size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}
