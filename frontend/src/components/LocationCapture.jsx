import React, { useState } from "react";
import Icon from "./Icon";

// Optional "Use my current location" capture.
//
// Only requests a fix when the button is explicitly clicked — this
// component never calls watchPosition, so there is no continuous
// tracking. Every failure mode is handled gracefully: the caller can
// always continue without a location.
//
// NOTE: browsers only expose geolocation on secure origins (HTTPS or
// localhost). On a plain-http URL the browser rejects the request
// without even prompting, which looks like "permission denied".
export default function LocationCapture({ onLocationCaptured }) {
  const [status, setStatus] = useState("idle"); // idle | requesting | success | error
  const [location, setLocation] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const fail = (message) => {
    setStatus("error");
    setErrorMessage(message);
    if (typeof onLocationCaptured === "function") onLocationCaptured(null);
  };

  const handleUseLocation = () => {
    if (!window.isSecureContext) {
      fail("Location needs a secure (https://) connection, and this site is currently served over http. Please type your address above instead.");
      return;
    }
    if (!navigator.geolocation) {
      fail("Location isn't supported on this browser. You can continue without it.");
      return;
    }

    setStatus("requesting");
    setErrorMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const captured = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setLocation(captured);
        setStatus("success");
        if (typeof onLocationCaptured === "function") onLocationCaptured(captured);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          fail("Location access is blocked. Allow it from the lock icon in your address bar, or continue without it.");
        } else if (error.code === error.TIMEOUT) {
          fail("Finding your location took too long. Try again or continue without it.");
        } else {
          fail("We couldn't detect your location. You can continue without it.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="form-group">
      <span className="field-label">Precise location (optional)</span>

      {status === "success" && location ? (
        <div className="notice notice-ok">
          <Icon name="my_location" size={20} />
          <div style={{ flex: 1 }}>
            <strong>Location added</strong>
            <div style={{ fontSize: "0.8rem" }}>
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)} · accurate to ~{Math.round(location.accuracy)} m
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 34, padding: "0 10px", fontSize: "0.82rem" }}
            onClick={() => {
              setLocation(null);
              setStatus("idle");
              if (typeof onLocationCaptured === "function") onLocationCaptured(null);
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleUseLocation}
          className="btn btn-secondary"
          disabled={status === "requesting"}
          style={{ width: "fit-content" }}
        >
          <Icon name={status === "requesting" ? "progress_activity" : "my_location"} size={18} spin={status === "requesting"} />
          {status === "requesting" ? "Detecting location…" : "Use my current location"}
        </button>
      )}

      {status === "error" && (
        <div className="notice notice-warn">
          <Icon name="info" size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      <span className="field-hint">Helps us send the nearest available professional. Captured once, only when you tap the button.</span>
    </div>
  );
}
