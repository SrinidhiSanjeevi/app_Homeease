const paymentClient = require("../services/payment/paymentClient");
const logger = require("../utils/logger");

// ============================================================
// CREATE RAZORPAY ORDER (HTTP Handler)
// ============================================================
const createOrder = async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const orderData = await paymentClient.createOrder({
      bookingId,
      userId: req.user._id
    });

    return res.status(200).json({
      success: true,
      ...orderData
    });
  } catch (error) {
    if (error.isOperational) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    logger.error({ err: error.message }, "Razorpay create order error");
    return res.status(500).json({ success: false, message: "Could not create payment order" });
  }
};

// ============================================================
// VERIFY RAZORPAY PAYMENT (HTTP Handler)
// ============================================================
const verifyPayment = async (req, res) => {
  try {
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const result = await paymentClient.verifyPayment({
      bookingId,
      userId: req.user._id,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature
    });

    return res.status(result.isValid ? 200 : 400).json({
      success: result.isValid,
      booking: result.booking,
      payment: result.payment
    });
  } catch (error) {
    if (error.isOperational) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    logger.error({ err: error.message }, "Razorpay verify error");
    return res.status(500).json({ success: false, message: "Payment verification failed" });
  }
};

// ============================================================
// REFUND PAYMENT (Delegator for backward compatibility)
// ============================================================
const refundPayment = async (bookingId) => {
  return paymentClient.refundPayment(bookingId);
};

// ============================================================
// HANDLE RAZORPAY WEBHOOK (HTTP Handler)
// ============================================================
const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    const rawPayload = req.rawBody
      ? req.rawBody.toString("utf8")
      : (typeof req.body === "string" ? req.body : JSON.stringify(req.body));

    const { statusCode, ...responseBody } = await paymentClient.processWebhook({
      rawPayload,
      signature,
      webhookSecret,
      eventHeaders: req.headers
    });

    return res.status(statusCode).json(responseBody);
  } catch (error) {
    logger.error({ err: error.message }, "[Razorpay Webhook] Webhook processing error");
    return res.status(500).json({ success: false, message: "Webhook processing error" });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  refundPayment,
  handleWebhook
};