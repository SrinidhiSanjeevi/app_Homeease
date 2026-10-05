const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

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
  name: 'homeease_booking_requests_total',
  help: 'Total number of booking requests received',
  labelNames: ['serviceType'],
  registers: [register]
});

const bookingsConfirmed = new client.Counter({
  name: 'homeease_bookings_confirmed_total',
  help: 'Total number of bookings confirmed',
  registers: [register]
});

const bookingsCancelled = new client.Counter({
  name: 'homeease_bookings_cancelled_total',
  help: 'Total number of bookings cancelled',
  registers: [register]
});

const bookingsCompleted = new client.Counter({
  name: 'homeease_bookings_completed_total',
  help: 'Total number of bookings completed successfully',
  registers: [register]
});

// ─── Payment Counters ─────────────────────────────────────────────────────────
const paymentSuccess = new client.Counter({
  name: 'homeease_payment_success_total',
  help: 'Total number of successful payments',
  registers: [register]
});

const paymentFailures = new client.Counter({
  name: 'homeease_payment_failures_total',
  help: 'Total number of failed payments',
  registers: [register]
});

const paymentRefunded = new client.Counter({
  name: 'homeease_payment_refunded_total',
  help: 'Total number of payments refunded due to booking cancellation',
  registers: [register]
});

// ─── Notification Counters ────────────────────────────────────────────────────
const notificationSuccess = new client.Counter({
  name: 'homeease_notification_success_total',
  help: 'Total number of notifications sent successfully',
  registers: [register]
});

const notificationFailures = new client.Counter({
  name: 'homeease_notification_failures_total',
  help: 'Total number of failed notifications',
  registers: [register]
});

const activeBookings = new client.Gauge({
  name: 'homeease_active_bookings',
  help: 'Bookings in status Created, Assigned or Confirmed (DB count)',
  registers: [register]
});

const queueLength = new client.Gauge({
  name: 'homeease_queue_length',
  help: 'createBooking requests currently in flight on this pod (not the assignment backlog)',
  registers: [register]
});

// ─── Histograms ───────────────────────────────────────────────────────────────
const professionalAssignmentTime = new client.Histogram({
  name: 'homeease_professional_assignment_time_seconds',
  help: 'Time from booking creation until a professional is assigned (seconds)',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 5, 30, 60, 300, 900, 1800, 3600, 7200, 21600],
  registers: [register]
});

const averageBookingLatency = new client.Histogram({
  name: 'homeease_booking_latency_seconds',
  help: 'End-to-end latency of a booking from creation to completion (seconds)',
  buckets: [3600, 10800, 21600, 43200, 86400, 172800, 345600, 604800, 1209600],
  registers: [register]
});

const totalServicesGauge = new client.Gauge({
  name: 'homeease_total_services',
  help: 'Total number of service offerings in the catalog',
  registers: [register]
});

const totalProfessionalsGauge = new client.Gauge({
  name: 'homeease_total_professionals',
  help: 'Total number of registered professionals',
  registers: [register]
});

const availableProfessionalsGauge = new client.Gauge({
  name: 'homeease_available_professionals',
  help: 'Number of professionals currently available',
  registers: [register]
});

const busyProfessionalsGauge = new client.Gauge({
  name: 'homeease_busy_professionals',
  help: 'Number of professionals currently busy',
  registers: [register]
});

const totalBookingsGauge = new client.Gauge({
  name: 'homeease_total_bookings',
  help: 'Total number of bookings ever created',
  registers: [register]
});

const bookingsByStatusGauge = new client.Gauge({
  name: 'homeease_bookings_by_status',
  help: 'Current count of bookings grouped by status',
  labelNames: ['status'],
  registers: [register]
});

const totalRevenueGauge = new client.Gauge({
  name: 'homeease_total_revenue',
  help: 'Total revenue from confirmed and completed bookings',
  registers: [register]
});

const totalUsersGauge = new client.Gauge({
  name: 'homeease_total_users',
  help: 'Total number of registered customer users',
  registers: [register]
});

const totalEmergenciesGauge = new client.Gauge({
  name: 'homeease_total_emergencies',
  help: 'Total number of emergency requests ever created',
  registers: [register]
});

// ─── Emergency Metrics ─────────────────────────────────────────────────────────
const activeEmergenciesGauge = new client.Gauge({
  name: 'homeease_active_emergencies',
  help: 'Number of emergency requests currently active (not Resolved or Cancelled)',
  registers: [register]
});

const emergencyRequestsTotal = new client.Counter({
  name: 'homeease_emergency_requests_total',
  help: 'Total number of emergency requests dispatched',
  labelNames: ['category', 'severity'],
  registers: [register]
});

const emergencyRequestsCancelledTotal = new client.Counter({
  name: 'homeease_emergency_requests_cancelled_total',
  help: 'Total number of emergency requests cancelled by the user',
  registers: [register]
});

const emergencyRequestsCompletedTotal = new client.Counter({
  name: 'homeease_emergency_requests_completed_total',
  help: 'Total number of emergency requests resolved/completed',
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
  paymentRefunded,
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
  totalEmergenciesGauge,
  activeEmergenciesGauge,
  emergencyRequestsTotal,
  emergencyRequestsCancelledTotal,
  emergencyRequestsCompletedTotal
};