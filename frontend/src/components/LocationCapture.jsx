import React, { useState } from "react";
import { MapPin, CheckCircle2, AlertTriangle } from "lucide-react";

// Optional "Use my current location" capture.
//
// Only requests a fix when the button is explicitly clicked — this
// component never calls watchPosition, so there is no continuous
// tracking. Permission denied / location unavailable are both handled
// gracefully: the caller can always continue without a location.
export default function LocationCapture({ onLocationCaptured }) {
  const [status, setStatus] = useState("idle"); // idle | requesting | success | error
  const [location, setLocation] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setStatus("error");
      setErrorMessage("Location is not supported on this browser. You can continue without it.");
      return;
    }

    setStatus("requesting");
    setErrorMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const captured = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        setLocation(captured);
        setStatus("success");
        if (typeof onLocationCaptured === "function") onLocationCaptured(captured);
      },
      (error) => {
        setStatus("error");
        setErrorMessage(
          error.code === error.PERMISSION_DENIED
            ? "Location permission denied. You can still continue without it."
            : "Could not detect your location. You can still continue without it."
        );
        if (typeof onLocationCaptured === "function") onLocationCaptured(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="form-group">
      <label>Location (optional)</label>

      {status !== "success" && (
        <button
          type="button"
          onClick={handleUseLocation}
          className="btn btn-secondary"
          disabled={status === "requesting"}
          style={{ display: "flex", alignItems: "center", gap: "6px", width: "fit-content" }}
        >
          <MapPin size={15} />
          {status === "requesting" ? "Detecting location..." : "Use my current location"}
        </button>
      )}

      {status === "success" && location && (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "10px",
            padding: "10px 14px",
            fontSize: "0.82rem",
            color: "#15803d"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, marginBottom: "4px" }}>
            <CheckCircle2 size={15} /> Location detected
          </div>
          <div>Latitude: {location.latitude.toFixed(6)}</div>
          <div>Longitude: {location.longitude.toFixed(6)}</div>
          <div>Accuracy: ~{Math.round(location.accuracy)} meters</div>
        </div>
      )}

      {status === "error" && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "6px",
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: "10px",
            padding: "10px 14px",
            fontSize: "0.8rem",
            color: "#9a3412",
            marginTop: "6px"
          }}
        >
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: "1px" }} />
          <span>{errorMessage}</span>
        </div>
      )}

      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "6px" }}>
        Optional — only used to find the nearest available professional. Captured once, only when you tap the button above.
      </p>
    </div>
  );
}
