const crypto = require("crypto");
const Razorpay = require("razorpay");
const razorpay = require("../config/razorpay");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const Professional = require("../models/Professional");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

// ============================================================
// CREATE ORDER
// ============================================================
const createOrder = async ({ bookingId, userId }) => {
  const booking = await Booking.findOne({ _id: bookingId, user: userId });

  if (!booking) {
    throw new AppError("Booking not found", 404);
  }

  if (booking.paymentStatus === "Paid") {
    throw new AppError("This booking is already paid", 400);
  }

  if (booking.status === "Cancelled" || booking.status === "Completed") {
    throw new AppError(`Cannot create payment order for a ${booking.status} booking`, 400);
  }

  const order = await razorpay.orders.create({
    amount: Math.round(booking.totalPrice * 100),
    currency: "INR",
    receipt: `booking_${booking._id}`,
    notes: {
      bookingId: booking._id.toString(),
      userId: userId.toString()
    }
  });

  await Payment.create({
    booking: booking._id,
    user: userId,
    amount: booking.totalPrice,
    status: "Pending",
    paymentMethod: "Razorpay",
    transactionId: `ORDER-${order.id}`,
    razorpayOrderId: order.id
  });

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID || "rzp_placeholder_key"
  };
};

// ============================================================
// VERIFY PAYMENT
// ============================================================
const verifyPayment = async ({
  bookingId,
  userId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature
}) => {
  const booking = await Booking.findById(bookingId);

  if (!booking) {
    throw new AppError("Booking not found", 404);
  }

  if (booking.user.toString() !== userId.toString()) {
    throw new AppError("Unauthorized to verify payment for this booking", 403);
  }

  if (booking.paymentStatus === "Paid") {
    throw new AppError("This booking is already paid", 400);
  }

  if (booking.status === "Cancelled" || booking.status === "Completed") {
    throw new AppError(`Cannot verify payment for a booking with status: ${booking.status}`, 400);
  }

  const existingSuccessfulPayment = await Payment.findOne({
    transactionId: razorpayPaymentId,
    status: "Success"
  });

  if (existingSuccessfulPayment) {
    throw new AppError("This payment has already been verified successfully", 400);
  }

  const secret = process.env.RAZORPAY_KEY_SECRET || "placeholder_secret";
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const isValid = expectedSignature === razorpaySignature;

  const payment = await Payment.create({
    booking: booking._id,
    user: booking.user,
    amount: booking.totalPrice,
    status: isValid ? "Success" : "Failure",
    paymentMethod: "Razorpay",
    transactionId: razorpayPaymentId,
    razorpayOrderId: razorpayOrderId,
    razorpaySignature: razorpaySignature,
    failureReason: isValid ? "" : "Signature verification failed"
  });

  if (isValid) {
    booking.status = booking.professional ? "Confirmed" : "Assigned";
    booking.paymentStatus = "Paid";
  } else {
    booking.status = "Cancelled";
    booking.paymentStatus = "Failed";

    if (booking.professional) {
      await Professional.findByIdAndUpdate(
        booking.professional,
        { status: "Available" }
      );
    }
  }

  await booking.save();

  return { isValid, booking, payment };
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

    return refund;
  } catch (error) {
    logger.error({ err: error.message }, "Razorpay refund error");
    return null;
  }
};

// ============================================================
// GET PAYMENT STATUS
// ============================================================
const getPaymentStatus = async ({ bookingId, transactionId }) => {
  const query = {};
  if (transactionId) {
    query.transactionId = transactionId;
  } else if (bookingId) {
    query.booking = bookingId;
  } else {
    throw new AppError("Either bookingId or transactionId is required", 400);
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

  logger.info({ event: eventType, eventId }, "[PaymentService Webhook] Processing authenticated webhook event");

  // ─── payment.captured / order.paid ───────────────────────────────────────
  if (eventType === "payment.captured" || eventType === "order.paid") {
    const paymentEntity = eventPayload.payload?.payment?.entity;
    if (!paymentEntity) {
      return { statusCode: 400, success: false, message: "Missing payment entity in payload" };
    }

    const paymentId = paymentEntity.id;
    const orderId = paymentEntity.order_id;
    const bookingIdFromNotes = paymentEntity.notes?.bookingId;

    const existingSuccessPayment = await Payment.findOne({
      transactionId: paymentId,
      status: "Success"
    });

    if (existingSuccessPayment) {
      logger.info(
        { paymentId, eventId },
        "[PaymentService Webhook] Payment already processed successfully (idempotent no-op)"
      );
      return { statusCode: 200, status: "ok", message: "Payment already processed" };
    }

    let booking = null;
    if (bookingIdFromNotes) {
      booking = await Booking.findById(bookingIdFromNotes);
    }
    if (!booking && orderId) {
      const pendingPayment = await Payment.findOne({ razorpayOrderId: orderId });
      if (pendingPayment && pendingPayment.booking) {
        booking = await Booking.findById(pendingPayment.booking);
      }
    }

    if (!booking) {
      logger.error(
        { paymentId, orderId, bookingIdFromNotes },
        "[PaymentService Webhook] Associated booking not found for captured payment"
      );
      return { statusCode: 404, success: false, message: "Associated booking not found" };
    }

    if (booking.paymentStatus === "Paid") {
      logger.info(
        { bookingId: booking._id, paymentId },
        "[PaymentService Webhook] Booking already marked Paid; recording payment audit record"
      );

      await Payment.findOneAndUpdate(
        { transactionId: paymentId },
        {
          $set: {
            booking: booking._id,
            user: booking.user,
            amount: (paymentEntity.amount || (booking.totalPrice * 100)) / 100,
            status: "Success",
            paymentMethod: "Razorpay",
            transactionId: paymentId,
            razorpayOrderId: orderId,
            webhookEventId: eventId,
            webhookProcessedAt: new Date()
          }
        },
        { upsert: true, new: true }
      );

      return { statusCode: 200, status: "ok", message: "Booking already paid" };
    }

    await Payment.findOneAndUpdate(
      {
        $or: [
          { transactionId: paymentId },
          { razorpayOrderId: orderId, status: "Pending" }
        ]
      },
      {
        $set: {
          booking: booking._id,
          user: booking.user,
          amount: (paymentEntity.amount || (booking.totalPrice * 100)) / 100,
          status: "Success",
          paymentMethod: "Razorpay",
          transactionId: paymentId,
          razorpayOrderId: orderId,
          webhookEventId: eventId,
          webhookProcessedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    booking.status = booking.professional ? "Confirmed" : "Assigned";
    booking.paymentStatus = "Paid";
    await booking.save();

    logger.info(
      { bookingId: booking._id, paymentId },
      "[PaymentService Webhook] Successfully captured payment and updated booking"
    );

    return { statusCode: 200, status: "ok", message: "Payment captured and booking updated" };
  }

  // ─── payment.failed ───────────────────────────────────────────────────────
  if (eventType === "payment.failed") {
    const paymentEntity = eventPayload.payload?.payment?.entity;
    if (!paymentEntity) {
      return { statusCode: 400, success: false, message: "Missing payment entity in payload" };
    }

    const paymentId = paymentEntity.id;
    const orderId = paymentEntity.order_id;
    const bookingIdFromNotes = paymentEntity.notes?.bookingId;
    const failureReason = paymentEntity.error_description || "Payment failed at gateway";

    let booking = null;
    if (bookingIdFromNotes) {
      booking = await Booking.findById(bookingIdFromNotes);
    }
    if (!booking && orderId) {
      const pendingPayment = await Payment.findOne({ razorpayOrderId: orderId });
      if (pendingPayment && pendingPayment.booking) {
        booking = await Booking.findById(pendingPayment.booking);
      }
    }

    if (!booking) {
      logger.warn(
        { paymentId, orderId },
        "[PaymentService Webhook] Booking not found for failed payment event"
      );
      return { statusCode: 404, success: false, message: "Booking not found" };
    }

    await Payment.findOneAndUpdate(
      { transactionId: paymentId },
      {
        $set: {
          booking: booking._id,
          user: booking.user,
          amount: (paymentEntity.amount || (booking.totalPrice * 100)) / 100,
          status: "Failure",
          paymentMethod: "Razorpay",
          transactionId: paymentId,
          razorpayOrderId: orderId,
          failureReason,
          webhookEventId: eventId,
          webhookProcessedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    booking.status = "Cancelled";
    booking.paymentStatus = "Failed";

    if (booking.professional) {
      await Professional.findByIdAndUpdate(
        booking.professional,
        { status: "Available" }
      );
    }

    await booking.save();

    logger.info(
      { bookingId: booking._id, paymentId },
      "[PaymentService Webhook] Recorded payment failure and cancelled booking"
    );

    return { statusCode: 200, status: "ok", message: "Payment failure processed" };
  }

  logger.info({ eventType, eventId }, "[PaymentService Webhook] Unhandled event acknowledged without changes");
  return { statusCode: 200, status: "ignored", message: `Event '${eventType}' not handled` };
};

module.exports = {
  createOrder,
  verifyPayment,
  refundPayment,
  getPaymentStatus,
  processWebhook
};
