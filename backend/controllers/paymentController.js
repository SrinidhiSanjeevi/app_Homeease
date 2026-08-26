const crypto = require("crypto");
const razorpay = require("../config/razorpay");
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const Professional = require("../models/Professional");
const { reassignWaitingWork } = require("../services/professionalMatcher");
const metrics = require("../metrics");

// ============================================================
// CREATE RAZORPAY ORDER
// ============================================================
const createOrder = async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const booking = await Booking.findOne({ _id: bookingId, user: req.user._id });

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (booking.paymentStatus === "Paid") {
      return res.status(400).json({ success: false, message: "This booking is already paid" });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(booking.totalPrice * 100),
      currency: "INR",
      receipt: `booking_${booking._id}`,
      notes: {
        bookingId: booking._id.toString(),
        userId: req.user._id.toString()
      }
    });

    return res.status(200).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error("RAZORPAY CREATE ORDER ERROR:", error);
    return res.status(500).json({ success: false, message: "Could not create payment order" });
  }
};

// ============================================================
// VERIFY RAZORPAY PAYMENT
// ============================================================
const verifyPayment = async (req, res) => {
  try {
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const isValid = expectedSignature === razorpay_signature;

    const payment = await Payment.create({
      booking: booking._id,
      user: booking.user,
      amount: booking.totalPrice,
      status: isValid ? "Success" : "Failure",
      paymentMethod: "Razorpay",
      transactionId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      razorpaySignature: razorpay_signature,
      failureReason: isValid ? "" : "Signature verification failed"
    });

    if (isValid) {
      booking.status = booking.professional ? "Confirmed" : "Assigned";
      booking.paymentStatus = "Paid";

      if (metrics && metrics.paymentSuccess) metrics.paymentSuccess.inc();
      if (metrics && metrics.bookingsConfirmed) metrics.bookingsConfirmed.inc();
      if (metrics && metrics.activeBookings) metrics.activeBookings.inc();
    } else {
      booking.status = "Cancelled";
      booking.paymentStatus = "Failed";

      // A professional may have been marked Busy when the booking was
      // created. Release them, then immediately check whether any other
      // customer is waiting for that same category — so a failed payment
      // doesn't leave a professional idle while someone else is stuck at
      // "no professional available."
      if (booking.professional) {
        const freedProfessional = await Professional.findByIdAndUpdate(
          booking.professional,
          { status: "Available" },
          { new: true }
        );
        if (freedProfessional) {
          reassignWaitingBookings(freedProfessional.category).catch((err) =>
            console.error("Auto-reassignment error:", err.message)
          );
        }
      }

      if (metrics && metrics.paymentFailures) metrics.paymentFailures.inc();
      if (metrics && metrics.bookingsCancelled) metrics.bookingsCancelled.inc();
    }

    await booking.save();

    return res.status(isValid ? 200 : 400).json({ success: isValid, booking, payment });
  } catch (error) {
    console.error("RAZORPAY VERIFY ERROR:", error);
    if (metrics && metrics.paymentFailures) metrics.paymentFailures.inc();
    return res.status(500).json({ success: false, message: "Payment verification failed" });
  }
};

// ============================================================
// REFUND PAYMENT
// ============================================================
const refundPayment = async (bookingId) => {
  const payment = await Payment.findOne({ booking: bookingId, status: "Success" }).sort({ createdAt: -1 });

  if (!payment || payment.paymentMethod !== "Razorpay") {
    return null;
  }

  try {
    const refund = await razorpay.payments.refund(payment.transactionId, {
      amount: Math.round(payment.amount * 100)
    });

    payment.status = "Refunded";
    payment.refundId = refund.id;
    await payment.save();

    if (metrics && metrics.paymentRefunded) metrics.paymentRefunded.inc();

    return refund;
  } catch (error) {
    console.error("RAZORPAY REFUND ERROR:", error.message);
    return null;
  }
};

module.exports = { createOrder, verifyPayment, refundPayment };