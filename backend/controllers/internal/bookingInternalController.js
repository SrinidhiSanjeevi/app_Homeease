/**
 * Internal Booking Controller
 *
 * Backs the /api/internal/bookings/* routes that payment-service calls over
 * HTTP instead of holding its own copy of the Booking model. This replaces
 * payment-service's former direct reads/writes of Booking.status /
 * Booking.paymentStatus.
 *
 * Every route here sits behind requireInternalToken (middleware/internalAuth.js)
 * — no end-user JWT is checked; the calling service already did human-level
 * auth (or, for payment-service, is acting on a verified Razorpay
 * signature/webhook).
 */

const mongoose = require("mongoose");
const Booking = require("../../models/Booking");
const logger = require("../../utils/logger");

// Minimal projection: what payment-service needs to create/verify an order
// and decide whether a payment can be applied to this booking, widened
// (Stage 3) with date/timeSlot/address so notification-service can render
// its BOOKING_CONFIRMED/BOOKING_COMPLETED email templates without holding
// its own copy of the Booking model.
const PROJECTION = "_id user paymentMethod paymentStatus status totalPrice professional date timeSlot address";

const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid booking id" });
    }

    const booking = await Booking.findById(id).select(PROJECTION);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    return res.status(200).json({ success: true, booking });
  } catch (error) {
    logger.error({ err: error.message }, "Internal Get Booking Error");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// Atomic conditional settlement of a booking's payment fields — replicates
// the semantics of the aggregation-pipeline `Booking.findOneAndUpdate` that
// used to live in payment-service/services/paymentService.js's
// settleGenuinePayment. The update only applies when the booking is still in
// the exact pre-settlement state the caller expects; otherwise this returns
// a 409 conflict marker (`settled: false`) instead of throwing, so the
// caller's existing "fall through to refund" logic keeps working unchanged.
const settleBookingPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { outcome } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid booking id" });
    }
    if (!["paid", "refund_pending"].includes(outcome)) {
      return res.status(400).json({ success: false, message: "outcome must be 'paid' or 'refund_pending'" });
    }

    if (outcome === "paid") {
      // Only a booking that is still waiting for payment can become paid.
      const paidBooking = await Booking.findOneAndUpdate(
        { _id: id, status: "Created", paymentStatus: "Pending" },
        [
          {
            $set: {
              paymentStatus: "Paid",
              status: { $cond: [{ $ifNull: ["$professional", false] }, "Confirmed", "Assigned"] }
            }
          }
        ],
        { new: true, updatePipeline: true }
      ).select(PROJECTION);

      if (!paidBooking) {
        return res.status(409).json({
          success: false,
          settled: false,
          message: "Booking is not in the expected pre-payment state (already settled, expired, or cancelled)"
        });
      }

      return res.status(200).json({ success: true, settled: true, booking: paidBooking });
    }

    // outcome === "refund_pending": the booking was already marked paid but
    // the money can no longer be applied to it (e.g. it expired or was
    // cancelled after the payment came in) — flag it for the refund sweep.
    const existing = await Booking.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const refundBooking = await Booking.findOneAndUpdate(
      { _id: id, paymentStatus: "Paid" },
      { $set: { paymentStatus: "Refund Pending", refundAmount: existing.totalPrice, refundAttempts: 0 } },
      { new: true }
    ).select(PROJECTION);

    if (!refundBooking) {
      return res.status(409).json({
        success: false,
        settled: false,
        message: "Booking is not in the expected paid state for a refund-pending settlement"
      });
    }

    return res.status(200).json({ success: true, settled: true, booking: refundBooking });
  } catch (error) {
    logger.error({ err: error.message }, "Internal Settle Booking Payment Error");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

module.exports = {
  getBookingById,
  settleBookingPayment
};
