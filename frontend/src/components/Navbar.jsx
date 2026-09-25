import React from "react";
import Icon from "./Icon";
import { AreaChip } from "./AreaPicker";

export function BrandMark({ size = 34 }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 10.6 12 3l9 7.6V20a1 1 0 0 1-1 1h-5.5v-6.5h-5V21H4a1 1 0 0 1-1-1z" />
      </svg>
    </span>
  );
}

const TABS = [
  { id: "dashboard", label: "Services", icon: "home_repair_service" },
  { id: "bookings", label: "My Bookings", icon: "event_note" },
  { id: "emergency", label: "Emergency", icon: "e911_emergency", isEmergency: true },
  { id: "profile", label: "Profile", icon: "account_circle" },
];

export default function Navbar({ activeTab, setActiveTab, user, onLogout, onSignIn, area, onChangeArea }) {
  const initials = (user?.name || "User")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="nav">
      <div className="page nav-inner">
        <button type="button" className="brand" onClick={() => setActiveTab("dashboard")} aria-label="HomeEase home">
          <BrandMark />
          <span>
            Home<span className="brand-accent">Ease</span>
          </span>
        </button>

        <nav className="nav-links" aria-label="Main">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`nav-link${isActive ? " is-active" : ""}${tab.isEmergency ? " is-emergency" : ""}`}
                aria-current={isActive ? "page" : undefined}
                title={tab.label}
              >
                <Icon name={tab.icon} size={20} filled={isActive} />
                <span className="nav-link-label">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="nav-user">
          <span className="nav-area">
            <AreaChip area={area} onClick={onChangeArea} compact />
          </span>
          {user ? (
            <>
              <span className="avatar">{initials}</span>
              <span className="nav-user-meta">
                <strong>{user.name || "User"}</strong>
                <span>{user.role === "professional" ? "Professional" : "Customer"}</span>
              </span>
              <button type="button" className="icon-btn" onClick={onLogout} aria-label="Log out" title="Log out">
                <Icon name="logout" size={20} />
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onSignIn}>
              <Icon name="login" size={18} /> Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
