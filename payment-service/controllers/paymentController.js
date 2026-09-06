const paymentService = require("../services/paymentService");
const logger = require("../utils/logger");
const metrics = require("../metrics");

const createOrder = async (req, res) => {
  try {
    const { bookingId, userId } = req.body;
    if (!bookingId || !userId) {
      return res.status(400).json({ success: false, message: "bookingId and userId are required" });
    }

    const orderData = await paymentService.createOrder({ bookingId, userId });
    metrics.paymentOrderCreatedTotal.inc();
    return res.status(200).json({ success: true, ...orderData });
  } catch (error) {
    if (error.isOperational) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    logger.error({ err: error.message }, "Payment Service createOrder error");
    return res.status(500).json({ success: false, message: "Could not create payment order" });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const {
      bookingId,
      userId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const finalOrderId = razorpayOrderId || razorpay_order_id;
    const finalPaymentId = razorpayPaymentId || razorpay_payment_id;
    const finalSignature = razorpaySignature || razorpay_signature;

    if (!bookingId || !userId || !finalOrderId || !finalPaymentId || !finalSignature) {
      return res.status(400).json({ success: false, message: "All payment verification fields are required" });
    }

    const result = await paymentService.verifyPayment({
      bookingId,
      userId,
      razorpayOrderId: finalOrderId,
      razorpayPaymentId: finalPaymentId,
      razorpaySignature: finalSignature
    });

    if (result.isValid) {
      metrics.paymentVerifySuccessTotal.inc();
    } else {
      metrics.paymentVerifyFailedTotal.inc();
    }

    return res.status(result.isValid ? 200 : 400).json({
      success: result.isValid,
      booking: result.booking,
      payment: result.payment
    });
  } catch (error) {
    if (error.isOperational) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    logger.error({ err: error.message }, "Payment Service verifyPayment error");
    return res.status(500).json({ success: false, message: "Payment verification failed" });
  }
};

const refundPayment = async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) {
      return res.status(400).json({ success: false, message: "bookingId is required" });
    }

    const refund = await paymentService.refundPayment(bookingId);
    if (!refund) {
      return res.status(404).json({ success: false, message: "Refund could not be processed or no eligible payment" });
    }

    metrics.paymentRefundTotal.inc();
    return res.status(200).json({ success: true, refund });
  } catch (error) {
    logger.error({ err: error.message }, "Payment Service refundPayment error");
    return res.status(500).json({ success: false, message: "Refund processing error" });
  }
};

const getStatus = async (req, res) => {
  try {
    const { bookingId, transactionId } = req.query;
    const payment = await paymentService.getPaymentStatus({ bookingId, transactionId });
    return res.status(200).json({ success: true, payment });
  } catch (error) {
    if (error.isOperational) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    logger.error({ err: error.message }, "Payment Service getStatus error");
    return res.status(500).json({ success: false, message: "Could not retrieve payment status" });
  }
};

const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    const rawPayload = req.rawBody
      ? req.rawBody.toString("utf8")
      : (typeof req.body === "string" ? req.body : JSON.stringify(req.body));

    const { statusCode, ...responseBody } = await paymentService.processWebhook({
      rawPayload,
      signature,
      webhookSecret,
      eventHeaders: req.headers
    });

    return res.status(statusCode).json(responseBody);
  } catch (error) {
    logger.error({ err: error.message }, "[Payment Service] Webhook processing error");
    return res.status(500).json({ success: false, message: "Webhook processing error" });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  refundPayment,
  getStatus,
  handleWebhook
};
