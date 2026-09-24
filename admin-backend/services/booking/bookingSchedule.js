// Booking dates arrive as "YYYY-MM-DD" (stored as UTC midnight) and time
// slots as "09:00 AM - 11:00 AM" in the customer's local time. Slots are
// IST by default; override with BOOKING_TZ_OFFSET_MINUTES if needed.
const TZ_OFFSET_MINUTES = Number.isFinite(Number(process.env.BOOKING_TZ_OFFSET_MINUTES))
  ? Number(process.env.BOOKING_TZ_OFFSET_MINUTES)
  : 330;

function parseSlotStart(timeSlot) {
  const match = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(String(timeSlot || ""));
  if (!match) return null;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  return { hours, minutes: Number(match[2]) };
}

/**
 * Returns the moment the booked slot starts, or null if it can't be parsed.
 */
function getScheduledStart(booking) {
  if (!booking || !booking.date) return null;
  const date = new Date(booking.date);
  if (Number.isNaN(date.getTime())) return null;

  const slot = parseSlotStart(booking.timeSlot) || { hours: 0, minutes: 0 };
  const localMidnightUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(
    localMidnightUtc + ((slot.hours * 60 + slot.minutes) - TZ_OFFSET_MINUTES) * 60 * 1000
  );
}

function hasScheduledTimeStarted(booking, now = new Date()) {
  const start = getScheduledStart(booking);
  return !start || now >= start;
}

module.exports = { getScheduledStart, hasScheduledTimeStarted };
