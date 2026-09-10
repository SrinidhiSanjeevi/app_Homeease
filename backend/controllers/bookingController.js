const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Service = require("../models/Service");
const Professional = require("../models/Professional");
const Payment = require("../models/Payment");
const Notification = require("../models/Notification");
const { reassignWaitingWork, claimProfessional, canTransition } = require("../services/customerCore");
const {
  processNotificationSimulation,
  processCompletionEmailNotification
} = require("../services/simulationService");
const { refundPayment } = require("../services/payment/paymentService");
const metrics = require("../metrics");
const logger = require("../utils/logger");

const DEFAULT_BOOKING_AMOUNT = 500;

// ============================================================
// CLAIM AVAILABLE PROFESSIONAL (Delegates to Authoritative Matcher)
// ============================================================
async function claimAvailableProfessional(filter = {}, session = null) {
  return claimProfessional(filter, { session });
}

// ============================================================
// CREATE NEW BOOKING
// ============================================================
const createBooking = async (req, res) => {
  let queueIncremented = false;

  try {
    const {
      serviceId, professionalId, date, timeSlot, address, contactNumber,
      notes, selectedProduct, paymentMethod, totalPrice,
      isCustom, customCategory, customDescription
    } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const userId = req.user._id;

    if (metrics && metrics.queueLength) {
      metrics.queueLength.inc();
      queueIncremented = true;
    }

    const rawPaymentMethod = paymentMethod || "Razorpay";
    const normalizedRawPaymentMethod = String(rawPaymentMethod).trim();

    const isCash =
      normalizedRawPaymentMethod === "Cash" ||
      normalizedRawPaymentMethod === "Cash on Delivery" ||
      normalizedRawPaymentMethod.toLowerCase().includes("cash");

    const normalizedPaymentMethod = isCash ? "Cash on Delivery" : "Razorpay";
    const bookingAmount = Number(totalPrice) > 0 ? Number(totalPrice) : DEFAULT_BOOKING_AMOUNT;

    let service = null;
    let professional = null;
    let booking = null;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (isCustom) {
          const targetCategory = customCategory || "Spa";
          professional = await claimAvailableProfessional({ category: targetCategory }, session);
          if (!professional) {
            professional = await claimAvailableProfessional({}, session);
          }
        } else {
          if (serviceId) {
            service = await Service.findById(serviceId).session(session);
          }

          if (professionalId) {
            professional = await Professional.findOneAndUpdate(
              { _id: professionalId, status: "Available", active: true },
              { $set: { status: "Busy" } },
              { new: true, session }
            );
          }

          if (!professional && service) {
            professional = await claimAvailableProfessional({ category: service.category }, session);
          }

          if (!professional) {
            professional = await claimAvailableProfessional({}, session);
          }
        }

        const [createdBooking] = await Booking.create(
          [
            {
              user: userId,
              service: isCustom ? null : service ? service._id : null,
              isCustom: !!isCustom,
              customCategory: customCategory || null,
              customDescription: customDescription || null,
              professional: professional ? professional._id : null,
              date: date ? new Date(date) : new Date(),
              timeSlot: timeSlot || "09:00 AM - 11:00 AM",
              address: address || "Default Address",
              contactNumber: contactNumber || "0000000000",
              notes: notes || "",
              selectedProduct: selectedProduct || null,
              paymentMethod: normalizedPaymentMethod,
              paymentStatus: isCash ? "Pending (Cash on Delivery)" : "Pending",
              status: professional ? "Confirmed" : "Assigned",
              totalPrice: bookingAmount
            }
          ],
          { session }
        );
        booking = createdBooking;

        if (isCash) {
          await Payment.create(
            [
              {
                booking: booking._id,
                user: userId,
                amount: bookingAmount,
                status: "Pending",
                paymentMethod: "Cash on Delivery",
                transactionId: `COD-${booking._id}`
              }
            ],
            { session }
          );
        }
      });
    } finally {
      await session.endSession();
    }

    const serviceType = isCustom
      ? (customCategory || "Custom")
      : (service ? service.category : "Unknown");

    if (metrics && metrics.totalBookingRequests) {
      metrics.totalBookingRequests.labels(serviceType).inc();
    }

    if (metrics && metrics.queueLength && queueIncremented) {
      metrics.queueLength.dec();
      queueIncremented = false;
    }

    if (isCash) {
      if (metrics && metrics.bookingsConfirmed) metrics.bookingsConfirmed.inc();
      if (metrics && metrics.activeBookings) metrics.activeBookings.inc();
    }

    processNotificationSimulation(booking, userId).catch((notificationError) => {
      logger.error({ err: notificationError.message }, "Background email notification error");
    });

    await booking.populate("professional");
    await booking.populate("service");

    return res.status(201).json({
      success: true,
      requiresPayment: !isCash,
      message: isCash
        ? "Booking confirmed! Payment will be collected in cash upon service completion."
        : "Booking created. Complete payment to confirm.",
      booking
    });
  } catch (error) {
    logger.error({ err: error.message }, "CREATE BOOKING ERROR");

    if (metrics && metrics.queueLength && queueIncremented) {
      metrics.queueLength.dec();
    }

    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// ============================================================
// GET USER BOOKINGS
// ============================================================
const getUserBookings = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const userId = req.user._id;

    const bookings = await Booking.find({ user: userId })
      .populate("service")
      .populate("professional")
      .sort({ createdAt: -1 })
      .lean();

    const enrichedBookings = await Promise.all(
      (bookings || []).map(async (booking) => {
        try {
          const [payments, notifications] = await Promise.all([
            Payment.find({ booking: booking._id }).sort({ createdAt: -1 }).lean(),
            Notification.find({ booking: booking._id }).sort({ createdAt: -1 }).lean()
          ]);
          return { ...booking, payments: payments || [], notifications: notifications || [] };
        } catch (error) {
          logger.error({ err: error.message }, "BOOKING HISTORY ENRICHMENT ERROR");
          return { ...booking, payments: [], notifications: [] };
        }
      })
    );

    return res.status(200).json({ success: true, bookings: enrichedBookings });
  } catch (error) {
    logger.error({ err: error.message }, "GET USER BOOKINGS ERROR");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// ============================================================
// GET ASSIGNED BOOKINGS FOR PROFESSIONAL
// ============================================================
const getProfessionalBookings = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const userId = req.user._id;
    const professional = await Professional.findOne({ user: userId });

    if (!professional) {
      return res.status(200).json({ success: true, bookings: [] });
    }

    const bookings = await Booking.find({ professional: professional._id })
      .populate("service")
      .populate("user", "name email phone address")
      .sort({ createdAt: -1 })
      .lean();

    const enrichedBookings = await Promise.all(
      (bookings || []).map(async (booking) => {
        try {
          const [payments, notifications] = await Promise.all([
            Payment.find({ booking: booking._id }).lean(),
            Notification.find({ booking: booking._id }).lean()
          ]);
          return { ...booking, payments: payments || [], notifications: notifications || [] };
        } catch (error) {
          logger.error({ err: error.message }, "PROFESSIONAL BOOKING ENRICHMENT ERROR");
          return { ...booking, payments: [], notifications: [] };
        }
      })
    );

    return res.status(200).json({ success: true, bookings: enrichedBookings });
  } catch (error) {
    logger.error({ err: error.message }, "GET PROFESSIONAL BOOKINGS ERROR");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// ============================================================
// ACCEPT BOOKING
// ============================================================
const acceptBooking = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const professional = await Professional.findOne({ user: req.user._id });

    if (!professional) {
      return res.status(403).json({ success: false, message: "Professional access required" });
    }

    const { id } = req.params;
    const booking = await Booking.findOne({ _id: id, professional: professional._id });

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (!canTransition(booking.status, "Confirmed")) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition booking from ${booking.status} to Confirmed`
      });
    }

    booking.status = "Confirmed";


    if (booking.paymentMethod === "Cash on Delivery") {
      booking.paymentStatus = "Pending (Cash on Delivery)";
    }

    await booking.save();

    if (metrics && metrics.bookingsConfirmed) metrics.bookingsConfirmed.inc();

    return res.status(200).json({ success: true, message: "Booking accepted & confirmed!", booking });
  } catch (error) {
    logger.error({ err: error.message }, "ACCEPT BOOKING ERROR");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// ============================================================
// COMPLETE BOOKING
// ============================================================
const completeBooking = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const { id } = req.params;
    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const isOwner = booking.user.toString() === req.user._id.toString();
    let isAssignedProfessional = false;

    if (booking.professional) {
      const professional = await Professional.findOne({
        _id: booking.professional,
        user: req.user._id
      });
      isAssignedProfessional = !!professional;
    }

    if (!isOwner && !isAssignedProfessional) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to complete this booking"
      });
    }

    if (!canTransition(booking.status, "Completed")) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition booking from ${booking.status} to Completed`
      });
    }

    booking.status = "Completed";


    if (booking.paymentMethod === "Cash on Delivery") {
      booking.paymentStatus = "Paid (Cash Collected)";

      await Payment.findOneAndUpdate(
        { booking: booking._id, paymentMethod: "Cash on Delivery" },
        { status: "Success" }
      );

      if (metrics && metrics.paymentSuccess) metrics.paymentSuccess.inc();
    }

    await booking.save();

    // Professional becomes available again — then immediately check
    // whether anyone else is waiting for exactly this category, so a
    // booking that got stuck at "no professional available" doesn't
    // sit there forever once someone frees up.
    if (booking.professional) {
      const freedProfessional = await Professional.findByIdAndUpdate(
        booking.professional,
        { status: "Available" },
        { new: true }
      );
      if (freedProfessional) {
        reassignWaitingWork(freedProfessional.category).catch((err) =>
          logger.error({ err: err.message }, "Auto-reassignment error after completeBooking")
        );
      }
    }

    processCompletionEmailNotification(booking, booking.user).catch((emailError) => {
      logger.error({ err: emailError.message }, "Background completion email error");
    });

    if (metrics && metrics.bookingsCompleted) metrics.bookingsCompleted.inc();
    if (metrics && metrics.activeBookings) metrics.activeBookings.dec();

    return res.status(200).json({
      success: true,
      message: "Service marked as COMPLETED! Completion email sent to customer email.",
      booking
    });
  } catch (error) {
    logger.error({ err: error.message }, "COMPLETE BOOKING ERROR");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// ============================================================
// CANCEL BOOKING
// ============================================================
const cancelBooking = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const { id } = req.params;
    const booking = await Booking.findOne({ _id: id, user: req.user._id });

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (!canTransition(booking.status, "Cancelled")) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition booking from ${booking.status} to Cancelled`
      });
    }

    booking.status = "Cancelled";


    if (booking.paymentStatus === "Paid") {
      const refund = await refundPayment(booking._id);
      if (refund) {
        booking.paymentStatus = "Refunded";
        if (metrics && metrics.paymentRefunded) metrics.paymentRefunded.inc();
      }
    }

    await booking.save();

    // Same reassignment hook as completeBooking — a cancellation also
    // frees up a professional that a waiting customer could use.
    if (booking.professional) {
      const freedProfessional = await Professional.findByIdAndUpdate(
        booking.professional,
        { status: "Available" },
        { new: true }
      );
      if (freedProfessional) {
        reassignWaitingWork(freedProfessional.category).catch((err) =>
          logger.error({ err: err.message }, "Auto-reassignment error after cancelBooking")
        );
      }
    }

    if (metrics && metrics.bookingsCancelled) metrics.bookingsCancelled.inc();
    if (metrics && metrics.activeBookings) metrics.activeBookings.dec();

    return res.status(200).json({ success: true, message: "Booking cancelled successfully", booking });
  } catch (error) {
    logger.error({ err: error.message }, "CANCEL BOOKING ERROR");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// ============================================================
// RATE AND REVIEW BOOKING
// ============================================================
const rateBooking = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const { id } = req.params;
    const { rating, review } = req.body;
    const userId = req.user._id;
    const numericRating = Number(rating);

    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ success: false, message: "Invalid rating value (1-5)" });
    }

    const booking = await Booking.findOne({ _id: id, user: userId });

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (booking.status !== "Completed") {
      return res.status(400).json({ success: false, message: "Only completed bookings can be rated" });
    }

    if (booking.userRating) {
      return res.status(400).json({ success: false, message: "This booking has already been rated" });
    }

    booking.userRating = numericRating;
    booking.userReview = typeof review === "string" ? review.trim() : "";
    await booking.save();

    if (booking.service) {
      try {
        await Service.findByIdAndUpdate(
          booking.service,
          [
            {
              $set: {
                ratingCount: { $add: [{ $ifNull: ["$ratingCount", 0] }, 1] },
                rating: {
                  $round: [
                    {
                      $divide: [
                        {
                          $add: [
                            {
                              $multiply: [
                                { $ifNull: ["$rating", 0] },
                                { $ifNull: ["$ratingCount", 0] }
                              ]
                            },
                            numericRating
                          ]
                        },
                        { $add: [{ $ifNull: ["$ratingCount", 0] }, 1] }
                      ]
                    },
                    1
                  ]
                }
              }
            }
          ]
        );
      } catch (serviceUpdateError) {
        logger.error(
          { err: serviceUpdateError.message, serviceId: booking.service },
          "Failed to atomically update service ratingCount"
        );
      }
    }

    return res.status(200).json({ success: true, message: "Thank you for your rating!", booking });
  } catch (error) {
    logger.error({ err: error.message }, "RATE BOOKING ERROR");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

module.exports = {
  createBooking,
  getUserBookings,
  getProfessionalBookings,
  acceptBooking,
  completeBooking,
  cancelBooking,
  rateBooking
};