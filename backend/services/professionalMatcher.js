const Booking = require("../models/Booking");
const EmergencyRequest = require("../models/EmergencyRequest");
const Professional = require("../models/Professional");
const SlotReservation = require("../models/SlotReservation");
const metrics = require("../metrics");
const logger = require("../utils/logger");
const { processNotificationSimulation } = require("./simulationService");
const { MATCH_RADIUS_KM } = require("./serviceArea");
const { localToday, currentSlot, hasScheduledTimeStarted } = require("./booking/bookingSchedule");

// How many of the nearest professionals to try before giving up.
const CANDIDATE_LIMIT = 15;

// Emergency types use different names from professional categories.
const EMERGENCY_TO_PROFESSIONAL_CATEGORY = Object.freeze({
  Electrical: "Electrician",
  Plumbing: "Plumbing",
  Security: "Security"
});

function professionalCategoryFor(category) {
  const safe = typeof category === "string" ? category.trim() : "";
  return EMERGENCY_TO_PROFESSIONAL_CATEGORY[safe] || safe;
}

// Haversine distance in km between two [lng, lat] points — good enough
// for "how far is the assigned professional" display, no map API needed.
function haversineDistanceKm([lng1, lat1], [lng2, lat2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const roundKm = (km) => Math.round(km * 10) / 10;

function isValidCoordinates(coordinates) {
  return Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    Number.isFinite(Number(coordinates[0])) &&
    Number.isFinite(Number(coordinates[1]));
}

// { latitude, longitude } stored on a booking/emergency → GeoJSON [lng, lat].
// 0,0 is treated as missing (older records stored Number(null) === 0).
function locationToCoordinates(location) {
  const lat = Number(location?.latitude);
  const lng = Number(location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return [lng, lat];
}

// Nearest on-duty professionals in a category within MATCH_RADIUS_KM,
// nearest first. $near is a plain read (never inside a transaction).
async function findNearestCandidates(category, coordinates, excludeIds = []) {
  const filter = {
    status: "Available",
    active: true,
    category: professionalCategoryFor(category),
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [Number(coordinates[0]), Number(coordinates[1])] },
        $maxDistance: MATCH_RADIUS_KM * 1000
      }
    }
  };
  if (excludeIds.length) filter._id = { $nin: excludeIds };

  return Professional.find(filter).select("_id location").limit(CANDIDATE_LIMIT).lean();
}

// ------------------------------------------------------------------
// Scheduled bookings: reserve a professional for one date + time slot
// ------------------------------------------------------------------

/**
 * Reserves the nearest professional who is free for this slot.
 * A professional the customer picked is tried first (if within range).
 * Returns { professional, distanceKm } — professional null when nobody is free.
 */
async function reserveNearestProfessional({ category, coordinates, date, timeSlot, bookingId, preferredProfessionalId = null }) {
  if (!isValidCoordinates(coordinates) || !category || !date || !timeSlot || !bookingId) {
    return { professional: null, distanceKm: null };
  }

  const taken = await SlotReservation.find({ date, timeSlot }).distinct("professional");
  const candidates = await findNearestCandidates(category, coordinates, taken);

  if (preferredProfessionalId) {
    const index = candidates.findIndex((c) => c._id.toString() === String(preferredProfessionalId));
    if (index > 0) candidates.unshift(...candidates.splice(index, 1));
  }

  for (const candidate of candidates) {
    try {
      await SlotReservation.create({ professional: candidate._id, date, timeSlot, booking: bookingId });
    } catch (error) {
      if (error && error.code === 11000) continue; // someone else just took this slot
      throw error;
    }

    const professional = await Professional.findById(candidate._id);
    const distanceKm = professional?.location?.coordinates
      ? roundKm(haversineDistanceKm(coordinates, professional.location.coordinates))
      : null;
    return { professional, distanceKm };
  }

  return { professional: null, distanceKm: null };
}

async function releaseBookingReservation(bookingId) {
  if (!bookingId) return;
  await SlotReservation.deleteMany({ booking: bookingId });
}

// Professionals busy with a scheduled job right now (today's current slot).
async function professionalsInCurrentSlot(now = new Date()) {
  const slot = currentSlot(now);
  if (!slot) return [];
  return SlotReservation.find({ date: localToday(now), timeSlot: slot }).distinct("professional");
}

// ------------------------------------------------------------------
// Emergencies: claim the nearest on-duty professional right now
// ------------------------------------------------------------------

/**
 * Claims (marks Busy) the nearest available professional for an
 * emergency, skipping anyone in the middle of a scheduled job.
 */
async function claimNearestProfessional(category, coordinates) {
  if (!isValidCoordinates(coordinates) || !category) {
    return { professional: null, distanceKm: null };
  }

  const busyNow = await professionalsInCurrentSlot();
  const candidates = await findNearestCandidates(category, coordinates, busyNow);

  for (const candidate of candidates) {
    const professional = await Professional.findOneAndUpdate(
      { _id: candidate._id, status: "Available", active: true },
      { $set: { status: "Busy" } },
      { new: true }
    );
    if (professional) {
      return {
        professional,
        distanceKm: roundKm(haversineDistanceKm(coordinates, professional.location.coordinates))
      };
    }
  }

  return { professional: null, distanceKm: null };
}

// ------------------------------------------------------------------
// Waiting work — swept by services/scheduler.js every minute
// ------------------------------------------------------------------

function bookingCategory(booking) {
  return booking.isCustom ? booking.customCategory : booking.service?.category;
}

async function assignWaitingBooking(booking) {
  const coordinates = locationToCoordinates(booking.location);
  const category = bookingCategory(booking);
  if (!coordinates || !category) return false;

  const { professional, distanceKm } = await reserveNearestProfessional({
    category,
    coordinates,
    date: booking.date,
    timeSlot: booking.timeSlot,
    bookingId: booking._id
  });
  if (!professional) return false;

  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, professional: null, status: "Assigned" },
    { $set: { professional: professional._id, status: "Confirmed", assignedDistanceKm: distanceKm } },
    { new: true }
  );

  if (!updated) {
    // Booking changed meanwhile (cancelled / assigned elsewhere) — give the slot back.
    await releaseBookingReservation(booking._id);
    return false;
  }

  if (metrics && metrics.bookingsConfirmed) metrics.bookingsConfirmed.inc();
  processNotificationSimulation(updated, updated.user).catch((err) => {
    logger.error({ err: err.message }, "Reassignment notification error");
  });
  logger.info({ professionalName: professional.name, bookingId: booking._id }, "[professionalMatcher] Auto-assigned professional to booking");
  return true;
}

async function reassignWaitingBookings() {
  const pendingBookings = await Booking.find({ professional: null, status: "Assigned" })
    .populate("service")
    .sort({ createdAt: 1 })
    .limit(50);

  for (const booking of pendingBookings) {
    if (hasScheduledTimeStarted(booking)) continue; // scheduler cancels these
    await assignWaitingBooking(booking);
  }
}

async function reassignWaitingEmergencies() {
  const pendingEmergencies = await EmergencyRequest.find({ assignedProfessional: null, status: "Dispatched" })
    .sort({ createdAt: 1 })
    .limit(20);

  for (const emergency of pendingEmergencies) {
    const coordinates = locationToCoordinates(emergency.location);
    if (!coordinates) continue;

    const { professional, distanceKm } = await claimNearestProfessional(emergency.category, coordinates);
    if (!professional) continue;

    const updated = await EmergencyRequest.findOneAndUpdate(
      { _id: emergency._id, assignedProfessional: null, status: "Dispatched" },
      { $set: { assignedProfessional: professional._id, assignedDistanceKm: distanceKm } },
      { new: true }
    );
    if (!updated) {
      await Professional.updateOne({ _id: professional._id }, { $set: { status: "Available" } });
      continue;
    }
    logger.info({ professionalName: professional.name, emergencyId: emergency._id }, "[professionalMatcher] Auto-assigned professional to emergency");
  }
}

// Called whenever someone frees up; sweeps all waiting work (cheap —
// both queries are indexed and capped). The category argument is kept
// for backward compatibility with existing callers.
async function reassignWaitingWork() {
  await reassignWaitingBookings();
  await reassignWaitingEmergencies();
}

module.exports = {
  EMERGENCY_TO_PROFESSIONAL_CATEGORY,
  professionalCategoryFor,
  haversineDistanceKm,
  locationToCoordinates,
  reserveNearestProfessional,
  releaseBookingReservation,
  professionalsInCurrentSlot,
  claimNearestProfessional,
  assignWaitingBooking,
  reassignWaitingBookings,
  reassignWaitingEmergencies,
  reassignWaitingWork
};
