const crypto = require("crypto");
const razorpay = require("../config/razorpay");
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const Professional = require("../models/Professional");
const { reassignWaitingWork } = require("../services/professionalMatcher");
const { canTransition } = require("../services/booking/bookingStateMachine");
const logger = require("../utils/logger");
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

    if (booking.status === "Cancelled" || booking.status === "Completed") {
      return res.status(400).json({
        success: false,
        message: `Cannot create payment order for a ${booking.status} booking`
      });
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

    // Record pending payment tracking for this Razorpay order
    await Payment.create({
      booking: booking._id,
      user: req.user._id,
      amount: booking.totalPrice,
      status: "Pending",
      paymentMethod: "Razorpay",
      transactionId: `ORDER-${order.id}`,
      razorpayOrderId: order.id
    });

    return res.status(200).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    logger.error({ err: error.message }, "Razorpay create order error");
    return res.status(500).json({ success: false, message: "Could not create payment order" });
  }
};

// ============================================================
// VERIFY RAZORPAY PAYMENT
// ============================================================
const verifyPayment = async (req, res) => {
  try {
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    // Ownership check: users can only verify payments for their own bookings
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to verify payment for this booking"
      });
    }

    if (booking.paymentStatus === "Paid") {
      return res.status(400).json({ success: false, message: "This booking is already paid" });
    }

    if (booking.status === "Cancelled" || booking.status === "Completed") {
      return res.status(400).json({
        success: false,
        message: `Cannot verify payment for a booking with status: ${booking.status}`
      });
    }

    // Prevent duplicate verification of the same transaction
    const existingSuccessfulPayment = await Payment.findOne({
      transactionId: razorpay_payment_id,
      status: "Success"
    });

    if (existingSuccessfulPayment) {
      return res.status(400).json({
        success: false,
        message: "This payment has already been verified successfully"
      });
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
      const targetStatus = booking.professional ? "Confirmed" : "Assigned";
      if (canTransition(booking.status, targetStatus)) {
        booking.status = targetStatus;
      }
      booking.paymentStatus = "Paid";

      if (metrics && metrics.paymentSuccess) metrics.paymentSuccess.inc();
      if (metrics && metrics.bookingsConfirmed) metrics.bookingsConfirmed.inc();
      if (metrics && metrics.activeBookings) metrics.activeBookings.inc();
    } else {
      if (canTransition(booking.status, "Cancelled")) {
        booking.status = "Cancelled";
      }
      booking.paymentStatus = "Failed";

      // Release assigned professional if payment failed, then sweep for waiting work
      if (booking.professional) {
        const freedProfessional = await Professional.findByIdAndUpdate(
          booking.professional,
          { status: "Available" },
          { new: true }
        );
        if (freedProfessional) {
          reassignWaitingWork(freedProfessional.category).catch((err) =>
            logger.error({ err: err.message }, "Auto-reassignment error after failed payment")
          );
        }
      }

      if (metrics && metrics.paymentFailures) metrics.paymentFailures.inc();
      if (metrics && metrics.bookingsCancelled) metrics.bookingsCancelled.inc();
    }

    await booking.save();

    return res.status(isValid ? 200 : 400).json({ success: isValid, booking, payment });
  } catch (error) {
    logger.error({ err: error.message }, "Razorpay verify error");
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
    logger.error({ err: error.message }, "Razorpay refund error");
    return null;
  }
};

module.exports = { createOrder, verifyPayment, refundPayment };