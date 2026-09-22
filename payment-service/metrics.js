const client = require("prom-client");

// Dedicated Registry for payment-service
const register = new client.Registry();

// Collect default Node.js / process metrics
client.collectDefaultMetrics({ register });

// ─── HTTP Metrics (RED triad) ─────────────────────────────────────────────────
const httpRequestDurationSeconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "code"],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10],
  registers: [register]
});

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "code"],
  registers: [register]
});

const httpRequestsInFlight = new client.Gauge({
  name: "http_requests_in_flight",
  help: "Current number of HTTP requests being processed",
  registers: [register]
});

// ─── Payment-Specific Counters ────────────────────────────────────────────────
const paymentOrderCreatedTotal = new client.Counter({
  name: "payment_order_created_total",
  help: "Total number of payment orders created",
  registers: [register]
});

const paymentVerifySuccessTotal = new client.Counter({
  name: "payment_verify_success_total",
  help: "Total number of payment verifications succeeded",
  registers: [register]
});

const paymentVerifyFailedTotal = new client.Counter({
  name: "payment_verify_failed_total",
  help: "Total number of payment verifications failed",
  registers: [register]
});

const paymentRefundTotal = new client.Counter({
  name: "payment_refund_total",
  help: "Total number of payment refunds processed",
  registers: [register]
});

// ─── Payment Latency Histogram ─────────────────────────────────────────────────
// Tracks end-to-end processing time for each payment operation (create_order,
// verify_payment, refund) so we can compute P50/P95/P99 per operation type.
const paymentProcessingDurationSeconds = new client.Histogram({
  name: "payment_processing_duration_seconds",
  help: "Duration of payment operations in seconds",
  labelNames: ["operation"],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register]
});

module.exports = {
  client,
  register,
  httpRequestDurationSeconds,
  httpRequestsTotal,
  httpRequestsInFlight,
  paymentOrderCreatedTotal,
  paymentVerifySuccessTotal,
  paymentVerifyFailedTotal,
  paymentRefundTotal,
  paymentProcessingDurationSeconds,
  // Legacy snake_case aliases kept for backward compat with any direct imports
  payment_order_created_total: paymentOrderCreatedTotal,
  payment_verify_success_total: paymentVerifySuccessTotal,
  payment_verify_failed_total: paymentVerifyFailedTotal,
  payment_refund_total: paymentRefundTotal
};
