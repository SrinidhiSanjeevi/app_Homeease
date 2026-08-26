const Booking = require("../models/Booking");
const EmergencyRequest = require("../models/EmergencyRequest");
const Professional = require("../models/Professional");

// Categories with no dedicated professional roster — same exception
// used in backend's emergencyController.js. Fire/Medical emergencies
// match ANY available professional, not a specific category.
const CATEGORIES_WITHOUT_DEDICATED_ROSTER = new Set(["Fire", "Medical"]);

// Atomically claim the best-rated available professional in a category.
async function claimProfessional(category) {
  const filter = CATEGORIES_WITHOUT_DEDICATED_ROSTER.has(category)
    ? { status: "Available" }
    : { category, status: "Available" };

  return Professional.findOneAndUpdate(
    filter,
    { $set: { status: "Busy" } },
    { sort: { rating: -1 }, new: true }
  );
}

// Reassigns any bookings still waiting for a professional in this category.
// NOTE: admin-backend has no simulationService/email capability — that's
// backend-only. If an admin action triggers a reassignment here, the
// customer won't get a "professional assigned" email the way they would
// from the customer-facing booking flow. Acceptable for now since admin
// actions are comparatively rare (status overrides, not the main flow).
async function reassignWaitingBookings(category) {
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

    console.log(`[admin-backend][professionalMatcher] Auto-assigned ${professional.name} to booking ${booking._id}`);
  }
}

// Reassigns any waiting emergencies for this category.
async function reassignWaitingEmergencies(category) {
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

    console.log(`[admin-backend][professionalMatcher] Auto-assigned ${professional.name} to emergency ${emergency._id}`);
  }
}

// Convenience wrapper — call whenever admin frees a professional
// (resolving/cancelling an emergency, cancelling a booking), so any
// other customer waiting in that same category gets picked up too.
async function reassignWaitingWork(category) {
  await reassignWaitingBookings(category);
  await reassignWaitingEmergencies(category);
}

module.exports = {
  reassignWaitingBookings,
  reassignWaitingEmergencies,
  reassignWaitingWork
};