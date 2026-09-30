const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const { dispatchNotification } = require("../services/notificationService");
const { NOTIFICATION_TYPES } = require("../services/notificationTypes");
const logger = require("../utils/logger");

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
