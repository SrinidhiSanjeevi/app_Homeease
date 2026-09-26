const Booking = require("../models/Booking");
const EmergencyRequest = require("../models/EmergencyRequest");
const Professional = require("../models/Professional");
const SlotReservation = require("../models/SlotReservation");
const metrics = require("../metrics");
const logger = require("../utils/logger");
const { processNotificationSimulation } = require("./simulationService");
const { localToday, currentSlot, hasScheduledTimeStarted } = require("./booking/bookingSchedule");
const { areaDistanceKm } = require("./areas");

// How many professionals to try (nearest area first) before giving up.
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

// A professional covers the areas listed in `serviceAreas` (set by the
// admin, up to MAX_SERVICE_AREAS). Older records without that list are
// treated as covering just their home area.
function coversArea(pro, area) {
  if (!area) return false;
  const wanted = String(area).toLowerCase();
  const areas = Array.isArray(pro.serviceAreas) && pro.serviceAreas.length ? pro.serviceAreas : [pro.locality];
  return areas.some((a) => typeof a === "string" && a.toLowerCase() === wanted);
}

// Available professionals in a category. Those who cover the customer's
// area come first, nearest home area (km) first; then — only as a
// fallback so a booking is never stranded — everyone else, nearest first.
// Ties go to rating, completed jobs, experience. No area yet = last.
async function findCandidates(category, excludeIds = [], customerArea = null) {
  const filter = {
    status: "Available",
    active: true,
    category: professionalCategoryFor(category)
  };
  if (excludeIds.length) filter._id = { $nin: excludeIds };

  const pros = await Professional.find(filter)
    .select("_id locality serviceAreas rating completedJobs experience")
    .lean();

  return pros
    .map((p) => ({ ...p, coversArea: coversArea(p, customerArea), distanceKm: areaDistanceKm(customerArea, p.locality) }))
    .sort((a, b) =>
      Number(b.coversArea) - Number(a.coversArea) ||
      a.distanceKm - b.distanceKm ||
      (b.rating || 0) - (a.rating || 0) ||
      (b.completedJobs || 0) - (a.completedJobs || 0) ||
      (b.experience || 0) - (a.experience || 0)
    );
}

const finiteKm = (km) => (Number.isFinite(km) ? km : null);

// ------------------------------------------------------------------
// Scheduled bookings: reserve a professional for one date + time slot
// ------------------------------------------------------------------

/**
 * Reserves the nearest professional covering the customer's area who is
 * free for this slot. A professional the customer picked is tried first.
 * Returns { professional, distanceKm } — professional null when nobody is free.
 */
async function reserveProfessional({ category, area = null, date, timeSlot, bookingId, preferredProfessionalId = null }) {
  if (!category || !date || !timeSlot || !bookingId) {
    return { professional: null, distanceKm: null };
  }

  const taken = await SlotReservation.find({ date, timeSlot }).distinct("professional");
  const candidates = await findCandidates(category, taken, area);

  // The customer's own pick wins whenever that professional is free,
  // even if they don't list this area.
  if (preferredProfessionalId) {
    const index = candidates.findIndex((c) => c._id.toString() === String(preferredProfessionalId));
    if (index > 0) candidates.unshift(...candidates.splice(index, 1));
  }

  for (const candidate of candidates.slice(0, CANDIDATE_LIMIT)) {
    try {
      await SlotReservation.create({ professional: candidate._id, date, timeSlot, booking: bookingId });
    } catch (error) {
      if (error && error.code === 11000) continue; // someone else just took this slot
      throw error;
    }
    return { professional: await Professional.findById(candidate._id), distanceKm: finiteKm(candidate.distanceKm) };
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
async function claimProfessional(category, area = null) {
  if (!category) return { professional: null, distanceKm: null };

  const busyNow = await professionalsInCurrentSlot();
  const candidates = await findCandidates(category, busyNow, area);

  for (const candidate of candidates.slice(0, CANDIDATE_LIMIT)) {
    const professional = await Professional.findOneAndUpdate(
      { _id: candidate._id, status: "Available", active: true },
      { $set: { status: "Busy" } },
      { new: true }
    );
    if (professional) return { professional, distanceKm: finiteKm(candidate.distanceKm) };
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
  const category = bookingCategory(booking);
  if (!category) return false;

  const { professional, distanceKm } = await reserveProfessional({
    category,
    area: booking.area,
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
  // Deferred assignment: the real wait is booking creation → now.
  if (metrics && metrics.professionalAssignmentTime && booking.createdAt) {
    const waitedSeconds = (Date.now() - new Date(booking.createdAt).getTime()) / 1000;
    if (waitedSeconds >= 0) metrics.professionalAssignmentTime.observe(waitedSeconds);
  }
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
    const { professional, distanceKm } = await claimProfessional(emergency.category, emergency.area);
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
  coversArea,
  professionalCategoryFor,
  reserveProfessional,
  releaseBookingReservation,
  professionalsInCurrentSlot,
  claimProfessional,
  assignWaitingBooking,
  reassignWaitingBookings,
  reassignWaitingEmergencies,
  reassignWaitingWork
};
