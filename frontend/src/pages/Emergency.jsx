import React, { useEffect, useRef, useState } from "react";
import { AreaChip } from "../components/AreaPicker";
import Icon, { Star, Loader2, XCircle, Check, MapPin } from "../components/Icon";

const CATEGORIES = [
  {
    value: "Electrical",
    icon: "bolt",
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
    defaultSeverity: "Critical",
    callOnly: true,
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
    defaultSeverity: "Critical",
    callOnly: true,
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
  { key: "Low", eta: 30 },
  { key: "Medium", eta: 20 },
  { key: "High", eta: 10 },
  { key: "Critical", eta: 10 }
];

const STEPS = ["Dispatched", "En route", "Arrived", "Resolved"];

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

export default function Emergency({
  activeEmergencies = [],
  onDispatchEmergency,
  showToast,
  token,
  area,
  onChangeArea,
  onRefresh
}) {
  const remembered = useRef(readRemembered()).current;

  const [category, setCategory] = useState("Electrical");
  const [severity, setSeverity] = useState("High");
  const [description, setDescription] = useState("");
  const [contactNumber, setContactNumber] = useState(remembered.contactNumber || "");
  const [address, setAddress] = useState(remembered.address || "");

  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const cat = CATEGORIES.find((c) => c.value === category) || CATEGORIES[0];
  const sev = SEVERITIES.find((s) => s.key === severity) || SEVERITIES[1];
  const callPublic = cat.publicService && cat.publicService.when.includes(severity);
  const isReady = description.trim() && contactNumber.trim() && address.trim();

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
        area
      });

      setDescription("");
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
      const response = await fetch(`/api/emergency/${encodeURIComponent(id)}/cancel`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();

      if (response.ok && data.success) {
        showToast("Emergency request cancelled", "success");
        if (typeof onRefresh === "function") await onRefresh();
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
    <div className="em-page">
      <header className="em-hero">
        <div className="em-hero-text">
          <h1>Emergency service</h1>
          <p>Request an urgent visit from the nearest available professional.</p>
        </div>

        <div className="em-dial">
          <span className="em-dial-label">If anyone is in danger, call</span>
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
              <h2>Type of emergency</h2>
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
                    onClick={() => pickCategory(item)}
                  >
                    <Icon name={item.icon} size={22} />
                    <span className="em-cat-name">{item.value}</span>
                  </button>
                );
              })}
            </div>

            {cat.callOnly ? (
              <div className="em-callonly">
                <div>
                  <strong>Call {cat.publicService.number} ({cat.publicService.name}) or 112</strong>
                  <p>We don&apos;t handle {cat.value.toLowerCase()} emergencies. Please contact the {cat.publicService.note} directly.</p>
                  <div className="em-callonly-actions">
                    <a href={`tel:${cat.publicService.number}`} className="em-callonly-btn">
                      <Icon name="call" size={18} /> Call {cat.publicService.number}
                    </a>
                    <a href="tel:112" className="em-callonly-btn is-alt">
                      <Icon name="call" size={18} /> Call 112
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <>
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
                  placeholder="Describe the problem"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </>
            )}
          </div>

          {!cat.callOnly && (
            <>
              {/* Step 2 */}
              <div className="em-step">
                <div className="em-step-head">
                  <span className="em-step-num">2</span>
                  <h2>Urgency</h2>
                </div>

                <div className="em-meter" role="radiogroup" aria-label="Severity">
                  {SEVERITIES.map((item) => {
                    return (
                      <button
                        type="button"
                        key={item.key}
                        role="radio"
                        aria-checked={severity === item.key}
                        className={`em-meter-seg${severity === item.key ? " is-current" : ""}`}
                        onClick={() => setSeverity(item.key)}
                      >
                        {item.key}
                      </button>
                    );
                  })}
                </div>

                <p className="em-note">
                  Estimated arrival: about {sev.eta} minutes.
                  {callPublic && (
                    <>
                      {" "}Please also call <a href={`tel:${cat.publicService.number}`}>{cat.publicService.number}</a> ({cat.publicService.name}).
                    </>
                  )}
                </p>
              </div>

              {/* Step 3 */}
              <div className="em-step">
                <div className="em-step-head">
                  <span className="em-step-num">3</span>
                  <h2>Address</h2>
                </div>

                <div className="area-bar">
                  <span>Your area</span>
                  <AreaChip area={area} onClick={onChangeArea} />
                </div>

                <div className="em-fields">
                  <label className="em-field">
                    <Icon name="call" size={18} />
                    <input
                      type="tel"
                      placeholder="Phone number"
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                    />
                  </label>
                  <label className="em-field">
                    <Icon name="home_pin" size={18} />
                    <input
                      type="text"
                      placeholder="Address and landmark"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </label>
                </div>

              </div>

              <button type="button" className="em-submit" onClick={submit} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 size={18} /> Sending request…
                  </>
                ) : (
                  "Request emergency visit"
                )}
              </button>
            </>
          )}
        </section>

        {/* ========================= RIGHT COLUMN ========================= */}
        <aside className="em-side">
          {activeEmergencies.length > 0 && (
            <div className="em-side-block">
              <h2 className="em-side-title">Active requests</h2>
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
            <h3>Safety tips</h3>
            <ol className="em-tips">
              {cat.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ol>
          </div>

          {activeEmergencies.length === 0 && (
            <div className="em-card em-empty">You have no active requests.</div>
          )}
        </aside>
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

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
    ringLabel = "—";
    ringSub = "pending";
  } else if (remaining <= 0) {
    ringLabel = "Soon";
    ringSub = "arriving";
  }

  const headline = isResolved
    ? "Resolved"
    : isArrived
      ? "Professional has arrived"
      : emergency.status === "OnTheWay"
        ? "Professional is on the way"
        : pro
          ? "Professional assigned"
          : "Finding a professional";

  return (
    <article className="em-live-card">
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
            <span className="em-tag">
              <Icon name={cat.icon} size={14} /> {emergency.category}
            </span>
            <span className="em-tag">{emergency.severity}</span>
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
              {pro.experience} yrs experience · <Star size={12} fill="currentColor" stroke="currentColor" /> {pro.rating}
            </span>
          </div>
        </div>
      ) : (
        <div className="em-warn">
          <span>
            No {emergency.category.toLowerCase()} professional is free right now. We&apos;ll assign one as soon as possible.
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

const STYLES = `
.em-page { padding: 32px 0 48px; }

/* Header */
.em-hero { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-end; justify-content: space-between;
  padding-bottom: 20px; margin-bottom: 24px; border-bottom: 1px solid var(--border); }
.em-hero h1 { font-size: 1.6rem; font-weight: 700; margin: 0 0 4px; letter-spacing: -.01em; }
.em-hero p { margin: 0; color: var(--text-muted); font-size: .95rem; }
.em-dial-label { display: block; font-size: .78rem; color: var(--text-muted); margin-bottom: 6px; }
.em-dial-row { display: flex; gap: 8px; flex-wrap: wrap; }
.em-dial-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 10px;
  border: 1px solid var(--border-strong); background: #fff; color: var(--text-main); text-decoration: none; font-size: .85rem; }
.em-dial-btn:hover { border-color: #b91c1c; }
.em-dial-btn .material-symbols-rounded { color: #b91c1c; }
.em-dial-num { font-weight: 700; color: #b91c1c; }
.em-dial-name { color: var(--text-muted); }

/* Layout */
.em-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 24px; align-items: start; }
@media (max-width: 960px) { .em-grid { grid-template-columns: 1fr; } }
.em-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); }

/* Form */
.em-form { padding: 4px 24px 24px; }
@media (max-width: 560px) { .em-form { padding: 4px 16px 18px; } }
.em-step { padding: 20px 0; border-bottom: 1px solid var(--border); }
.em-step:last-of-type { border-bottom: 0; }
.em-step-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.em-step-head h2 { font-size: 1rem; font-weight: 700; margin: 0; }
.em-step-num { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
  font-size: .75rem; font-weight: 700; color: var(--text-muted); border: 1px solid var(--border-strong); }

.em-cats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 640px) { .em-cats { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); } }
.em-cat { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 8px;
  border-radius: 10px; cursor: pointer; background: #fff; border: 1px solid var(--border-strong);
  color: var(--text-body); transition: border-color .15s ease; }
.em-cat:hover { border-color: var(--text-muted); }
.em-cat-name { font-weight: 600; font-size: .85rem; }
.em-cat.is-active { border-color: var(--primary); color: var(--primary); box-shadow: inset 0 0 0 1px var(--primary); }

.em-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 10px; }
.em-chip { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 8px;
  font-size: .78rem; cursor: pointer; background: #fff; color: var(--text-body); border: 1px solid var(--border-strong); }
.em-chip:hover { border-color: var(--text-muted); }
.em-chip.is-on { border-color: var(--primary); color: var(--primary); background: #fff; }
.em-textarea { min-height: 76px; resize: vertical; }

.em-meter { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--border-strong); border-radius: 10px; overflow: hidden; }
.em-meter-seg { padding: 10px 4px; background: #fff; border: 0; border-left: 1px solid var(--border-strong);
  cursor: pointer; color: var(--text-body); font-weight: 600; font-size: .85rem; }
.em-meter-seg:first-child { border-left: 0; }
.em-meter-seg.is-current { background: var(--primary); color: #fff; }
.em-note { margin: 12px 0 0; font-size: .85rem; color: var(--text-muted); }
.em-note a { color: #b91c1c; font-weight: 700; text-decoration: none; }

.em-fields { display: grid; gap: 10px; margin-bottom: 4px; }
.em-field { position: relative; display: block; margin: 0; }
.em-field > .material-symbols-rounded { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.em-field input { padding-left: 42px; }

.em-submit { width: 100%; min-height: 50px; margin-top: 16px; border: 0; border-radius: 10px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--primary); color: #fff; font-weight: 700; font-size: .95rem; }
.em-submit:hover:not(:disabled) { filter: brightness(1.08); }
.em-submit:disabled { opacity: .7; cursor: progress; }
.em-submit:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }

/* Fire / medical: call instead of dispatch */
.em-callonly { margin-top: 16px; padding: 16px; border-radius: 10px; border: 1px solid #fecaca; background: #fff; }
.em-callonly strong { display: block; font-size: 1rem; color: #b91c1c; }
.em-callonly p { margin: 6px 0 12px; font-size: .86rem; line-height: 1.5; color: var(--text-body); }
.em-callonly-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.em-callonly-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 8px;
  background: #b91c1c; color: #fff; font-weight: 700; text-decoration: none; }
.em-callonly-btn.is-alt { background: #fff; color: #b91c1c; border: 1px solid #fca5a5; }

/* Right column */
.em-side { display: flex; flex-direction: column; gap: 16px; }
.em-side-block { display: flex; flex-direction: column; gap: 12px; }
.em-side-title { font-size: 1rem; font-weight: 700; margin: 0; }

.em-guide { padding: 18px 20px; }
.em-guide h3 { margin: 0 0 10px; font-size: 1rem; font-weight: 700; }
.em-tips { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
.em-tips li { font-size: .86rem; line-height: 1.45; color: var(--text-body); }

.em-empty { padding: 16px 20px; color: var(--text-muted); font-size: .88rem; }

/* Live card */
.em-live-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px; display: grid; gap: 14px; }
.em-live-top { display: flex; gap: 14px; align-items: center; }
.em-ring { width: 76px; height: 76px; flex-shrink: 0; }
.em-ring-track { fill: none; stroke: var(--bg-subtle); stroke-width: 6; }
.em-ring-bar { fill: none; stroke: var(--primary); stroke-width: 6; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 40px 40px; transition: stroke-dashoffset 1s linear; }
.em-ring-main { text-anchor: middle; font-size: 14px; font-weight: 700; fill: var(--text-main); }
.em-ring-sub { text-anchor: middle; font-size: 9px; fill: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; }
.em-live-info { display: grid; gap: 4px; min-width: 0; }
.em-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.em-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 6px; font-size: .72rem;
  color: var(--text-body); border: 1px solid var(--border-strong); }
.em-live-headline { font-size: .95rem; }
.em-live-time { font-size: .75rem; color: var(--text-muted); }

.em-rail { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); }
.em-rail li { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.em-rail li::before { content: ""; position: absolute; top: 9px; left: -50%; width: 100%; height: 2px; background: var(--border); z-index: 0; }
.em-rail li:first-child::before { display: none; }
.em-rail li.is-done::before { background: var(--primary); }
.em-rail-dot { position: relative; z-index: 1; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
  background: var(--border); color: #fff; border: 3px solid var(--bg-card); }
.em-rail li.is-done .em-rail-dot { background: var(--primary); }
.em-rail-label { font-size: .7rem; color: var(--text-muted); text-align: center; }
.em-rail li.is-done .em-rail-label { color: var(--text-main); }

.em-pro { display: flex; gap: 12px; align-items: center; padding: 10px 12px; border-radius: 10px; background: var(--bg-subtle); }
.em-pro img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
.em-pro strong { display: block; font-size: .9rem; }
.em-pro span { display: inline-flex; align-items: center; gap: 3px; font-size: .75rem; color: var(--text-muted); }
.em-warn { padding: 10px 12px; border-radius: 10px; background: var(--bg-subtle); color: var(--text-body); font-size: .82rem; line-height: 1.4; }
.em-unit { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: .8rem; color: var(--text-body); }
.em-unit a { margin-left: auto; font-weight: 700; color: #b91c1c; text-decoration: none; }

.em-live-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.em-live-addr { display: inline-flex; align-items: center; gap: 4px; font-size: .78rem; color: var(--text-muted); min-width: 0; overflow-wrap: anywhere; }
.em-cancel { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 8px;
  border: 1px solid var(--border-strong); background: #fff; color: var(--text-body); font-size: .78rem; cursor: pointer; }
.em-cancel:hover { border-color: #b91c1c; color: #b91c1c; }
.em-cancel:disabled { opacity: .6; cursor: not-allowed; }

@media (prefers-reduced-motion: reduce) { .em-ring-bar { transition: none; } }
`;
