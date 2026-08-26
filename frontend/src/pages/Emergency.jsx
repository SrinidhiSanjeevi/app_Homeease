import React, { useState } from "react";
import {
  ShieldAlert,
  PhoneCall,
  MapPin,
  Star,
  Flame,
  Loader2,
  AlertTriangle,
  Clock,
  XCircle,
  CheckCircle2
} from "lucide-react";

const CATEGORIES = [
  {
    value: "Electrical",
    label: "Electrical",
    sub: "Short Circuit, Sparking, Blackout",
    defaultSeverity: "High"
  },
  {
    value: "Plumbing",
    label: "Plumbing",
    sub: "Burst Pipe, Sewage, Faucet Flood",
    defaultSeverity: "Medium"
  },
  {
    value: "Security",
    label: "Security",
    sub: "Lockout, Smart Lock, Break-in",
    defaultSeverity: "High"
  },
  {
    value: "Fire",
    label: "Fire",
    sub: "Active Fire, Smoke, Gas Leak",
    defaultSeverity: "Critical"
  },
  {
    value: "Medical",
    label: "Medical",
    sub: "Injury, Unconscious, Cardiac Event",
    defaultSeverity: "Critical"
  }
];

const SEVERITY_CONFIG = {
  Low: {
    color: "#374151",
    bg: "#f3f4f6",
    border: "#e5e7eb",
    eta: 30,
    fireEngine: false,
    emergencyNumber: null
  },

  Medium: {
    color: "#d97706",
    bg: "#fef3c7",
    border: "#fde68a",
    eta: 20,
    fireEngine: false,
    emergencyNumber: "1800-SERV-HELP"
  },

  High: {
    color: "#dc2626",
    bg: "#fee2e2",
    border: "#fecaca",
    eta: 10,
    fireEngine: true,
    emergencyNumber: "101"
  },

  Critical: {
    color: "#991b1b",
    bg: "#fee2e2",
    border: "#fca5a5",
    eta: 5,
    fireEngine: true,
    emergencyNumber: "101"
  }
};

export default function Emergency({
  activeEmergencies = [],
  onDispatchEmergency,
  showToast,
  token
}) {
  const [category, setCategory] = useState("Electrical");
  const [severity, setSeverity] = useState("High");
  const [description, setDescription] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [address, setAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const handleCategoryChange = (value) => {
    setCategory(value);

    const selectedCategory = CATEGORIES.find(
      (item) => item.value === value
    );

    if (selectedCategory) {
      setSeverity(selectedCategory.defaultSeverity);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (
      !description.trim() ||
      !contactNumber.trim() ||
      !address.trim()
    ) {
      showToast("Please fill in all fields", "error");
      return;
    }

    setLoading(true);

    try {
      await onDispatchEmergency({
        category,
        severity,
        description: description.trim(),
        contactNumber: contactNumber.trim(),
        address: address.trim()
      });

      setDescription("");
      setContactNumber("");
      setAddress("");
    } catch (error) {
      console.error("Emergency dispatch error:", error);
      showToast(
        error?.message || "Failed to dispatch emergency service",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm("Cancel this emergency request?")) {
      return;
    }

    setCancellingId(id);

    try {
      const response = await fetch(
        `/api/emergency/${id}/cancel`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        showToast(
          "Emergency request cancelled",
          "success"
        );

        /*
         * Keep your existing application behaviour.
         * Reload guarantees that active emergency data is
         * fetched again from the backend.
         */
        window.location.reload();
      } else {
        showToast(
          data.message || "Failed to cancel emergency request",
          "error"
        );
      }
    } catch (error) {
      console.error("Emergency cancellation error:", error);

      showToast(
        "Server error while cancelling emergency request",
        "error"
      );
    } finally {
      setCancellingId(null);
    }
  };

  const selectedSeverity =
    SEVERITY_CONFIG[severity] ||
    SEVERITY_CONFIG.Medium;

  return (
    <div
      style={{
        animation: "fadeInUp 0.4s ease-out",
        padding: "40px 0"
      }}
    >

      {/* ============================================================
          HEADER
      ============================================================ */}

      <div
        style={{
          background: "#1e293b",
          color: "white",
          padding: "24px 28px",
          borderRadius: "16px",
          display: "flex",
          alignItems: "center",
          gap: "20px",
          marginBottom: "32px",
          border: "1px solid #334155",
          flexWrap: "wrap"
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.1)",
            padding: "12px",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}
        >
          <ShieldAlert size={28} />
        </div>

        <div
          style={{
            flex: 1,
            minWidth: "200px"
          }}
        >
          <h1
            style={{
              fontSize: "1.3rem",
              fontWeight: 700,
              margin: 0
            }}
          >
            Emergency Services
          </h1>

          <p
            style={{
              opacity: 0.8,
              fontSize: "0.88rem",
              margin: "4px 0 0"
            }}
          >
            Submit your emergency request to dispatch a verified
            specialist.
          </p>
        </div>

        {/* Emergency numbers */}

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap"
          }}
        >
          {[
            ["101", "Fire"],
            ["108", "Ambulance"],
            ["100", "Police"]
          ].map(([number, label]) => (
            <a
              key={number}
              href={`tel:${number}`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                background: "rgba(255,255,255,0.08)",
                padding: "8px 14px",
                borderRadius: "8px",
                textDecoration: "none",
                color: "white",
                border:
                  "1px solid rgba(255,255,255,0.1)"
              }}
            >
              <span
                style={{
                  fontSize: "0.65rem",
                  opacity: 0.7
                }}
              >
                {label}
              </span>

              <span
                style={{
                  fontWeight: 800,
                  fontSize: "0.95rem"
                }}
              >
                {number}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* ============================================================
          MAIN GRID
      ============================================================ */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(340px, 1fr))",
          gap: "28px"
        }}
      >

        {/* ==========================================================
            EMERGENCY FORM
        ========================================================== */}

        <div
          className="glass-card"
          style={{
            padding: "28px",
            height: "fit-content"
          }}
        >
          <h2
            style={{
              fontSize: "1.1rem",
              fontWeight: 800,
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <Flame
              size={18}
              color="var(--accent)"
            />

            Book Emergency Service
          </h2>

          <form onSubmit={handleSubmit}>

            {/* ======================================================
                CATEGORY
            ====================================================== */}

            <div className="form-group">
              <label>Emergency Type</label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px"
                }}
              >
                {CATEGORIES.map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    onClick={() =>
                      handleCategoryChange(item.value)
                    }
                    style={{
                      padding: "10px 12px",
                      borderRadius: "10px",
                      cursor: "pointer",
                      textAlign: "left",

                      border:
                        category === item.value
                          ? "2px solid var(--primary)"
                          : "2px solid transparent",

                      background:
                        category === item.value
                          ? "rgba(99,102,241,0.1)"
                          : "rgba(0,0,0,0.03)",

                      color:
                        category === item.value
                          ? "var(--primary)"
                          : "var(--text-main)",

                      fontWeight:
                        category === item.value
                          ? 700
                          : 500,

                      fontSize: "0.82rem",
                      transition: "all 0.18s"
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700
                      }}
                    >
                      {item.label}
                    </div>

                    <div
                      style={{
                        fontSize: "0.7rem",
                        opacity: 0.7,
                        marginTop: "2px"
                      }}
                    >
                      {item.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ======================================================
                SEVERITY
            ====================================================== */}

            <div className="form-group">
              <label>Severity</label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(4, 1fr)",
                  gap: "8px"
                }}
              >
                {Object.entries(
                  SEVERITY_CONFIG
                ).map(([key, config]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() =>
                      setSeverity(key)
                    }
                    style={{
                      padding: "9px 6px",
                      borderRadius: "10px",
                      cursor: "pointer",

                      border:
                        severity === key
                          ? `2px solid ${config.color}`
                          : "2px solid transparent",

                      background:
                        severity === key
                          ? config.bg
                          : "rgba(0,0,0,0.03)",

                      color:
                        severity === key
                          ? config.color
                          : "#6b7280",

                      fontWeight:
                        severity === key
                          ? 800
                          : 500,

                      fontSize: "0.8rem",
                      transition: "all 0.18s",
                      textAlign: "center"
                    }}
                  >
                    <div>{key}</div>

                    <div
                      style={{
                        fontSize: "0.66rem",
                        opacity: 0.8,
                        marginTop: "1px"
                      }}
                    >
                      ~{config.eta}m
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ======================================================
                SEVERITY SUMMARY
            ====================================================== */}

            <div
              style={{
                background: selectedSeverity.bg,
                border:
                  `1px solid ${selectedSeverity.border}`,
                borderRadius: "10px",
                padding: "10px 14px",
                marginBottom: "14px",
                fontSize: "0.8rem",
                color: selectedSeverity.color,
                lineHeight: 1.5
              }}
            >
              {selectedSeverity.fireEngine ? (
                <>
                  <strong>
                    Fire Engine will be dispatched
                  </strong>

                  {" · Call "}

                  <strong>
                    {selectedSeverity.emergencyNumber}
                  </strong>

                  {" · ETA ~"}

                  {selectedSeverity.eta}

                  {" min"}
                </>
              ) : selectedSeverity.emergencyNumber ? (
                <>
                  Helpline:{" "}
                  <strong>
                    {selectedSeverity.emergencyNumber}
                  </strong>

                  {" · ETA ~"}

                  {selectedSeverity.eta}

                  {" min"}
                </>
              ) : (
                <>
                  ETA: ~
                  {selectedSeverity.eta}
                  {" minutes"}
                </>
              )}
            </div>

            {/* ======================================================
                DESCRIPTION
            ====================================================== */}

            <div className="form-group">
              <label>
                Describe the Emergency
              </label>

              <textarea
                placeholder="Briefly describe what's happening so the specialist arrives prepared..."
                value={description}
                onChange={(event) =>
                  setDescription(
                    event.target.value
                  )
                }
                style={{
                  minHeight: "72px"
                }}
              />
            </div>

            {/* ======================================================
                CONTACT
            ====================================================== */}

            <div className="form-group">
              <label>
                Contact Number
              </label>

              <input
                type="tel"
                placeholder="Your active phone number"
                value={contactNumber}
                onChange={(event) =>
                  setContactNumber(
                    event.target.value
                  )
                }
              />
            </div>

            {/* ======================================================
                ADDRESS
            ====================================================== */}

            <div
              className="form-group"
              style={{
                marginBottom: "22px"
              }}
            >
              <label>Address</label>

              <input
                type="text"
                placeholder="Full address with landmark..."
                value={address}
                onChange={(event) =>
                  setAddress(
                    event.target.value
                  )
                }
              />
            </div>

            {/* ======================================================
                SUBMIT
            ====================================================== */}

            <button
              type="submit"
              className="btn btn-danger"
              style={{
                width: "100%",
                padding: "13px",
                fontSize: "0.95rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2
                    className="animate-spin"
                    size={17}
                    style={{
                      marginRight: 6
                    }}
                  />

                  Dispatching...
                </>
              ) : (
                <>
                  <PhoneCall
                    size={17}
                    style={{
                      marginRight: 6
                    }}
                  />

                  Book Emergency Service
                </>
              )}
            </button>
          </form>
        </div>

        {/* ==========================================================
            ACTIVE EMERGENCIES
        ========================================================== */}

        <div>
          <h2
            style={{
              fontSize: "1.1rem",
              fontWeight: 800,
              marginBottom: "18px"
            }}
          >
            Active Emergency Bookings

            {activeEmergencies.length > 0 && (
              <span
                style={{
                  marginLeft: "8px",
                  background: "var(--accent)",
                  color: "white",
                  borderRadius: "20px",
                  padding: "2px 10px",
                  fontSize: "0.8rem"
                }}
              >
                {activeEmergencies.length}
              </span>
            )}
          </h2>

          {/* ========================================================
              EMPTY STATE
          ======================================================== */}

          {activeEmergencies.length === 0 ? (
            <div
              className="glass-card"
              style={{
                padding: "44px",
                textAlign: "center",
                color: "var(--text-muted)"
              }}
            >
              <ShieldAlert
                size={38}
                style={{
                  margin: "0 auto 12px",
                  opacity: 0.3
                }}
              />

              <p
                style={{
                  fontWeight: 600,
                  marginBottom: "4px"
                }}
              >
                No active emergency bookings
              </p>

              <p
                style={{
                  fontSize: "0.84rem"
                }}
              >
                Your bookings will appear here
                after submission.
              </p>
            </div>
          ) : (

            /* ======================================================
               ACTIVE LIST
            ====================================================== */

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "18px"
              }}
            >
              {activeEmergencies.map((emergency) => {
                const config =
                  SEVERITY_CONFIG[
                    emergency.severity
                  ] ||
                  SEVERITY_CONFIG.Medium;

                return (
                  <div
                    key={emergency._id}
                    className="glass-card"
                    style={{
                      padding: "22px",
                      border:
                        `1px solid ${config.border}`
                    }}
                  >

                    {/* ==================================================
                        TOP ROW
                    ================================================== */}

                    <div
                      style={{
                        display: "flex",
                        justifyContent:
                          "space-between",
                        alignItems: "center",
                        marginBottom: "14px",
                        flexWrap: "wrap",
                        gap: "8px"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: "8px"
                        }}
                      >
                        <span
                          style={{
                            background: config.bg,
                            color: config.color,
                            padding: "4px 12px",
                            borderRadius: "20px",
                            fontSize: "0.78rem",
                            fontWeight: 800
                          }}
                        >
                          {emergency.severity}
                        </span>

                        <span
                          style={{
                            background:
                              "rgba(99,102,241,0.1)",
                            color:
                              "var(--primary)",
                            padding: "4px 12px",
                            borderRadius: "20px",
                            fontSize: "0.78rem",
                            fontWeight: 700
                          }}
                        >
                          {emergency.category}
                        </span>
                      </div>

                      <span
                        style={{
                          fontSize: "0.73rem",
                          color:
                            "var(--text-muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                      >
                        <Clock size={11} />

                        {new Date(
                          emergency.createdAt
                        ).toLocaleString()}
                      </span>
                    </div>

                    {/* ==================================================
                        STATUS
                    ================================================== */}

                    <div
                      style={{
                        background: "#f0fdf4",
                        border:
                          "1px solid #bbf7d0",
                        borderRadius: "10px",
                        padding: "10px 14px",
                        marginBottom: "14px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px"
                      }}
                    >
                      <CheckCircle2
                        size={17}
                        color="#16a34a"
                      />

                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            color: "#15803d",
                            fontSize: "0.88rem"
                          }}
                        >
                          {emergency.assignedProfessional
                            ? "Booking Accepted — Specialist Dispatched"
                            : "Emergency Request Received"}
                        </div>

                        {emergency.assignedProfessional ? (
                          emergency.estimatedArrivalMinutes && (
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "#16a34a",
                                marginTop: "1px"
                              }}
                            >
                              Estimated arrival:
                              {" ~"}
                              {
                                emergency.estimatedArrivalMinutes
                              }
                              {" minutes"}
                            </div>
                          )
                        ) : (
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "#b45309",
                              marginTop: "3px"
                            }}
                          >
                            No specialist is currently
                            assigned to this request.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ==================================================
                        NO PROFESSIONAL AVAILABLE
                    ================================================== */}

                    {!emergency.assignedProfessional && (
                      <div
                        style={{
                          background: "#fff7ed",
                          border:
                            "1px solid #fed7aa",
                          borderRadius: "10px",
                          padding: "10px 14px",
                          marginBottom: "14px",
                          display: "flex",
                          gap: "8px",
                          alignItems: "flex-start",
                          color: "#9a3412",
                          fontSize: "0.82rem"
                        }}
                      >
                        <AlertTriangle
                          size={16}
                          style={{
                            flexShrink: 0,
                            marginTop: "1px"
                          }}
                        />

                        <div>
                          <strong>
                            No specialist available
                          </strong>

                          <div
                            style={{
                              marginTop: "2px"
                            }}
                          >
                            There is currently no available
                            specialist for{" "}
                            <strong>
                              {emergency.category}
                            </strong>
                            . Please try again later or
                            contact the appropriate emergency
                            service if this is urgent.
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ==================================================
                        FIRE ENGINE
                    ================================================== */}

                    {emergency.fireEngineNumber && (
                      <div
                        style={{
                          background: "#f8fafc",
                          border:
                            "1px solid #e2e8f0",
                          borderRadius: "10px",
                          padding: "10px 14px",
                          marginBottom: "14px",
                          display: "flex",
                          gap: "16px",
                          flexWrap: "wrap",
                          fontSize: "0.82rem"
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 700,
                            color: "#334155"
                          }}
                        >
                          Fire Engine:{" "}
                          <strong>
                            {
                              emergency.fireEngineNumber
                            }
                          </strong>
                        </span>

                        {emergency.emergencyServiceNumber && (
                          <a
                            href={`tel:${emergency.emergencyServiceNumber}`}
                            style={{
                              fontWeight: 700,
                              color: "#0f172a",
                              textDecoration: "none"
                            }}
                          >
                            Call:{" "}
                            <strong>
                              {
                                emergency.emergencyServiceNumber
                              }
                            </strong>
                          </a>
                        )}
                      </div>
                    )}

                    {/* ==================================================
                        ASSIGNED PROFESSIONAL
                    ================================================== */}

                    <div
                      style={{
                        background:
                          "var(--bg-main)",
                        border:
                          "1px solid var(--border)",
                        borderRadius: "10px",
                        padding: "12px 14px",
                        marginBottom: "14px"
                      }}
                    >
                      {emergency.assignedProfessional ? (
                        <div
                          style={{
                            display: "flex",
                            gap: "12px",
                            alignItems: "center"
                          }}
                        >
                          <img
                            src={
                              emergency
                                .assignedProfessional
                                .image ||
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                emergency
                                  .assignedProfessional
                                  .name
                              )}&background=6366f1&color=fff`
                            }
                            alt={
                              emergency
                                .assignedProfessional
                                .name
                            }
                            style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "50%",
                              objectFit: "cover"
                            }}
                          />

                          <div>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: "0.9rem"
                              }}
                            >
                              {
                                emergency
                                  .assignedProfessional
                                  .name
                              }
                            </div>

                            <div
                              style={{
                                fontSize: "0.73rem",
                                color:
                                  "var(--text-muted)",
                                display: "flex",
                                gap: "8px",
                                marginTop: "2px"
                              }}
                            >
                              <span>
                                {
                                  emergency
                                    .assignedProfessional
                                    .experience
                                }{" "}
                                yrs exp
                              </span>

                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "2px"
                                }}
                              >
                                <Star
                                  size={11}
                                  fill="#f59e0b"
                                  stroke="#f59e0b"
                                />

                                {
                                  emergency
                                    .assignedProfessional
                                    .rating
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                            color: "#b91c1c",
                            fontSize: "0.84rem"
                          }}
                        >
                          <AlertTriangle
                            size={15}
                          />

                          <span
                            style={{
                              fontWeight: 600
                            }}
                          >
                            Specialist assignment
                            is currently unavailable.
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ==================================================
                        ADDRESS + DESCRIPTION
                    ================================================== */}

                    <div
                      style={{
                        fontSize: "0.8rem",
                        color:
                          "var(--text-muted)",
                        marginBottom: "14px"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: "5px",
                          marginBottom: "4px"
                        }}
                      >
                        <MapPin
                          size={12}
                          style={{
                            marginTop: "2px",
                            flexShrink: 0
                          }}
                        />

                        <span>
                          {emergency.address}
                        </span>
                      </div>

                      <div
                        style={{
                          fontStyle: "italic"
                        }}
                      >
                        "{emergency.description}"
                      </div>
                    </div>

                    {/* ==================================================
                        CANCEL
                    ================================================== */}

                    <button
                      onClick={() =>
                        handleCancel(
                          emergency._id
                        )
                      }
                      disabled={
                        cancellingId ===
                        emergency._id
                      }
                      style={{
                        padding: "7px 16px",
                        borderRadius: "8px",
                        border:
                          "1px solid #fca5a5",
                        background:
                          "transparent",
                        color: "#dc2626",
                        fontWeight: 600,
                        fontSize: "0.8rem",
                        cursor:
                          cancellingId ===
                          emergency._id
                            ? "not-allowed"
                            : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        opacity:
                          cancellingId ===
                          emergency._id
                            ? 0.6
                            : 1
                      }}
                    >
                      <XCircle size={13} />

                      {cancellingId ===
                      emergency._id
                        ? "Cancelling..."
                        : "Cancel Booking"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ============================================================
          ANIMATIONS
      ============================================================ */}

      <style>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}