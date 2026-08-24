const client = require('prom-client');

// Dedicated Registry — matches admin-backend's pattern, keeps this
// service's metrics isolated from anything else that might register
// into the default global registry.
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// ─── HTTP Metrics (RED method) ────────────────────────────────────────────────
// Previously missing entirely from backend despite admin-backend having
// them — every service should expose baseline Rate/Errors/Duration
// regardless of its business logic.
const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10],
  registers: [register]
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'code'],
  registers: [register]
});

const httpRequestsInFlight = new client.Gauge({
  name: 'http_requests_in_flight',
  help: 'Current number of HTTP requests being processed',
  registers: [register]
});

// ─── Booking Counters ─────────────────────────────────────────────────────────
const totalBookingRequests = new client.Counter({
  name: 'serviceexpress_booking_requests_total',
  help: 'Total number of booking requests received',
  labelNames: ['serviceType'],
  registers: [register]
});

const bookingsConfirmed = new client.Counter({
  name: 'serviceexpress_bookings_confirmed_total',
  help: 'Total number of bookings confirmed',
  registers: [register]
});

const bookingsCancelled = new client.Counter({
  name: 'serviceexpress_bookings_cancelled_total',
  help: 'Total number of bookings cancelled',
  registers: [register]
});

const bookingsCompleted = new client.Counter({
  name: 'serviceexpress_bookings_completed_total',
  help: 'Total number of bookings completed successfully',
  registers: [register]
});

// ─── Payment Counters ─────────────────────────────────────────────────────────
const paymentSuccess = new client.Counter({
  name: 'serviceexpress_payment_success_total',
  help: 'Total number of successful payments',
  registers: [register]
});

const paymentFailures = new client.Counter({
  name: 'serviceexpress_payment_failures_total',
  help: 'Total number of failed payments',
  registers: [register]
});

// ─── Notification Counters ────────────────────────────────────────────────────
const notificationSuccess = new client.Counter({
  name: 'serviceexpress_notification_success_total',
  help: 'Total number of notifications sent successfully',
  registers: [register]
});

const notificationFailures = new client.Counter({
  name: 'serviceexpress_notification_failures_total',
  help: 'Total number of failed notifications',
  registers: [register]
});

// ─── Live Gauges (in-process, per-pod — correct to duplicate across replicas) ─
const activeBookings = new client.Gauge({
  name: 'serviceexpress_active_bookings',
  help: 'Number of currently active bookings',
  registers: [register]
});

const queueLength = new client.Gauge({
  name: 'serviceexpress_queue_length',
  help: 'Current number of bookings waiting in queue for professional assignment',
  registers: [register]
});

// ─── Histograms ───────────────────────────────────────────────────────────────
const professionalAssignmentTime = new client.Histogram({
  name: 'serviceexpress_professional_assignment_time_seconds',
  help: 'Time taken to assign a professional to a booking (seconds)',
  buckets: [1, 2, 5, 10, 20, 30, 60],
  registers: [register]
});

const averageBookingLatency = new client.Histogram({
  name: 'serviceexpress_booking_latency_seconds',
  help: 'End-to-end latency of a booking from creation to completion (seconds)',
  buckets: [60, 300, 600, 1800, 3600, 7200, 14400],
  registers: [register]
});

// ─── DB-truth Gauges ───────────────────────────────────────────────────────────
// NOTE: these are only ever set by metricsCollector.js, which only runs
// inside the dedicated single-replica metrics-exporter process — never
// inside the scaled backend/admin-backend API pods. That's what keeps
// these values single-sourced instead of duplicated across HPA replicas.
const totalServicesGauge = new client.Gauge({
  name: 'serviceexpress_total_services',
  help: 'Total number of service offerings in the catalog',
  registers: [register]
});

const totalProfessionalsGauge = new client.Gauge({
  name: 'serviceexpress_total_professionals',
  help: 'Total number of registered professionals',
  registers: [register]
});

const availableProfessionalsGauge = new client.Gauge({
  name: 'serviceexpress_available_professionals',
  help: 'Number of professionals currently available',
  registers: [register]
});

const busyProfessionalsGauge = new client.Gauge({
  name: 'serviceexpress_busy_professionals',
  help: 'Number of professionals currently busy',
  registers: [register]
});

const totalBookingsGauge = new client.Gauge({
  name: 'serviceexpress_total_bookings',
  help: 'Total number of bookings ever created',
  registers: [register]
});

const bookingsByStatusGauge = new client.Gauge({
  name: 'serviceexpress_bookings_by_status',
  help: 'Current count of bookings grouped by status',
  labelNames: ['status'],
  registers: [register]
});

const totalRevenueGauge = new client.Gauge({
  name: 'serviceexpress_total_revenue',
  help: 'Total revenue from confirmed and completed bookings',
  registers: [register]
});

const totalUsersGauge = new client.Gauge({
  name: 'serviceexpress_total_users',
  help: 'Total number of registered customer users',
  registers: [register]
});

const totalEmergenciesGauge = new client.Gauge({
  name: 'serviceexpress_total_emergencies',
  help: 'Total number of emergency requests ever created',
  registers: [register]
});

module.exports = {
  client,
  register,
  httpRequestDurationSeconds,
  httpRequestsTotal,
  httpRequestsInFlight,
  totalBookingRequests,
  bookingsConfirmed,
  bookingsCancelled,
  bookingsCompleted,
  paymentSuccess,
  paymentFailures,
  notificationSuccess,
  notificationFailures,
  activeBookings,
  queueLength,
  professionalAssignmentTime,
  averageBookingLatency,
  totalServicesGauge,
  totalProfessionalsGauge,
  availableProfessionalsGauge,
  busyProfessionalsGauge,
  totalBookingsGauge,
  bookingsByStatusGauge,
  totalRevenueGauge,
  totalUsersGauge,
  totalEmergenciesGauge
};