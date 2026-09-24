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
} from "lucide-react";

export default function ServiceDetail({ service, professionals = [], onBack, onBook }) {
  const products = service.products || [];
  const [selectedProduct, setSelectedProduct] = useState(products[0] || null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [service._id]);

  const categoryPros = useMemo(
    () => professionals.filter((p) => p.category === service.category),
    [professionals, service.category]
  );
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
      <button onClick={onBack} className="btn btn-secondary" style={{ marginBottom: "20px", padding: "8px 14px" }}>
        <ArrowLeft size={16} /> Back to services
      </button>

      <div className="service-detail-grid">
        {/* ================= LEFT: INFO ================= */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", minWidth: 0 }}>
          <div style={{ position: "relative", borderRadius: "var(--radius-lg)", overflow: "hidden", height: "380px", border: "1px solid var(--border)" }}>
            <img
              src={service.imageUrl || service.image}
              alt={service.imageAlt || service.name}
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
                No specialists listed yet. We'll auto-assign the best available professional.
              </p>
            )}
          </section>
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
