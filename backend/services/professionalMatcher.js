const Booking = require("../models/Booking");
const EmergencyRequest = require("../models/EmergencyRequest");
const Professional = require("../models/Professional");
const metrics = require("../metrics");
const { processNotificationSimulation } = require("./simulationService");

// Categories with no dedicated professional roster — same exception
// used in emergencyController.js. Fire/Medical emergencies match ANY
// available professional, not a specific category.
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

    if (metrics && metrics.bookingsConfirmed) metrics.bookingsConfirmed.inc();

    processNotificationSimulation(booking, booking.user).catch((err) => {
      console.error("Reassignment notification error:", err.message);
    });

    console.log(`[professionalMatcher] Auto-assigned ${professional.name} to booking ${booking._id}`);
  }
}

// NEW: same idea, but for EmergencyRequest documents. This is what was
// missing — image 2's "No specialist available" for Security stays
// stuck forever without this, because nothing ever re-checked it once
// a Security professional became free again.
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

    console.log(`[professionalMatcher] Auto-assigned ${professional.name} to emergency ${emergency._id}`);
  }
}

// Convenience wrapper — call this one from controllers whenever a
// professional's status flips back to Available, and it sweeps both
// waiting bookings and waiting emergencies for that category.
async function reassignWaitingWork(category) {
  await reassignWaitingBookings(category);
  await reassignWaitingEmergencies(category);
}

module.exports = {
  reassignWaitingBookings,
  reassignWaitingEmergencies,
  reassignWaitingWork
};