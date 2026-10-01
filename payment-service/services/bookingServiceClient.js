const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || "http://127.0.0.1:5000";
const DEFAULT_TIMEOUT_MS = parseInt(process.env.BOOKING_SERVICE_TIMEOUT_MS || "5000", 10);
// Shared secret with booking-service (middleware/internalAuth.js).
const INTERNAL_TOKEN = (process.env.INTERNAL_SERVICE_TOKEN || "").trim();

// Path segments come from callers (and, transitively, remote data): accept ObjectIds only, then encode.
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const safeId = (id) => {
  const value = String(id);
  if (!OBJECT_ID_RE.test(value)) {
    throw new AppError("Invalid identifier", 400);
  }
  return encodeURIComponent(value);
};

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

const getBooking = async (bookingId) => makeRequest(`/api/internal/bookings/${safeId(bookingId)}`, { method: "GET" });

const settlePayment = async (bookingId, body) => {
  try {
    const data = await makeRequest(`/api/internal/bookings/${safeId(bookingId)}/settle-payment`, {
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
