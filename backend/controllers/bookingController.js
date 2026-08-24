const Booking = require("../models/Booking");
const Service = require("../models/Service");
const Professional = require("../models/Professional");
const Payment = require("../models/Payment");
const Notification = require("../models/Notification");
const {
  processPaymentSimulation,
  processNotificationSimulation,
  processCompletionEmailNotification
} = require("../services/simulationService");
const metrics = require("../metrics");

// ============================================================
// CREATE NEW BOOKING
// Directly auto-assigns an available professional
// ============================================================
const createBooking = async (req, res) => {
  let queueIncremented = false;
  try {
    const {
      serviceId,
      professionalId,
      date,
      timeSlot,
      address,
      contactNumber,
      notes,
      selectedProduct,
      paymentMethod,
      totalPrice,
      isCustom,
      customCategory,
      customDescription
    } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    const userId = req.user._id;

    if (metrics && metrics.queueLength) {
      metrics.queueLength.inc();
      queueIncremented = true;
    }

    let service = null;
    let professional = null;

    if (isCustom) {
      const targetCategory = customCategory || (service ? service.category : "Spa");
      professional = await Professional.findOne({
        category: targetCategory,
        status: "Available"
      }).sort({ rating: -1 });

      if (!professional) {
        professional = await Professional.findOne({
          status: "Available"
        }).sort({ rating: -1 });
      }
    } else {
      if (serviceId) {
        service = await Service.findById(serviceId);
      }
      if (professionalId) {
        professional = await Professional.findOne({
          _id: professionalId,
          status: "Available"
        });
      }
      if (!professional && service) {
        professional = await Professional.findOne({
          category: service.category,
          status: "Available"
        }).sort({ rating: -1 });
      }
      if (!professional) {
        professional = await Professional.findOne({
          status: "Available"
        }).sort({ rating: -1 });
      }
    }

    const serviceType = isCustom
      ? customCategory || "Custom"
      : service
        ? service.category
        : "Unknown";

    if (metrics && metrics.totalBookingRequests) {
      metrics.totalBookingRequests.labels(serviceType).inc();
    }

    if (metrics && metrics.queueLength && queueIncremented) {
      metrics.queueLength.dec();
      queueIncremented = false;
    }

    if (professional) {
      professional.status = "Busy";
      await professional.save();
    }

    const rawPaymentMethod = paymentMethod || "Online Payment (Simulated)";
    const normalizedRawPaymentMethod = String(rawPaymentMethod).trim();
    const isCash =
      normalizedRawPaymentMethod === "Cash" ||
      normalizedRawPaymentMethod === "Cash on Delivery" ||
      normalizedRawPaymentMethod.toLowerCase().includes("cash");
    const normalizedPaymentMethod = isCash
      ? "Cash on Delivery"
      : "Online Payment (Simulated)";
    const bookingAmount = Number(totalPrice) > 0 ? Number(totalPrice) : 500;

    const booking = await Booking.create({
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
    });

    const { success: paymentSuccess, payment } = await processPaymentSimulation(
      booking,
      userId,
      bookingAmount,
      normalizedPaymentMethod
    );

    if (paymentSuccess) {
      booking.paymentStatus = isCash ? "Pending (Cash on Delivery)" : "Paid";
      // FIX: status must reflect whether a professional was actually
      // assigned, not just whether payment succeeded. Previously this
      // always set "Confirmed" even when professional was null, which
      // caused the UI to show a contradictory "Confirmed" badge next
      // to "Auto-assigning...".
      booking.status = professional ? "Confirmed" : "Assigned";
      if (metrics && metrics.bookingsConfirmed) {
        metrics.bookingsConfirmed.inc();
      }
      if (metrics && metrics.activeBookings) {
        metrics.activeBookings.inc();
      }
    } else {
      booking.paymentStatus = "Failed";
      booking.status = "Cancelled";
      if (metrics && metrics.bookingsCancelled) {
        metrics.bookingsCancelled.inc();
      }
      if (professional) {
        professional.status = "Available";
        await professional.save();
      }
    }

    processNotificationSimulation(booking, userId).catch((notificationError) => {
      console.error("Background email notification error:", notificationError.message);
    });

    await booking.save();
    await booking.populate("professional");
    await booking.populate("service");

    const notifications = [];

    return res.status(201).json({
      success: paymentSuccess,
      message: paymentSuccess
        ? (isCash
            ? "Booking confirmed! Payment will be collected in cash upon service completion."
            : "Booking created & payment confirmed!")
        : "Booking failed due to online payment simulation error.",
      booking,
      payment,
      notifications
    });
  } catch (error) {
    console.error("CREATE BOOKING ERROR:", error);
    if (metrics && metrics.queueLength && queueIncremented) {
      metrics.queueLength.dec();
    }
    return res.status(500).json({
      success: false,
      message: "Something went wrong, please try again"
    });
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
          console.error("BOOKING HISTORY ENRICHMENT ERROR:", error.message);
          return { ...booking, payments: [], notifications: [] };
        }
      })
    );

    return res.status(200).json({ success: true, bookings: enrichedBookings });
  } catch (error) {
    console.error("GET USER BOOKINGS ERROR:", error);
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
          console.error("PROFESSIONAL BOOKING ENRICHMENT ERROR:", error.message);
          return { ...booking, payments: [], notifications: [] };
        }
      })
    );

    return res.status(200).json({ success: true, bookings: enrichedBookings });
  } catch (error) {
    console.error("GET PROFESSIONAL BOOKINGS ERROR:", error);
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// ============================================================
// ACCEPT BOOKING
// Professional can accept only their own booking
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
    if (booking.status === "Cancelled" || booking.status === "Completed") {
      return res.status(400).json({
        success: false,
        message: `Cannot accept booking in ${booking.status} status`
      });
    }
    booking.status = "Confirmed";
    if (booking.paymentMethod === "Cash" || booking.paymentMethod === "Cash on Delivery") {
      booking.paymentStatus = "Pending (Cash on Delivery)";
    } else {
      booking.paymentStatus = "Paid";
    }
    await booking.save();
    if (metrics && metrics.bookingsConfirmed) {
      metrics.bookingsConfirmed.inc();
    }
    return res.status(200).json({ success: true, message: "Booking accepted & confirmed!", booking });
  } catch (error) {
    console.error("ACCEPT BOOKING ERROR:", error);
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// ============================================================
// COMPLETE BOOKING
// FIX: previously required the requester to BE the assigned
// professional, which silently 403'd customers even though the
// frontend showed them a "Mark Service Completed" button. Now
// either the booking's own customer OR the assigned professional
// may complete it.
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

    if (booking.status === "Cancelled") {
      return res.status(400).json({ success: false, message: "Cannot complete a cancelled booking" });
    }
    if (booking.status === "Completed") {
      return res.status(400).json({ success: false, message: "Booking is already completed" });
    }

    booking.status = "Completed";
    if (booking.paymentMethod === "Cash" || booking.paymentMethod === "Cash on Delivery") {
      booking.paymentStatus = "Paid (Cash Collected)";
    } else {
      booking.paymentStatus = "Paid";
    }
    await booking.save();

    if (booking.professional) {
      await Professional.findByIdAndUpdate(booking.professional, { status: "Available" });
    }

    processCompletionEmailNotification(booking, booking.user).catch((emailError) => {
      console.error("Background completion email error:", emailError.message);
    });

    if (metrics && metrics.bookingsCompleted) metrics.bookingsCompleted.inc();
    if (metrics && metrics.activeBookings) metrics.activeBookings.dec();

    return res.status(200).json({
      success: true,
      message: "Service marked as COMPLETED! Completion email sent to customer email.",
      booking
    });
  } catch (error) {
    console.error("COMPLETE BOOKING ERROR:", error);
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
    if (booking.status === "Cancelled" || booking.status === "Completed") {
      return res.status(400).json({
        success: false,
        message: `Booking cannot be cancelled. Current status is ${booking.status}`
      });
    }
    booking.status = "Cancelled";
    await booking.save();
    if (booking.professional) {
      await Professional.findByIdAndUpdate(booking.professional, { status: "Available" });
    }
    if (metrics && metrics.bookingsCancelled) {
      metrics.bookingsCancelled.inc();
    }
    if (metrics && metrics.activeBookings) {
      metrics.activeBookings.dec();
    }
    return res.status(200).json({ success: true, message: "Booking cancelled successfully", booking });
  } catch (error) {
    console.error("CANCEL BOOKING ERROR:", error);
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
      const service = await Service.findById(booking.service);
      if (service) {
        const currentTotalRatings = service.rating * service.numRatings;
        const newNumRatings = service.numRatings + 1;
        const newAverageRating = (currentTotalRatings + numericRating) / newNumRatings;
        service.rating = Math.round(newAverageRating * 10) / 10;
        service.numRatings = newNumRatings;
        await service.save();
      }
    }

    return res.status(200).json({ success: true, message: "Thank you for your rating!", booking });
  } catch (error) {
    console.error("RATE BOOKING ERROR:", error);
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