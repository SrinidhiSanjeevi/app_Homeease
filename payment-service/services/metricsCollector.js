const Payment = require("../models/Payment");
const metrics = require("../metrics");
const logger = require("../utils/logger");

const POLL_INTERVAL_MS = 30000;
const STATUSES = ["Pending", "Success", "Failure", "Refunded", "Partially Refunded"];

// Reads the real payment history from MongoDB so dashboards show true totals, not "since the pod started".
async function collectDbMetrics() {
  try {
    const rows = await Payment.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" }, last: { $max: "$createdAt" } } }
    ]);
    const byStatus = new Map(rows.map((r) => [r._id, r]));
    for (const status of STATUSES) {
      const row = byStatus.get(status);
      metrics.paymentRecordsByStatus.labels(status).set(row ? row.count : 0);
      metrics.paymentAmountByStatus.labels(status).set(row ? row.amount : 0);
      metrics.paymentLastRecordTimestamp.labels(status).set(row && row.last ? Math.floor(row.last.getTime() / 1000) : 0);
    }
    logger.info("[metricsCollector] DB-truth payment gauges refreshed");
  } catch (error) {
    logger.error({ err: error.message }, "[metricsCollector] Failed to refresh payment metrics");
  }
}

function startMetricsCollector() {
  void collectDbMetrics();
  const timer = setInterval(collectDbMetrics, POLL_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = { startMetricsCollector, collectDbMetrics, STATUSES };
