import React from "react";
import { User, Mail, ShieldCheck, DollarSign, CalendarCheck, Sparkles } from "lucide-react";

export default function Profile({ user, bookings, onLogout }) {
  // Stats calculations
  const totalBookings = bookings.length;
  const completedBookings = bookings.filter((b) => b.status === "Completed").length;
  const activeBookings = bookings.filter((b) => b.status === "Confirmed" || b.status === "Assigned").length;
  
  const totalSpent = bookings
    .filter((b) => b.status === "Completed" || b.status === "Confirmed")
    .reduce((sum, b) => sum + (b.totalPrice || 0), 0);

  return (
    <div style={{ animation: "fadeInUp 0.4s ease-out", padding: "40px 0", maxWidth: "800px", margin: "0 auto" }}>
      
      {/* Profile Header Card */}
      <div
        className="glass-card"
        style={{
          padding: "40px",
          textAlign: "center",
          borderRadius: "24px",
          background: "linear-gradient(to bottom, var(--primary-light) 0%, #ffffff 100%)",
          marginBottom: "30px",
        }}
      >
        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)",
            color: "white",
            fontSize: "2rem",
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px auto",
            border: "4px solid #ffffff",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {user?.name?.substring(0, 2).toUpperCase() || "US"}
        </div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-main)" }}>
          {user?.name || "Premium User"}
        </h2>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "0.85rem",
            color: "var(--primary)",
            background: "var(--primary-light)",
            padding: "4px 12px",
            borderRadius: "20px",
            fontWeight: 700,
            marginTop: "8px",
          }}
        >
          <Sparkles size={12} /> Standard Member
        </span>
      </div>

      {/* Stats Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "20px",
          marginBottom: "30px",
        }}
      >
        <div className="glass-card" style={{ padding: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              background: "var(--primary-light)",
              color: "var(--primary)",
              padding: "12px",
              borderRadius: "12px",
            }}
          >
            <CalendarCheck size={24} />
          </div>
          <div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block" }}>Total Bookings</span>
            <span style={{ fontSize: "1.4rem", fontWeight: 800 }}>{totalBookings}</span>
          </div>
        </div>

        <div className="glass-card" style={{ padding: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ background: "hsl(142, 70%, 95%)", color: "var(--success)", padding: "12px", borderRadius: "12px" }}>
            <ShieldCheck size={24} />
          </div>
          <div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block" }}>Completed / Active</span>
            <span style={{ fontSize: "1.4rem", fontWeight: 800 }}>
              {completedBookings} <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-muted)" }}>/ {activeBookings} active</span>
            </span>
          </div>
        </div>

        <div className="glass-card" style={{ padding: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ background: "hsl(190, 90%, 95%)", color: "var(--secondary)", padding: "12px", borderRadius: "12px" }}>
            <DollarSign size={24} />
          </div>
          <div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block" }}>Total Investment</span>
            <span style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--primary)" }}>₹{totalSpent}</span>
          </div>
        </div>
      </div>

      {/* Account Settings / General Info */}
      <div className="glass-card" style={{ padding: "30px" }}>
        <h3 style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: "20px", borderBottom: "1px solid var(--border)", paddingBottom: "10px" }}>
          Account Details
        </h3>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <User size={18} color="var(--text-muted)" />
            <div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Name</span>
              <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>{user?.name}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <Mail size={18} color="var(--text-muted)" />
            <div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Email</span>
              <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>{user?.email}</span>
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", marginTop: "24px", paddingTop: "20px", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onLogout} className="btn btn-secondary btn-danger">
            Logout Session
          </button>
        </div>
      </div>
    </div>
  );
}
