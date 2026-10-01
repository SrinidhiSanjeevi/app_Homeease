const Service = require("../models/Service");
const Professional = require("../models/Professional");
const Booking = require("../models/Booking");
const User = require("../models/User");
const EmergencyRequest = require("../models/EmergencyRequest");
const metrics = require("../metrics");
const logger = require("../utils/logger");

const POLL_INTERVAL_MS = 30000;
const BOOKING_STATUSES = ["Created", "Assigned", "Confirmed", "Completed", "Cancelled"];

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
      User.countDocuments({ role: "user" }),
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

    logger.info("[metricsCollector] DB-truth gauges refreshed");
  } catch (error) {
    logger.error({ err: error.message }, "[metricsCollector] Failed to refresh DB metrics");
  }
}

function startMetricsCollector() {
  void collectDbMetrics();
  setInterval(collectDbMetrics, POLL_INTERVAL_MS);
}

module.exports = { startMetricsCollector, collectDbMetrics };