// Booking dates arrive as "YYYY-MM-DD" (stored as UTC midnight) and time
// slots as "09:00 AM - 11:00 AM" in the customer's local time. Slots are
// IST by default; override with BOOKING_TZ_OFFSET_MINUTES if needed.
const TZ_OFFSET_MINUTES = Number.isFinite(Number(process.env.BOOKING_TZ_OFFSET_MINUTES))
  ? Number(process.env.BOOKING_TZ_OFFSET_MINUTES)
  : 330;

// The only slots customers can book (must match frontend BookingModal).
const TIME_SLOTS = Object.freeze([
  "09:00 AM - 11:00 AM",
  "12:00 PM - 02:00 PM",
  "03:00 PM - 05:00 PM",
  "06:00 PM - 08:00 PM"
]);

const MAX_ADVANCE_DAYS = Number(process.env.BOOKING_MAX_ADVANCE_DAYS) || 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_RE = /(\d{1,2}):(\d{2})\s*(AM|PM)/gi;

function toMinutes([, h, m, meridiem]) {
  let hours = Number(h) % 12;
  if (meridiem.toUpperCase() === "PM") hours += 12;
  return hours * 60 + Number(m);
}

function slotMinutes(timeSlot) {
  return [...String(timeSlot || "").matchAll(TIME_RE)].map(toMinutes);
}

function localMidnightUtc(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function atLocalMinutes(date, minutes) {
  const midnight = localMidnightUtc(date);
  if (midnight === null) return null;
  return new Date(midnight + (minutes - TZ_OFFSET_MINUTES) * 60 * 1000);
}

/**
 * Returns the moment the booked slot starts, or null if it can't be parsed.
 */
function getScheduledStart(booking) {
  if (!booking || !booking.date) return null;
  const times = slotMinutes(booking.timeSlot);
  return atLocalMinutes(booking.date, times.length ? times[0] : 0);
}

/**
 * Returns the moment the booked slot ends, or null if it can't be parsed.
 * A slot without an end time ("09:00 AM") falls back to its start time;
 * a date with no parsable slot falls back to the end of that day.
 */
function getScheduledEnd(booking) {
  if (!booking || !booking.date) return null;
  const times = slotMinutes(booking.timeSlot);
  return atLocalMinutes(booking.date, times.length ? times[times.length - 1] : 24 * 60);
}

function hasScheduledTimeEnded(booking, now = new Date()) {
  const end = getScheduledEnd(booking);
  return !end || now >= end;
}

function hasScheduledTimeStarted(booking, now = new Date()) {
  const start = getScheduledStart(booking);
  return !start || now >= start;
}

// Today's date in the service timezone, as the UTC-midnight Date that
// bookings store, e.g. 2026-09-25T00:00:00Z.
function localToday(now = new Date()) {
  const local = new Date(now.getTime() + TZ_OFFSET_MINUTES * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

// The slot happening right now in the service timezone, or null.
function currentSlot(now = new Date()) {
  const today = localToday(now);
  return TIME_SLOTS.find((slot) => {
    const start = getScheduledStart({ date: today, timeSlot: slot });
    const end = getScheduledEnd({ date: today, timeSlot: slot });
    return now >= start && now < end;
  }) || null;
}

/**
 * Validates a customer-supplied date ("YYYY-MM-DD") + time slot.
 * Returns { ok: true, date } (UTC midnight Date) or { ok: false, message }.
 */
function validateSchedule(dateInput, timeSlot, now = new Date()) {
  if (typeof dateInput !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return { ok: false, message: "Please pick a valid date (YYYY-MM-DD)." };
  }
  const date = new Date(`${dateInput}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateInput) {
    return { ok: false, message: "Please pick a valid date." };
  }
  if (!TIME_SLOTS.includes(timeSlot)) {
    return { ok: false, message: `Please pick one of the available time slots: ${TIME_SLOTS.join(", ")}.` };
  }

  const today = localToday(now);
  if (date < today) {
    return { ok: false, message: "You can't book a date in the past." };
  }
  if (date.getTime() - today.getTime() > MAX_ADVANCE_DAYS * DAY_MS) {
    return { ok: false, message: `Bookings can be made up to ${MAX_ADVANCE_DAYS} days in advance.` };
  }
  if (hasScheduledTimeStarted({ date, timeSlot }, now)) {
    return { ok: false, message: "That time slot has already started today. Please pick a later slot or another day." };
  }
  return { ok: true, date };
}

module.exports = {
  TIME_SLOTS,
  MAX_ADVANCE_DAYS,
  getScheduledStart,
  getScheduledEnd,
  hasScheduledTimeStarted,
  hasScheduledTimeEnded,
  localToday,
  currentSlot,
  validateSchedule
};
