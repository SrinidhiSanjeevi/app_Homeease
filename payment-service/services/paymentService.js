const crypto = require("crypto");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const razorpay = require("../config/razorpay");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));
const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

// ============================================================
// CREATE ORDER
// ============================================================
// One open Razorpay order per booking: a second call returns the same
// order instead of creating another one that could also be paid.
const createOrder = async ({ bookingId, userId }) => {
  if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId) || !userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid booking ID or user ID", 400);
  }

  const booking = await Booking.findOne({ _id: toObjectId(bookingId), user: toObjectId(userId) });
  if (!booking) {
    throw new AppError("Booking not found", 404);
  }
  if (booking.paymentMethod !== "Razorpay") {
    throw new AppError("This booking is paid in cash after the service", 400);
  }
  if (booking.paymentStatus === "Paid") {
    throw new AppError("This booking is already paid", 400);
  }
  if (booking.status !== "Created" || booking.paymentStatus !== "Pending") {
    throw new AppError("This booking can no longer be paid (it may have expired). Please book again.", 400);
  }

  const amountPaise = Math.round(booking.totalPrice * 100);
  const keyId = (process.env.RAZORPAY_KEY_ID || "rzp_placeholder_key").trim();

  const openOrder = await Payment.findOne({
    booking: booking._id,
    paymentMethod: "Razorpay",
    status: "Pending",
    razorpayOrderId: { $exists: true }
  }).sort({ createdAt: -1 });

  if (openOrder && Math.round(openOrder.amount * 100) === amountPaise) {
    return { orderId: openOrder.razorpayOrderId, amount: amountPaise, currency: "INR", keyId };
  }

  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: `booking_${booking._id}`,
    notes: { bookingId: booking._id.toString(), userId: userId.toString() }
  });

  await Payment.create({
    booking: booking._id,
    user: booking.user,
    amount: booking.totalPrice,
    status: "Pending",
    paymentMethod: "Razorpay",
    transactionId: `ORDER-${order.id}`,
    razorpayOrderId: order.id
  });

  return { orderId: order.id, amount: order.amount, currency: order.currency, keyId };
};

// ============================================================
// SETTLE A GENUINE RAZORPAY PAYMENT (shared by verify + webhook)
// ============================================================
// Called only once the payment is proven genuine (valid checkout signature
// or signed webhook) AND its order is known to belong to this booking.
//   - Booking still awaiting payment → mark it paid.
//   - Booking expired / cancelled, or already paid by another payment →
//     keep the money record and refund it straight away.
async function settleGenuinePayment({ booking, orderRecord, paymentId, amountPaise, extra = {} }) {
  const already = await Payment.findOne({ transactionId: paymentId, status: { $in: ["Success", "Refunded", "Partially Refunded"] } });
  if (already) {
    const fresh = await Booking.findById(booking._id);
    return { outcome: already.status === "Success" ? "paid" : "refunded", booking: fresh, payment: already };
  }

  const expectedPaise = Math.round(orderRecord.amount * 100);
  if (amountPaise && amountPaise !== expectedPaise) {
    logger.error({ bookingId: booking._id, paymentId, amountPaise, expectedPaise }, "[PaymentService] Paid amount does not match order amount");
  }
  const amount = (amountPaise || expectedPaise) / 100;

  // Only a booking that is still waiting for payment can become paid.
  const paidBooking = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "Created", paymentStatus: "Pending" },
    [
      {
        $set: {
          paymentStatus: "Paid",
          status: { $cond: [{ $ifNull: ["$professional", false] }, "Confirmed", "Assigned"] }
        }
      }
    ],
    { new: true, updatePipeline: true }
  );

  const payment = await Payment.findOneAndUpdate(
    { _id: orderRecord._id },
    {
      $set: {
        status: "Success",
        amount,
        transactionId: paymentId,
        ...extra
      }
    },
    { new: true }
  );

  if (paidBooking) {
    return { outcome: "paid", booking: paidBooking, payment };
  }

  // Late or duplicate payment — give the money back.
  const current = await Booking.findById(booking._id);
  logger.warn(
    { bookingId: booking._id, paymentId, bookingStatus: current?.status, paymentStatus: current?.paymentStatus },
    "[PaymentService] Payment received for a booking that can't take it — refunding"
  );
  const refunded = await refundSpecificPayment(payment, amount);
  return { outcome: refunded ? "refunded" : "refund_failed", booking: current, payment };
}

// ============================================================
// VERIFY PAYMENT (checkout callback)
// ============================================================
const verifyPayment = async ({ bookingId, userId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new AppError("Invalid booking ID", 400);
  }
  const paymentId = cleanString(razorpayPaymentId);
  const orderId = cleanString(razorpayOrderId);
  const signature = cleanString(razorpaySignature);
  if (!paymentId || !orderId) {
    throw new AppError("Invalid payment details", 400);
  }

  const booking = await Booking.findById(toObjectId(bookingId));
  if (!booking) {
    throw new AppError("Booking not found", 404);
  }
  if (!userId || booking.user.toString() !== userId.toString()) {
    throw new AppError("Unauthorized to verify payment for this booking", 403);
  }

  // The order must be one we created for THIS booking — stops a cheap
  // payment being replayed against an expensive booking.
  const orderRecord = await Payment.findOne({ booking: booking._id, razorpayOrderId: orderId, paymentMethod: "Razorpay" });
  if (!orderRecord) {
    throw new AppError("This payment does not belong to this booking", 400);
  }

  // Trim everything that feeds the HMAC — a stray newline/space in the
  // secret (common with Kubernetes Secret / Key Vault CSI mounts)
  // otherwise produces a mismatch for a genuine payment.
  const secret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
  const expectedSignature = secret
    ? crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex")
    : "";
  const isValid =
    Boolean(secret) &&
    expectedSignature.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));

  if (!isValid) {
    // Record the failed attempt only. The booking is NOT cancelled: the
    // customer can retry inside the same checkout, and an unpaid booking
    // expires on its own after 15 minutes.
    await Payment.create({
      booking: booking._id,
      user: booking.user,
      amount: orderRecord.amount,
      status: "Failure",
      paymentMethod: "Razorpay",
      transactionId: `FAILED-${paymentId}-${Date.now()}`,
      razorpayOrderId: orderId,
      failureReason: "Signature verification failed"
    });
    return { isValid: false, booking, message: "Payment could not be verified. If money was deducted, it will be refunded automatically." };
  }

  const result = await settleGenuinePayment({
    booking,
    orderRecord,
    paymentId,
    amountPaise: null,
    extra: { razorpaySignature: signature }
  });

  if (result.outcome === "paid") {
    return { isValid: true, booking: result.booking, payment: result.payment };
  }
  return {
    isValid: false,
    booking: result.booking,
    payment: result.payment,
    message: result.outcome === "refunded"
      ? "This booking had already expired or been paid, so your payment has been refunded. Please book again."
      : "This booking had already expired. Your refund is being processed."
  };
};

// ============================================================
// REFUND PAYMENT
// ============================================================
async function refundSpecificPayment(payment, amount) {
  if (!payment || payment.paymentMethod !== "Razorpay" || !payment.transactionId || payment.transactionId.startsWith("ORDER-")) {
    return null;
  }
  const refundAmount = Math.min(Number(amount) || payment.amount, payment.amount);
  try {
    const refund = await razorpay.payments.refund(payment.transactionId, {
      amount: Math.round(refundAmount * 100)
    });
    payment.status = refundAmount < payment.amount ? "Partially Refunded" : "Refunded";
    payment.refundId = refund.id;
    await payment.save();
    return refund;
  } catch (error) {
    logger.error({ err: error.message, paymentId: payment.transactionId }, "Razorpay refund error");
    return null;
  }
}

// Refunds the booking's successful payment — fully, or `amount` rupees
// when a late-cancellation fee applies.
const refundPayment = async (bookingId, amount) => {
  if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
    return null;
  }
  const payment = await Payment.findOne({ booking: toObjectId(bookingId), status: "Success", paymentMethod: "Razorpay" })
    .sort({ createdAt: -1 });
  return refundSpecificPayment(payment, amount);
};

// ============================================================
// GET PAYMENT STATUS
// ============================================================
const getPaymentStatus = async ({ bookingId, transactionId }) => {
  const query = {};
  if (typeof transactionId === "string" && transactionId.trim()) {
    query.transactionId = transactionId.trim();
  } else if (bookingId && mongoose.Types.ObjectId.isValid(bookingId)) {
    query.booking = toObjectId(bookingId);
  } else {
    throw new AppError("Either valid bookingId or transactionId is required", 400);
  }

  const payment = await Payment.findOne(query).sort({ createdAt: -1 });
  if (!payment) {
    throw new AppError("Payment record not found", 404);
  }
  return payment;
};

// ============================================================
// PROCESS WEBHOOK
// ============================================================
async function findOrderForWebhook(orderId, bookingIdFromNotes) {
  if (!orderId) return { orderRecord: null, booking: null };
  const orderRecord = await Payment.findOne({ razorpayOrderId: orderId, paymentMethod: "Razorpay" }).sort({ createdAt: 1 });
  if (!orderRecord) return { orderRecord: null, booking: null };
  // The order's booking is authoritative; notes must agree if present.
  if (bookingIdFromNotes && orderRecord.booking.toString() !== bookingIdFromNotes) {
    logger.error({ orderId, bookingIdFromNotes }, "[PaymentService Webhook] Order/booking mismatch");
    return { orderRecord: null, booking: null };
  }
  const booking = await Booking.findById(orderRecord.booking);
  return { orderRecord, booking };
}

const processWebhook = async ({ rawPayload, signature, webhookSecret, eventHeaders = {} }) => {
  if (!signature) {
    return { statusCode: 400, success: false, message: "Missing signature header" };
  }
  if (!webhookSecret) {
    logger.error("[PaymentService Webhook] Webhook secret is not configured in environment");
    return { statusCode: 500, success: false, message: "Webhook secret not configured" };
  }

  let isValid = false;
  try {
    isValid = Razorpay.validateWebhookSignature(rawPayload, signature, webhookSecret);
  } catch (err) {
    logger.warn({ err: err.message }, "[PaymentService Webhook] Error during signature validation");
    return { statusCode: 400, success: false, message: "Invalid signature" };
  }
  if (!isValid) {
    logger.warn("[PaymentService Webhook] Webhook signature verification failed");
    return { statusCode: 400, success: false, message: "Invalid signature" };
  }

  const eventPayload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  const eventType = eventPayload.event;
  const eventId = eventHeaders["x-razorpay-event-id"] || eventPayload.event_id || `evt_${Date.now()}`;
  const paymentEntity = eventPayload.payload?.payment?.entity;

  logger.info({ event: eventType, eventId }, "[PaymentService Webhook] Processing authenticated webhook event");

  if (!["payment.captured", "order.paid", "payment.failed"].includes(eventType)) {
    return { statusCode: 200, status: "ignored", message: `Event '${eventType}' not handled` };
  }
  if (!paymentEntity) {
    return { statusCode: 400, success: false, message: "Missing payment entity in payload" };
  }

  const paymentId = cleanString(paymentEntity.id);
  const orderId = cleanString(paymentEntity.order_id);
  const notesBookingId = cleanString(paymentEntity.notes?.bookingId);
  if (!paymentId) {
    return { statusCode: 400, success: false, message: "Invalid payment ID in payload" };
  }

  const { orderRecord, booking } = await findOrderForWebhook(orderId, mongoose.Types.ObjectId.isValid(notesBookingId) ? notesBookingId : null);
  if (!orderRecord || !booking) {
    logger.error({ paymentId, orderId }, "[PaymentService Webhook] No booking order found for this payment");
    return { statusCode: 404, success: false, message: "Associated booking not found" };
  }

  // ─── payment.failed: record it, never cancel (customer can retry) ─────
  if (eventType === "payment.failed") {
    await Payment.findOneAndUpdate(
      { transactionId: `FAILED-${paymentId}` },
      {
        $set: {
          booking: booking._id,
          user: booking.user,
          amount: orderRecord.amount,
          status: "Failure",
          paymentMethod: "Razorpay",
          transactionId: `FAILED-${paymentId}`,
          razorpayOrderId: orderId,
          failureReason: cleanString(paymentEntity.error_description) || "Payment failed at gateway",
          webhookEventId: eventId,
          webhookProcessedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );
    return { statusCode: 200, status: "ok", message: "Payment failure recorded" };
  }

  // ─── payment.captured / order.paid ─────────────────────────────────────
  const result = await settleGenuinePayment({
    booking,
    orderRecord,
    paymentId,
    amountPaise: Number(paymentEntity.amount) || null,
    extra: { razorpayOrderId: orderId, webhookEventId: eventId, webhookProcessedAt: new Date() }
  });

  logger.info({ bookingId: booking._id, paymentId, outcome: result.outcome }, "[PaymentService Webhook] Captured payment processed");
  return { statusCode: 200, status: "ok", message: `Payment ${result.outcome}` };
};

module.exports = {
  createOrder,
  verifyPayment,
  refundPayment,
  getPaymentStatus,
  processWebhook
};
