// Booking dates arrive as "YYYY-MM-DD" (stored as UTC midnight) and time
// slots as "09:00 AM - 11:00 AM" in the customer's local time. Slots are
// IST by default; override with BOOKING_TZ_OFFSET_MINUTES if needed.
const TZ_OFFSET_MINUTES = Number.isFinite(Number(process.env.BOOKING_TZ_OFFSET_MINUTES))
  ? Number(process.env.BOOKING_TZ_OFFSET_MINUTES)
  : 330;

const TIME_RE = /(\d{1,2}):(\d{2})\s*(AM|PM)/gi;

function toMinutes([, h, m, meridiem]) {
  let hours = Number(h) % 12;
  if (meridiem.toUpperCase() === "PM") hours += 12;
  return hours * 60 + Number(m);
}

/**
 * Returns the moment the booked slot ends, or null if it can't be parsed.
 * A slot without an end time ("09:00 AM") falls back to its start time;
 * a date with no parsable slot falls back to the end of that day.
 */
function getScheduledEnd(booking) {
  if (!booking || !booking.date) return null;
  const date = new Date(booking.date);
  if (Number.isNaN(date.getTime())) return null;

  const times = [...String(booking.timeSlot || "").matchAll(TIME_RE)].map(toMinutes);
  const endMinutes = times.length ? times[times.length - 1] : 24 * 60;

  const localMidnightUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(localMidnightUtc + (endMinutes - TZ_OFFSET_MINUTES) * 60 * 1000);
}

function hasScheduledTimeEnded(booking, now = new Date()) {
  const end = getScheduledEnd(booking);
  return !end || now >= end;
}

module.exports = { getScheduledEnd, hasScheduledTimeEnded };
