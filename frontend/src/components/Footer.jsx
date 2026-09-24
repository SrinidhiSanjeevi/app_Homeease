import React from "react";
import Icon from "./Icon";
import { BrandMark } from "./Navbar";

export default function Footer({ onNavigate }) {
  const go = (tab) => (e) => {
    e.preventDefault();
    if (typeof onNavigate === "function") onNavigate(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="footer">
      <div className="page">
        <div className="footer-grid">
          <div>
            <div className="brand">
              <BrandMark size={30} />
              <span>HomeEase</span>
            </div>
            <p style={{ maxWidth: 300 }}>
              Verified professionals for every job around the house — booked in minutes, done right the first time.
            </p>
          </div>

          <div>
            <h4>Services</h4>
            <ul>
              <li><a href="/" onClick={go("dashboard")}>All services</a></li>
              <li><a href="/" onClick={go("emergency")}>Emergency help</a></li>
              <li><a href="/" onClick={go("bookings")}>My bookings</a></li>
            </ul>
          </div>

          <div>
            <h4>Account</h4>
            <ul>
              <li><a href="/" onClick={go("profile")}>Profile</a></li>
              <li><a href="/" onClick={go("bookings")}>Rate a service</a></li>
            </ul>
          </div>

          <div>
            <h4>Support</h4>
            <ul>
              <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="mail" size={16} /> <a href="mailto:support@homeease.com">support@homeease.com</a>
              </li>
              <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="call" size={16} /> <a href="tel:+911800000000">1800-000-000</a>
              </li>
              <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="schedule" size={16} /> 8 AM – 10 PM, all days
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} homeease.com · All rights reserved</span>
          <span>Privacy · Terms · Refund policy</span>
        </div>
      </div>
    </footer>
  );
}
