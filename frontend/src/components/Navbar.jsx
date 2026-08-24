import React from "react";
import { Home, Calendar, User, ShieldAlert, LogOut, Sparkles } from "lucide-react";

export default function Navbar({ activeTab, setActiveTab, user, onLogout }) {
  return (
    <nav
      style={{
        background: "#ffffff",
        borderBottom: "1px solid var(--border)",
        padding: "16px 32px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      }}
    >
      <div
        onClick={() => setActiveTab("dashboard")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)",
            color: "white",
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 10px rgba(79, 70, 229, 0.2)",
          }}
        >
          <Sparkles size={18} />
        </div>
        <span style={{ fontSize: "1.25rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
          Home<span style={{ color: "var(--primary)" }}>Ease</span>
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {[
          { id: "dashboard", label: "Services", icon: Home },
          { id: "bookings", label: "My Bookings", icon: Calendar },
          { id: "emergency", label: "Emergency Help", icon: ShieldAlert, isEmergency: true },
          { id: "profile", label: "Profile", icon: User },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: isActive
                  ? tab.isEmergency
                    ? "var(--accent)"
                    : "var(--primary-light)"
                  : "transparent",
                color: isActive
                  ? tab.isEmergency
                    ? "white"
                    : "var(--primary)"
                  : tab.isEmergency
                  ? "var(--accent)"
                  : "var(--text-muted)",
                padding: "8px 16px",
                borderRadius: "12px",
                fontWeight: isActive ? 700 : 500,
                fontSize: "0.9rem",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "var(--transition-fast)",
                border: tab.isEmergency && !isActive ? "1px solid var(--accent)" : "none",
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "var(--primary-light)",
              color: "var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "0.95rem",
              border: "2px solid var(--border)",
            }}
          >
            {user?.name?.substring(0, 2).toUpperCase() || "US"}
          </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{user?.name || "User"}</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {user?.role === "admin" ? "Admin" : "Member"}
              </span>
            </div>
        </div>

        <button
          onClick={onLogout}
          style={{
            background: "none",
            border: "none",
            padding: "8px",
            color: "var(--text-muted)",
            cursor: "pointer",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "var(--transition-fast)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  );
}
