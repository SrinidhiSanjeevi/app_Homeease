const Payment = require("../models/Payment");
const metrics = require("../metrics");
const logger = require("../utils/logger");

const POLL_INTERVAL_MS = 30000;
// On AWS nothing scrapes /metrics, so the same DB-backed numbers are also written as
// CloudWatch Embedded Metric Format lines on stdout. Off by default (AKS unchanged).
const EMF_ENABLED = process.env.CLOUDWATCH_EMF_ENABLED === "true";
const EMF_NAMESPACE = process.env.CLOUDWATCH_METRICS_NAMESPACE || "HomeEase";
const STATUSES = ["Pending", "Success", "Failure", "Refunded", "Partially Refunded"];

function emitCloudWatchMetrics(byStatus) {
  for (const status of STATUSES) {
    const row = byStatus.get(status);
    const emf = {
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: EMF_NAMESPACE,
            Dimensions: [["Scope", "Status"]],
            Metrics: [
              { Name: "PaymentRecords", Unit: "Count" },
              { Name: "PaymentAmount", Unit: "None" }
            ]
          }
        ]
      },
      Scope: "payments",
      Status: status,
      PaymentRecords: row ? row.count : 0,
      PaymentAmount: row ? row.amount : 0
    };
    process.stdout.write(`${JSON.stringify(emf)}\n`);
  }
}

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
    if (EMF_ENABLED) emitCloudWatchMetrics(byStatus);
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

module.exports = { startMetricsCollector, collectDbMetrics, emitCloudWatchMetrics, STATUSES };
