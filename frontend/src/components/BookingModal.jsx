import React, { useState, useEffect } from "react";
import { X, Calendar, ShoppingBag, MapPin, CreditCard, ChevronRight, ChevronLeft, Star } from "lucide-react";

export default function BookingModal({ service, onClose, onSubmit, onBookingSettled, professionals }) {
  const [step, setStep] = useState(1);
  const [customCategory, setCustomCategory] = useState(service.category || "Spa");
  const [customDescription, setCustomDescription] = useState("");
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("09:00 AM - 11:00 AM");
  const [selectedProfessional, setSelectedProfessional] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(
    service.products && service.products.length > 0 ? service.products[0] : null
  );
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Razorpay");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [localProfessionals, setLocalProfessionals] = useState([]);

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

  useEffect(() => {
    const activeCategory = service.isCustom ? customCategory : service.category;
    const filtered = professionals.filter(p => p.category === activeCategory && p.status === "Available");
    setLocalProfessionals(filtered);
  }, [professionals, service, customCategory]);

  const basePrice = service.price;
  const productExtra = (!service.isCustom && selectedProduct) ? selectedProduct.extraPrice : 0;
  const subtotal = basePrice + productExtra;
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;

  const handleNext = () => {
    if (step === 1 && !date) { alert("Please select a date."); return; }
    if (step === 2 && service.isCustom && !customDescription) { alert("Please describe your custom service requirements."); return; }
    if (step === 3 && (!address || !contactNumber)) { alert("Please provide delivery address and contact details."); return; }
    setStep(step + 1);
  };

  const handleBack = () => setStep(step - 1);

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
    totalPrice: total
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
      const orderRes = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: booking._id }),
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
        name: "ServiceXpress",
        description: service.name || "Service Booking",
        handler: async function (response) {
          const verifyRes = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              bookingId: booking._id,
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
        theme: { color: "#000000" },
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

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(6px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, animation: "fadeIn 0.2s ease-out" }}>
      <div className="glass-card" style={{ width: "550px", maxWidth: "90%", maxHeight: "85vh", display: "flex", flexDirection: "column", borderRadius: "16px", border: "1px solid var(--border)", animation: "scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#ffffff" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800 }}>{service.isCustom ? "Custom Request" : "Book Service"}</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{service.isCustom ? "Submit custom requirements" : service.name}</p>
          </div>
          <button onClick={onClose} style={{ background: "var(--primary-light)", color: "var(--text-main)", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ background: "var(--bg-main)", padding: "12px 24px", display: "flex", gap: "8px" }}>
          {[
            { step: 1, label: "Schedule" },
            { step: 2, label: "Customize" },
            { step: 3, label: "Details" },
            { step: 4, label: "Payment" },
          ].map((bar) => {
            const isActive = step === bar.step;
            const isCompleted = step > bar.step;
            return (
              <div key={bar.step} style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", fontWeight: 700, color: isActive ? "var(--primary)" : isCompleted ? "var(--success)" : "var(--text-muted)" }}>
                <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: isActive ? "var(--primary)" : isCompleted ? "var(--success)" : "#cbd5e1", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem" }}>
                  {isCompleted ? "✓" : bar.step}
                </div>
                <span>{bar.label}</span>
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "24px", background: "#ffffff" }}>
          {step === 1 && (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              {service.isCustom && (
                <div className="form-group" style={{ marginBottom: "20px" }}>
                  <label>Select Category</label>
                  <select value={customCategory} onChange={(e) => setCustomCategory(e.target.value)}>
                    <option value="Spa">Spa & Wellness</option>
                    <option value="Electrical">Electrician & Appliances</option>
                    <option value="Carpentry">Carpentry & Woodwork</option>
                    <option value="Plumbing">Plumbing & Sanitary</option>
                    <option value="Security">Security & Alarm Systems</option>
                    <option value="Repair">General Cleaning & Repair</option>
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Select Date</label>
                <input type="date" min={new Date().toISOString().split("T")[0]} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Preferred Time Slot</label>
                <select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)}>
                  <option value="09:00 AM - 11:00 AM">09:00 AM - 11:00 AM (Morning)</option>
                  <option value="12:00 PM - 02:00 PM">12:00 PM - 02:00 PM (Afternoon)</option>
                  <option value="03:00 PM - 05:00 PM">03:00 PM - 05:00 PM (Evening)</option>
                  <option value="06:00 PM - 08:00 PM">06:00 PM - 08:00 PM (Night)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Choose Specialist</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "5px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "8px", border: selectedProfessional === "" ? "2px solid var(--primary)" : "1px solid var(--border)", background: selectedProfessional === "" ? "var(--primary-light)" : "white", cursor: "pointer" }}>
                    <input type="radio" name="professional" value="" checked={selectedProfessional === ""} onChange={() => setSelectedProfessional("")} style={{ width: "auto", marginTop: 0 }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-main)", textTransform: "none" }}>Auto-Assign Best Specialist</span>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>System selects the highest-rated free professional instantly.</p>
                    </div>
                  </label>
                  {localProfessionals.map((prof) => (
                    <label key={prof._id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "8px", border: selectedProfessional === prof._id ? "2px solid var(--primary)" : "1px solid var(--border)", background: selectedProfessional === prof._id ? "var(--primary-light)" : "white", cursor: "pointer" }}>
                      <input type="radio" name="professional" value={prof._id} checked={selectedProfessional === prof._id} onChange={() => setSelectedProfessional(prof._id)} style={{ width: "auto", marginTop: 0 }} />
                      <img src={prof.image} alt={prof.name} style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover" }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: "0.9rem", textTransform: "none", color: "var(--text-main)" }}>{prof.name}</span>
                        <div style={{ display: "flex", gap: "10px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          <span>{prof.experience} yrs exp</span>
                          <span style={{ display: "flex", alignItems: "center", gap: "2px" }}><Star size={12} fill="var(--warning)" stroke="var(--warning)" />{prof.rating}</span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              {service.isCustom ? (
                <div className="form-group">
                  <label>Describe Your Custom Job Requirements</label>
                  <textarea placeholder="Describe exactly what needs to be repaired, installed, or styled..." value={customDescription} onChange={(e) => setCustomDescription(e.target.value)} style={{ minHeight: "120px" }} />
                </div>
              ) : (
                <div className="form-group">
                  <label>Choose Brand/Product Package</label>
                  {service.products && service.products.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "5px" }}>
                      {service.products.map((prod, idx) => (
                        <label key={idx} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "8px", border: selectedProduct?.name === prod.name ? "2px solid var(--primary)" : "1px solid var(--border)", background: selectedProduct?.name === prod.name ? "var(--primary-light)" : "white", cursor: "pointer" }}>
                          <input type="radio" name="product" checked={selectedProduct?.name === prod.name} onChange={() => setSelectedProduct(prod)} style={{ width: "auto", marginTop: 0 }} />
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-main)", textTransform: "none" }}>{prod.name}</span>
                            <span style={{ marginLeft: "8px", fontSize: "0.75rem", background: "#eaeaea", padding: "2px 6px", borderRadius: "4px" }}>{prod.brand}</span>
                          </div>
                          <span style={{ fontWeight: 800, color: "var(--primary)" }}>{prod.extraPrice === 0 ? "Included" : `+ ₹${prod.extraPrice}`}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Standard tools and premium materials are included in this service by default.</p>
                  )}
                </div>
              )}
              <div className="form-group" style={{ marginTop: "20px" }}>
                <label>Allergies & Special Requests</label>
                <textarea placeholder="E.g., Allergies to chemicals, specify structural details, entry access etc." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          )}
          {step === 3 && (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              <div className="form-group">
                <label>Service Delivery Address</label>
                <textarea placeholder="Enter house details, building name, street, area, landmark..." value={address} onChange={(e) => setAddress(e.target.value)} style={{ minHeight: "100px" }} />
              </div>
              <div className="form-group">
                <label>Contact Phone Number</label>
                <input type="tel" placeholder="Enter 10-digit mobile number" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
              </div>
            </div>
          )}
          {step === 4 && (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              <div style={{ background: "var(--bg-main)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border)", marginBottom: "20px" }}>
                <h4 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "10px", textTransform: "uppercase" }}>Summary</h4>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Base Service Price</span>
                  <span>₹{basePrice}</span>
                </div>
                {!service.isCustom && selectedProduct && selectedProduct.extraPrice > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                    <span style={{ color: "var(--text-muted)" }}>Product upgrade ({selectedProduct.brand})</span>
                    <span>+ ₹{productExtra}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                  <span style={{ color: "var(--text-muted)" }}>GST (18%)</span>
                  <span>₹{gst}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.05rem", fontWeight: 800, marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
                  <span>Grand Total</span>
                  <span style={{ color: "var(--primary)" }}>₹{total}</span>
                </div>
              </div>
              <div className="form-group">
                <label>Select Payment Method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="Razorpay">Online Payment (Razorpay Test Mode)</option>
                  <option value="Cash on Delivery">Cash on Delivery (Pay after service)</option>
                </select>
              </div>
              {paymentMethod === "Razorpay" && (
                <div style={{ padding: "14px", background: "var(--primary-light)", borderRadius: "8px", fontSize: "0.85rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "8px", marginTop: "12px" }}>
                  <CreditCard size={18} />
                  <span>
                    {razorpayLoaded
                      ? "You'll be redirected to Razorpay's secure test checkout. Use card 4111 1111 1111 1111, any future expiry, any CVV."
                      : "Loading secure payment gateway..."}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", background: "var(--bg-main)" }}>
          {step > 1 ? (
            <button onClick={handleBack} className="btn btn-secondary" disabled={processingPayment}>
              <ChevronLeft size={16} /> Back
            </button>
          ) : <div></div>}
          {step < 4 ? (
            <button onClick={handleNext} className="btn btn-primary">
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handlePaymentInitiate}
              className="btn btn-primary"
              disabled={processingPayment || (paymentMethod === "Razorpay" && !razorpayLoaded)}
              style={{ background: "#000000" }}
            >
              {processingPayment ? "Processing..." : `Checkout (₹${total})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}