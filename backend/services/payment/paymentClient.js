/**
 * Payment Service HTTP Client Adapter
 *
 * Exclusively handles network communication between Customer API and Payment Service.
 * Contains NO business logic.
 */

const AppError = require("../../utils/AppError");
const logger = require("../../utils/logger");

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || "http://127.0.0.1:5002";
const DEFAULT_TIMEOUT_MS = parseInt(process.env.PAYMENT_SERVICE_TIMEOUT_MS || "5000", 10);

async function makeRequest(path, options = {}) {
  const url = `${PAYMENT_SERVICE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(options.timeout || DEFAULT_TIMEOUT_MS)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new AppError(data.message || `Payment service error (${response.status})`, response.status);
      error.isOperational = true;
      throw error;
    }

    return data;
  } catch (err) {
    if (err.isOperational) {
      throw err;
    }
    const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
    logger.error(
      { err: err.message, url, isTimeout },
      "[PaymentClient] Connection error communicating with Payment Service"
    );
    const networkError = new AppError(
      isTimeout ? "Payment service request timed out" : "Payment service is temporarily unavailable",
      503
    );
    networkError.isOperational = true;
    throw networkError;
  }
}

const createOrder = async ({ bookingId, userId }) => {
  return makeRequest("/api/payments/order", {
    method: "POST",
    body: JSON.stringify({ bookingId, userId })
  });
};

const verifyPayment = async ({
  bookingId,
  userId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature
}) => {
  return makeRequest("/api/payments/verify", {
    method: "POST",
    body: JSON.stringify({
      bookingId,
      userId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    })
  });
};

const refundPayment = async (bookingId) => {
  try {
    const res = await makeRequest("/api/payments/refund", {
      method: "POST",
      body: JSON.stringify({ bookingId })
    });
    return res.refund || res;
  } catch (err) {
    logger.error({ err: err.message, bookingId }, "[PaymentClient] Refund error from Payment Service");
    return null;
  }
};

const getPaymentStatus = async ({ bookingId, transactionId }) => {
  const params = new URLSearchParams();
  if (bookingId) params.append("bookingId", bookingId);
  if (transactionId) params.append("transactionId", transactionId);

  return makeRequest(`/api/payments/status?${params.toString()}`, {
    method: "GET"
  });
};

const processWebhook = async ({ rawPayload, signature, webhookSecret, eventHeaders = {} }) => {
  const url = `${PAYMENT_SERVICE_URL}/api/payments/webhook`;
  const headers = {
    "Content-Type": "application/json",
    "x-razorpay-signature": signature || "",
    ...eventHeaders
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });

    const data = await response.json().catch(() => ({}));
    return {
      statusCode: response.status,
      ...data
    };
  } catch (err) {
    const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
    logger.error({ err: err.message, isTimeout }, "[PaymentClient] Failed forwarding webhook to Payment Service");
    return {
      statusCode: 503,
      success: false,
      message: isTimeout
        ? "Payment Service webhook request timed out"
        : "Payment Service unreachable for webhook delivery"
    };
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  refundPayment,
  getPaymentStatus,
  processWebhook
};
