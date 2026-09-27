/**
 * Internal Notifications Controller
 *
 * Backs the /api/internal/notifications/* routes that `backend`
 * (booking-service) calls over HTTP for booking-lifecycle notifications,
 * instead of dispatching them in-process. Gated solely by
 * requireInternalToken — no end-user JWT.
 */

const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const { dispatchNotification } = require("../services/notificationService");
const { NOTIFICATION_TYPES } = require("../services/notificationTypes");
const logger = require("../utils/logger");

// POST /api/internal/notifications/dispatch — same fire-and-forget contract
// callers already used against the in-process dispatchNotification: the
// caller doesn't await delivery succeeding, only that the outbox record was
// enqueued and a first delivery attempt was made. Responds 202 once that
// synchronous enqueue+process completes (matching how long today's
// in-process call already took the caller, which itself awaits this inside
// a `.catch(...)`-guarded, non-blocking background call).
const dispatch = async (req, res) => {
  try {
    const { type, bookingId, userId } = req.body || {};

    if (!type || !Object.values(NOTIFICATION_TYPES).includes(type)) {
      return res.status(400).json({ success: false, message: "A valid notification type is required" });
    }
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, message: "A valid bookingId is required" });
    }
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "A valid userId is required" });
    }

    const notification = await dispatchNotification({ type, booking: bookingId, userId });

    return res.status(202).json({ success: true, notification: notification || null });
  } catch (error) {
    logger.error({ err: error.message }, "Internal Dispatch Notification Error");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// GET /api/internal/notifications/booking/:bookingId — replaces backend's
// local Notification.find({ booking }) in getUserBookings/getProfessionalBookings.
const getNotificationsForBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, message: "Invalid booking id" });
    }

    const notifications = await Notification.find({ booking: bookingId }).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, notifications: notifications || [] });
  } catch (error) {
    logger.error({ err: error.message }, "Internal Get Notifications For Booking Error");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

module.exports = {
  dispatch,
  getNotificationsForBooking
};
