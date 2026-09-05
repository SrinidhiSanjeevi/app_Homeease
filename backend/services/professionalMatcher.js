const Booking = require("../models/Booking");
const EmergencyRequest = require("../models/EmergencyRequest");
const Professional = require("../models/Professional");
const metrics = require("../metrics");
const logger = require("../utils/logger");
const { processNotificationSimulation } = require("./simulationService");

// Categories with no dedicated professional roster — same exception
// used in emergencyController.js. Fire/Medical emergencies match ANY
// available professional, not a specific category.
const CATEGORIES_WITHOUT_DEDICATED_ROSTER = new Set(["Fire", "Medical"]);

// Atomically claim the best-rated available professional in a category or by filter.
async function claimProfessional(categoryOrFilter, options = {}) {
  const ProfessionalModel = options.models?.Professional || Professional;
  let filter;

  if (typeof categoryOrFilter === "object" && categoryOrFilter !== null) {
    filter = { status: "Available", active: true, ...categoryOrFilter };
  } else {
    const category = categoryOrFilter;
    filter = CATEGORIES_WITHOUT_DEDICATED_ROSTER.has(category)
      ? { status: "Available", active: true }
      : { category, status: "Available", active: true };
  }

  const queryOptions = { sort: { rating: -1 }, new: true };
  if (options.session) {
    queryOptions.session = options.session;
  }

  return ProfessionalModel.findOneAndUpdate(
    filter,
    { $set: { status: "Busy" } },
    queryOptions
  );
}

// Reassigns any bookings still waiting for a professional in this category.
async function reassignWaitingBookings(category, options = {}) {
  if (!category) return;

  const BookingModel = options.models?.Booking || Booking;
  const onReassigned = options.onBookingReassigned !== undefined
    ? options.onBookingReassigned
    : (booking) => {
        if (metrics && metrics.bookingsConfirmed) metrics.bookingsConfirmed.inc();
        processNotificationSimulation(booking, booking.user).catch((err) => {
          logger.error({ err: err.message }, "Reassignment notification error");
        });
      };
  const logPrefix = options.logPrefix || "[professionalMatcher]";

  const pendingBookings = await BookingModel.find({
    professional: null,
    status: "Assigned"
  })
    .populate("service")
    .sort({ createdAt: 1 })
    .limit(20);

  for (const booking of pendingBookings) {
    const bookingCategory = booking.isCustom
      ? booking.customCategory
      : booking.service?.category;

    if (bookingCategory !== category) continue;

    const professional = await claimProfessional(category, options);
    if (!professional) break;

    booking.professional = professional._id;
    booking.status = "Confirmed";
    await booking.save();

    if (typeof onReassigned === "function") {
      onReassigned(booking, professional);
    }

    logger.info({ professionalName: professional.name, bookingId: booking._id }, `${logPrefix} Auto-assigned professional to booking`);
  }
}

// Same idea for EmergencyRequest documents: sweeps waiting emergencies for category
async function reassignWaitingEmergencies(category, options = {}) {
  if (!category) return;

  const EmergencyRequestModel = options.models?.EmergencyRequest || EmergencyRequest;
  const logPrefix = options.logPrefix || "[professionalMatcher]";

  const pendingEmergencies = await EmergencyRequestModel.find({
    assignedProfessional: null,
    status: "Dispatched"
  })
    .sort({ createdAt: 1 })
    .limit(20);

  for (const emergency of pendingEmergencies) {
    const matchesCategory =
      CATEGORIES_WITHOUT_DEDICATED_ROSTER.has(emergency.category) ||
      emergency.category === category;

    if (!matchesCategory) continue;

    const professional = await claimProfessional(category, options);
    if (!professional) break;

    emergency.assignedProfessional = professional._id;
    await emergency.save();

    logger.info({ professionalName: professional.name, emergencyId: emergency._id }, `${logPrefix} Auto-assigned professional to emergency`);
  }
}

// Convenience wrapper — call this one from controllers whenever a
// professional's status flips back to Available, and it sweeps both
// waiting bookings and waiting emergencies for that category.
async function reassignWaitingWork(category, options = {}) {
  await reassignWaitingBookings(category, options);
  await reassignWaitingEmergencies(category, options);
}

module.exports = {
  CATEGORIES_WITHOUT_DEDICATED_ROSTER,
  claimProfessional,
  reassignWaitingBookings,
  reassignWaitingEmergencies,
  reassignWaitingWork
};