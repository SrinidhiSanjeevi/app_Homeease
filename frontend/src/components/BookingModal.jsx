import React, { useState, useEffect } from "react";
import { X, Calendar, User, ShoppingBag, MapPin, CreditCard, ChevronRight, ChevronLeft, Star, FileText, CheckCircle } from "lucide-react";

export default function BookingModal({ service, onClose, onSubmit, professionals }) {
  const [step, setStep] = useState(1);
  
  // Custom Service details
  const [customCategory, setCustomCategory] = useState(service.category || "Spa");
  const [customDescription, setCustomDescription] = useState("");

  // Form State
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("09:00 AM - 11:00 AM");
  const [selectedProfessional, setSelectedProfessional] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(
    service.products && service.products.length > 0 ? service.products[0] : null
  );
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Online Payment (Simulated)");
  
  // Simulated Online Payment Overlay State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentOrderId, setPaymentOrderId] = useState("");
  const [processingPayment, setProcessingPayment] = useState(false);

  const [localProfessionals, setLocalProfessionals] = useState([]);

  // Filter professionals based on selected category
  useEffect(() => {
    const activeCategory = service.isCustom ? customCategory : service.category;
    const filtered = professionals.filter(p => p.category === activeCategory && p.status === "Available");
    setLocalProfessionals(filtered);
  }, [professionals, service, customCategory]);

  // Pricing calculations
  const basePrice = service.price;
  const productExtra = (!service.isCustom && selectedProduct) ? selectedProduct.extraPrice : 0;
  const subtotal = basePrice + productExtra;
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;

  const handleNext = () => {
    if (step === 1 && !date) {
      alert("Please select a date.");
      return;
    }
    if (step === 2 && service.isCustom && !customDescription) {
      alert("Please describe your custom service requirements.");
      return;
    }
    if (step === 3 && (!address || !contactNumber)) {
      alert("Please provide delivery address and contact details.");
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  // Online / Cash Flow
  const handlePaymentInitiate = async (e) => {
    e.preventDefault();

    if (paymentMethod === "Cash" || paymentMethod === "Cash on Delivery") {
      finalizeBooking({ method: "Cash on Delivery", status: "Pending (Cash on Delivery)", details: null });
      return;
    }

    setPaymentOrderId(`sim_order_${Date.now()}`);
    setShowPaymentModal(true);
  };

  const handleSimulatedPaymentSuccess = () => {
    if (processingPayment) return;
    setProcessingPayment(true);
    setShowPaymentModal(false);
    finalizeBooking({
      method: "Online Payment (Simulated)",
      status: "Paid",
      details: {
        orderId: paymentOrderId,
        paymentId: `pay_simulated_${Date.now()}`
      }
    });
  };

  const finalizeBooking = (paymentResult) => {
    if (processingPayment) return;
    setProcessingPayment(true);
    const bookingData = {
      serviceId: service.isCustom ? null : service._id,
      isCustom: service.isCustom,
      customCategory: service.isCustom ? customCategory : null,
      customDescription: service.isCustom ? customDescription : null,
      professionalId: selectedProfessional || null,
      date,
      timeSlot,
      address,
      contactNumber,
      notes: notes,
      selectedProduct: service.isCustom ? null : selectedProduct,
      paymentMethod: paymentResult.method,
      paymentDetails: paymentResult.details,
      totalPrice: total
    };

    onSubmit(bookingData);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(6px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        className="glass-card"
        style={{
          width: "550px",
          maxWidth: "90%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          animation: "scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#ffffff",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800 }}>
              {service.isCustom ? "Custom Request" : "Book Service"}
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {service.isCustom ? "Submit custom requirements" : service.name}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--primary-light)",
              color: "var(--text-main)",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Progress Bar */}
        <div style={{ background: "var(--bg-main)", padding: "12px 24px", display: "flex", gap: "8px" }}>
          {[
            { step: 1, label: "Schedule", icon: Calendar },
            { step: 2, label: "Customize", icon: ShoppingBag },
            { step: 3, label: "Details", icon: MapPin },
            { step: 4, label: "Payment", icon: CreditCard },
          ].map((bar) => {
            const isActive = step === bar.step;
            const isCompleted = step > bar.step;
            return (
              <div
                key={bar.step}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: isActive ? "var(--primary)" : isCompleted ? "var(--success)" : "var(--text-muted)",
                }}
              >
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    background: isActive ? "var(--primary)" : isCompleted ? "var(--success)" : "#cbd5e1",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.7rem",
                  }}
                >
                  {isCompleted ? "✓" : bar.step}
                </div>
                <span>{bar.label}</span>
              </div>
            );
          })}
        </div>

        {/* Form Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px", background: "#ffffff" }}>
          
          {/* STEP 1: SCHEDULE & PROFESSIONAL */}
          {step === 1 && (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              {service.isCustom && (
                <div className="form-group" style={{ marginBottom: "20px" }}>
                  <label>Select Category</label>
                  <select value={customCategory} onChange={(e) => setCustomCategory(e.target.value)}>
                    <option value="Spa">Spa & Wellness</option>
                    <option value="Electrician">Electrician & Appliances</option>
                    <option value="Carpentry">Carpentry & Woodwork</option>
                    <option value="Plumbing">Plumbing & Sanitary</option>
                    <option value="Security">Security & Alarm Systems</option>
                    <option value="Repair">General Cleaning & Repair</option>
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Select Date</label>
                <input
                  type="date"
                  min={new Date().toISOString().split("T")[0]}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
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
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px",
                      borderRadius: "8px",
                      border: selectedProfessional === "" ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: selectedProfessional === "" ? "var(--primary-light)" : "white",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="professional"
                      value=""
                      checked={selectedProfessional === ""}
                      onChange={() => setSelectedProfessional("")}
                      style={{ width: "auto", marginTop: 0 }}
                    />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-main)", textTransform: "none" }}>
                        Auto-Assign Best Specialist
                      </span>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        System selects the highest-rated free professional instantly.
                      </p>
                    </div>
                  </label>

                  {localProfessionals.map((prof) => (
                    <label
                      key={prof._id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px",
                        borderRadius: "8px",
                        border: selectedProfessional === prof._id ? "2px solid var(--primary)" : "1px solid var(--border)",
                        background: selectedProfessional === prof._id ? "var(--primary-light)" : "white",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="professional"
                        value={prof._id}
                        checked={selectedProfessional === prof._id}
                        onChange={() => setSelectedProfessional(prof._id)}
                        style={{ width: "auto", marginTop: 0 }}
                      />
                      <img
                        src={prof.image}
                        alt={prof.name}
                        style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover" }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: "0.9rem", textTransform: "none", color: "var(--text-main)" }}>
                          {prof.name}
                        </span>
                        <div style={{ display: "flex", gap: "10px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          <span>{prof.experience} yrs exp</span>
                          <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                            <Star size={12} fill="var(--warning)" stroke="var(--warning)" />
                            {prof.rating}
                          </span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: CUSTOMIZE & PRODUCTS */}
          {step === 2 && (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              {service.isCustom ? (
                <div className="form-group">
                  <label>Describe Your Custom Job Requirements</label>
                  <textarea
                    placeholder="Describe exactly what needs to be repaired, installed, or styled..."
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    style={{ minHeight: "120px" }}
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label>Choose Brand/Product Package</label>
                  {service.products && service.products.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "5px" }}>
                      {service.products.map((prod, idx) => (
                        <label
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: "12px",
                            borderRadius: "8px",
                            border: selectedProduct?.name === prod.name ? "2px solid var(--primary)" : "1px solid var(--border)",
                            background: selectedProduct?.name === prod.name ? "var(--primary-light)" : "white",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="radio"
                            name="product"
                            checked={selectedProduct?.name === prod.name}
                            onChange={() => setSelectedProduct(prod)}
                            style={{ width: "auto", marginTop: 0 }}
                          />
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-main)", textTransform: "none" }}>
                              {prod.name}
                            </span>
                            <span
                              style={{
                                marginLeft: "8px",
                                fontSize: "0.75rem",
                                background: "#eaeaea",
                                padding: "2px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              {prod.brand}
                            </span>
                          </div>
                          <span style={{ fontWeight: 800, color: "var(--primary)" }}>
                            {prod.extraPrice === 0 ? "Included" : `+ ₹${prod.extraPrice}`}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      Standard tools and premium materials are included in this service by default.
                    </p>
                  )}
                </div>
              )}

              <div className="form-group" style={{ marginTop: "20px" }}>
                <label>Allergies & Special Requests</label>
                <textarea
                  placeholder="E.g., Allergies to chemicals, specify structural details, entry access etc."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 3: DETAILS */}
          {step === 3 && (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              <div className="form-group">
                <label>Service Delivery Address</label>
                <textarea
                  placeholder="Enter house details, building name, street, area, landmark..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  style={{ minHeight: "100px" }}
                />
              </div>

              <div className="form-group">
                <label>Contact Phone Number</label>
                <input
                  type="tel"
                  placeholder="Enter 10-digit mobile number"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 4: PAYMENT */}
          {step === 4 && (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              {/* Order Summary */}
              <div
                style={{
                  background: "var(--bg-main)",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  marginBottom: "20px",
                }}
              >
                <h4 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "10px", textTransform: "uppercase" }}>
                  Summary
                </h4>
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
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "1.05rem",
                    fontWeight: 800,
                    marginTop: "10px",
                    paddingTop: "10px",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <span>Grand Total</span>
                  <span style={{ color: "var(--primary)" }}>₹{total}</span>
                </div>
              </div>

              {/* Payment Selector */}
              <div className="form-group">
                <label>Select Payment Method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="Online Payment (Simulated)">Online Payment (Simulated)</option>
                  <option value="Cash on Delivery">Cash on Delivery (Pay after service)</option>
                </select>
              </div>

              {paymentMethod.includes("Online") && (
                <div
                  style={{
                    padding: "14px",
                    background: "var(--primary-light)",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "12px",
                  }}
                >
                  <CreditCard size={18} />
                  <span>
                    Simulated Online Payment. Clicking checkout opens instant confirmation.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            background: "var(--bg-main)",
          }}
        >
          {step > 1 ? (
            <button onClick={handleBack} className="btn btn-secondary" disabled={processingPayment}>
              <ChevronLeft size={16} /> Back
            </button>
          ) : (
            <div></div>
          )}

          {step < 4 ? (
            <button onClick={handleNext} className="btn btn-primary">
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handlePaymentInitiate}
              className="btn btn-primary"
              disabled={processingPayment}
              style={{ background: "#000000" }}
            >
              {processingPayment ? "Processing..." : `Checkout (₹${total})`}
            </button>
          )}
        </div>
      </div>

      {/* CUSTOM MOCK PAYMENT POPUP */}
      {showPaymentModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 2000,
            animation: "fadeIn 0.2s ease",
          }}
        >
          <div
            style={{
              width: "380px",
              background: "#ffffff",
              borderRadius: "12px",
              overflow: "hidden",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              border: "1px solid #ddd",
            }}
          >
            {/* Simulation Header */}
            <div
              style={{
                background: "#0d2343",
                color: "#ffffff",
                padding: "20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span style={{ fontSize: "0.75rem", opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Online Payment Simulation
                </span>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Confirm Payment</h3>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                style={{ background: "none", color: "white", padding: 0, cursor: "pointer", border: "none" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Simulation Body */}
            <div style={{ padding: "24px" }}>
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Payable Amount</span>
                <h1 style={{ fontSize: "2rem", fontWeight: 800, margin: "4px 0" }}>₹{total}</h1>
              </div>

              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "12px",
                  fontSize: "0.85rem",
                  marginBottom: "20px",
                  textAlign: "center"
                }}
              >
                <p style={{ fontWeight: 700, marginBottom: "4px" }}>Simulated Online Gateway</p>
                <p style={{ color: "var(--text-muted)" }}>Confirm payment transaction for this service booking.</p>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  style={{
                    flex: 1,
                    background: "#f1f5f9",
                    color: "#334155",
                    height: "46px",
                    borderRadius: "6px",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    border: "none",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSimulatedPaymentSuccess}
                  disabled={processingPayment}
                  style={{
                    flex: 1,
                    background: processingPayment ? "#6ee7b7" : "#10b981",
                    color: "#ffffff",
                    height: "46px",
                    borderRadius: "6px",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    border: "none",
                    cursor: processingPayment ? "not-allowed" : "pointer"
                  }}
                >
                  <CheckCircle size={18} /> {processingPayment ? "Processing..." : "Confirm Payment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
