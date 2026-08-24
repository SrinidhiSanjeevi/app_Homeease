import React, { useState } from "react";
import ServiceCard from "../components/ServiceCard";
import { Search, Sparkles, FileText, ChevronRight } from "lucide-react";

export default function Dashboard({ services, onBookClick }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const categories = ["All", "Spa", "Electrician", "Carpentry", "Plumbing", "Security", "Repair"];

  // Filter logic
  const filteredServices = services.filter((service) => {
    const matchesSearch =
      service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      service.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = selectedCategory === "All" || service.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handleCustomRequest = () => {
    // Open BookingModal with a virtual custom service payload
    const customServicePayload = {
      _id: "custom_request_id",
      isCustom: true,
      name: "Custom Service Request",
      price: 999, // default base quote price
      category: selectedCategory === "All" ? "Spa" : selectedCategory,
      description: "Request customized home services tailored to your specific criteria.",
      products: [],
      duration: "Flexible"
    };
    onBookClick(customServicePayload);
  };

  return (
    <div style={{ animation: "fadeInUp 0.4s ease-out", padding: "40px 0" }}>
      {/* Hero Header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: "40px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <span
          style={{
            background: "var(--primary-light)",
            color: "var(--primary)",
            padding: "6px 16px",
            borderRadius: "20px",
            fontSize: "0.8rem",
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <Sparkles size={14} /> Book trusted local specialists
        </span>
        <h1 style={{ fontSize: "2.75rem", fontWeight: 800, letterSpacing: "-0.03em" }}>
          Find Home Services, Instantly
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "1.1rem", maxWidth: "600px" }}>
          Choose from certified electricians, plumbers, carpenters, spa therapists, and professional cleaning teams.
        </p>

        {/* Search Input Box */}
        <div
          style={{
            position: "relative",
            width: "500px",
            maxWidth: "90%",
            marginTop: "20px",
            boxShadow: "var(--shadow-md)",
            borderRadius: "8px",
          }}
        >
          <Search
            size={20}
            style={{
              position: "absolute",
              left: "18px",
              top: "15px",
              color: "var(--text-muted)",
            }}
          />
          <input
            type="text"
            placeholder="Search for 'haircut', 'plumber', 'AC cleaning'..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: "16px 16px 16px 54px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              fontSize: "1rem",
              background: "#ffffff",
            }}
          />
        </div>
      </div>

      {/* Categories Filter list */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "36px",
        }}
      >
        {categories.map((cat) => {
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                background: isActive ? "var(--primary)" : "white",
                color: isActive ? "white" : "var(--text-muted)",
                border: "1px solid " + (isActive ? "var(--primary)" : "var(--border)"),
                padding: "8px 20px",
                borderRadius: "8px",
                fontWeight: 700,
                fontSize: "0.85rem",
                boxShadow: isActive ? "0 4px 12px rgba(0, 0, 0, 0.1)" : "var(--shadow-sm)",
                transition: "var(--transition-fast)",
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Services Grid Render */}
      {filteredServices.length > 0 ? (
        <div className="services-grid">
          {filteredServices.map((service) => (
            <ServiceCard key={service._id} service={service} onBook={onBookClick} />
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
          <p style={{ fontSize: "1.1rem", fontWeight: 600 }}>No services found matching your criteria.</p>
          <p style={{ fontSize: "0.9rem", marginTop: "4px" }}>Try searching for a different keyword.</p>
        </div>
      )}

      {/* Custom Service Request Banner */}
      <div
        style={{
          marginTop: "60px",
          background: "#ffffff",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          padding: "32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "24px",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div style={{ display: "flex", gap: "20px", alignItems: "center", minWidth: "280px", flex: 1 }}>
          <div
            style={{
              background: "var(--primary-light)",
              color: "var(--primary)",
              padding: "16px",
              borderRadius: "12px",
            }}
          >
            <FileText size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: "4px" }}>
              Can't find your service?
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Submit a customized requirements query. We will assign a specialized local expert for your work.
            </p>
          </div>
        </div>
        <button
          onClick={handleCustomRequest}
          className="btn btn-primary"
          style={{ padding: "14px 28px" }}
        >
          Request Custom Service <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
