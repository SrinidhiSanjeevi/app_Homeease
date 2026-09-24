/**
 * Cancellation + refund rules shared by customer cancel, unpaid-booking
 * expiry and the automatic "nobody could be assigned" cancel.
 */

const Booking = require("../../models/Booking");
const paymentClient = require("../payment/paymentClient");
const { releaseBookingReservation } = require("../professionalMatcher");
const { getScheduledStart } = require("./bookingSchedule");
const metrics = require("../../metrics");
const logger = require("../../utils/logger");

// Customers can cancel for free until this long before the slot starts.
const FREE_CANCEL_HOURS = Number(process.env.FREE_CANCEL_HOURS) || 2;
// Late cancellations (inside that window) keep this share as a fee.
const LATE_CANCEL_FEE_RATE = Number(process.env.LATE_CANCEL_FEE_RATE) || 0.2;
const MAX_REFUND_ATTEMPTS = 10;

const ACTIVE_STATUSES = ["Created", "Assigned", "Confirmed"];

/**
 * What a customer would get back if they cancelled now.
 * Returns { allowed, fee, refund, reason }.
 */
function customerCancellationQuote(booking, now = new Date()) {
  if (!ACTIVE_STATUSES.includes(booking.status)) {
    return { allowed: false, fee: 0, refund: 0, reason: `This booking is already ${booking.status.toLowerCase()}.` };
  }

  const start = getScheduledStart(booking);
  if (start && now >= start) {
    return {
      allowed: false,
      fee: 0,
      refund: 0,
      reason: "The visit has already started, so it can't be cancelled here. Please contact support."
    };
  }

  const isPaid = booking.paymentStatus === "Paid";
  if (!isPaid) return { allowed: true, fee: 0, refund: 0, reason: null };

  const hoursLeft = start ? (start - now) / 3600000 : Infinity;
  const fee = hoursLeft < FREE_CANCEL_HOURS ? Math.round(booking.totalPrice * LATE_CANCEL_FEE_RATE) : 0;
  return { allowed: true, fee, refund: booking.totalPrice - fee, reason: null };
}

async function issueRefund(booking, amount) {
  if (!amount || amount <= 0) return true;
  const refund = await paymentClient.refundPayment(booking._id, amount);
  if (refund && metrics && metrics.paymentRefunded) metrics.paymentRefunded.inc();
  return Boolean(refund);
}

/**
 * Atomically cancels a booking (only if it is still in `fromStatus`),
 * frees the professional's slot and refunds `refundAmount` if it was paid.
 * Returns the updated booking, or null if the booking had already moved on.
 */
async function cancelBooking(booking, { by, reason, fee = 0, refundAmount = null }) {
  const isPaid = booking.paymentStatus === "Paid";
  const amount = isPaid ? (refundAmount ?? booking.totalPrice) : 0;

  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: booking.status },
    {
      $set: {
        status: "Cancelled",
        cancelledAt: new Date(),
        cancelledBy: by,
        cancellationReason: reason || "",
        cancellationFee: isPaid ? fee : 0,
        ...(isPaid && amount > 0 ? { paymentStatus: "Refund Pending", refundAmount: amount } : {}),
        ...(booking.paymentStatus === "Pending" ? { paymentStatus: by === "system" ? "Expired" : "Cancelled" } : {})
      }
    },
    { new: true }
  );
  if (!updated) return null;

  await releaseBookingReservation(updated._id);

  if (isPaid && amount > 0) {
    const refunded = await issueRefund(updated, amount);
    updated.paymentStatus = refunded ? (fee > 0 ? "Partially Refunded" : "Refunded") : "Refund Pending";
    if (!refunded) updated.refundAttempts = 1;
    await updated.save();
  }

  if (metrics && metrics.bookingsCancelled) metrics.bookingsCancelled.inc();
  if (metrics && metrics.activeBookings && booking.status !== "Created") metrics.activeBookings.dec();
  return updated;
}

// Refunds that failed earlier (payment-service down, Razorpay error) are
// retried by the scheduler until they succeed or hit MAX_REFUND_ATTEMPTS.
async function retryPendingRefunds() {
  const pending = await Booking.find({
    paymentStatus: "Refund Pending",
    refundAttempts: { $lt: MAX_REFUND_ATTEMPTS }
  }).limit(20);

  for (const booking of pending) {
    const amount = booking.refundAmount ?? booking.totalPrice;
    const refunded = await issueRefund(booking, amount);
    booking.refundAttempts = (booking.refundAttempts || 0) + 1;
    if (refunded) {
      booking.paymentStatus = booking.cancellationFee > 0 ? "Partially Refunded" : "Refunded";
    } else if (booking.refundAttempts >= MAX_REFUND_ATTEMPTS) {
      logger.error({ bookingId: booking._id }, "Refund still failing after max attempts — needs manual action");
    }
    await booking.save();
  }
}

module.exports = {
  FREE_CANCEL_HOURS,
  LATE_CANCEL_FEE_RATE,
  ACTIVE_STATUSES,
  customerCancellationQuote,
  cancelBooking,
  retryPendingRefunds
};
