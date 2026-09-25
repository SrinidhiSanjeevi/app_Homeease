import React, { useEffect, useMemo, useRef, useState } from "react";
import ServiceCard, { formatCount } from "../components/ServiceCard";
import Icon from "../components/Icon";
import { AreaChip } from "../components/AreaPicker";

const CATEGORIES = [
  { id: "Spa", label: "Spa & Salon", icon: "spa" },
  { id: "Electrician", label: "Electrician", icon: "electrical_services" },
  { id: "Carpentry", label: "Carpentry", icon: "carpenter" },
  { id: "Plumbing", label: "Plumbing", icon: "plumbing" },
  { id: "Security", label: "Security", icon: "lock" },
  { id: "Repair", label: "Repair", icon: "handyman" },
];

const TRUST = [
  { icon: "verified_user", title: "Verified professionals", sub: "ID and background checked" },
  { icon: "receipt_long", title: "Upfront pricing", sub: "GST included, no surprises" },
  { icon: "event_available", title: "Flexible slots", sub: "Morning to night, all week" },
  { icon: "reviews", title: "Real reviews", sub: "Only from completed bookings" },
];

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";

function Stars({ value, size = 16 }) {
  return (
    <span className="stars" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} filled={n <= Math.round(value)} />
      ))}
    </span>
  );
}

export default function Dashboard({ services = [], onBookClick, onViewService, area, onChangeArea }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [reviews, setReviews] = useState([]);
  const listRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/services/reviews/recent?limit=6", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { success: false }))
      .then((data) => {
        if (data.success && Array.isArray(data.reviews)) setReviews(data.reviews);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error("Fetch recent reviews error:", err);
      });
    return () => controller.abort();
  }, []);

  const filteredServices = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return services.filter((service) => {
      const name = service?.name?.toLowerCase() || "";
      const description = service?.description?.toLowerCase() || "";
      const category = service?.category || "";
      const matchesSearch = !search || name.includes(search) || description.includes(search) || category.toLowerCase().includes(search);
      const matchesCategory = selectedCategory === "All" || category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [services, searchTerm, selectedCategory]);

  const stats = useMemo(() => {
    const rated = services.filter((s) => s.rating);
    const avg = rated.length ? rated.reduce((sum, s) => sum + Number(s.rating), 0) / rated.length : 0;
    const jobs = services.reduce((sum, s) => sum + (s.completedBookingCount || 0), 0);
    return { avg, jobs, count: services.length };
  }, [services]);

  const pickCategory = (id) => {
    setSelectedCategory((prev) => (prev === id ? "All" : id));
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleCustomRequest = () => {
    onBookClick?.({
      _id: "custom_request_id",
      isCustom: true,
      name: "Custom Service Request",
      price: 999,
      category: selectedCategory === "All" ? "Repair" : selectedCategory,
      description: "Request customized home services tailored to your specific requirements.",
      products: [],
      duration: "Flexible",
    });
  };

  return (
    <div style={{ animation: "fadeInUp 0.35s ease-out" }}>
      {/* ================= HERO ================= */}
      <section className="hero">
        <div>
          <h1>
            Home services,
            <br />
            <em>on your schedule.</em>
          </h1>
          <p className="hero-lead">
            Book trusted electricians, plumbers, carpenters and spa experts. Fixed prices, verified pros, and a slot that suits you.
          </p>

          <div className="area-bar">
            <span>Service in</span>
            <AreaChip area={area} onClick={onChangeArea} />
            {area && <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>· nearest professionals first</span>}
          </div>

          <label className="search-box">
            <Icon name="search" size={22} color="var(--text-muted)" />
            <input
              type="search"
              placeholder="Search for 'tap repair', 'wiring', 'facial'…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && listRef.current?.scrollIntoView({ behavior: "smooth" })}
              aria-label="Search services"
            />
            {searchTerm && (
              <button type="button" className="icon-btn" onClick={() => setSearchTerm("")} aria-label="Clear search">
                <Icon name="close" size={18} />
              </button>
            )}
          </label>

          <div className="hero-stats">
            {stats.avg > 0 && (
              <div>
                <strong style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {stats.avg.toFixed(1)} <Icon name="star" size={20} filled color="var(--saffron)" />
                </strong>
                <span>Average service rating</span>
              </div>
            )}
            {stats.jobs > 0 && (
              <div>
                <strong>{formatCount(stats.jobs)}</strong>
                <span>Jobs completed</span>
              </div>
            )}
            <div>
              <strong>{stats.count}</strong>
              <span>Services offered</span>
            </div>
          </div>
        </div>

        <div className="hero-panel">
          <h3>What are you looking for?</h3>
          <div className="category-grid">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`category-tile${selectedCategory === c.id ? " is-active" : ""}`}
                onClick={() => pickCategory(c.id)}
                aria-pressed={selectedCategory === c.id}
              >
                <span className="tile-icon">
                  <Icon name={c.icon} size={26} />
                </span>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ================= TRUST ================= */}
      <section className="trust-strip" aria-label="Why HomeEase">
        {TRUST.map((t) => (
          <div key={t.title} className="trust-item">
            <Icon name={t.icon} size={28} />
            <div>
              <strong>{t.title}</strong>
              <span className="sub">{t.sub}</span>
            </div>
          </div>
        ))}
      </section>

      {/* ================= SERVICES ================= */}
      <section ref={listRef} style={{ scrollMarginTop: "calc(var(--nav-h) + 16px)" }}>
        <div className="toolbar">
          <div>
            <h2 className="section-title">
              {selectedCategory === "All" ? "Popular services" : CATEGORIES.find((c) => c.id === selectedCategory)?.label}
            </h2>
            <p className="section-sub">
              {filteredServices.length} service{filteredServices.length === 1 ? "" : "s"}
              {searchTerm.trim() ? ` matching "${searchTerm.trim()}"` : ""}
            </p>
          </div>
          <div className="chip-row" role="tablist" aria-label="Filter by category">
            {["All", ...CATEGORIES.map((c) => c.id)].map((id) => (
              <button
                key={id}
                type="button"
                className={`chip${selectedCategory === id ? " is-active" : ""}`}
                onClick={() => setSelectedCategory(id)}
              >
                {id === "All" ? "All" : CATEGORIES.find((c) => c.id === id)?.label}
              </button>
            ))}
          </div>
        </div>

        {filteredServices.length > 0 ? (
          <div className="services-grid">
            {filteredServices.map((service) => (
              <ServiceCard key={service._id} service={service} onBook={onBookClick} onView={onViewService} />
            ))}
          </div>
        ) : (
          <div className="card" style={{ padding: "48px 20px", textAlign: "center" }}>
            <Icon name="search_off" size={40} color="var(--text-muted)" />
            <p style={{ fontWeight: 700, marginTop: 12 }}>No services match your search</p>
            <p className="section-sub">Try another keyword, or send us a custom request below.</p>
          </div>
        )}
      </section>

      {/* ================= REVIEWS ================= */}
      {reviews.length > 0 && (
        <section style={{ marginTop: 56 }}>
          <div className="toolbar">
            <div>
              <h2 className="section-title">What customers say</h2>
              <p className="section-sub">Recent reviews from completed bookings</p>
            </div>
          </div>
          <div className="reviews-grid">
            {reviews.map((r) => (
              <article key={r._id} className="card review-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Stars value={r.rating} />
                  <span className="field-hint">{formatDate(r.date)}</span>
                </div>
                <p>{r.review}</p>
                <div className="review-author">
                  <span className="avatar">{r.author?.[0] || "C"}</span>
                  <div style={{ minWidth: 0 }}>
                    <strong>{r.author}</strong>
                    {r.serviceName && (
                      <span
                        role={r.serviceId ? "link" : undefined}
                        tabIndex={r.serviceId ? 0 : undefined}
                        style={{ cursor: r.serviceId ? "pointer" : "default", color: "var(--brand)", fontWeight: 600 }}
                        onClick={() => r.serviceId && onViewService?.({ _id: r.serviceId })}
                        onKeyDown={(e) => e.key === "Enter" && r.serviceId && onViewService?.({ _id: r.serviceId })}
                      >
                        {r.serviceName}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ================= CUSTOM SERVICE ================= */}
      <section
        className="card"
        style={{
          marginTop: 56,
          padding: "clamp(20px, 3vw, 32px)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 20,
          background: "var(--brand-soft)",
          borderColor: "#c6e0d9",
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center", flex: "1 1 320px" }}>
          <span className="brand-mark" style={{ width: 52, height: 52, borderRadius: 14 }}>
            <Icon name="edit_note" size={28} />
          </span>
          <div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 800 }}>Can&apos;t find what you need?</h3>
            <p style={{ color: "var(--text-body)", fontSize: "0.92rem" }}>
              Describe the job and we&apos;ll match a specialist for it.
            </p>
          </div>
        </div>
        <button type="button" onClick={handleCustomRequest} className="btn btn-primary btn-lg">
          Request a custom service <Icon name="arrow_forward" size={18} />
        </button>
      </section>
    </div>
  );
}
