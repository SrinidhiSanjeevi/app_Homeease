const Service = require("../models/Service");
const Professional = require("../models/Professional");
const Booking = require("../models/Booking");
const User = require("../models/User");
const EmergencyRequest = require("../models/EmergencyRequest");
const metrics = require("../metrics");
const logger = require("../utils/logger");

const POLL_INTERVAL_MS = 30000;
// On AWS nothing scrapes /metrics (no Prometheus), so the same DB-truth numbers
// are also written as CloudWatch Embedded Metric Format lines on stdout; the
// awslogs driver ships them and CloudWatch turns them into metrics. Off by
// default so the Prometheus path (AKS) is unchanged.
const EMF_ENABLED = process.env.CLOUDWATCH_EMF_ENABLED === "true";
const EMF_NAMESPACE = process.env.CLOUDWATCH_METRICS_NAMESPACE || "HomeEase";
const BOOKING_STATUSES = ["Created", "Assigned", "Confirmed", "Completed", "Cancelled"];

function emitEmf(dimensions, values) {
  const emf = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: EMF_NAMESPACE,
          Dimensions: [Object.keys(dimensions)],
          Metrics: Object.keys(values).map((name) => ({ Name: name, Unit: "Count" }))
        }
      ]
    },
    ...dimensions,
    ...values
  };
  process.stdout.write(`${JSON.stringify(emf)}\n`);
}

function emitCloudWatchMetrics({ totals, byStatus }) {
  emitEmf({ Scope: "totals" }, totals);
  BOOKING_STATUSES.forEach((status, i) => {
    emitEmf({ Scope: "bookings", Status: status }, { Bookings: byStatus[i] });
  });
}

async function collectDbMetrics() {
  try {
    const [
      totalServices,
      totalProfessionals,
      availableProfessionals,
      busyProfessionals,
      totalBookings,
      totalUsers,
      totalEmergencies,
      activeEmergencies,
      revenueAgg,
      ...statusCounts
    ] = await Promise.all([
      Service.countDocuments(),
      Professional.countDocuments(),
      Professional.countDocuments({ status: "Available" }),
      Professional.countDocuments({ status: "Busy" }),
      Booking.countDocuments(),
      User.countDocuments({ role: "user", active: { $ne: false } }),
      EmergencyRequest.countDocuments(),
      EmergencyRequest.countDocuments({ status: { $nin: ["Resolved", "Cancelled"] } }),
      Booking.aggregate([
        { $match: { paymentStatus: { $in: ["Paid", "Paid (Cash Collected)", "Partially Refunded"] } } },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $cond: [{ $eq: ["$paymentStatus", "Partially Refunded"] }, { $ifNull: ["$cancellationFee", 0] }, "$totalPrice"]
              }
            }
          }
        }
      ]),
      ...BOOKING_STATUSES.map((status) => Booking.countDocuments({ status }))
    ]);

    metrics.totalServicesGauge.set(totalServices);
    metrics.totalProfessionalsGauge.set(totalProfessionals);
    metrics.availableProfessionalsGauge.set(availableProfessionals);
    metrics.busyProfessionalsGauge.set(busyProfessionals);
    metrics.totalBookingsGauge.set(totalBookings);
    metrics.totalUsersGauge.set(totalUsers);
    metrics.totalEmergenciesGauge.set(totalEmergencies);
    metrics.activeEmergenciesGauge.set(activeEmergencies);
    metrics.totalRevenueGauge.set(revenueAgg.length > 0 ? revenueAgg[0].total : 0);

    BOOKING_STATUSES.forEach((status, i) => {
      metrics.bookingsByStatusGauge.labels(status).set(statusCounts[i]);
    });
    const activeStatuses = ["Created", "Assigned", "Confirmed"];
    metrics.activeBookings.set(
      BOOKING_STATUSES.reduce((sum, status, i) => (activeStatuses.includes(status) ? sum + statusCounts[i] : sum), 0)
    );

    if (EMF_ENABLED) {
      emitCloudWatchMetrics({
        totals: {
          TotalBookings: totalBookings,
          TotalUsers: totalUsers,
          TotalServices: totalServices,
          TotalProfessionals: totalProfessionals,
          AvailableProfessionals: availableProfessionals,
          ActiveEmergencies: activeEmergencies,
          TotalEmergencies: totalEmergencies,
          Revenue: revenueAgg.length > 0 ? revenueAgg[0].total : 0,
          // Same definition as the admin dashboard: Created + Assigned.
          PendingBookings: statusCounts[0] + statusCounts[1]
        },
        byStatus: statusCounts
      });
    }

    logger.info("[metricsCollector] DB-truth gauges refreshed");
  } catch (error) {
    logger.error({ err: error.message }, "[metricsCollector] Failed to refresh DB metrics");
  }
}

function startMetricsCollector() {
  void collectDbMetrics();
  setInterval(collectDbMetrics, POLL_INTERVAL_MS);
}

module.exports = { startMetricsCollector, collectDbMetrics, emitCloudWatchMetrics };