import React, { useEffect } from "react";
import Icon from "./Icon";

const TONE = {
  success: { icon: "check_circle", color: "#4ade80" },
  error: { icon: "error", color: "#f87171" },
  info: { icon: "info", color: "#93c5fd" },
};

export default function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const tone = TONE[type] || TONE.success;

  return (
    <div className="toast" role="status" aria-live="polite">
      <Icon name={tone.icon} size={22} color={tone.color} filled />
      <div style={{ flex: 1 }}>{message}</div>
      <button type="button" className="icon-btn" onClick={onClose} aria-label="Dismiss">
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
