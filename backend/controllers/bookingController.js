const Booking = require("../models/Booking");
const Service = require("../models/Service");
const Professional = require("../models/Professional");
const Payment = require("../models/Payment");
const Notification = require("../models/Notification");
const { reassignWaitingWork, reserveProfessional, releaseBookingReservation, canTransition } = require("../services/customerCore");
const {
  processNotificationSimulation,
  processCompletionEmailNotification
} = require("../services/simulationService");
const { generateImageUrl } = require("../services/blobStorage");
const { getScheduledEnd, hasScheduledTimeEnded, validateSchedule } = require("../services/booking/bookingSchedule");
const { customerCancellationQuote, cancelBooking: cancelWithRefund } = require("../services/booking/bookingLifecycle");
const { calculateBookingPrice } = require("../services/pricing");
const metrics = require("../metrics");
const logger = require("../utils/logger");

// Categories a custom request can target (Service.category enum).
const CUSTOM_CATEGORIES = ["Spa", "Electrician", "Carpentry", "Plumbing", "Security", "Repair", "Cleaning"];
// Unpaid online bookings a customer may hold at once (each one reserves a slot).
const MAX_UNPAID_BOOKINGS = 3;

// Populated services only carry imageKey; attach the signed imageUrl so
// each booking card shows its own service image instead of a placeholder.
async function withServiceImageUrl(service) {
  if (!service || !service.imageKey) return service;
  try {
    return { ...service, imageUrl: await generateImageUrl(service.imageKey) };
  } catch (error) {
    logger.error({ err: error.message }, "BOOKING SERVICE IMAGE URL ERROR");
    return service;
  }
}

// ============================================================
// CREATE NEW BOOKING
// ============================================================
const createBooking = async (req, res) => {
  let queueIncremented = false;

  try {
    const {
      serviceId, professionalId, date, timeSlot, address, contactNumber,
      notes, selectedProduct, paymentMethod,
      isCustom, customCategory, customDescription
    } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }
    const userId = req.user._id;

    // Real dates and slots only: no past dates, no slot that already started.
    const schedule = validateSchedule(date, timeSlot);
    if (!schedule.ok) {
      return res.status(400).json({ success: false, message: schedule.message });
    }

    let service = null;
    let category;
    if (isCustom) {
      if (!CUSTOM_CATEGORIES.includes(customCategory)) {
        return res.status(400).json({ success: false, message: "Please choose a valid category for your custom request" });
      }
      category = customCategory;
    } else {
      service = serviceId ? await Service.findOne({ _id: serviceId, active: true }) : null;
      if (!service) {
        return res.status(404).json({ success: false, message: "This service is not available right now" });
      }
      category = service.category;
    }

    // The price is always computed here — the client's total is ignored.
    const price = calculateBookingPrice(service, isCustom ? null : selectedProduct, Boolean(isCustom));
    if (!price.ok) {
      return res.status(400).json({ success: false, message: price.message });
    }

    const isCash = String(paymentMethod || "").toLowerCase().includes("cash");

    if (!isCash) {
      const unpaid = await Booking.countDocuments({ user: userId, status: "Created", paymentStatus: "Pending" });
      if (unpaid >= MAX_UNPAID_BOOKINGS) {
        return res.status(429).json({
          success: false,
          message: "You have unpaid bookings waiting. Complete or cancel them before booking again."
        });
      }
    }

    if (metrics && metrics.queueLength) {
      metrics.queueLength.inc();
      queueIncremented = true;
    }

    // Online bookings stay "Created" (holding the slot) until payment is
    // verified; unpaid ones expire after 15 minutes (services/scheduler.js).
    let booking = await Booking.create({
      user: userId,
      service: service ? service._id : null,
      isCustom: Boolean(isCustom),
      customCategory: isCustom ? customCategory : null,
      customDescription: isCustom ? customDescription : null,
      professional: null,
      date: schedule.date,
      timeSlot,
      address,
      contactNumber,
      notes: notes || "",
      selectedProduct: price.product,
      paymentMethod: isCash ? "Cash on Delivery" : "Razorpay",
      paymentStatus: isCash ? "Pending (Cash on Delivery)" : "Pending",
      status: isCash ? "Assigned" : "Created",
      subtotal: price.subtotal,
      gst: price.gst,
      totalPrice: price.total
    });

    if (isCash) {
      try {
        await Payment.create({
          booking: booking._id,
          user: userId,
          amount: price.total,
          status: "Pending",
          paymentMethod: "Cash on Delivery",
          transactionId: `COD-${booking._id}`
        });
      } catch (paymentError) {
        await Booking.deleteOne({ _id: booking._id });
        throw paymentError;
      }
    }

    // Best-rated professional who is free for this date + slot (the
    // customer's own pick is tried first). Nobody free → the booking waits
    // and the scheduler keeps trying until the slot starts.
    const matchStart = Date.now();
    const { professional } = await reserveProfessional({
      category,
      date: schedule.date,
      timeSlot,
      bookingId: booking._id,
      preferredProfessionalId: professionalId || null
    });

    if (professional) {
      if (metrics && metrics.professionalAssignmentTime) {
        metrics.professionalAssignmentTime.observe((Date.now() - matchStart) / 1000);
      }
      booking = await Booking.findByIdAndUpdate(
        booking._id,
        {
          $set: {
            professional: professional._id,
            ...(isCash ? { status: "Confirmed" } : {})
          }
        },
        { new: true }
      );
    }

    if (metrics && metrics.totalBookingRequests) {
      metrics.totalBookingRequests.labels(category).inc();
    }
    if (metrics && metrics.queueLength && queueIncremented) {
      metrics.queueLength.dec();
      queueIncremented = false;
    }
    if (isCash) {
      if (professional && metrics && metrics.bookingsConfirmed) metrics.bookingsConfirmed.inc();
      if (metrics && metrics.activeBookings) metrics.activeBookings.inc();
      processNotificationSimulation(booking, userId).catch((notificationError) => {
        logger.error({ err: notificationError.message }, "Background email notification error");
      });
    }

    await booking.populate("professional");
    await booking.populate("service");

    let message;
    if (!isCash) {
      message = "Booking created. Complete payment within 15 minutes to confirm it.";
    } else if (professional) {
      message = "Booking confirmed! Payment will be collected in cash after the service.";
    } else {
      message = "Booking received! No professional is free for that slot yet — we'll assign a professional as soon as someone is available.";
    }

    return res.status(201).json({ success: true, requiresPayment: !isCash, message, booking });
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
          const service = await withServiceImageUrl(booking.service);
          return { ...booking, service, payments: payments || [], notifications: notifications || [] };
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
          const service = await withServiceImageUrl(booking.service);
          return { ...booking, service, payments: payments || [], notifications: notifications || [] };
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

    // Admins can complete a booking at any time. The customer who owns the
    // booking can only complete it once its booked time slot has ended.
    const isAdmin = req.user.role === "admin";
    const isOwner = booking.user && booking.user.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: "You are not allowed to complete this booking" });
    }

    if (booking.status === "Completed") {
      return res.status(400).json({ success: false, message: "This booking is already completed" });
    }

    if (!canTransition(booking.status, "Completed")) {
      return res.status(400).json({
        success: false,
        message: booking.status === "Created"
          ? "This booking hasn't been paid yet, so it can't be completed"
          : `Cannot transition booking from ${booking.status} to Completed`
      });
    }

    const isCash = booking.paymentMethod === "Cash on Delivery";
    if (!isCash && booking.paymentStatus !== "Paid") {
      return res.status(400).json({ success: false, message: "Only paid bookings can be completed" });
    }

    if (!isAdmin && !hasScheduledTimeEnded(booking)) {
      const end = getScheduledEnd(booking);
      return res.status(400).json({
        success: false,
        message: `You can mark this service completed after its time slot ends (${end.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })})`
      });
    }

    // Atomic Confirmed → Completed, so a double click can't complete twice.
    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, status: booking.status },
      { $set: { status: "Completed", ...(isCash ? { paymentStatus: "Paid (Cash Collected)" } : {}) } },
      { new: true }
    );
    if (!updated) {
      return res.status(409).json({ success: false, message: "This booking was just updated. Please refresh." });
    }

    if (isCash) {
      await Payment.findOneAndUpdate(
        { booking: updated._id, paymentMethod: "Cash on Delivery" },
        { status: "Success" }
      );
      if (metrics && metrics.paymentSuccess) metrics.paymentSuccess.inc();
    }

    // The professional's slot is free again, and their job count goes up.
    await releaseBookingReservation(updated._id);
    if (updated.professional) {
      await Professional.updateOne({ _id: updated.professional }, { $inc: { completedJobs: 1 } });
    }
    reassignWaitingWork().catch((err) =>
      logger.error({ err: err.message }, "Auto-reassignment error after completeBooking")
    );

    processCompletionEmailNotification(updated, updated.user).catch((emailError) => {
      logger.error({ err: emailError.message }, "Background completion email error");
    });

    if (metrics && metrics.bookingsCompleted) metrics.bookingsCompleted.inc();
    if (metrics && metrics.activeBookings) metrics.activeBookings.dec();
    if (metrics && metrics.averageBookingLatency && updated.createdAt) {
      const latencySeconds = (Date.now() - new Date(updated.createdAt).getTime()) / 1000;
      if (latencySeconds >= 0) {
        metrics.averageBookingLatency.observe(latencySeconds);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Service marked as COMPLETED! Completion email sent to customer email.",
      booking: updated
    });
  } catch (error) {
    logger.error({ err: error.message }, "COMPLETE BOOKING ERROR");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// ============================================================
// CANCEL BOOKING
// ============================================================
// Free until FREE_CANCEL_HOURS before the slot; a late cancellation keeps
// a fee; no customer cancellation once the visit has started.
const cancelBooking = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id });
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const quote = customerCancellationQuote(booking);
    if (!quote.allowed) {
      return res.status(400).json({ success: false, message: quote.reason });
    }

    const updated = await cancelWithRefund(booking, {
      by: "customer",
      reason: typeof req.body?.reason === "string" ? req.body.reason.slice(0, 300) : "Cancelled by customer",
      fee: quote.fee,
      refundAmount: quote.refund
    });
    if (!updated) {
      return res.status(409).json({ success: false, message: "This booking was just updated. Please refresh." });
    }

    reassignWaitingWork().catch((err) =>
      logger.error({ err: err.message }, "Auto-reassignment error after cancelBooking")
    );

    let message = "Booking cancelled successfully";
    if (updated.paymentStatus === "Refunded") message = `Booking cancelled. ₹${quote.refund} will be refunded to your original payment method.`;
    if (updated.paymentStatus === "Partially Refunded") message = `Booking cancelled. A late-cancellation fee of ₹${quote.fee} applies; ₹${quote.refund} will be refunded.`;
    if (updated.paymentStatus === "Refund Pending") message = "Booking cancelled. Your refund is being processed and will be retried automatically.";

    return res.status(200).json({ success: true, message, booking: updated });
  } catch (error) {
    logger.error({ err: error.message }, "CANCEL BOOKING ERROR");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// GET /api/bookings/:id/cancel-quote — what cancelling now would cost.
const getCancellationQuote = async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id });
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    return res.status(200).json({ success: true, quote: customerCancellationQuote(booking) });
  } catch (error) {
    logger.error({ err: error.message }, "CANCEL QUOTE ERROR");
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

    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be a whole number from 1 to 5" });
    }

    const booking = await Booking.findOne({ _id: id, user: userId });

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (booking.status !== "Completed") {
      return res.status(400).json({ success: false, message: "Only completed bookings can be rated" });
    }

    // Atomic "rate once": only succeeds if nobody rated it yet.
    const rated = await Booking.findOneAndUpdate(
      { _id: booking._id, userRating: { $exists: false } },
      { $set: { userRating: numericRating, userReview: typeof review === "string" ? review.trim() : "" } },
      { new: true }
    );
    if (!rated) {
      return res.status(400).json({ success: false, message: "This booking has already been rated" });
    }
    booking.userRating = rated.userRating;
    booking.userReview = rated.userReview;

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
          ],
          // Mongoose 9 rejects aggregation-pipeline updates without this flag
          // (which is why service ratings silently never updated before).
          { updatePipeline: true }
        );
      } catch (serviceUpdateError) {
        logger.error(
          { err: serviceUpdateError.message, serviceId: booking.service },
          "Failed to atomically update service ratingCount"
        );
      }
    }

    // The professional's own rating follows the same running average.
    if (booking.professional) {
      try {
        await Professional.updateOne({ _id: booking.professional }, [
        {
          $set: {
            ratingCount: { $add: [{ $ifNull: ["$ratingCount", 0] }, 1] },
            rating: {
              $round: [
                {
                  $divide: [
                    { $add: [{ $multiply: [{ $ifNull: ["$rating", 0] }, { $ifNull: ["$ratingCount", 0] }] }, numericRating] },
                    { $add: [{ $ifNull: ["$ratingCount", 0] }, 1] }
                  ]
                },
                1
              ]
            }
          }
        }
      ], { updatePipeline: true });
      } catch (professionalUpdateError) {
        logger.error({ err: professionalUpdateError.message }, "Failed to update professional rating");
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
  getCancellationQuote,
  rateBooking
};