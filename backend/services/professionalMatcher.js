const Booking = require("../models/Booking");
const EmergencyRequest = require("../models/EmergencyRequest");
const Professional = require("../models/Professional");
const SlotReservation = require("../models/SlotReservation");
const metrics = require("../metrics");
const logger = require("../utils/logger");
const { processNotificationSimulation } = require("./simulationService");
const { localToday, currentSlot, hasScheduledTimeStarted } = require("./booking/bookingSchedule");

// How many of the best-rated professionals to try before giving up.
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

// Best available professionals in a category: highest rated first,
// then most experienced. Location is not used.
async function findCandidates(category, excludeIds = []) {
  const filter = {
    status: "Available",
    active: true,
    category: professionalCategoryFor(category)
  };
  if (excludeIds.length) filter._id = { $nin: excludeIds };

  return Professional.find(filter)
    .select("_id")
    .sort({ rating: -1, completedJobs: -1, experience: -1 })
    .limit(CANDIDATE_LIMIT)
    .lean();
}

// ------------------------------------------------------------------
// Scheduled bookings: reserve a professional for one date + time slot
// ------------------------------------------------------------------

/**
 * Reserves the best-rated professional who is free for this slot.
 * A professional the customer picked is tried first.
 * Returns { professional } — professional null when nobody is free.
 */
async function reserveProfessional({ category, date, timeSlot, bookingId, preferredProfessionalId = null }) {
  if (!category || !date || !timeSlot || !bookingId) {
    return { professional: null };
  }

  const taken = await SlotReservation.find({ date, timeSlot }).distinct("professional");
  const candidates = await findCandidates(category, taken);

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
    return { professional: await Professional.findById(candidate._id) };
  }

  return { professional: null };
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
// Emergencies: claim the best on-duty professional right now
// ------------------------------------------------------------------

/**
 * Claims (marks Busy) the best available professional for an emergency,
 * skipping anyone in the middle of a scheduled job.
 */
async function claimProfessional(category) {
  if (!category) return { professional: null };

  const busyNow = await professionalsInCurrentSlot();
  const candidates = await findCandidates(category, busyNow);

  for (const candidate of candidates) {
    const professional = await Professional.findOneAndUpdate(
      { _id: candidate._id, status: "Available", active: true },
      { $set: { status: "Busy" } },
      { new: true }
    );
    if (professional) return { professional };
  }

  return { professional: null };
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

  const { professional } = await reserveProfessional({
    category,
    date: booking.date,
    timeSlot: booking.timeSlot,
    bookingId: booking._id
  });
  if (!professional) return false;

  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, professional: null, status: "Assigned" },
    { $set: { professional: professional._id, status: "Confirmed" } },
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
    const { professional } = await claimProfessional(emergency.category);
    if (!professional) continue;

    const updated = await EmergencyRequest.findOneAndUpdate(
      { _id: emergency._id, assignedProfessional: null, status: "Dispatched" },
      { $set: { assignedProfessional: professional._id } },
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
  reserveProfessional,
  releaseBookingReservation,
  professionalsInCurrentSlot,
  claimProfessional,
  assignWaitingBooking,
  reassignWaitingBookings,
  reassignWaitingEmergencies,
  reassignWaitingWork
};
