/**
 * Professional Matcher Service
 *
 * Authoritative Source of Truth:
 *   backend/services/professionalMatcher.js
 *
 * This file serves as the admin-backend boundary consumer of the authoritative
 * matching and reassignment logic. In the unified workspace/monorepo, it delegates
 * to the authoritative implementation, injecting admin-backend models and suppressing
 * customer-only notifications. For containerized deployments where admin-backend runs
 * in an isolated filesystem, it provides identical matching and reassignment logic.
 */

const Booking = require("../models/Booking");
const EmergencyRequest = require("../models/EmergencyRequest");
const Professional = require("../models/Professional");
const logger = require("../utils/logger");

let authoritativeMatcher;
try {
  authoritativeMatcher = require("../../backend/services/professionalMatcher");
} catch (_) {
  authoritativeMatcher = null;
}

const CATEGORIES_WITHOUT_DEDICATED_ROSTER = authoritativeMatcher
  ? authoritativeMatcher.CATEGORIES_WITHOUT_DEDICATED_ROSTER
  : new Set(["Fire", "Medical"]);

async function claimProfessional(category) {
  if (authoritativeMatcher) {
    return authoritativeMatcher.claimProfessional(category, {
      models: { Professional }
    });
  }

  const filter = CATEGORIES_WITHOUT_DEDICATED_ROSTER.has(category)
    ? { status: "Available", active: true }
    : { category, status: "Available", active: true };

  return Professional.findOneAndUpdate(
    filter,
    { $set: { status: "Busy" } },
    { sort: { rating: -1 }, new: true }
  );
}

async function reassignWaitingBookings(category) {
  if (authoritativeMatcher) {
    return authoritativeMatcher.reassignWaitingBookings(category, {
      models: { Booking, Professional },
      logPrefix: "[admin-backend][professionalMatcher]",
      onBookingReassigned: null
    });
  }

  if (!category) return;
  const pendingBookings = await Booking.find({
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

    const professional = await claimProfessional(category);
    if (!professional) break;

    booking.professional = professional._id;
    booking.status = "Confirmed";
    await booking.save();

    logger.info({ professionalName: professional.name, bookingId: booking._id }, "[admin-backend][professionalMatcher] Auto-assigned professional to booking");
  }
}

async function reassignWaitingEmergencies(category) {
  if (authoritativeMatcher) {
    return authoritativeMatcher.reassignWaitingEmergencies(category, {
      models: { EmergencyRequest, Professional },
      logPrefix: "[admin-backend][professionalMatcher]"
    });
  }

  if (!category) return;
  const pendingEmergencies = await EmergencyRequest.find({
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

    const professional = await claimProfessional(category);
    if (!professional) break;

    emergency.assignedProfessional = professional._id;
    await emergency.save();

    logger.info({ professionalName: professional.name, emergencyId: emergency._id }, "[admin-backend][professionalMatcher] Auto-assigned professional to emergency");
  }
}

async function reassignWaitingWork(category) {
  if (authoritativeMatcher) {
    return authoritativeMatcher.reassignWaitingWork(category, {
      models: { Booking, EmergencyRequest, Professional },
      logPrefix: "[admin-backend][professionalMatcher]",
      onBookingReassigned: null
    });
  }

  await reassignWaitingBookings(category);
  await reassignWaitingEmergencies(category);
}

module.exports = {
  CATEGORIES_WITHOUT_DEDICATED_ROSTER,
  claimProfessional,
  reassignWaitingBookings,
  reassignWaitingEmergencies,
  reassignWaitingWork
};