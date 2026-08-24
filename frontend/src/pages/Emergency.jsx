import React, { useState } from "react";
import {
  ShieldAlert, PhoneCall, MapPin, Star, Flame, Loader2,
  Zap, Droplets, Lock, AlertTriangle, Clock, Truck, XCircle, CheckCircle2
} from "lucide-react";

const CATEGORIES = [
  { value: "Electrical", label: "Electrical", sub: "Short Circuit, Sparking, Blackout",  defaultSeverity: "High"     },
  { value: "Plumbing",   label: "Plumbing",   sub: "Burst Pipe, Sewage, Faucet Flood",   defaultSeverity: "Medium"   },
  { value: "Security",   label: "Security",   sub: "Lockout, Smart Lock, Break-in",      defaultSeverity: "High"     },
  { value: "Fire",       label: "Fire",       sub: "Active Fire, Smoke, Gas Leak",       defaultSeverity: "Critical" },
  { value: "Medical",    label: "Medical",    sub: "Injury, Unconscious, Cardiac Event", defaultSeverity: "Critical" }
];

const SEVERITY_CONFIG = {
  Low:      { color: "#374151", bg: "#f3f4f6", border: "#e5e7eb", eta: 30, fireEngine: false, emergencyNumber: null            },
  Medium:   { color: "#d97706", bg: "#fef3c7", border: "#fde68a", eta: 20, fireEngine: false, emergencyNumber: "1800-SERV-HELP" },
  High:     { color: "#dc2626", bg: "#fee2e2", border: "#fecaca", eta: 10, fireEngine: true,  emergencyNumber: "101"            },
  Critical: { color: "#991b1b", bg: "#fee2e2", border: "#fca5a5", eta: 5,  fireEngine: true,  emergencyNumber: "101"            }
};

export default function Emergency({ activeEmergencies, onDispatchEmergency, showToast, token }) {
  const [category,       setCategory]       = useState("Electrical");
  const [severity,       setSeverity]       = useState("High");
  const [description,    setDescription]    = useState("");
  const [contactNumber,  setContactNumber]  = useState("");
  const [address,        setAddress]        = useState("");
  const [loading,        setLoading]        = useState(false);
  const [cancellingId,   setCancellingId]   = useState(null);

  const handleCategoryChange = (val) => {
    setCategory(val);
    const cat = CATEGORIES.find((c) => c.value === val);
    if (cat) setSeverity(cat.defaultSeverity);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim() || !contactNumber.trim() || !address.trim()) {
      showToast("Please fill in all fields", "error");
      return;
    }
    setLoading(true);
    await onDispatchEmergency({ category, severity, description, contactNumber, address });
    setLoading(false);
    setDescription("");
    setContactNumber("");
    setAddress("");
  };

 const handleCancel = async (id) => {
  if (!window.confirm("Cancel this emergency request?")) return;
  setCancellingId(id);
  try {
    const res = await fetch(`/api/emergency/${id}/cancel`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast("Emergency request cancelled", "success");
      window.location.reload();
    } else {
      showToast(data.message || "Failed to cancel", "error");
    }
  } catch {
    showToast("Server error", "error");
  }
  setCancellingId(null);
};

  const sev = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.Medium;

  return (
    <div style={{ animation: "fadeInUp 0.4s ease-out", padding: "40px 0" }}>

      {/* ── Header Banner ─────────────────────────────────────────── */}
      <div style={{
        background: "#1e293b",
        color: "white", padding: "24px 28px", borderRadius: "16px",
        display: "flex", alignItems: "center", gap: "20px",
        marginBottom: "32px", border: "1px solid #334155", flexWrap: "wrap"
      }}>
        <div style={{
          background: "rgba(255,255,255,0.1)", padding: "12px", borderRadius: "12px",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
        }}>
          <ShieldAlert size={28} />
        </div>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0 }}>Emergency Services</h1>
          <p style={{ opacity: 0.8, fontSize: "0.88rem", margin: "4px 0 0" }}>
            Submit your emergency request to dispatch a verified specialist.
          </p>
        </div>
        {/* Quick-dial numbers */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[["101", "Fire"], ["108", "Ambulance"], ["100", "Police"]].map(([num, lbl]) => (
            <a key={num} href={`tel:${num}`} style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              background: "rgba(255,255,255,0.08)", padding: "8px 14px",
              borderRadius: "8px", textDecoration: "none", color: "white", border: "1px solid rgba(255,255,255,0.1)"
            }}>
              <span style={{ fontSize: "0.65rem", opacity: 0.7 }}>{lbl}</span>
              <span style={{ fontWeight: 800, fontSize: "0.95rem" }}>{num}</span>
            </a>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "28px" }}>

        {/* ── Booking Form ───────────────────────────────────────── */}
        <div className="glass-card" style={{ padding: "28px", height: "fit-content" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Flame size={18} color="var(--accent)" /> Book Emergency Service
          </h2>

          <form onSubmit={handleSubmit}>
            {/* Category */}
            <div className="form-group">
              <label>Emergency Type</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {CATEGORIES.map((cat) => (
                  <button
                    type="button" key={cat.value}
                    onClick={() => handleCategoryChange(cat.value)}
                    style={{
                      padding: "10px 12px", borderRadius: "10px", cursor: "pointer", textAlign: "left",
                      border: category === cat.value ? "2px solid var(--primary)" : "2px solid transparent",
                      background: category === cat.value ? "rgba(99,102,241,0.1)" : "rgba(0,0,0,0.03)",
                      color: category === cat.value ? "var(--primary)" : "var(--text-main)",
                      fontWeight: category === cat.value ? 700 : 500, fontSize: "0.82rem", transition: "all 0.18s"
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{cat.label}</div>
                    <div style={{ fontSize: "0.7rem", opacity: 0.7, marginTop: "2px" }}>{cat.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Severity */}
            <div className="form-group">
              <label>Severity</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                {Object.entries(SEVERITY_CONFIG).map(([key, cfg]) => (
                  <button
                    type="button" key={key}
                    onClick={() => setSeverity(key)}
                    style={{
                      padding: "9px 6px", borderRadius: "10px", cursor: "pointer",
                      border: severity === key ? `2px solid ${cfg.color}` : "2px solid transparent",
                      background: severity === key ? cfg.bg : "rgba(0,0,0,0.03)",
                      color: severity === key ? cfg.color : "#6b7280",
                      fontWeight: severity === key ? 800 : 500, fontSize: "0.8rem", transition: "all 0.18s",
                      textAlign: "center"
                    }}
                  >
                    <div>{cfg.icon}</div>
                    <div style={{ marginTop: "3px" }}>{key}</div>
                    <div style={{ fontSize: "0.66rem", opacity: 0.8, marginTop: "1px" }}>~{cfg.eta}m</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Severity summary */}
            <div style={{
              background: sev.bg, border: `1px solid ${sev.border}`,
              borderRadius: "10px", padding: "10px 14px", marginBottom: "14px",
              fontSize: "0.8rem", color: sev.color, lineHeight: 1.5
            }}>
              {sev.fireEngine
                ? <><strong>Fire Engine will be dispatched</strong> · Call <strong>{sev.emergencyNumber}</strong> · ETA ~{sev.eta} min</>
                : sev.emergencyNumber
                  ? <>Helpline: <strong>{sev.emergencyNumber}</strong> · ETA ~{sev.eta} min</>
                  : <>ETA: ~{sev.eta} minutes</>
              }
            </div>

            <div className="form-group">
              <label>Describe the Emergency</label>
              <textarea
                placeholder="Briefly describe what's happening so the specialist arrives prepared..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ minHeight: "72px" }}
              />
            </div>

            <div className="form-group">
              <label>Contact Number</label>
              <input
                type="tel" placeholder="Your active phone number"
                value={contactNumber} onChange={(e) => setContactNumber(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: "22px" }}>
              <label>Address</label>
              <input
                type="text" placeholder="Full address with landmark..."
                value={address} onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="btn btn-danger"
              style={{ width: "100%", padding: "13px", fontSize: "0.95rem", fontWeight: 700 }}
              disabled={loading}
            >
              {loading
                ? <><Loader2 className="animate-spin" size={17} style={{ marginRight: 6 }} /> Dispatching...</>
                : <><PhoneCall size={17} style={{ marginRight: 6 }} /> Book Emergency Service</>
              }
            </button>
          </form>
        </div>

        {/* ── Active Bookings ────────────────────────────────────── */}
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: "18px" }}>
            Active Emergency Bookings
            {activeEmergencies.length > 0 && (
              <span style={{
                marginLeft: "8px", background: "var(--accent)", color: "white",
                borderRadius: "20px", padding: "2px 10px", fontSize: "0.8rem"
              }}>
                {activeEmergencies.length}
              </span>
            )}
          </h2>

          {activeEmergencies.length === 0 ? (
            <div className="glass-card" style={{ padding: "44px", textAlign: "center", color: "var(--text-muted)" }}>
              <ShieldAlert size={38} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <p style={{ fontWeight: 600, marginBottom: "4px" }}>No active emergency bookings</p>
              <p style={{ fontSize: "0.84rem" }}>Your bookings will appear here after submission.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {activeEmergencies.map((em) => {
                const cfg = SEVERITY_CONFIG[em.severity] || SEVERITY_CONFIG.Medium;
                return (
                  <div
                    key={em._id}
                    className="glass-card"
                    style={{ padding: "22px", border: `1px solid ${cfg.border}` }}
                  >
                    {/* Top row */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <span style={{ background: cfg.bg, color: cfg.color, padding: "4px 12px", borderRadius: "20px", fontSize: "0.78rem", fontWeight: 800 }}>
                          {em.severity}
                        </span>
                        <span style={{ background: "rgba(99,102,241,0.1)", color: "var(--primary)", padding: "4px 12px", borderRadius: "20px", fontSize: "0.78rem", fontWeight: 700 }}>
                          {em.category}
                        </span>
                      </div>
                      <span style={{ fontSize: "0.73rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                        <Clock size={11} /> {new Date(em.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {/* Status */}
                    <div style={{
                      background: "#f0fdf4", border: "1px solid #bbf7d0",
                      borderRadius: "10px", padding: "10px 14px", marginBottom: "14px",
                      display: "flex", alignItems: "center", gap: "10px"
                    }}>
                      <CheckCircle2 size={17} color="#16a34a" />
                      <div>
                        <div style={{ fontWeight: 700, color: "#15803d", fontSize: "0.88rem" }}>Booking Accepted — Specialist Dispatched</div>
                        {em.estimatedArrivalMinutes && (
                          <div style={{ fontSize: "0.75rem", color: "#16a34a", marginTop: "1px" }}>
                            Estimated arrival: ~{em.estimatedArrivalMinutes} minutes
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Fire engine info if applicable */}
                    {em.fireEngineNumber && (
                      <div style={{
                        background: "#f8fafc", border: "1px solid #e2e8f0",
                        borderRadius: "10px", padding: "10px 14px", marginBottom: "14px",
                        display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "0.82rem"
                      }}>
                        <span style={{ fontWeight: 700, color: "#334155" }}>
                          Fire Engine: <strong>{em.fireEngineNumber}</strong>
                        </span>
                        {em.emergencyServiceNumber && (
                          <a href={`tel:${em.emergencyServiceNumber}`} style={{ fontWeight: 700, color: "#0f172a", textDecoration: "none" }}>
                            Call: <strong>{em.emergencyServiceNumber}</strong>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Assigned professional */}
                    <div style={{ background: "var(--bg-main)", borderRadius: "10px", padding: "12px 14px", border: "1px solid var(--border)", marginBottom: "14px" }}>
                      {em.assignedProfessional ? (
                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                          <img
                            src={em.assignedProfessional.image ||
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(em.assignedProfessional.name)}&background=6366f1&color=fff`}
                            alt={em.assignedProfessional.name}
                            style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover" }}
                          />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{em.assignedProfessional.name}</div>
                            <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", display: "flex", gap: "8px", marginTop: "2px" }}>
                              <span>{em.assignedProfessional.experience} yrs exp</span>
                              <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                                <Star size={11} fill="#f59e0b" stroke="#f59e0b" /> {em.assignedProfessional.rating}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", color: "#d97706", fontSize: "0.84rem" }}>
                          <Loader2 size={15} className="animate-spin" />
                          <span style={{ fontWeight: 600 }}>Finding nearest specialist...</span>
                        </div>
                      )}
                    </div>

                    {/* Address & description */}
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "14px" }}>
                      <div style={{ display: "flex", gap: "5px", marginBottom: "4px" }}>
                        <MapPin size={12} style={{ marginTop: "2px", flexShrink: 0 }} />
                        <span>{em.address}</span>
                      </div>
                      <div style={{ fontStyle: "italic" }}>"{em.description}"</div>
                    </div>

                    {/* Cancel */}
                    <button
                      onClick={() => handleCancel(em._id)}
                      disabled={cancellingId === em._id}
                      style={{
                        padding: "7px 16px", borderRadius: "8px",
                        border: "1px solid #fca5a5", background: "transparent",
                        color: "#dc2626", fontWeight: 600, fontSize: "0.8rem",
                        cursor: "pointer", display: "flex", alignItems: "center", gap: "5px"
                      }}
                    >
                      <XCircle size={13} />
                      {cancellingId === em._id ? "Cancelling..." : "Cancel Booking"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%   { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255,255,255,0.4); }
          70%  { transform: scale(1);    box-shadow: 0 0 0 12px rgba(255,255,255,0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255,255,255,0); }
        }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
