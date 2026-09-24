import React, { useEffect, useState } from "react";
import Icon from "./Icon";

// Where is the service needed? Three free ways to set it, all ending in
// coordinates that must fall inside the HomeEase service area
// (Gachibowli, Hyderabad and surroundings):
//
//   1. "Use my current location" — browser Geolocation API (HTTPS only),
//      then a reverse lookup for a readable address.
//   2. Address search — OpenStreetMap Nominatim via our backend
//      (/api/location/search). Runs only on explicit search, never per
//      keystroke, per Nominatim's usage policy.
//   3. Quick-pick locality — fixed list from the backend; works even when
//      GPS and geocoding are unavailable.
//
// onChange receives { latitude, longitude, accuracy, label, source } or null.
// onAddressFound (optional) receives a readable address to pre-fill a field.

let serviceAreaPromise = null;
const loadServiceArea = () => {
  if (!serviceAreaPromise) {
    serviceAreaPromise = fetch("/api/location/service-area")
      .then((r) => r.json())
      .then((d) => (d.success ? d.serviceArea : null))
      .catch(() => null);
    serviceAreaPromise.then((area) => {
      if (!area) serviceAreaPromise = null; // allow a retry later
    });
  }
  return serviceAreaPromise;
};

const authHeaders = () => {
  let token = "";
  try {
    token = localStorage.getItem("token") || "";
  } catch {
    /* storage blocked */
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const toRad = (d) => (d * Math.PI) / 180;
const distanceKm = (a, b) => {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export default function LocationPicker({ value, onChange, onAddressFound, label = "Service location" }) {
  const [area, setArea] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | locating | searching
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);

  useEffect(() => {
    let alive = true;
    loadServiceArea().then((a) => alive && setArea(a));
    return () => {
      alive = false;
    };
  }, []);

  const kmFromCenter = (loc) => (area ? distanceKm(area.center, loc) : null);

  const choose = (loc) => {
    const km = kmFromCenter(loc);
    if (area && km > area.radiusKm) {
      setError(
        `That spot is about ${Math.round(km)} km from ${area.name}. HomeEase currently serves only within ${area.radiusKm} km.`
      );
      onChange(null);
      return;
    }
    setError("");
    setResults(null);
    onChange(loc);
    if (loc.label && typeof onAddressFound === "function") onAddressFound(loc.label);
  };

  const useCurrentLocation = () => {
    if (!window.isSecureContext) {
      setError("Current location needs a secure (https://) connection. Search your address or pick your area below.");
      return;
    }
    if (!navigator.geolocation) {
      setError("This browser can't share location. Search your address or pick your area below.");
      return;
    }

    setStatus("locating");
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const loc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          label: null,
          source: "gps"
        };
        try {
          const r = await fetch(`/api/location/reverse?lat=${loc.latitude}&lng=${loc.longitude}`, {
            headers: authHeaders()
          });
          const d = await r.json();
          if (d.success && d.place?.label) loc.label = d.place.label;
        } catch {
          /* coordinates are enough */
        }
        setStatus("idle");
        choose(loc);
      },
      (err) => {
        setStatus("idle");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location access is blocked. Search your address or pick your area below."
            : "We couldn't detect your location. Search your address or pick your area below."
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const search = async () => {
    const q = query.trim();
    if (q.length < 3) {
      setError("Type at least 3 characters, e.g. \"DLF Cyber City\" or \"Botanical Garden Road\".");
      return;
    }
    setStatus("searching");
    setError("");
    try {
      const r = await fetch(`/api/location/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
      const d = await r.json();
      if (!r.ok || !d.success) {
        setError(d.message || "Address search failed. Pick your area below instead.");
        setResults(null);
      } else {
        setResults(d.places);
      }
    } catch {
      setError("Address search is unavailable right now. Pick your area below instead.");
      setResults(null);
    } finally {
      setStatus("idle");
    }
  };

  // ---------- Selected ----------
  if (value) {
    const km = kmFromCenter(value);
    return (
      <div className="form-group">
        <span className="field-label">{label}</span>
        <div className="lp-selected">
          <span className="lp-pin">
            <Icon name="where_to_vote" size={22} filled />
          </span>
          <div className="lp-selected-text">
            <strong>{value.label || `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`}</strong>
            <span>
              {value.source === "gps" ? "Your current location" : value.source === "locality" ? "Area selected" : "Address found"}
              {km !== null && ` · ${km.toFixed(1)} km from ${area.name.split(",")[0]}`}
              {value.accuracy ? ` · ±${Math.round(value.accuracy)} m` : ""}
            </span>
          </div>
          <button type="button" className="btn btn-ghost lp-change" onClick={() => onChange(null)}>
            Change
          </button>
        </div>
        <span className="field-hint">We&apos;ll send the nearest available professional within the service area.</span>
        <style>{STYLES}</style>
      </div>
    );
  }

  // ---------- Picker ----------
  return (
    <div className="form-group">
      <span className="field-label">{label}</span>

      <div className="lp-area">
        <Icon name="location_on" size={18} />
        <span>
          HomeEase currently serves <strong>{area ? area.name : "Gachibowli, Hyderabad"}</strong> and nearby areas
          {area ? ` (within ${area.radiusKm} km)` : ""}.
        </span>
      </div>

      <button
        type="button"
        className="btn btn-secondary lp-gps"
        onClick={useCurrentLocation}
        disabled={status === "locating"}
      >
        <Icon name={status === "locating" ? "progress_activity" : "my_location"} size={18} spin={status === "locating"} />
        {status === "locating" ? "Detecting location…" : "Use my current location"}
      </button>

      <div className="lp-search">
        <input
          type="search"
          placeholder="Search building, street or landmark"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" className="btn btn-primary" onClick={search} disabled={status === "searching"}>
          {status === "searching" ? <Icon name="progress_activity" size={18} spin /> : <Icon name="search" size={18} />}
          <span className="lp-search-label">Search</span>
        </button>
      </div>

      {results && (
        <div className="lp-results">
          {results.length === 0 ? (
            <div className="lp-empty">No matches inside the service area. Try a nearby landmark, or pick your area below.</div>
          ) : (
            results.map((place) => (
              <button
                type="button"
                key={`${place.latitude},${place.longitude}`}
                className="lp-result"
                onClick={() =>
                  choose({ latitude: place.latitude, longitude: place.longitude, accuracy: null, label: place.label, source: "search" })
                }
              >
                <Icon name="location_on" size={18} />
                <span>
                  <strong>{place.label}</strong>
                  <small>{place.distanceFromCenterKm} km from Gachibowli</small>
                </span>
              </button>
            ))
          )}
          <div className="lp-attrib">Search by © OpenStreetMap contributors</div>
        </div>
      )}

      {area && (
        <>
          <span className="lp-or">Or pick your area</span>
          <div className="lp-localities">
            {area.localities.map((l) => (
              <button
                type="button"
                key={l.name}
                className="chip lp-chip"
                onClick={() =>
                  choose({ latitude: l.latitude, longitude: l.longitude, accuracy: null, label: `${l.name}, Hyderabad`, source: "locality" })
                }
              >
                {l.name}
              </button>
            ))}
          </div>
        </>
      )}

      {error && (
        <div className="notice notice-warn">
          <Icon name="info" size={18} />
          <span>{error}</span>
        </div>
      )}

      <style>{STYLES}</style>
    </div>
  );
}

const STYLES = `
.lp-area { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: var(--radius-md);
  background: var(--brand-soft); color: var(--brand-ink); font-size: .82rem; line-height: 1.45; }
.lp-area .material-symbols-rounded { flex-shrink: 0; margin-top: 1px; }
.lp-gps { width: fit-content; }
.lp-search { display: flex; gap: 8px; }
.lp-search input { flex: 1; min-width: 0; }
.lp-search .btn { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; }
@media (max-width: 420px) { .lp-search-label { display: none; } }
.lp-results { border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; background: #fff; }
.lp-result { display: flex; gap: 10px; align-items: flex-start; width: 100%; text-align: left; padding: 10px 12px;
  background: none; border: 0; border-bottom: 1px solid var(--border); cursor: pointer; color: var(--text-main); }
.lp-result:hover { background: var(--bg-subtle); }
.lp-result .material-symbols-rounded { color: var(--primary); flex-shrink: 0; margin-top: 2px; }
.lp-result strong { display: block; font-size: .85rem; font-weight: 600; }
.lp-result small { font-size: .74rem; color: var(--text-muted); }
.lp-empty { padding: 12px; font-size: .82rem; color: var(--text-muted); }
.lp-attrib { padding: 6px 12px; font-size: .68rem; color: var(--text-muted); background: var(--bg-subtle); text-align: right; }
.lp-or { font-size: .74rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
.lp-localities { display: flex; flex-wrap: wrap; gap: 6px; }
.lp-chip { min-height: 32px; padding: 0 12px; font-size: .8rem; cursor: pointer; }
.lp-chip:hover { border-color: var(--primary); color: var(--primary); }
.lp-selected { display: flex; gap: 12px; align-items: center; padding: 12px 14px; border-radius: var(--radius-md);
  background: #e3f5ea; border: 1px solid #bfe6cd; }
.lp-pin { color: #15703a; display: flex; }
.lp-selected-text { flex: 1; min-width: 0; }
.lp-selected-text strong { display: block; font-size: .88rem; color: var(--text-main); overflow-wrap: anywhere; }
.lp-selected-text span { font-size: .76rem; color: #15703a; }
.lp-change { min-height: 34px; padding: 0 10px; font-size: .82rem; flex-shrink: 0; }
`;
