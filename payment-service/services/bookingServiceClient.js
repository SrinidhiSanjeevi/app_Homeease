/**
 * Booking Service HTTP Client Adapter
 *
 * Exclusively handles network communication between Payment Service and
 * Booking Service (today's `backend`). Contains NO business logic — that
 * stays in services/paymentService.js.
 *
 * Modeled exactly on admin-backend/services/bookingServiceClient.js /
 * backend/services/payment/paymentClient.js.
 */

const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || "http://127.0.0.1:5000";
const DEFAULT_TIMEOUT_MS = parseInt(process.env.BOOKING_SERVICE_TIMEOUT_MS || "5000", 10);
// Shared secret with booking-service (middleware/internalAuth.js).
const INTERNAL_TOKEN = (process.env.INTERNAL_SERVICE_TOKEN || "").trim();

async function makeRequest(path, options = {}) {
  const url = `${BOOKING_SERVICE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(INTERNAL_TOKEN ? { "X-Internal-Token": INTERNAL_TOKEN } : {}),
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
      const error = new AppError(data.message || `Booking service error (${response.status})`, response.status);
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
      "[BookingServiceClient] Connection error communicating with Booking Service"
    );
    const networkError = new AppError(
      isTimeout ? "Booking service request timed out" : "Booking service is temporarily unavailable",
      503
    );
    networkError.isOperational = true;
    throw networkError;
  }
}

// GET /api/internal/bookings/:id — minimal projection. Throws a 404
// AppError (via makeRequest) when the booking doesn't exist, same as a
// local Booking.findById returning null used to be handled by callers.
const getBooking = async (bookingId) => makeRequest(`/api/internal/bookings/${bookingId}`, { method: "GET" });

// POST /api/internal/bookings/:id/settle-payment — atomic conditional
// update. A 409 conflict (the booking wasn't in the expected pre-settlement
// state) is an ordinary, expected outcome here — not an error — so it's
// translated into { settled: false } instead of being thrown, letting
// settleGenuinePayment's existing "fall through to refund" logic keep
// working unchanged. Any other failure (timeout, 5xx, etc.) still throws.
const settlePayment = async (bookingId, body) => {
  try {
    const data = await makeRequest(`/api/internal/bookings/${bookingId}/settle-payment`, {
      method: "POST",
      body: JSON.stringify(body)
    });
    return { settled: true, booking: data.booking };
  } catch (err) {
    if (err.isOperational && err.statusCode === 409) {
      return { settled: false, booking: null };
    }
    throw err;
  }
};

module.exports = {
  getBooking,
  settlePayment
};
