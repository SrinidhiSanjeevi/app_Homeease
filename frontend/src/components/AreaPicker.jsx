import React, { useEffect, useState } from "react";
import Icon from "./Icon";

// Distance between two { latitude, longitude } points in km (Haversine).
const distanceKm = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// Farthest a detected position may be from an area centre to count as "in" it.
const MAX_DETECT_KM = 12;

/**
 * Chip showing the chosen area; opens a picker with the 10 service areas
 * and an optional "Detect my location" (GPS → nearest area).
 */
export function AreaChip({ area, onClick, compact = false }) {
  return (
    <button type="button" className={`area-chip${area ? "" : " is-empty"}${compact ? " is-compact" : ""}`} onClick={onClick}>
      <Icon name="location_on" size={18} filled={Boolean(area)} />
      <span className="area-chip-text">{area || "Choose your area"}</span>
      <Icon name="expand_more" size={18} />
    </button>
  );
}

export default function AreaPicker({ open, areas, current, onSelect, onClose, required = false }) {
  const [status, setStatus] = useState("idle"); // idle | locating
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (open) setMessage("");
  }, [open]);

  if (!open) return null;

  const detect = () => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setMessage("Automatic detection needs a secure (https) connection. Please pick your area from the list.");
      return;
    }
    setStatus("locating");
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus("idle");
        const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        const nearest = areas
          .map((a) => ({ ...a, km: distanceKm(here, a) }))
          .sort((x, y) => x.km - y.km)[0];
        if (!nearest || nearest.km > MAX_DETECT_KM) {
          setMessage("You seem to be outside our service area (Gachibowli and nearby). Pick the closest area below.");
          return;
        }
        onSelect(nearest.name);
      },
      () => {
        setStatus("idle");
        setMessage("We couldn't get your location. Please pick your area from the list.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !required && onClose()}>
      <div className="modal area-modal" role="dialog" aria-modal="true" aria-labelledby="area-title">
        <div className="modal-head">
          <div>
            <h2 id="area-title">Where do you need service?</h2>
            <p>HomeEase serves Gachibowli and nearby areas. We send the professional closest to you.</p>
          </div>
          {!required && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" size={24} />
            </button>
          )}
        </div>

        <div className="area-body">
          <button type="button" className="btn btn-secondary area-detect" onClick={detect} disabled={status === "locating"}>
            <Icon name={status === "locating" ? "progress_activity" : "my_location"} size={18} spin={status === "locating"} />
            {status === "locating" ? "Detecting…" : "Detect my location"}
          </button>

          {message && (
            <div className="notice notice-warn">
              <Icon name="info" size={18} />
              <span>{message}</span>
            </div>
          )}

          <div className="area-grid">
            {areas.map((a) => (
              <button
                type="button"
                key={a.name}
                className={`area-option${current === a.name ? " is-active" : ""}`}
                onClick={() => onSelect(a.name)}
              >
                <Icon name="location_on" size={20} filled={current === a.name} />
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {a.professionals > 0 ? `${a.professionals} professional${a.professionals > 1 ? "s" : ""} nearby` : "Covered by nearby areas"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
