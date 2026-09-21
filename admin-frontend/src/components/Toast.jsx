import React, { useEffect } from "react";
import { CheckCircle, AlertCircle, X } from "lucide-react";

export default function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        top: "24px",
        right: "24px",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "16px 20px",
        borderRadius: "12px",
        background: "#ffffff",
        color: "#1e293b",
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
        borderLeft: `5px solid ${type === "success" ? "hsl(142, 70%, 45%)" : "hsl(343, 90%, 60%)"}`,
        animation: "slideInRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        maxWidth: "350px",
      }}
    >
      {type === "success" ? (
        <CheckCircle size={20} color="hsl(142, 70%, 45%)" />
      ) : (
        <AlertCircle size={20} color="hsl(343, 90%, 60%)" />
      )}
      <div style={{ flex: 1, fontSize: "0.9rem", fontWeight: 500 }}>
        {message}
      </div>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "#94a3b8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
