import React, { useEffect, useRef, useState } from "react";
import Icon, { Star, Loader2, AlertTriangle, XCircle, Check, MapPin } from "../components/Icon";
import LocationCapture from "../components/LocationCapture";

// ------------------------------------------------------------------
// Static config
// ------------------------------------------------------------------

// Each emergency type knows its own colour, the public service that
// should be involved (if any), quick description chips and what the
// customer should do while the specialist is on the way.
const CATEGORIES = [
  {
    value: "Electrical",
    icon: "bolt",
    tint: "#d97706",
    sub: "Short circuit, sparking, blackout",
    defaultSeverity: "High",
    publicService: { name: "Fire", number: "101", when: ["Critical"], note: "if there is smoke or fire" },
    chips: ["Sparks from socket", "Burning smell", "Full blackout", "Tripped breaker won't reset", "Exposed wires"],
    tips: [
      "Switch off the main breaker if you can reach it safely.",
      "Never touch wires or appliances with wet hands.",
      "Keep everyone away from sparking outlets.",
      "Use a CO₂ or dry-powder extinguisher, never water."
    ]
  },
  {
    value: "Plumbing",
    icon: "water_drop",
    tint: "#0284c7",
    sub: "Burst pipe, sewage, flooding",
    defaultSeverity: "Medium",
    publicService: null,
    chips: ["Burst pipe", "Water leaking into wiring", "Sewage backflow", "Tap won't shut", "Ceiling leak"],
    tips: [
      "Close the main water valve, usually near the meter.",
      "Turn off power to any room where water is near sockets.",
      "Move valuables and electronics off the floor.",
      "Take photos of the damage for insurance."
    ]
  },
  {
    value: "Security",
    icon: "lock",
    tint: "#4f46e5",
    sub: "Lockout, smart lock, break-in",
    defaultSeverity: "High",
    publicService: { name: "Police", number: "100", when: ["High", "Critical"], note: "for a break-in or intruder" },
    chips: ["Locked out", "Smart lock failure", "Door forced open", "Broken window", "Lost keys"],
    tips: [
      "If an intruder may still be inside, leave and call 100.",
      "Don't touch forced locks or doors, they are evidence.",
      "Wait somewhere well lit near your home.",
      "Keep your ID ready to prove you live there."
    ]
  },
  {
    value: "Fire",
    icon: "local_fire_department",
    tint: "#dc2626",
    sub: "Active fire, smoke, gas leak",
    defaultSeverity: "Critical",
    publicService: { name: "Fire", number: "101", when: ["Low", "Medium", "High", "Critical"], note: "fire brigade" },
    chips: ["Kitchen fire", "Heavy smoke", "Gas smell", "Electrical fire", "People trapped"],
    tips: [
      "Get everyone out first. Don't stop for belongings.",
      "If you smell gas, don't switch on lights or strike a flame.",
      "Stay low under smoke and close doors behind you.",
      "Don't go back inside for any reason."
    ]
  },
  {
    value: "Medical",
    icon: "medical_services",
    tint: "#db2777",
    sub: "Injury, unconscious, cardiac",
    defaultSeverity: "Critical",
    publicService: { name: "Ambulance", number: "108", when: ["Low", "Medium", "High", "Critical"], note: "ambulance" },
    chips: ["Unconscious", "Chest pain", "Heavy bleeding", "Fall injury", "Breathing difficulty"],
    tips: [
      "Call 108 immediately for life-threatening situations.",
      "Don't move someone with a suspected neck or back injury.",
      "Press firmly on bleeding with a clean cloth.",
      "Unlock the door and switch on outside lights for responders."
    ]
  }
];

const SEVERITIES = [
  { key: "Low", eta: 30, color: "#16a34a", hint: "Can wait a little" },
  { key: "Medium", eta: 20, color: "#d97706", hint: "Needs attention soon" },
  { key: "High", eta: 10, color: "#ea580c", hint: "Risk to property" },
  { key: "Critical", eta: 5, color: "#dc2626", hint: "Risk to life" }
];

const STEPS = ["Dispatched", "En route", "Arrived", "Resolved"];

const HOLD_MS = 1200;
const REMEMBER_KEY = "homeease.emergency.contact";

const getStep = (status) => {
  if (status === "Resolved") return 4;
  if (status === "Arrived") return 3;
  if (status === "OnTheWay") return 2;
  return 1;
};

const readRemembered = () => {
  try {
    return JSON.parse(localStorage.getItem(REMEMBER_KEY)) || {};
  } catch {
    return {};
  }
};

const formatClock = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function Emergency({
  activeEmergencies = [],
  onDispatchEmergency,
  showToast,
  token
}) {
  const remembered = useRef(readRemembered()).current;

  const [category, setCategory] = useState("Electrical");
  const [severity, setSeverity] = useState("High");
  const [description, setDescription] = useState("");
  const [contactNumber, setContactNumber] = useState(remembered.contactNumber || "");
  const [address, setAddress] = useState(remembered.address || "");
  const [location, setLocation] = useState(null);

  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const cat = CATEGORIES.find((c) => c.value === category) || CATEGORIES[0];
  const sev = SEVERITIES.find((s) => s.key === severity) || SEVERITIES[1];
  const callPublic = cat.publicService && cat.publicService.when.includes(severity);
  const isReady = description.trim() && contactNumber.trim() && address.trim();

  // Live clock for ETA countdowns, only while something is active.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (activeEmergencies.length === 0) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeEmergencies.length]);

  const pickCategory = (item) => {
    setCategory(item.value);
    setSeverity(item.defaultSeverity);
  };

  const toggleChip = (chip) => {
    setDescription((prev) => {
      if (prev.includes(chip)) {
        return prev.replace(chip, "").replace(/(,\s*){2,}/g, ", ").replace(/^,\s*|,\s*$/g, "").trim();
      }
      return prev.trim() ? `${prev.trim()}, ${chip}` : chip;
    });
  };

  const submit = async () => {
    if (loading) return;
    if (!isReady) {
      showToast("Please describe the emergency and add your phone number and address", "error");
      return;
    }

    setLoading(true);
    try {
      try {
        localStorage.setItem(
          REMEMBER_KEY,
          JSON.stringify({ contactNumber: contactNumber.trim(), address: address.trim() })
        );
      } catch {
        /* storage unavailable — not critical */
      }

      await onDispatchEmergency({
        category,
        severity,
        description: description.trim(),
        contactNumber: contactNumber.trim(),
        address: address.trim(),
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        accuracy: location?.accuracy ?? null
      });

      setDescription("");
      setLocation(null);
    } catch (error) {
      showToast(error?.message || "Failed to dispatch emergency service", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm("Cancel this emergency request?")) return;

    setCancellingId(id);
    try {
      const response = await fetch(`/api/emergency/${id}/cancel`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();

      if (response.ok && data.success) {
        showToast("Emergency request cancelled", "success");
        // Reload so active emergency data is fetched again from the backend.
        window.location.reload();
      } else {
        showToast(data.message || "Failed to cancel emergency request", "error");
      }
    } catch (error) {
      console.error("Emergency cancellation error:", error);
      showToast("Server error while cancelling emergency request", "error");
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="em-page" style={{ "--cat": cat.tint, "--sev": sev.color }}>
      {/* ============================ HERO ============================ */}
      <header className="em-hero">
        <div className="em-hero-text">
          <span className="em-live">
            <span className="em-live-dot" /> 24×7 dispatch is live
          </span>
          <h1>Emergency help</h1>
          <p>Tell us what&apos;s wrong in three quick steps. We send the nearest verified specialist and tell you exactly what to do until they arrive.</p>
        </div>

        <div className="em-dial">
          <span className="em-dial-label">Life in danger? Call directly</span>
          <div className="em-dial-row">
            {[
              ["101", "Fire", "local_fire_department"],
              ["108", "Ambulance", "ambulance"],
              ["100", "Police", "local_police"]
            ].map(([number, label, icon]) => (
              <a key={number} href={`tel:${number}`} className="em-dial-btn">
                <Icon name={icon} size={20} />
                <span className="em-dial-num">{number}</span>
                <span className="em-dial-name">{label}</span>
              </a>
            ))}
          </div>
        </div>
      </header>

      <div className="em-grid">
        {/* ============================ FORM ============================ */}
        <section className="em-card em-form">
          {/* Step 1 */}
          <div className="em-step">
            <div className="em-step-head">
              <span className="em-step-num">1</span>
              <h2>What&apos;s happening?</h2>
            </div>

            <div className="em-cats" role="radiogroup" aria-label="Emergency type">
              {CATEGORIES.map((item) => {
                const active = item.value === category;
                return (
                  <button
                    type="button"
                    key={item.value}
                    role="radio"
                    aria-checked={active}
                    className={`em-cat${active ? " is-active" : ""}`}
                    style={{ "--t": item.tint }}
                    onClick={() => pickCategory(item)}
                  >
                    <span className="em-cat-icon">
                      <Icon name={item.icon} size={22} filled={active} />
                    </span>
                    <span className="em-cat-name">{item.value}</span>
                    <span className="em-cat-sub">{item.sub}</span>
                  </button>
                );
              })}
            </div>

            <div className="em-chips">
              {cat.chips.map((chip) => (
                <button
                  type="button"
                  key={chip}
                  className={`em-chip${description.includes(chip) ? " is-on" : ""}`}
                  onClick={() => toggleChip(chip)}
                >
                  {description.includes(chip) ? <Check size={14} /> : <Icon name="add" size={14} />}
                  {chip}
                </button>
              ))}
            </div>

            <textarea
              className="em-textarea"
              placeholder="Tap the chips above or describe it in your own words…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Step 2 */}
          <div className="em-step">
            <div className="em-step-head">
              <span className="em-step-num">2</span>
              <h2>How serious is it?</h2>
            </div>

            <div className="em-meter" role="radiogroup" aria-label="Severity">
              {SEVERITIES.map((item, index) => {
                const filled = SEVERITIES.findIndex((s) => s.key === severity) >= index;
                return (
                  <button
                    type="button"
                    key={item.key}
                    role="radio"
                    aria-checked={severity === item.key}
                    className={`em-meter-seg${filled ? " is-filled" : ""}${severity === item.key ? " is-current" : ""}`}
                    onClick={() => setSeverity(item.key)}
                  >
                    <span className="em-meter-bar" />
                    <span className="em-meter-label">{item.key}</span>
                    <span className="em-meter-hint">{item.hint}</span>
                  </button>
                );
              })}
            </div>

            {/* Live dispatch preview */}
            <div className="em-preview">
              <div className="em-preview-item">
                <Icon name="engineering" size={20} />
                <div>
                  <strong>{cat.value} specialist</strong>
                  <span>Nearest verified pro · ETA ~{sev.eta} min</span>
                </div>
              </div>
              {cat.publicService && (
                <a
                  href={`tel:${cat.publicService.number}`}
                  className={`em-preview-item em-preview-public${callPublic ? " is-urgent" : ""}`}
                >
                  <Icon name="call" size={20} />
                  <div>
                    <strong>
                      {callPublic ? "Also call" : "Call"} {cat.publicService.number} ({cat.publicService.name})
                    </strong>
                    <span>{callPublic ? "Recommended at this severity" : `Only ${cat.publicService.note}`}</span>
                  </div>
                </a>
              )}
            </div>
          </div>

          {/* Step 3 */}
          <div className="em-step">
            <div className="em-step-head">
              <span className="em-step-num">3</span>
              <h2>Where should we come?</h2>
              {remembered.address && <span className="em-remembered">Filled in from your last request</span>}
            </div>

            <div className="em-fields">
              <label className="em-field">
                <Icon name="call" size={18} />
                <input
                  type="tel"
                  placeholder="Phone number the specialist can reach"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                />
              </label>
              <label className="em-field">
                <Icon name="home_pin" size={18} />
                <input
                  type="text"
                  placeholder="Full address with a landmark"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
            </div>

            <LocationCapture onLocationCaptured={setLocation} />
          </div>

          <HoldToSend loading={loading} ready={Boolean(isReady)} onConfirm={submit} onBlocked={submit} />
        </section>

        {/* ========================= RIGHT COLUMN ========================= */}
        <aside className="em-side">
          {activeEmergencies.length > 0 && (
            <div className="em-side-block">
              <h2 className="em-side-title">
                Live requests <span className="em-count">{activeEmergencies.length}</span>
              </h2>
              {activeEmergencies.map((emergency) => (
                <LiveCard
                  key={emergency._id}
                  emergency={emergency}
                  now={now}
                  cancelling={cancellingId === emergency._id}
                  onCancel={() => handleCancel(emergency._id)}
                />
              ))}
            </div>
          )}

          <div className="em-card em-guide">
            <div className="em-guide-head">
              <span className="em-guide-icon">
                <Icon name={cat.icon} size={22} filled />
              </span>
              <div>
                <span className="em-guide-kicker">While you wait</span>
                <h3>{cat.value} safety guide</h3>
              </div>
            </div>
            <ol className="em-tips">
              {cat.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ol>
          </div>

          {activeEmergencies.length === 0 && (
            <div className="em-card em-empty">
              <Icon name="radar" size={30} />
              <div>
                <strong>No live requests</strong>
                <span>Once you send a request, you can track the specialist here with a live arrival countdown.</span>
              </div>
            </div>
          )}
        </aside>
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

// ------------------------------------------------------------------
// Hold-to-send SOS button: prevents accidental dispatches while still
// being a single gesture. Works with mouse, touch and keyboard.
// ------------------------------------------------------------------

function HoldToSend({ loading, ready, onConfirm, onBlocked }) {
  const [progress, setProgress] = useState(0);
  const frame = useRef(null);
  const start = useRef(0);

  const stop = () => {
    cancelAnimationFrame(frame.current);
    frame.current = null;
    setProgress(0);
  };

  const begin = () => {
    if (loading || frame.current) return;
    if (!ready) {
      onBlocked();
      return;
    }
    start.current = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        frame.current = null;
        setProgress(0);
        if (navigator.vibrate) navigator.vibrate(80);
        onConfirm();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onKeyDown = (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      begin();
    }
  };
  const onKeyUp = (e) => {
    if (e.key === " " || e.key === "Enter") stop();
  };

  return (
    <button
      type="button"
      className={`em-sos${progress > 0 ? " is-holding" : ""}${ready ? "" : " is-idle"}`}
      disabled={loading}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Press and hold to send emergency request"
    >
      <span className="em-sos-fill" style={{ transform: `scaleX(${progress})` }} />
      <span className="em-sos-content">
        {loading ? (
          <>
            <Loader2 size={20} /> Dispatching your specialist…
          </>
        ) : (
          <>
            <Icon name="sos" size={24} weight={600} />
            {progress > 0 ? "Keep holding…" : "Press & hold to send help"}
          </>
        )}
      </span>
    </button>
  );
}

// ------------------------------------------------------------------
// Live request card with arrival countdown ring
// ------------------------------------------------------------------

function LiveCard({ emergency, now, cancelling, onCancel }) {
  const cat = CATEGORIES.find((c) => c.value === emergency.category) || CATEGORIES[0];
  const sev = SEVERITIES.find((s) => s.key === emergency.severity) || SEVERITIES[1];
  const step = getStep(emergency.status);
  const pro = emergency.assignedProfessional;
  const isArrived = emergency.status === "Arrived";
  const isResolved = emergency.status === "Resolved";

  const etaMin = emergency.estimatedArrivalMinutes || sev.eta;
  const etaMs = etaMin * 60 * 1000;
  const elapsed = now - new Date(emergency.createdAt).getTime();
  const remaining = etaMs - elapsed;
  const ratio = Math.min(1, Math.max(0, elapsed / etaMs));

  const R = 34;
  const C = 2 * Math.PI * R;

  let ringLabel = formatClock(remaining);
  let ringSub = "ETA";
  if (isResolved) {
    ringLabel = "Done";
    ringSub = "";
  } else if (isArrived) {
    ringLabel = "Here";
    ringSub = "on site";
  } else if (!pro) {
    ringLabel = "…";
    ringSub = "matching";
  } else if (remaining <= 0) {
    ringLabel = "Any min";
    ringSub = "arriving";
  }

  const headline = isResolved
    ? "Emergency resolved"
    : isArrived
      ? "Your specialist is on site"
      : emergency.status === "OnTheWay"
        ? "Your specialist is on the way"
        : pro
          ? "Specialist assigned and dispatched"
          : "Finding the nearest specialist…";

  return (
    <article className="em-live-card" style={{ "--t": cat.tint, "--s": sev.color }}>
      <div className="em-live-top">
        <svg className="em-ring" viewBox="0 0 80 80" aria-hidden="true">
          <circle cx="40" cy="40" r={R} className="em-ring-track" />
          <circle
            cx="40"
            cy="40"
            r={R}
            className="em-ring-bar"
            strokeDasharray={C}
            strokeDashoffset={isArrived || isResolved ? 0 : C * (1 - ratio)}
          />
          <text x="40" y={ringSub ? 40 : 45} className="em-ring-main">{ringLabel}</text>
          {ringSub && <text x="40" y="54" className="em-ring-sub">{ringSub}</text>}
        </svg>

        <div className="em-live-info">
          <div className="em-tags">
            <span className="em-tag em-tag-cat">
              <Icon name={cat.icon} size={14} filled /> {emergency.category}
            </span>
            <span className="em-tag em-tag-sev">{emergency.severity}</span>
          </div>
          <strong className="em-live-headline">{headline}</strong>
          <span className="em-live-time">
            Requested {new Date(emergency.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>

      <ol className="em-rail">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`${step > i ? "is-done" : ""}${step === i + 1 ? " is-current" : ""}`}
          >
            <span className="em-rail-dot">{step > i ? <Check size={12} strokeWidth={3} /> : null}</span>
            <span className="em-rail-label">{label}</span>
          </li>
        ))}
      </ol>

      {pro ? (
        <div className="em-pro">
          <img
            src={
              pro.imageUrl ||
              pro.image ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(pro.name)}&background=0e5e4f&color=fff`
            }
            alt={pro.imageAlt || pro.name}
          />
          <div>
            <strong>{pro.name}</strong>
            <span>
              {pro.experience} yrs exp · <Star size={12} fill="#f59e0b" stroke="#f59e0b" /> {pro.rating}
            </span>
          </div>
        </div>
      ) : (
        <div className="em-warn">
          <AlertTriangle size={16} />
          <span>
            No {emergency.category.toLowerCase()} specialist is free right now. We&apos;ll keep trying. If it&apos;s urgent, call the number above.
          </span>
        </div>
      )}

      {emergency.fireEngineNumber && (
        <div className="em-unit">
          <Icon name="fire_truck" size={16} />
          Emergency unit <strong>{emergency.fireEngineNumber}</strong>
          {emergency.emergencyServiceNumber && (
            <a href={`tel:${emergency.emergencyServiceNumber}`}>Call {emergency.emergencyServiceNumber}</a>
          )}
        </div>
      )}

      <div className="em-live-foot">
        <span className="em-live-addr">
          <MapPin size={14} /> {emergency.address}
        </span>
        <button type="button" className="em-cancel" onClick={onCancel} disabled={cancelling}>
          <XCircle size={14} /> {cancelling ? "Cancelling…" : "Cancel"}
        </button>
      </div>
    </article>
  );
}

// ------------------------------------------------------------------
// Styles (scoped with the em- prefix)
// ------------------------------------------------------------------

const STYLES = `
.em-page { padding: 32px 0 48px; animation: emIn .4s ease-out; }
@keyframes emIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

/* Hero */
.em-hero {
  position: relative; overflow: hidden;
  display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-end; justify-content: space-between;
  padding: 28px 32px; margin-bottom: 28px; border-radius: var(--radius-xl);
  background:
    radial-gradient(600px 240px at 0% 0%, rgba(214,51,74,.35), transparent 70%),
    linear-gradient(135deg, #1b1f24, #2a1418);
  color: #fff;
}
.em-hero-text { max-width: 560px; }
.em-hero h1 { font-size: clamp(1.6rem, 3vw, 2.1rem); font-weight: 800; margin: 10px 0 6px; letter-spacing: -.02em; }
.em-hero p { margin: 0; opacity: .78; font-size: .95rem; line-height: 1.55; }
.em-live { display: inline-flex; align-items: center; gap: 8px; font-size: .75rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: .08em; color: #fecdd3; }
.em-live-dot { width: 8px; height: 8px; border-radius: 50%; background: #f43f5e; box-shadow: 0 0 0 0 rgba(244,63,94,.7); animation: emPulse 1.6s infinite; }
@keyframes emPulse { 70% { box-shadow: 0 0 0 10px rgba(244,63,94,0); } 100% { box-shadow: 0 0 0 0 rgba(244,63,94,0); } }
.em-dial-label { display: block; font-size: .72rem; opacity: .7; margin-bottom: 8px; font-weight: 600; }
.em-dial-row { display: flex; gap: 8px; flex-wrap: wrap; }
.em-dial-btn { display: grid; grid-template-columns: auto auto; column-gap: 8px; align-items: center;
  padding: 10px 14px; border-radius: 14px; color: #fff; text-decoration: none;
  background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); transition: var(--transition); }
.em-dial-btn:hover { background: rgba(255,255,255,.16); transform: translateY(-1px); }
.em-dial-btn .material-symbols-rounded { grid-row: span 2; color: #fda4af; }
.em-dial-num { font-weight: 800; font-size: 1.05rem; line-height: 1.1; }
.em-dial-name { font-size: .68rem; opacity: .7; }

/* Layout */
.em-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 28px; align-items: start; }
@media (max-width: 960px) { .em-grid { grid-template-columns: 1fr; } }
.em-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); }

/* Form */
.em-form { padding: 8px 28px 28px; }
@media (max-width: 560px) { .em-form { padding: 4px 18px 20px; } .em-hero { padding: 22px 20px; } }
.em-step { padding: 22px 0; border-bottom: 1px dashed var(--border); }
.em-step:last-of-type { border-bottom: 0; }
.em-step-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.em-step-head h2 { font-size: 1.05rem; font-weight: 800; margin: 0; }
.em-step-num { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
  font-size: .8rem; font-weight: 800; color: #fff; background: var(--text-main); }
.em-remembered { margin-left: auto; font-size: .72rem; color: var(--text-muted); background: var(--bg-subtle); padding: 3px 10px; border-radius: 20px; }

.em-cats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 640px) { .em-cats { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); } }
.em-cat { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left;
  padding: 12px; border-radius: 14px; cursor: pointer; background: var(--bg-subtle);
  border: 2px solid transparent; color: var(--text-main); transition: var(--transition); }
.em-cat:hover { border-color: color-mix(in srgb, var(--t) 35%, transparent); }
.em-cat-icon { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center;
  color: var(--t); background: color-mix(in srgb, var(--t) 12%, white); margin-bottom: 4px; transition: var(--transition); }
.em-cat-name { font-weight: 800; font-size: .88rem; }
.em-cat-sub { font-size: .7rem; color: var(--text-muted); line-height: 1.3; }
.em-cat.is-active { border-color: var(--t); background: color-mix(in srgb, var(--t) 7%, white); }
.em-cat.is-active .em-cat-icon { background: var(--t); color: #fff; }

.em-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 10px; }
.em-chip { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 20px;
  font-size: .78rem; font-weight: 600; cursor: pointer; background: #fff; color: var(--text-body);
  border: 1px solid var(--border-strong); transition: var(--transition-fast); }
.em-chip:hover { border-color: var(--cat); color: var(--cat); }
.em-chip.is-on { background: var(--cat); border-color: var(--cat); color: #fff; }
.em-textarea { min-height: 76px; resize: vertical; }

.em-meter { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.em-meter-seg { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; text-align: left;
  padding: 0 2px 4px; background: none; border: 0; cursor: pointer; color: var(--text-muted); }
.em-meter-bar { width: 100%; height: 10px; border-radius: 6px; background: var(--bg-subtle); transition: var(--transition); }
.em-meter-seg.is-filled .em-meter-bar { background: var(--sev); }
.em-meter-seg.is-current .em-meter-bar { box-shadow: 0 0 0 3px color-mix(in srgb, var(--sev) 25%, transparent); }
.em-meter-label { font-weight: 800; font-size: .85rem; }
.em-meter-seg.is-current .em-meter-label { color: var(--sev); }
.em-meter-hint { font-size: .7rem; line-height: 1.25; }

.em-preview { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; margin-top: 16px; }
.em-preview-item { display: flex; gap: 10px; align-items: center; padding: 12px 14px; border-radius: 12px;
  background: var(--bg-subtle); color: var(--text-main); text-decoration: none; }
.em-preview-item > .material-symbols-rounded { color: var(--cat); }
.em-preview-item strong { display: block; font-size: .85rem; }
.em-preview-item span { display: block; font-size: .74rem; color: var(--text-muted); }
.em-preview-public.is-urgent { background: #fef2f2; outline: 1px solid #fecaca; }
.em-preview-public.is-urgent > .material-symbols-rounded, .em-preview-public.is-urgent strong { color: #b91c1c; }

.em-fields { display: grid; gap: 10px; margin-bottom: 12px; }
.em-field { position: relative; display: block; margin: 0; }
.em-field > .material-symbols-rounded { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.em-field input { padding-left: 42px; }

/* SOS hold button */
.em-sos { position: relative; overflow: hidden; width: 100%; min-height: 60px; margin-top: 8px;
  border: 0; border-radius: 16px; cursor: pointer; color: #fff; font-weight: 800; font-size: 1rem;
  background: var(--accent); box-shadow: 0 10px 24px -10px rgba(214,51,74,.7);
  user-select: none; -webkit-user-select: none; touch-action: none; transition: transform .12s ease; }
.em-sos.is-idle { background: #e8909c; box-shadow: none; }
.em-sos.is-holding { transform: scale(.985); }
.em-sos:disabled { opacity: .85; cursor: progress; }
.em-sos:focus-visible { outline: 3px solid var(--ring); outline-offset: 3px; }
.em-sos-fill { position: absolute; inset: 0; background: #9f1239; transform-origin: left; transform: scaleX(0); }
.em-sos-content { position: relative; display: flex; align-items: center; justify-content: center; gap: 10px; }

/* Right column */
.em-side { display: flex; flex-direction: column; gap: 18px; }
.em-side-block { display: flex; flex-direction: column; gap: 14px; }
.em-side-title { font-size: 1.05rem; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 8px; }
.em-count { background: var(--accent); color: #fff; border-radius: 20px; padding: 1px 9px; font-size: .75rem; }

.em-guide { padding: 20px 22px; border-top: 4px solid var(--cat); }
.em-guide-head { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
.em-guide-icon { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; color: #fff; background: var(--cat); }
.em-guide-kicker { font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); }
.em-guide h3 { margin: 0; font-size: 1.02rem; font-weight: 800; }
.em-tips { list-style: none; counter-reset: tip; margin: 0; padding: 0; display: grid; gap: 10px; }
.em-tips li { counter-increment: tip; display: flex; gap: 10px; font-size: .86rem; line-height: 1.45; color: var(--text-body); }
.em-tips li::before { content: counter(tip); flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
  display: grid; place-items: center; font-size: .72rem; font-weight: 800;
  color: var(--cat); background: color-mix(in srgb, var(--cat) 12%, white); }

.em-empty { display: flex; gap: 14px; align-items: center; padding: 18px 20px; color: var(--text-muted); }
.em-empty strong { display: block; color: var(--text-main); font-size: .9rem; }
.em-empty span { font-size: .8rem; }

/* Live card */
.em-live-card { background: var(--bg-card); border: 1px solid var(--border); border-left: 4px solid var(--s);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-md); padding: 18px; display: grid; gap: 14px; }
.em-live-top { display: flex; gap: 14px; align-items: center; }
.em-ring { width: 84px; height: 84px; flex-shrink: 0; }
.em-ring-track { fill: none; stroke: var(--bg-subtle); stroke-width: 7; }
.em-ring-bar { fill: none; stroke: var(--s); stroke-width: 7; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 40px 40px; transition: stroke-dashoffset 1s linear; }
.em-ring-main { text-anchor: middle; font-size: 14px; font-weight: 800; fill: var(--text-main); }
.em-ring-sub { text-anchor: middle; font-size: 9px; font-weight: 600; fill: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }
.em-live-info { display: grid; gap: 4px; min-width: 0; }
.em-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.em-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 20px; font-size: .72rem; font-weight: 700; }
.em-tag-cat { color: var(--t); background: color-mix(in srgb, var(--t) 12%, white); }
.em-tag-sev { color: var(--s); background: color-mix(in srgb, var(--s) 12%, white); }
.em-live-headline { font-size: .95rem; }
.em-live-time { font-size: .74rem; color: var(--text-muted); }

.em-rail { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); }
.em-rail li { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.em-rail li::before { content: ""; position: absolute; top: 10px; left: -50%; width: 100%; height: 3px; background: var(--bg-subtle); z-index: 0; }
.em-rail li:first-child::before { display: none; }
.em-rail li.is-done::before { background: #16a34a; }
.em-rail-dot { position: relative; z-index: 1; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
  background: var(--bg-subtle); color: #fff; border: 3px solid var(--bg-card); }
.em-rail li.is-done .em-rail-dot { background: #16a34a; }
.em-rail li.is-current .em-rail-dot { box-shadow: 0 0 0 4px rgba(22,163,74,.2); }
.em-rail-label { font-size: .7rem; font-weight: 600; color: var(--text-muted); text-align: center; }
.em-rail li.is-done .em-rail-label { color: var(--text-main); }

.em-pro { display: flex; gap: 12px; align-items: center; padding: 10px 12px; border-radius: 12px; background: var(--bg-subtle); }
.em-pro img { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; }
.em-pro strong { display: block; font-size: .9rem; }
.em-pro span { display: inline-flex; align-items: center; gap: 3px; font-size: .75rem; color: var(--text-muted); }
.em-warn { display: flex; gap: 8px; padding: 10px 12px; border-radius: 12px; background: #fff7ed; color: #9a3412; font-size: .8rem; line-height: 1.4; }
.em-warn .material-symbols-rounded { flex-shrink: 0; }
.em-unit { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: .8rem; color: #334155; }
.em-unit a { margin-left: auto; font-weight: 700; color: #b91c1c; text-decoration: none; }

.em-live-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.em-live-addr { display: inline-flex; align-items: center; gap: 4px; font-size: .78rem; color: var(--text-muted); min-width: 0; overflow-wrap: anywhere; }
.em-cancel { display: inline-flex; align-items: center; gap: 4px; padding: 6px 14px; border-radius: 10px;
  border: 1px solid #fca5a5; background: transparent; color: #dc2626; font-weight: 600; font-size: .78rem; cursor: pointer; }
.em-cancel:disabled { opacity: .6; cursor: not-allowed; }

@media (prefers-reduced-motion: reduce) {
  .em-page, .em-live-dot { animation: none; }
  .em-ring-bar { transition: none; }
}
`;
