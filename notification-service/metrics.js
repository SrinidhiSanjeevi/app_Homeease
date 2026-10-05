const client = require("prom-client");

// Dedicated Registry for notification-service
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

// ─── Notification Counters ────────────────────────────────────────────────────
const notificationSuccess = new client.Counter({
  name: "homeease_notification_success_total",
  help: "Total number of notifications sent successfully",
  registers: [register]
});

const notificationFailures = new client.Counter({
  name: "homeease_notification_failures_total",
  help: "Total number of failed notifications",
  registers: [register]
});

module.exports = {
  client,
  register,
  httpRequestDurationSeconds,
  httpRequestsTotal,
  httpRequestsInFlight,
  notificationSuccess,
  notificationFailures
};
