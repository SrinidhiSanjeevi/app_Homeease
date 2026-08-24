const client = require('prom-client');

// Dedicated Registry for admin-backend
const register = new client.Registry();

// Collect default metrics (CPU, Memory, Heap, GC, etc.)
client.collectDefaultMetrics({ register });

// ─── HTTP Metrics ─────────────────────────────────────────────────────────────
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

// ─── MongoDB Query Metrics ────────────────────────────────────────────────────
const mongodbQueryDurationSeconds = new client.Histogram({
  name: 'mongodb_query_duration_seconds',
  help: 'Duration of MongoDB queries in seconds',
  labelNames: ['collection', 'op'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register]
});

const mongodbQueryErrorsTotal = new client.Counter({
  name: 'mongodb_query_errors_total',
  help: 'Total number of MongoDB query errors',
  labelNames: ['collection', 'op'],
  registers: [register]
});

const mongodbConnectionState = new client.Gauge({
  name: 'mongodb_connection_state',
  help: 'Current MongoDB connection status (1 = connected, 0 = disconnected)',
  registers: [register]
});

const mongodbDocumentsTotal = new client.Gauge({
  name: 'mongodb_documents_total',
  help: 'Total count of documents in scoped collection',
  labelNames: ['collection'],
  registers: [register]
});

module.exports = {
  client,
  register,
  httpRequestDurationSeconds,
  httpRequestsTotal,
  httpRequestsInFlight,
  mongodbQueryDurationSeconds,
  mongodbQueryErrorsTotal,
  mongodbConnectionState,
  mongodbDocumentsTotal
};