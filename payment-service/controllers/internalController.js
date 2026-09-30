const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const logger = require("../utils/logger");

const createCodPayment = async (req, res) => {
  try {
    const { bookingId, userId, amount } = req.body || {};

    if (
      !bookingId || !mongoose.Types.ObjectId.isValid(bookingId) ||
      !userId || !mongoose.Types.ObjectId.isValid(userId) ||
      typeof amount !== "number" || !(amount >= 0)
    ) {
      return res.status(400).json({ success: false, message: "bookingId, userId and amount are required" });
    }

    const payment = await Payment.create({
      booking: bookingId,
      user: userId,
      amount,
      status: "Pending",
      paymentMethod: "Cash on Delivery",
      transactionId: `COD-${bookingId}`
    });

    return res.status(201).json({ success: true, payment });
  } catch (error) {
    logger.error({ err: error.message }, "Internal Create COD Payment Error");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const settleCodPayment = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, message: "Invalid booking id" });
    }
    if (status !== "Success") {
      return res.status(400).json({ success: false, message: "status must be 'Success'" });
    }

    const payment = await Payment.findOneAndUpdate(
      { booking: bookingId, paymentMethod: "Cash on Delivery" },
      { status: "Success" },
      { new: true }
    );

    return res.status(200).json({ success: true, payment: payment || null });
  } catch (error) {
    logger.error({ err: error.message }, "Internal Settle COD Payment Error");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const getPaymentsForBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, message: "Invalid booking id" });
    }

    const payments = await Payment.find({ booking: bookingId }).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, payments: payments || [] });
  } catch (error) {
    logger.error({ err: error.message }, "Internal Get Payments For Booking Error");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

module.exports = {
  createCodPayment,
  settleCodPayment,
  getPaymentsForBooking
};
