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

// Haversine distance in km between two [lng, lat] points — good enough
// for "how far is the assigned professional" display purposes, no map
// API needed.
function haversineDistanceKm([lng1, lat1], [lng2, lat2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius, km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Claim the nearest available professional in a category, using
// MongoDB's $near (2dsphere index on Professional.location). $near
// returns matches nearest-first, so the first result is the closest.
//
// Two steps rather than one findOneAndUpdate($near filter):
//   1. A plain, session-less read to find the nearest candidate's _id.
//      countDocuments()/aggregation pipelines explicitly forbid $near
//      inside a transaction (it's a "Match Execution operator", not
//      allowed in $match) — bookingController.js calls this from
//      inside session.withTransaction(), so this lookup deliberately
//      never takes a session, to stay clear of that restriction
//      regardless of exactly which read path a given MongoDB/driver
//      version routes it through.
//   2. An ordinary _id-based findOneAndUpdate (no geo operator at all)
//      to atomically claim that candidate — this step DOES honor
//      options.session, so the claim still participates in, and rolls
//      back with, the caller's transaction exactly like every other
//      claim path in this file.
// If another request claims the same candidate between steps 1 and 2
// (rare), step 2 simply returns null and the caller falls back to
// claimProfessional(), same as "no professional available".
//
// Professionals with no `location` set never match $near, so this
// naturally returns null for a category with no geo-tagged providers.
async function claimNearestProfessional(category, coordinates, options = {}) {
  const ProfessionalModel = options.models?.Professional || Professional;

  const geoFilter = {
    status: "Available",
    active: true,
    location: {
      $near: {
        $geometry: { type: "Point", coordinates }
      }
    }
  };
  if (!CATEGORIES_WITHOUT_DEDICATED_ROSTER.has(category)) {
    geoFilter.category = category;
  }

  const candidate = await ProfessionalModel.findOne(geoFilter).select("_id location");
  if (!candidate) {
    return { professional: null, distanceKm: null };
  }

  const queryOptions = { new: true };
  if (options.session) {
    queryOptions.session = options.session;
  }

  const professional = await ProfessionalModel.findOneAndUpdate(
    { _id: candidate._id, status: "Available", active: true },
    { $set: { status: "Busy" } },
    queryOptions
  );

  if (!professional) {
    return { professional: null, distanceKm: null };
  }

  const distanceKm = haversineDistanceKm(coordinates, professional.location.coordinates);
  return { professional, distanceKm: Math.round(distanceKm * 10) / 10 };
}

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

    const matchStart = Date.now();
    const professional = await claimProfessional(category, options);
    if (!professional) break;
    if (metrics && metrics.professionalAssignmentTime) {
      metrics.professionalAssignmentTime.observe((Date.now() - matchStart) / 1000);
    }

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
  claimNearestProfessional,
  haversineDistanceKm,
  reassignWaitingBookings,
  reassignWaitingEmergencies,
  reassignWaitingWork
};