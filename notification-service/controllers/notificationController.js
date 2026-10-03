const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const { dispatchNotification } = require("../services/notificationService");
const { NOTIFICATION_TYPES } = require("../services/notificationTypes");
const logger = require("../utils/logger");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const dispatch = async (req, res) => {
  try {
    const { type, bookingId, userId, recipientEmail, recipientName } = req.body || {};

    if (!type || !Object.values(NOTIFICATION_TYPES).includes(type)) {
      return res.status(400).json({ success: false, message: "A valid notification type is required" });
    }
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, message: "A valid bookingId is required" });
    }
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "A valid userId is required" });
    }

    // An explicit recipient is only honoured for provider notifications (customers are always looked up by userId).
    const isProviderMail = type === NOTIFICATION_TYPES.PROFESSIONAL_NEW_JOB;
    const providerEmail = isProviderMail && recipientEmail ? String(recipientEmail).trim().toLowerCase() : undefined;
    if (providerEmail && !EMAIL_RE.test(providerEmail)) {
      return res.status(400).json({ success: false, message: "recipientEmail is not a valid email address" });
    }
    const notification = await dispatchNotification({
      type,
      booking: bookingId,
      userId,
      recipientEmail: providerEmail,
      recipientName: isProviderMail && recipientName ? String(recipientName).slice(0, 80) : undefined
    });

    return res.status(202).json({ success: true, notification: notification || null });
  } catch (error) {
    logger.error({ err: error.message }, "Internal Dispatch Notification Error");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const getNotificationsForBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, message: "Invalid booking id" });
    }

    const notifications = await Notification.find({ booking: { $eq: bookingId } }).sort({ createdAt: -1 }).lean();
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
