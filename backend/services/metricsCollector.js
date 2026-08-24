const Service = require("../models/Service");
const Professional = require("../models/Professional");
const Booking = require("../models/Booking");
const User = require("../models/User");
const EmergencyRequest = require("../models/EmergencyRequest");
const metrics = require("../metrics");

const POLL_INTERVAL_MS = 30000;
const BOOKING_STATUSES = ["Assigned", "Confirmed", "Completed", "Cancelled"];

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
      Booking.aggregate([
        { $match: { status: { $in: ["Confirmed", "Completed"] } } },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } }
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
    metrics.totalRevenueGauge.set(revenueAgg.length > 0 ? revenueAgg[0].total : 0);

    BOOKING_STATUSES.forEach((status, i) => {
      metrics.bookingsByStatusGauge.labels(status).set(statusCounts[i]);
    });

    console.log("[metricsCollector] DB-truth gauges refreshed");
  } catch (error) {
    console.error("[metricsCollector] Failed to refresh DB metrics:", error.message);
  }
}

function startMetricsCollector() {
  collectDbMetrics(); // run once immediately on boot, don't wait 30s for first data
  setInterval(collectDbMetrics, POLL_INTERVAL_MS);
}

module.exports = { startMetricsCollector, collectDbMetrics };