const Booking = require("../../models/Booking");
const { localToday } = require("./bookingSchedule");

// Open work = anything not finished. Professionals are assigned automatically, so the
// useful split for an operator is by day: today (or overdue) vs. later days.
const OPEN_STATUSES = Object.freeze(["Created", "Assigned", "Confirmed"]);

async function countScheduleBuckets(now = new Date()) {
  const today = localToday(now);
  const [pending, upcoming] = await Promise.all([
    Booking.countDocuments({ status: { $in: OPEN_STATUSES }, date: { $lte: today } }),
    Booking.countDocuments({ status: { $in: OPEN_STATUSES }, date: { $gt: today } })
  ]);
  return { pending, upcoming };
}

module.exports = { OPEN_STATUSES, countScheduleBuckets };
