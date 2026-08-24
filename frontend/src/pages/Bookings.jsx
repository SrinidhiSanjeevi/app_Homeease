import React, { useState } from "react";
import { Calendar, Clock, MapPin, User, Star, CheckCircle, CreditCard, Mail, ArrowRight, XCircle, Activity, TrendingUp } from "lucide-react";

export default function Bookings({ bookings, onCancelBooking, onRateBooking, onAcceptBooking, onCompleteBooking, isProfessionalMode }) {
  const [ratingId, setRatingId] = useState(null);
  const [ratingVal, setRatingVal] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [filter, setFilter] = useState("All");

  const handleRatingSubmit = (e, bookingId) => {
    e.preventDefault();
    onRateBooking(bookingId, ratingVal, reviewText);
    setRatingId(null);
    setRatingVal(5);
    setReviewText("");
  };

  const getStepProgress = (booking) => {
    if (booking.status === "Cancelled") return -1;
    if (booking.status === "Completed") return 4;
    if (booking.status === "Confirmed") return 3;
    if (booking.professional) return 2;
    return 1;
  };

  // ─── STATS ────────────────────────────────────────────────────────────
  const totalCount     = bookings.length;
  const activeCount    = bookings.filter((b) => b.status !== "Completed" && b.status !== "Cancelled").length;
  const completedCount = bookings.filter((b) => b.status === "Completed").length;
  const cancelledCount = bookings.filter((b) => b.status === "Cancelled").length;

  // ─── FILTER ───────────────────────────────────────────────────────────
  const filteredBookings = filter === "All"
    ? bookings
    : filter === "Active"
      ? bookings.filter((b) => b.status !== "Completed" && b.status !== "Cancelled")
      : bookings.filter((b) => b.status === filter);

  const filterTabs = [
    { label: "All",       count: totalCount },
    { label: "Active",    count: activeCount },
    { label: "Completed", count: completedCount },
    { label: "Cancelled", count: cancelledCount },
  ];

  const statCards = [
    {
      label: "Total Bookings",
      value: totalCount,
      color: "#6366f1",
      bg: "rgba(99,102,241,0.1)",
      icon: <Activity size={20} color="#6366f1" />,
    },
    {
      label: "Active / In-Progress",
      value: activeCount,
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.1)",
      icon: <TrendingUp size={20} color="#f59e0b" />,
    },
    {
      label: "Completed",
      value: completedCount,
      color: "#16a34a",
      bg: "rgba(22,163,74,0.1)",
      icon: <CheckCircle size={20} color="#16a34a" />,
    },
    {
      label: "Cancelled",
      value: cancelledCount,
      color: "#dc2626",
      bg: "rgba(220,38,38,0.1)",
      icon: <XCircle size={20} color="#dc2626" />,
    },
  ];

  return (
    <div style={{ animation: "fadeInUp 0.4s ease-out", padding: "40px 0" }}>

      {/* ── PAGE HEADER ───────────────────────────────────────────── */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "6px", letterSpacing: "-0.02em" }}>
          {isProfessionalMode ? "Professional Service Dashboard" : "My Bookings"}
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          {isProfessionalMode
            ? "Manage assigned home service requests, perform services, and mark bookings as completed."
            : "Track your home service lifecycle: Booked → Professional Assigned → Service Confirmed → Service Completed."}
        </p>
      </div>

      {/* ── STATS ROW ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "16px", marginBottom: "28px" }}>
        {statCards.map((card) => (
          <div
            key={card.label}
            style={{
              background: card.bg,
              border: `1px solid ${card.color}30`,
              borderRadius: "16px",
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {card.icon}
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: card.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {card.label}
              </span>
            </div>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, color: card.color, lineHeight: 1 }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── FILTER TABS ──────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "24px" }}>
        {filterTabs.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setFilter(tab.label)}
            style={{
              padding: "8px 20px",
              borderRadius: "30px",
              border: "none",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              transition: "all 0.2s",
              backgroundColor: filter === tab.label ? "var(--primary)" : "rgba(99,102,241,0.08)",
              color: filter === tab.label ? "white" : "var(--text-muted)",
            }}
          >
            {tab.label}
            <span style={{
              marginLeft: "6px",
              background: filter === tab.label ? "rgba(255,255,255,0.25)" : "rgba(99,102,241,0.15)",
              borderRadius: "30px",
              padding: "1px 7px",
              fontSize: "0.75rem",
            }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── BOOKING CARDS ────────────────────────────────────────── */}
      {filteredBookings.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          {filteredBookings.map((booking) => {
            const isCompleted = booking.status === "Completed";
            const isCancelled = booking.status === "Cancelled";
            const isConfirmed = booking.status === "Confirmed";
            const isCash = booking.paymentMethod === "Cash" || booking.paymentMethod === "Cash on Delivery";

            const currentStep = getStepProgress(booking);

            const simpleTrackerSteps = [
              { num: 1, label: "Booked",               done: currentStep >= 1 },
              { num: 2, label: "Professional Assigned", done: currentStep >= 2 },
              { num: 3, label: "Service Confirmed",     done: currentStep >= 3 },
              { num: 4, label: "Service Completed",     done: currentStep >= 4 },
            ];

            return (
              <div
                key={booking._id}
                className="glass-card"
                style={{
                  padding: "28px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                  borderRadius: "20px",
                  border: isCancelled
                    ? "1px solid #fee2e2"
                    : isCompleted
                      ? "1px solid #bbf7d0"
                      : "1px solid var(--border)",
                  opacity: isCancelled ? 0.85 : 1,
                }}
              >
                {/* ── Header row ─────────────────────────────────── */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "12px",
                    borderBottom: "1px solid var(--border)",
                    paddingBottom: "16px",
                  }}
                >
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <img
                      src={
                        booking.isCustom
                          ? "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=100&q=80"
                          : (booking.service?.image || "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=100&q=80")
                      }
                      alt={booking.isCustom ? "Custom Request" : booking.service?.name}
                      style={{ width: "64px", height: "64px", borderRadius: "14px", objectFit: "cover" }}
                    />
                    <div>
                      <h3 style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                        {booking.isCustom ? "Custom Service Request" : (booking.service?.name || "Home Service")}
                      </h3>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        Category: {booking.isCustom ? booking.customCategory : (booking.service?.category || "General")}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span
                      style={{
                        padding: "6px 14px",
                        borderRadius: "20px",
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        backgroundColor: isCompleted ? "#dcfce7" : isCancelled ? "#fee2e2" : "#dbeafe",
                        color: isCompleted ? "#15803d" : isCancelled ? "#b91c1c" : "#1d4ed8",
                      }}
                    >
                      {booking.status}
                    </span>
                    <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--primary)" }}>
                      ₹{booking.totalPrice}
                    </span>
                  </div>
                </div>

                {/* ── 4-Stage Progress Tracker ────────────────────── */}
                {!isCancelled ? (
                  <div style={{ background: "rgba(243,244,246,0.7)", padding: "18px 24px", borderRadius: "16px" }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "14px", letterSpacing: "0.05em" }}>
                      Booking Progress Tracker
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
                      {simpleTrackerSteps.map((step, idx) => (
                        <React.Fragment key={idx}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div
                              style={{
                                width: "28px",
                                height: "28px",
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: "0.85rem",
                                backgroundColor: step.done ? "#16a34a" : "#e5e7eb",
                                color: step.done ? "#ffffff" : "#6b7280",
                              }}
                            >
                              {step.done ? "✓" : step.num}
                            </div>
                            <span style={{ fontSize: "0.9rem", fontWeight: step.done ? 700 : 500, color: step.done ? "#15803d" : "#4b5563" }}>
                              {step.label}
                            </span>
                          </div>
                          {idx < simpleTrackerSteps.length - 1 && (
                            <ArrowRight size={16} style={{ color: "#9ca3af" }} />
                          )}
                        </React.Fragment>
                      ))}
                    </div>

                  </div>
                ) : (
                  <div style={{ background: "#fef2f2", padding: "14px 20px", borderRadius: "12px", display: "flex", alignItems: "center", gap: "10px", color: "#991b1b", fontSize: "0.9rem" }}>
                    <XCircle size={18} />
                    <span>This booking has been <strong>Cancelled</strong>.</span>
                  </div>
                )}

                {/* ── Details Grid ────────────────────────────────── */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "16px",
                    fontSize: "0.85rem",
                  }}
                >
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <Calendar size={16} style={{ color: "var(--primary)", marginTop: "2px" }} />
                    <div>
                      <span style={{ display: "block", fontWeight: 700, color: "var(--text-muted)" }}>Scheduled Date</span>
                      <span>{new Date(booking.date).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <Clock size={16} style={{ color: "var(--primary)", marginTop: "2px" }} />
                    <div>
                      <span style={{ display: "block", fontWeight: 700, color: "var(--text-muted)" }}>Time Slot</span>
                      <span>{booking.timeSlot}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <MapPin size={16} style={{ color: "var(--primary)", marginTop: "2px" }} />
                    <div>
                      <span style={{ display: "block", fontWeight: 700, color: "var(--text-muted)" }}>Address</span>
                      <span>{booking.address}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <User size={16} style={{ color: "var(--primary)", marginTop: "2px" }} />
                    <div>
                      <span style={{ display: "block", fontWeight: 700, color: "var(--text-muted)" }}>Professional Assigned</span>
                      {booking.professional && (booking.professional.name || typeof booking.professional === "string") ? (
                        <span style={{ fontWeight: 600 }}>{booking.professional.name || "Specialist Assigned"}</span>
                      ) : isCompleted ? (
                        <span style={{ color: "#16a34a", fontWeight: 600 }}>Service Completed</span>
                      ) : isCancelled ? (
                        <span style={{ color: "#6b7280" }}>Not Assigned (Cancelled)</span>
                      ) : (
                        <span style={{ color: "#b45309" }}>No professional currently available</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Payment & Notifications ─────────────────────── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                  {/* Payment Card */}
                  <div style={{ border: "1px solid var(--border)", padding: "14px 18px", borderRadius: "14px", fontSize: "0.85rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, marginBottom: "8px" }}>
                      <CreditCard size={16} style={{ color: "var(--primary)" }} />
                      <span>Payment Method & Status</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", padding: "10px 14px", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{isCash ? "Cash on Delivery" : (booking.paymentMethod || "Online Payment")}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {isCash ? "Pay cash directly after service completion" : "Online Gateway Payment"}
                        </div>
                      </div>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: "0.8rem",
                          padding: "4px 10px",
                          borderRadius: "12px",
                          backgroundColor: isCompleted && isCash ? "#dcfce7" : isCash ? "#fef3c7" : booking.paymentStatus === "Paid" ? "#dcfce7" : "#fee2e2",
                          color: isCompleted && isCash ? "#166534" : isCash ? "#92400e" : booking.paymentStatus === "Paid" ? "#166534" : "#991b1b",
                        }}
                      >
                        {booking.paymentStatus || (isCash ? "Cash on Delivery" : "Pending")}
                      </span>
                    </div>
                  </div>

                  {/* Notifications Card — Email Only */}
                  <div style={{ border: "1px solid var(--border)", padding: "14px 18px", borderRadius: "14px", fontSize: "0.85rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, marginBottom: "8px" }}>
                      <Mail size={16} style={{ color: "var(--primary)" }} />
                      <span>Email Notification</span>
                    </div>
                    {booking.notifications && booking.notifications.length > 0 ? (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", padding: "10px 14px", borderRadius: "8px", fontSize: "0.83rem" }}>
                        <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                          <Mail size={13} />
                          Confirmation email sent to customer
                        </span>
                        <span style={{
                          color: booking.notifications[0]?.status === "Success" ? "#16a34a" : "#dc2626",
                          fontWeight: 700,
                          background: booking.notifications[0]?.status === "Success" ? "#dcfce7" : "#fee2e2",
                          padding: "2px 10px",
                          borderRadius: "12px",
                          fontSize: "0.78rem"
                        }}>
                          {booking.notifications[0]?.status || "Sent"}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                        Confirmation email will be sent on booking.
                      </span>
                    )}
                  </div>

                </div>

                {/* ── ACTION BUTTONS ──────────────────────────────── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", paddingTop: "8px" }}>

                  {/* CUSTOMER ONLY: Mark Service Completed */}
                  {!isProfessionalMode && !isCompleted && !isCancelled && (
                    <button
                      onClick={() => onCompleteBooking(booking._id)}
                      style={{
                        padding: "10px 22px",
                        fontSize: "0.88rem",
                        fontWeight: 700,
                        backgroundColor: "#16a34a",
                        color: "white",
                        border: "none",
                        borderRadius: "10px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        transition: "transform 0.15s, box-shadow 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(22,163,74,0.4)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      <CheckCircle size={16} /> Mark Service Completed
                    </button>
                  )}

                  {/* CUSTOMER VIEW: completed banner */}
                  {!isProfessionalMode && isCompleted && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#16a34a", fontWeight: 700, fontSize: "0.95rem" }}>
                      <CheckCircle size={18} />
                      Service successfully completed
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "12px" }}>
                    {/* Cancel — only for non-completed, non-cancelled */}
                    {!isCompleted && !isCancelled && (
                      <button
                        onClick={() => onCancelBooking(booking._id)}
                        style={{
                          padding: "10px 18px",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          backgroundColor: "transparent",
                          color: "#dc2626",
                          border: "1px solid #fca5a5",
                          borderRadius: "10px",
                          cursor: "pointer",
                        }}
                      >
                        Cancel Booking
                      </button>
                    )}

                    {/* Rate — customer only, after completion, before rating */}
                    {isCompleted && !booking.userRating && !isProfessionalMode && (
                      <button
                        onClick={() => setRatingId(booking._id)}
                        className="btn-primary"
                        style={{ padding: "10px 18px", fontSize: "0.85rem" }}
                      >
                        Rate & Review
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Rating Form ─────────────────────────────────── */}
                {ratingId === booking._id && (
                  <form onSubmit={(e) => handleRatingSubmit(e, booking._id)} style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", marginTop: "10px" }}>
                    <div style={{ fontWeight: 700, marginBottom: "8px" }}>Leave a Service Review</div>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={24}
                          onClick={() => setRatingVal(star)}
                          style={{ cursor: "pointer", color: star <= ratingVal ? "#f59e0b" : "#cbd5e1", fill: star <= ratingVal ? "#f59e0b" : "none" }}
                        />
                      ))}
                    </div>
                    <textarea
                      placeholder="Write your feedback..."
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", marginBottom: "10px" }}
                    />
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button type="submit" className="btn-primary" style={{ padding: "8px 16px" }}>Submit Rating</button>
                      <button type="button" onClick={() => setRatingId(null)} style={{ padding: "8px 16px", background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card" style={{ padding: "60px", textAlign: "center", borderRadius: "20px" }}>
          <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "8px" }}>
            {filter === "All" ? "No Bookings Found" : `No ${filter} Bookings`}
          </h3>
          <p style={{ color: "var(--text-muted)" }}>
            {filter === "All"
              ? "You haven't scheduled any home services yet."
              : `You have no bookings with status "${filter}".`}
          </p>
        </div>
      )}
    </div>
  );
}
