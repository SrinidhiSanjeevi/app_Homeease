const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || "http://127.0.0.1:5000";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.BOOKING_SERVICE_TIMEOUT_MS || "5000", 10);
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

// Build the target URL and refuse anything that would leave the booking service's origin (SSRF guard).
const buildUrl = (path) => {
  const base = new URL(BOOKING_SERVICE_URL);
  let target;
  try {
    target = new URL(`${BOOKING_SERVICE_URL}${path}`);
  } catch (_) {
    throw new AppError("Invalid booking service path", 400);
  }
  if (target.origin !== base.origin) {
    throw new AppError("Invalid booking service path", 400);
  }
  return target.href;
};

async function makeRequest(path, options = {}) {
  const url = buildUrl(path);
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

function toQueryString(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

const getStats = async () => makeRequest("/api/internal/admin/stats", { method: "GET" });

const getAllUsers = async (query) => makeRequest(`/api/internal/admin/users${toQueryString(query)}`, { method: "GET" });

const getUserById = async (id) => makeRequest(`/api/internal/admin/users/${safeId(id)}`, { method: "GET" });

const deleteUser = async (id) => makeRequest(`/api/internal/admin/users/${safeId(id)}`, { method: "DELETE" });

const getAllBookings = async (query) => makeRequest(`/api/internal/admin/bookings${toQueryString(query)}`, { method: "GET" });

const updateBookingStatus = async (id, status) =>
  makeRequest(`/api/internal/admin/bookings/${safeId(id)}/status`, {
    method: "PUT",
    body: JSON.stringify({ status })
  });

const getAllServices = async (query) => makeRequest(`/api/internal/admin/services${toQueryString(query)}`, { method: "GET" });

const createService = async (body) =>
  makeRequest("/api/internal/admin/services", { method: "POST", body: JSON.stringify(body) });

const updateService = async (id, body) =>
  makeRequest(`/api/internal/admin/services/${safeId(id)}`, { method: "PUT", body: JSON.stringify(body) });

const deleteService = async (id) => makeRequest(`/api/internal/admin/services/${safeId(id)}`, { method: "DELETE" });

const getAllProfessionals = async (query) => makeRequest(`/api/internal/admin/professionals${toQueryString(query)}`, { method: "GET" });

const createProfessional = async (body) =>
  makeRequest("/api/internal/admin/professionals", { method: "POST", body: JSON.stringify(body) });

const updateProfessional = async (id, body) =>
  makeRequest(`/api/internal/admin/professionals/${safeId(id)}`, { method: "PUT", body: JSON.stringify(body) });

const deleteProfessional = async (id) => makeRequest(`/api/internal/admin/professionals/${safeId(id)}`, { method: "DELETE" });

const getAllEmergencies = async (query) => makeRequest(`/api/internal/admin/emergencies${toQueryString(query)}`, { method: "GET" });

const updateEmergencyStatus = async (id, status) =>
  makeRequest(`/api/internal/admin/emergencies/${safeId(id)}/status`, {
    method: "PUT",
    body: JSON.stringify({ status })
  });

const getAreas = async () => makeRequest("/api/internal/admin/areas", { method: "GET" });

module.exports = {
  // exported for unit tests
  _buildUrl: buildUrl,
  _safeId: safeId,
  getStats,
  getAllUsers,
  getUserById,
  deleteUser,
  getAllBookings,
  updateBookingStatus,
  getAllServices,
  createService,
  updateService,
  deleteService,
  getAllProfessionals,
  createProfessional,
  updateProfessional,
  deleteProfessional,
  getAllEmergencies,
  updateEmergencyStatus,
  getAreas
};
