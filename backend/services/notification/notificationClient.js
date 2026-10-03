const AppError = require("../../utils/AppError");
const logger = require("../../utils/logger");

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || "http://127.0.0.1:5003";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.NOTIFICATION_SERVICE_TIMEOUT_MS || "5000", 10);
// Shared secret with notification-service (middleware/internalAuth.js).
const INTERNAL_TOKEN = (process.env.INTERNAL_SERVICE_TOKEN || "").trim();

async function makeRequest(path, options = {}) {
  const url = `${NOTIFICATION_SERVICE_URL}${path}`;
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
      const error = new AppError(data.message || `Notification service error (${response.status})`, response.status);
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
      "[NotificationClient] Connection error communicating with Notification Service"
    );
    const networkError = new AppError(
      isTimeout ? "Notification service request timed out" : "Notification service is temporarily unavailable",
      503
    );
    networkError.isOperational = true;
    throw networkError;
  }
}

const dispatch = async ({ type, bookingId, userId, recipientEmail, recipientName }) => {
  return makeRequest("/api/internal/notifications/dispatch", {
    method: "POST",
    body: JSON.stringify({ type, bookingId, userId, recipientEmail, recipientName })
  });
};

const getNotificationsForBooking = async (bookingId) => {
  return makeRequest(`/api/internal/notifications/booking/${bookingId}`, {
    method: "GET"
  });
};

module.exports = {
  dispatch,
  getNotificationsForBooking
};
