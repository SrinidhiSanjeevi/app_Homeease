import React from "react";
import { Star, Clock, Check } from "lucide-react";

export default function ServiceCard({ service, onBook }) {
  return (
    <div
      className="glass-card"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderRadius: "16px",
        overflow: "hidden",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "var(--shadow-lg)";
        e.currentTarget.style.borderColor = "var(--primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      <div style={{ position: "relative", height: "200px", overflow: "hidden" }}>
        <img
          src={service.image}
          alt={service.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transition: "transform 0.5s ease",
          }}
          onMouseEnter={(e) => (e.target.style.transform = "scale(1.08)")}
          onMouseLeave={(e) => (e.target.style.transform = "scale(1)")}
        />
        <div
          style={{
            position: "absolute",
            top: "12px",
            left: "12px",
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            color: "white",
            padding: "4px 12px",
            borderRadius: "20px",
            fontSize: "0.75rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
          }}
        >
          {service.category}
        </div>
        <div
          style={{
            position: "absolute",
            bottom: "12px",
            right: "12px",
            background: "white",
            color: "var(--text-main)",
            padding: "4px 8px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            fontWeight: 700,
            fontSize: "0.8rem",
          }}
        >
          <Star size={14} fill="var(--warning)" stroke="var(--warning)" />
          {service.rating || "New"}
        </div>
      </div>

      <div
        style={{
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          gap: "10px",
        }}
      >
        <h3
          style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "var(--text-main)",
            lineHeight: 1.3,
          }}
        >
          {service.name}
        </h3>
        
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            lineHeight: 1.5,
            flexGrow: 1,
          }}
        >
          {service.description}
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "0.8rem",
            color: "var(--text-muted)",
            paddingBottom: "10px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Clock size={14} />
            <span>{service.duration}</span>
          </div>
          {service.products && service.products.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--secondary)" }}>
              <Check size={14} />
              <span>Custom Brands</span>
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "10px",
          }}
        >
          <div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>
              Starting from
            </span>
            <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--primary)" }}>
              ₹{service.price}
            </span>
          </div>
          <button onClick={() => onBook(service)} className="btn btn-primary" style={{ padding: "10px 16px" }}>
            Book Now
          </button>
        </div>
      </div>
    </div>
  );
}
