import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Star,
  Clock,
  Check,
  ShieldCheck,
  Users,
  BadgeCheck,
  Package,
  Share2,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import { FALLBACK_IMAGE } from "../components/ServiceCard";

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

export default function ServiceDetail({
  serviceId,
  initialService,
  services = [],
  professionals = [],
  onBack,
  onBook,
  onViewService,
}) {
  const [service, setService] = useState(initialService || null);
  const [status, setStatus] = useState(initialService ? "ready" : "loading");
  const [selectedProduct, setSelectedProduct] = useState(initialService?.products?.[0] || null);
  const [reviewsData, setReviewsData] = useState({ reviews: [], breakdown: {}, total: 0 });
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [shareLabel, setShareLabel] = useState("Share");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [serviceId]);

  // Always fetch the latest copy — covers deep links / refresh and keeps
  // price, rating and options fresh even when the grid data is stale.
  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/services/${serviceId}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 404) {
          setStatus("notfound");
          return;
        }
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "Failed to load service");
        setService(data.service);
        setSelectedProduct((prev) =>
          data.service.products?.find((p) => p.name === prev?.name) || data.service.products?.[0] || null
        );
        setStatus("ready");
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Fetch service error:", err);
        // Keep showing grid data if we have it; otherwise surface the error.
        setStatus((prev) => (prev === "ready" ? prev : "error"));
      });

    fetch(`/api/services/${serviceId}/reviews?limit=10`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setReviewsData(data);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error("Fetch reviews error:", err);
      })
      .finally(() => setReviewsLoading(false));

    return () => controller.abort();
  }, [serviceId]);

  useEffect(() => {
    if (!service) return undefined;
    const previousTitle = document.title;
    document.title = `${service.name} · HomeEase`;
    return () => {
      document.title = previousTitle;
    };
  }, [service]);

  const relatedServices = useMemo(
    () =>
      service
        ? services.filter((s) => s.category === service.category && s._id !== service._id).slice(0, 3)
        : [],
    [services, service]
  );

  const categoryPros = useMemo(
    () => (service ? professionals.filter((p) => p.category === service.category) : []),
    [professionals, service]
  );

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: service.name, text: service.description, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareLabel("Link copied");
    } catch (err) {
      if (err?.name === "AbortError") return; // user closed the share sheet
      setShareLabel("Copy failed");
    }
    setTimeout(() => setShareLabel("Share"), 2000);
  };

  if (status === "loading") {
    return (
      <div style={{ padding: "24px 0 60px" }} aria-busy="true">
        <div className="skeleton" style={{ width: "160px", height: "38px", marginBottom: "20px" }} />
        <div className="service-detail-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="skeleton" style={{ height: "380px", borderRadius: "var(--radius-lg)" }} />
            <div className="skeleton" style={{ height: "36px", width: "60%" }} />
            <div className="skeleton" style={{ height: "80px" }} />
          </div>
          <div className="skeleton" style={{ height: "360px", borderRadius: "var(--radius-lg)" }} />
        </div>
      </div>
    );
  }

  if (status === "notfound" || status === "error") {
    return (
      <div style={{ padding: "80px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
        <AlertCircle size={40} color="var(--text-muted)" />
        <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>
          {status === "notfound" ? "This service isn't available" : "Couldn't load this service"}
        </h2>
        <p style={{ color: "var(--text-muted)", maxWidth: "380px" }}>
          {status === "notfound"
            ? "It may have been removed or is temporarily inactive."
            : "Please check your connection and try again."}
        </p>
        <button onClick={onBack} className="btn btn-primary" style={{ marginTop: "8px" }}>
          <ArrowLeft size={16} /> Back to services
        </button>
      </div>
    );
  }

  const products = service.products || [];

  const availableCount = categoryPros.filter((p) => p.status === "Available").length;

  const productExtra = selectedProduct ? selectedProduct.extraPrice : 0;
  const subtotal = service.price + productExtra;
  const gst = Math.round(subtotal * 0.18);

  const stats = [
    {
      icon: <Star size={18} fill="var(--warning)" stroke="var(--warning)" />,
      label: "Rating",
      value: service.rating ? `${service.rating} (${service.ratingCount || 0})` : "New",
    },
    { icon: <Clock size={18} />, label: "Duration", value: service.duration },
    { icon: <BadgeCheck size={18} />, label: "Completed", value: `${service.completedBookingCount || 0} jobs` },
    { icon: <Users size={18} />, label: "Available pros", value: availableCount },
  ];

  return (
    <div style={{ padding: "24px 0 60px", animation: "fadeIn 0.2s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <button onClick={onBack} className="btn btn-secondary" style={{ padding: "8px 14px" }}>
          <ArrowLeft size={16} /> Back to services
        </button>
        <button onClick={handleShare} className="btn btn-secondary" style={{ padding: "8px 14px" }} aria-live="polite">
          <Share2 size={16} /> {shareLabel}
        </button>
      </div>

      <div className="service-detail-grid">
        {/* ================= LEFT: INFO ================= */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", minWidth: 0 }}>
          <div style={{ position: "relative", borderRadius: "var(--radius-lg)", overflow: "hidden", height: "380px", border: "1px solid var(--border)" }}>
            <img
              src={service.imageUrl || service.image}
              alt={service.imageAlt || service.name}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = FALLBACK_IMAGE;
              }}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <span
              style={{
                position: "absolute",
                top: "16px",
                left: "16px",
                background: "rgba(15, 23, 42, 0.6)",
                backdropFilter: "blur(4px)",
                color: "white",
                padding: "6px 14px",
                borderRadius: "20px",
                fontSize: "0.8rem",
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              {service.category}
            </span>
          </div>

          <div>
            <h1 style={{ fontSize: "2rem", fontWeight: 800, lineHeight: 1.2, marginBottom: "12px" }}>{service.name}</h1>
            <p style={{ fontSize: "1rem", color: "var(--text-muted)", lineHeight: 1.7 }}>{service.description}</p>
          </div>

          <div className="service-detail-stats">
            {stats.map((s) => (
              <div key={s.label} className="glass-card" style={{ padding: "14px 16px", borderRadius: "var(--radius-md)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600 }}>
                  {s.icon} {s.label}
                </div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, marginTop: "6px" }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Product / brand options */}
          <section>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Package size={20} /> Available Options
            </h2>
            {products.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {products.map((prod) => {
                  const active = selectedProduct?.name === prod.name;
                  return (
                    <label
                      key={prod._id || prod.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "14px 16px",
                        borderRadius: "var(--radius-md)",
                        border: active ? "2px solid var(--primary)" : "1px solid var(--border)",
                        background: active ? "var(--primary-light)" : "var(--bg-card)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="detail-product"
                        checked={active}
                        onChange={() => setSelectedProduct(prod)}
                        style={{ width: "auto", marginTop: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{prod.name}</span>
                        <span style={{ marginLeft: "8px", fontSize: "0.75rem", background: "#eaeaea", padding: "2px 6px", borderRadius: "4px" }}>
                          {prod.brand}
                        </span>
                      </div>
                      <span style={{ fontWeight: 800 }}>{prod.extraPrice === 0 ? "Included" : `+ ₹${prod.extraPrice}`}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
                Standard tools and premium materials are included in this service by default.
              </p>
            )}
          </section>

          {/* Professionals */}
          <section>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Users size={20} /> {service.category} Specialists
            </h2>
            {categoryPros.length > 0 ? (
              <div className="service-detail-pros">
                {categoryPros.map((prof) => (
                  <div key={prof._id} className="glass-card" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "var(--radius-md)" }}>
                    <img
                      src={prof.imageUrl || prof.image}
                      alt={prof.imageAlt || prof.name}
                      style={{ width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prof.name}</div>
                      <div style={{ display: "flex", gap: "10px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        <span>{prof.experience} yrs exp</span>
                        <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                          <Star size={12} fill="var(--warning)" stroke="var(--warning)" />
                          {prof.rating}
                        </span>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: "20px",
                        background: prof.status === "Available" ? "#d1fae5" : "#f5f5f5",
                        color: prof.status === "Available" ? "#047857" : "var(--text-muted)",
                      }}
                    >
                      {prof.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
                No specialists listed yet. We&apos;ll auto-assign the best available professional.
              </p>
            )}
          </section>

          {/* Reviews */}
          <section>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <MessageSquare size={20} /> Customer Reviews
            </h2>
            {reviewsLoading ? (
              <div className="skeleton" style={{ height: "120px", borderRadius: "var(--radius-md)" }} />
            ) : reviewsData.total === 0 ? (
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
                No reviews yet — be the first to book and rate this service.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="glass-card service-detail-rating" style={{ padding: "16px", borderRadius: "var(--radius-md)" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "2.2rem", fontWeight: 800, lineHeight: 1 }}>{service.rating || "–"}</div>
                    <div style={{ display: "flex", justifyContent: "center", gap: "2px", margin: "6px 0" }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          size={14}
                          fill={n <= Math.round(service.rating || 0) ? "var(--warning)" : "none"}
                          stroke="var(--warning)"
                        />
                      ))}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{reviewsData.total} ratings</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                    {[5, 4, 3, 2, 1].map((n) => {
                      const count = reviewsData.breakdown?.[n] || 0;
                      const pct = reviewsData.total ? (count / reviewsData.total) * 100 : 0;
                      return (
                        <div key={n} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem" }}>
                          <span style={{ width: "10px" }}>{n}</span>
                          <div style={{ flex: 1, height: "8px", background: "var(--primary-light)", borderRadius: "4px", overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: "var(--warning)" }} />
                          </div>
                          <span style={{ width: "28px", textAlign: "right", color: "var(--text-muted)" }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {reviewsData.reviews.map((r) => (
                  <div key={r._id} style={{ paddingBottom: "14px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.8rem" }}>
                          {r.author[0]}
                        </span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{r.author}</div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                            {formatDate(r.date)}
                            {r.product ? ` · ${r.product}` : ""}
                          </div>
                        </div>
                      </div>
                      <span style={{ display: "flex", alignItems: "center", gap: "3px", fontWeight: 700, fontSize: "0.85rem" }}>
                        <Star size={14} fill="var(--warning)" stroke="var(--warning)" /> {r.rating}
                      </span>
                    </div>
                    {r.review && (
                      <p style={{ fontSize: "0.9rem", color: "var(--text-main)", lineHeight: 1.6 }}>{r.review}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Related services */}
          {relatedServices.length > 0 && (
            <section>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: "12px" }}>
                More {service.category} services
              </h2>
              <div className="service-detail-pros">
                {relatedServices.map((rs) => (
                  <button
                    key={rs._id}
                    onClick={() => onViewService(rs)}
                    className="glass-card"
                    style={{ display: "flex", flexDirection: "column", textAlign: "left", padding: 0, borderRadius: "var(--radius-md)", overflow: "hidden", cursor: "pointer", border: "1px solid var(--border)" }}
                  >
                    <img
                      src={rs.imageUrl || rs.image}
                      alt={rs.imageAlt || rs.name}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = FALLBACK_IMAGE;
                      }}
                      style={{ width: "100%", height: "120px", objectFit: "cover" }}
                    />
                    <div style={{ padding: "12px" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "4px" }}>{rs.name}</div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 800 }}>₹{rs.price}</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ================= RIGHT: BOOKING CARD ================= */}
        <aside className="glass-card service-detail-aside" style={{ padding: "24px", borderRadius: "var(--radius-lg)" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Starting from</span>
          <div style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "16px" }}>₹{service.price}</div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.9rem", paddingBottom: "14px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Base price</span>
              <span>₹{service.price}</span>
            </div>
            {productExtra > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>{selectedProduct.brand} upgrade</span>
                <span>+ ₹{productExtra}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>GST (18%)</span>
              <span>₹{gst}</span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: "1.1rem", margin: "14px 0 20px" }}>
            <span>Estimated total</span>
            <span>₹{subtotal + gst}</span>
          </div>

          <button
            onClick={() => onBook(service, selectedProduct)}
            className="btn btn-primary"
            style={{ width: "100%", padding: "14px", fontSize: "1rem" }}
          >
            Book Now
          </button>

          <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0", display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            <li style={{ display: "flex", gap: "8px", alignItems: "center" }}><ShieldCheck size={16} /> Verified & background-checked pros</li>
            <li style={{ display: "flex", gap: "8px", alignItems: "center" }}><Check size={16} /> Pay online or cash after service</li>
            <li style={{ display: "flex", gap: "8px", alignItems: "center" }}><Clock size={16} /> Pick a date and time slot that suits you</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
