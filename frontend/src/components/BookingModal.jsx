import React, { useState, useEffect, useMemo } from "react";
import Icon from "./Icon";
import LocationCapture from "./LocationCapture";

const STEPS = [
  { step: 1, label: "Schedule" },
  { step: 2, label: "Customize" },
  { step: 3, label: "Address" },
  { step: 4, label: "Payment" },
];

const TIME_SLOTS = [
  { value: "09:00 AM - 11:00 AM", label: "Morning", time: "9 – 11 AM" },
  { value: "12:00 PM - 02:00 PM", label: "Afternoon", time: "12 – 2 PM" },
  { value: "03:00 PM - 05:00 PM", label: "Evening", time: "3 – 5 PM" },
  { value: "06:00 PM - 08:00 PM", label: "Night", time: "6 – 8 PM" },
];

// Values must match Service.category / Professional.category in the DB.
const CUSTOM_CATEGORIES = [
  { value: "Spa", label: "Spa & Wellness" },
  { value: "Electrician", label: "Electrician & Appliances" },
  { value: "Carpentry", label: "Carpentry & Woodwork" },
  { value: "Plumbing", label: "Plumbing & Sanitary" },
  { value: "Security", label: "Security & Smart Locks" },
  { value: "Repair", label: "General Cleaning & Repair" },
];

const todayIso = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split("T")[0];
};

export default function BookingModal({ service, initialProduct, onClose, onSubmit, onBookingSettled, professionals, user }) {
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState("");
  const [customCategory, setCustomCategory] = useState(service.category || "Spa");
  const [customDescription, setCustomDescription] = useState("");
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[0].value);
  const [selectedProfessional, setSelectedProfessional] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(
    initialProduct || (service.products && service.products.length > 0 ? service.products[0] : null)
  );
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [location, setLocation] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("Razorpay");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  useEffect(() => {
    if (window.Razorpay) {
      setRazorpayLoaded(true);
      return;
    }
    if (document.getElementById("razorpay-checkout-js")) {
      const existing = document.getElementById("razorpay-checkout-js");
      existing.addEventListener("load", () => setRazorpayLoaded(true));
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-checkout-js";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => setRazorpayLoaded(true);
    script.onerror = () => console.error("Failed to load Razorpay checkout script");
    document.body.appendChild(script);
  }, []);

  // Close on Escape (unless a payment is in flight)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !processingPayment) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, processingPayment]);

  const activeCategory = service.isCustom ? customCategory : service.category;

  // Every pro in this category; busy ones are shown but not selectable.
  const categoryProfessionals = useMemo(
    () =>
      professionals
        .filter((p) => p.category === activeCategory)
        .sort((a, b) => (a.status === "Available" ? 0 : 1) - (b.status === "Available" ? 0 : 1) || (b.rating || 0) - (a.rating || 0)),
    [professionals, activeCategory]
  );
  const availableCount = categoryProfessionals.filter((p) => p.status === "Available").length;

  useEffect(() => {
    // Drop a stale choice if that pro is no longer available / in category
    if (selectedProfessional && !categoryProfessionals.some((p) => p._id === selectedProfessional && p.status === "Available")) {
      setSelectedProfessional("");
    }
  }, [categoryProfessionals, selectedProfessional]);

  const basePrice = service.price;
  const productExtra = (!service.isCustom && selectedProduct) ? selectedProduct.extraPrice : 0;
  const subtotal = basePrice + productExtra;
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;

  const handleNext = () => {
    if (step === 1 && !date) return setStepError("Please pick a date for your visit.");
    if (step === 2 && service.isCustom && !customDescription.trim()) return setStepError("Please describe what you need done.");
    if (step === 3) {
      if (!address.trim()) return setStepError("Please enter the service address.");
      if (!/^[6-9]\d{9}$/.test(contactNumber.replace(/\D/g, "").slice(-10))) return setStepError("Please enter a valid 10-digit mobile number.");
    }
    setStepError("");
    setStep(step + 1);
  };

  const handleBack = () => {
    setStepError("");
    setStep(step - 1);
  };

  const buildBookingPayload = (paymentMethodValue) => ({
    serviceId: service.isCustom ? null : service._id,
    isCustom: service.isCustom,
    customCategory: service.isCustom ? customCategory : null,
    customDescription: service.isCustom ? customDescription : null,
    professionalId: selectedProfessional || null,
    date,
    timeSlot,
    address,
    contactNumber,
    notes,
    selectedProduct: service.isCustom ? null : selectedProduct,
    paymentMethod: paymentMethodValue,
    totalPrice: total,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    accuracy: location?.accuracy ?? null
  });

  const finalizeCashBooking = async () => {
    if (processingPayment) return;
    setProcessingPayment(true);
    try {
      await onSubmit(buildBookingPayload("Cash on Delivery"));
      if (typeof onBookingSettled === "function") onBookingSettled();
      onClose();
    } catch (err) {
      console.error("Cash booking error:", err);
      alert("Could not create booking. Please try again.");
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleRazorpayCheckout = async () => {
    if (!razorpayLoaded || !window.Razorpay) {
      alert("Payment gateway is still loading — please wait a second and try again.");
      return;
    }
    if (processingPayment) return;
    setProcessingPayment(true);

    try {
      const createRes = await onSubmit(buildBookingPayload("Razorpay"));
      const booking = createRes?.booking;
      if (!booking?._id) {
        throw new Error("Booking creation did not return a booking id — check onSubmit's return value in the parent component.");
      }

      const token = localStorage.getItem("token");
      const userId = user?.id || user?._id || "";
      const orderRes = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: booking._id, userId }),
      }).then(r => r.json());

      if (!orderRes.success) {
        alert(orderRes.message || "Could not start payment.");
        setProcessingPayment(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: orderRes.keyId,
        amount: orderRes.amount,
        currency: orderRes.currency,
        order_id: orderRes.orderId,
        name: "HomeEase",
        description: service.name || "Service Booking",
        handler: async function (response) {
          const verifyRes = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              bookingId: booking._id,
              userId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          }).then(r => r.json());

          setProcessingPayment(false);
          if (verifyRes.success) {
            if (typeof onBookingSettled === "function") onBookingSettled();
            onClose();
          } else {
            alert("Payment verification failed. Your booking ID is " + booking._id + " — contact support if the amount was deducted.");
          }
        },
        modal: {
          ondismiss: function () {
            setProcessingPayment(false);
          },
        },
        theme: { color: "#0E5E4F" },
      });

      // FIX: Razorpay does NOT call `handler` on a bank decline — it fires
      // this event instead. Without reporting it to the backend, the
      // booking stays "Pending" and the claimed professional stays "Busy"
      // forever. We call /verify with an empty signature — the HMAC check
      // will correctly fail, which marks the Payment "Failure", cancels
      // the booking, and releases the professional (see paymentController.js).
      rzp.on("payment.failed", async function (response) {
        console.error("Razorpay payment failed:", response.error);
        try {
          const meta = response.error?.metadata || {};
          await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              bookingId: booking._id,
              razorpay_order_id: meta.order_id || orderRes.orderId,
              razorpay_payment_id: meta.payment_id || "",
              razorpay_signature: "",
            }),
          });
          if (typeof onBookingSettled === "function") onBookingSettled();
        } catch (reportErr) {
          console.error("Failed to record payment failure:", reportErr);
        } finally {
          setProcessingPayment(false);
          alert("Payment failed: " + (response.error?.description || "Please try again."));
        }
      });

      rzp.open();
    } catch (err) {
      console.error("Payment initiation error:", err);
      setProcessingPayment(false);
      alert(err.message || "Something went wrong starting payment. Please try again.");
    }
  };

  const handlePaymentInitiate = (e) => {
    e.preventDefault();
    if (paymentMethod === "Cash on Delivery") {
      finalizeCashBooking();
    } else {
      handleRazorpayCheckout();
    }
  };

  const selectedPro = categoryProfessionals.find((p) => p._id === selectedProfessional);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !processingPayment) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
        <div className="modal-head">
          <div>
            <h2 id="booking-title">{service.isCustom ? "Custom request" : service.name}</h2>
            <p>
              {service.isCustom
                ? "Tell us what you need and we'll match an expert"
                : `${service.category} · ${service.duration || "Flexible"} · from ₹${service.price}`}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={processingPayment} aria-label="Close">
            <Icon name="close" size={24} />
          </button>
        </div>

        <div className="stepper">
          {STEPS.map((s) => (
            <div key={s.step} className={`stepper-item${step === s.step ? " is-active" : ""}${step > s.step ? " is-done" : ""}`}>
              <div className="stepper-bar" />
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {step > s.step && <Icon name="check" size={14} />}
                <span className="stepper-label">{s.label}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="modal-body">
          {step === 1 && (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              {service.isCustom && (
                <div className="form-group">
                  <label htmlFor="bm-category">Category</label>
                  <select id="bm-category" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)}>
                    {CUSTOM_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="bm-date">When should we come?</label>
                <input id="bm-date" type="date" min={todayIso()} value={date} onChange={(e) => { setDate(e.target.value); setStepError(""); }} />
              </div>

              <div className="form-group">
                <span className="field-label">Time slot</span>
                <div className="slot-grid">
                  {TIME_SLOTS.map((slot) => (
                    <button
                      key={slot.value}
                      type="button"
                      className={`slot${timeSlot === slot.value ? " is-active" : ""}`}
                      onClick={() => setTimeSlot(slot.value)}
                      aria-pressed={timeSlot === slot.value}
                    >
                      <strong>{slot.label}</strong>
                      <span>{slot.time}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <span className="field-label" style={{ display: "flex", justifyContent: "space-between" }}>
                  Choose your professional
                  <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>
                    {availableCount} of {categoryProfessionals.length} available
                  </span>
                </span>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label className={`option-card${selectedProfessional === "" ? " is-active" : ""}`}>
                    <input type="radio" name="professional" checked={selectedProfessional === ""} onChange={() => setSelectedProfessional("")} />
                    <span className="avatar" style={{ background: "var(--brand)", color: "#fff" }}>
                      <Icon name="bolt" size={20} filled />
                    </span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: "0.95rem" }}>Auto-assign best match</strong>
                      <div className="field-hint">We pick the highest-rated professional who is free — fastest option.</div>
                    </div>
                    <span className="badge badge-completed">Recommended</span>
                  </label>

                  {categoryProfessionals.map((prof) => {
                    const busy = prof.status !== "Available";
                    const active = selectedProfessional === prof._id;
                    return (
                      <label key={prof._id} className={`option-card${active ? " is-active" : ""}${busy ? " is-disabled" : ""}`}>
                        <input
                          type="radio"
                          name="professional"
                          checked={active}
                          disabled={busy}
                          onChange={() => setSelectedProfessional(prof._id)}
                        />
                        {prof.imageUrl || prof.image ? (
                          <img src={prof.imageUrl || prof.image} alt={prof.imageAlt || prof.name} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                        ) : (
                          <span className="avatar">{prof.name?.[0]}</span>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ fontSize: "0.95rem" }}>{prof.name}</strong>
                          <div className="service-card-meta">
                            <span className="rating-pill" style={{ fontSize: "0.8rem" }}>
                              <Icon name="star" size={14} filled /> {prof.rating || "New"}
                            </span>
                            <span className="dot" />
                            <span>{prof.experience} yrs experience</span>
                            {prof.completedJobs > 0 && (
                              <>
                                <span className="dot" />
                                <span>{prof.completedJobs} jobs</span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className={`badge ${busy ? "badge-pending" : "badge-completed"}`}>{busy ? "Busy" : "Available"}</span>
                      </label>
                    );
                  })}

                  {categoryProfessionals.length > 0 && availableCount === 0 && (
                    <div className="notice notice-info">
                      <Icon name="schedule" size={18} />
                      <span>All {activeCategory} professionals are on jobs right now. Choose auto-assign and we&apos;ll confirm the first one who frees up.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              {service.isCustom ? (
                <div className="form-group">
                  <label htmlFor="bm-desc">Describe the job</label>
                  <textarea
                    id="bm-desc"
                    placeholder="What needs to be repaired, installed or serviced? Include sizes, brands or photos you can share on arrival."
                    value={customDescription}
                    onChange={(e) => { setCustomDescription(e.target.value); setStepError(""); }}
                    style={{ minHeight: 140 }}
                  />
                </div>
              ) : (
                <div className="form-group">
                  <span className="field-label">Choose a package</span>
                  {service.products && service.products.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {service.products.map((prod, idx) => {
                        const active = selectedProduct?.name === prod.name;
                        return (
                          <label key={idx} className={`option-card${active ? " is-active" : ""}`}>
                            <input type="radio" name="product" checked={active} onChange={() => setSelectedProduct(prod)} />
                            <div style={{ flex: 1 }}>
                              <strong style={{ fontSize: "0.95rem" }}>{prod.name}</strong>
                              <div className="field-hint">{prod.brand}</div>
                            </div>
                            <strong>{prod.extraPrice === 0 ? "Included" : `+ ₹${prod.extraPrice}`}</strong>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="notice notice-info">
                      <Icon name="inventory_2" size={18} />
                      <span>Standard tools and quality materials are included with this service.</span>
                    </div>
                  )}
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="bm-notes">Notes for the professional <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>(optional)</span></label>
                <textarea
                  id="bm-notes"
                  placeholder="Allergies, parking or gate instructions, pets at home…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              <div className="form-group">
                <label htmlFor="bm-address">Service address</label>
                <textarea
                  id="bm-address"
                  placeholder="Flat / house no., building, street, area, landmark"
                  value={address}
                  onChange={(e) => { setAddress(e.target.value); setStepError(""); }}
                  style={{ minHeight: 96 }}
                />
              </div>
              <div className="form-group">
                <label htmlFor="bm-phone">Mobile number</label>
                <input
                  id="bm-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="10-digit mobile number"
                  value={contactNumber}
                  onChange={(e) => { setContactNumber(e.target.value); setStepError(""); }}
                />
              </div>
              <LocationCapture onLocationCaptured={setLocation} />
            </div>
          )}

          {step === 4 && (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              <div className="summary">
                <div className="summary-row" style={{ color: "var(--text-main)", fontWeight: 700, marginBottom: 12 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="event" size={18} /> {date ? new Date(date + "T00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : "—"}
                  </span>
                  <span>{TIME_SLOTS.find((s) => s.value === timeSlot)?.time}</span>
                </div>
                <div className="summary-row">
                  <span>Professional</span>
                  <span>{selectedPro ? selectedPro.name : "Auto-assigned"}</span>
                </div>
                <div className="summary-row">
                  <span>Service price</span>
                  <span>₹{basePrice}</span>
                </div>
                {!service.isCustom && selectedProduct && selectedProduct.extraPrice > 0 && (
                  <div className="summary-row">
                    <span>{selectedProduct.name} ({selectedProduct.brand})</span>
                    <span>+ ₹{productExtra}</span>
                  </div>
                )}
                <div className="summary-row">
                  <span>GST (18%)</span>
                  <span>₹{gst}</span>
                </div>
                <div className="summary-total">
                  <span>Total</span>
                  <span>₹{total}</span>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <span className="field-label">Payment method</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { value: "Razorpay", icon: "credit_card", title: "Pay online", hint: "UPI, cards, net banking · Razorpay test mode" },
                    { value: "Cash on Delivery", icon: "payments", title: "Pay after service", hint: "Cash or UPI to the professional" },
                  ].map((m) => (
                    <label key={m.value} className={`option-card${paymentMethod === m.value ? " is-active" : ""}`}>
                      <input type="radio" name="payment" checked={paymentMethod === m.value} onChange={() => setPaymentMethod(m.value)} />
                      <Icon name={m.icon} size={22} color="var(--brand)" />
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: "0.95rem" }}>{m.title}</strong>
                        <div className="field-hint">{m.hint}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {stepError && (
            <div className="notice notice-warn" role="alert" style={{ marginTop: 16 }}>
              <Icon name="error" size={18} />
              <span>{stepError}</span>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {step > 1 ? (
            <button type="button" onClick={handleBack} className="btn btn-secondary" disabled={processingPayment}>
              <Icon name="arrow_back" size={18} /> Back
            </button>
          ) : (
            <span className="price" style={{ fontSize: "1rem" }}>
              <small>Estimated total</small>₹{total}
            </span>
          )}
          {step < 4 ? (
            <button type="button" onClick={handleNext} className="btn btn-primary" style={{ minWidth: 140 }}>
              Continue <Icon name="arrow_forward" size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePaymentInitiate}
              className="btn btn-primary"
              style={{ minWidth: 180 }}
              disabled={processingPayment || (paymentMethod === "Razorpay" && !razorpayLoaded)}
            >
              {processingPayment ? (
                <>
                  <Icon name="progress_activity" size={18} spin /> Processing…
                </>
              ) : paymentMethod === "Razorpay" ? (
                `Pay ₹${total}`
              ) : (
                `Confirm booking · ₹${total}`
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
