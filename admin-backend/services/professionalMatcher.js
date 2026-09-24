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
const { MATCH_RADIUS_KM, distanceKm: haversineKm } = require("./serviceArea");

let authoritativeMatcher;
try {
  authoritativeMatcher = require("../../backend/services/professionalMatcher");
} catch (_) {
  authoritativeMatcher = null;
}

const CATEGORIES_WITHOUT_DEDICATED_ROSTER = authoritativeMatcher
  ? authoritativeMatcher.CATEGORIES_WITHOUT_DEDICATED_ROSTER
  : new Set(["Fire", "Medical"]);

// Standalone fallback (admin-backend container): nearest available
// professional within MATCH_RADIUS_KM of [lng, lat], same rules as the
// authoritative backend/services/professionalMatcher.js.
async function claimNearestProfessional(category, coordinates) {
  const safeCategory = typeof category === "string" ? category.trim() : "";
  const filter = {
    status: "Available",
    active: true,
    location: {
      $near: {
        $geometry: { type: "Point", coordinates },
        $maxDistance: MATCH_RADIUS_KM * 1000
      }
    }
  };
  if (!CATEGORIES_WITHOUT_DEDICATED_ROSTER.has(safeCategory)) {
    filter.category = safeCategory;
  }

  const candidate = await Professional.findOne(filter).select("_id");
  if (!candidate) return { professional: null, distanceKm: null };

  const professional = await Professional.findOneAndUpdate(
    { _id: candidate._id, status: "Available", active: true },
    { $set: { status: "Busy" } },
    { new: true }
  );
  if (!professional) return { professional: null, distanceKm: null };

  const [pLng, pLat] = professional.location.coordinates;
  const km = haversineKm(coordinates[1], coordinates[0], pLat, pLng);
  return { professional, distanceKm: Math.round(km * 10) / 10 };
}

function locationToCoordinates(location) {
  const lat = Number(location?.latitude);
  const lng = Number(location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lng, lat];
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

    const coords = locationToCoordinates(booking.location);
    if (!coords) continue;

    const { professional, distanceKm } = await claimNearestProfessional(category, coords);
    if (!professional) continue;

    booking.professional = professional._id;
    booking.status = "Confirmed";
    booking.assignedDistanceKm = distanceKm;
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

    const coords = locationToCoordinates(emergency.location);
    if (!coords) continue;

    const { professional, distanceKm } = await claimNearestProfessional(category, coords);
    if (!professional) continue;

    emergency.assignedProfessional = professional._id;
    emergency.assignedDistanceKm = distanceKm;
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
  claimNearestProfessional,
  reassignWaitingBookings,
  reassignWaitingEmergencies,
  reassignWaitingWork
};