/**
 * Background housekeeping, run every minute by each backend replica.
 * Every step uses conditional (atomic) updates, so replicas running it at
 * the same time can't double-process anything.
 *
 *   1. Expire online bookings not paid within UNPAID_EXPIRY_MINUTES,
 *      releasing the professional's slot.
 *   2. Cancel (and fully refund) bookings nobody could be assigned to
 *      before their slot started.
 *   3. Assign waiting bookings / emergencies to anyone who freed up.
 *   4. Retry refunds that failed earlier.
 */

const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { reassignWaitingWork } = require("./professionalMatcher");
const { cancelBooking, retryPendingRefunds } = require("./booking/bookingLifecycle");
const { hasScheduledTimeStarted } = require("./booking/bookingSchedule");
const logger = require("../utils/logger");

const UNPAID_EXPIRY_MINUTES = Number(process.env.UNPAID_EXPIRY_MINUTES) || 15;
const INTERVAL_MS = 60 * 1000;

async function expireUnpaidBookings(now = new Date()) {
  const cutoff = new Date(now.getTime() - UNPAID_EXPIRY_MINUTES * 60 * 1000);
  const stale = await Booking.find({
    status: "Created",
    paymentMethod: "Razorpay",
    paymentStatus: "Pending",
    createdAt: { $lt: cutoff }
  }).limit(100);

  for (const booking of stale) {
    const cancelled = await cancelBooking(booking, { by: "system", reason: "Payment not completed in time" });
    if (cancelled) logger.info({ bookingId: booking._id }, "[scheduler] Expired unpaid booking");
  }
}

async function cancelUnassignableBookings(now = new Date()) {
  const waiting = await Booking.find({ status: "Assigned", professional: null }).limit(100);

  for (const booking of waiting) {
    if (!hasScheduledTimeStarted(booking, now)) continue;
    const cancelled = await cancelBooking(booking, {
      by: "system",
      reason: "No professional was available for this slot"
    });
    if (cancelled) logger.warn({ bookingId: booking._id }, "[scheduler] Cancelled booking — nobody could be assigned before the slot");
  }
}

async function runOnce() {
  if (mongoose.connection.readyState !== 1) return;
  const steps = [
    ["expireUnpaidBookings", expireUnpaidBookings],
    ["cancelUnassignableBookings", cancelUnassignableBookings],
    ["reassignWaitingWork", reassignWaitingWork],
    ["retryPendingRefunds", retryPendingRefunds]
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (error) {
      logger.error({ err: error.message, step: name }, "[scheduler] Step failed");
    }
  }
}

let timer = null;
let running = false;

function start() {
  if (timer || process.env.SCHEDULER_ENABLED === "false" || process.env.NODE_ENV === "test") return;
  timer = setInterval(async () => {
    if (running) return; // previous run still going
    running = true;
    try {
      await runOnce();
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
  timer.unref();
  logger.info({ intervalSeconds: INTERVAL_MS / 1000, unpaidExpiryMinutes: UNPAID_EXPIRY_MINUTES }, "[scheduler] Started");
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, runOnce, expireUnpaidBookings, cancelUnassignableBookings, UNPAID_EXPIRY_MINUTES };
