const mongoose = require("mongoose");
const Booking = require("../../models/Booking");
const logger = require("../../utils/logger");

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
