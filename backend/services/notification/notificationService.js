const Notification = require("../../models/Notification");
const User = require("../../models/User");
const metrics = require("../../metrics");
const logger = require("../../utils/logger");
const { sendEmail } = require("./emailProvider");
const {
  getBookingConfirmedTemplate,
  getBookingCompletedTemplate
} = require("./notificationTemplates");
const { NOTIFICATION_TYPES, NOTIFICATION_CHANNELS } = require("./notificationTypes");

async function dispatchNotification({ type, booking, userId }) {
  try {
    const userDoc = await User.findById(userId).lean();
    const recipientEmail = userDoc?.email || "customer@homeease.com";
    const recipientName = userDoc?.name || "Customer";
    const bookingRef = booking._id.toString().slice(-6).toUpperCase();

    let templateData = null;

    switch (type) {
      case NOTIFICATION_TYPES.BOOKING_CONFIRMED:
        templateData = getBookingConfirmedTemplate({
          recipientName,
          bookingRef,
          booking,
          recipientEmail
        });
        break;

      case NOTIFICATION_TYPES.BOOKING_COMPLETED:
        templateData = getBookingCompletedTemplate({
          recipientName,
          bookingRef,
          booking,
          recipientEmail
        });
        break;

      default:
        logger.warn({ type }, "[NotificationService] Unsupported notification type");
        return null;
    }

    const emailResult = await sendEmail({
      to: recipientEmail,
      subject: templateData.subject,
      html: templateData.html
    });

    const status = emailResult.success ? "Success" : "Failure";

    const notificationDoc = await Notification.create({
      booking: booking._id,
      user: userId,
      type: NOTIFICATION_CHANNELS.EMAIL,
      status,
      recipient: recipientEmail,
      message: templateData.message
    });

    if (emailResult.success) {
      if (metrics && metrics.notificationSuccess) metrics.notificationSuccess.inc();
    } else {
      if (metrics && metrics.notificationFailures) metrics.notificationFailures.inc();
    }

    return notificationDoc;
  } catch (error) {
    logger.error({ error: error.message, type, userId }, "[NotificationService] Error dispatching notification");
    if (metrics && metrics.notificationFailures) metrics.notificationFailures.inc();
    return null;
  }
}

module.exports = {
  dispatchNotification
};
