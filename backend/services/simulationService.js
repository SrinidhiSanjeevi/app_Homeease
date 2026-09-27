const notificationClient = require("./notification/notificationClient");

// Mirrors notification-service's services/notificationTypes.js NOTIFICATION_TYPES
// enum (the canonical source now that notification-service owns dispatch).
const NOTIFICATION_TYPES = {
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  BOOKING_COMPLETED: "BOOKING_COMPLETED"
};

/**
 * Backward-compatible adapter delegating to notification-service over HTTP
 * instead of the old in-process dispatchNotification(...) call. Every call
 * site already invokes this fire-and-forget with a `.catch(...)`, so a
 * thrown 503 (notification-service unreachable) is swallowed there exactly
 * like a local processing error used to be — same contract as
 * processCompletionEmailNotification below.
 */
const processNotificationSimulation = async (booking, userId) => {
  const bookingId = booking._id || booking;
  const { notification } = await notificationClient.dispatch({
    type: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
    bookingId,
    userId
  });
  return notification ? [notification] : [];
};

/**
 * Backward-compatible adapter for service completion notification.
 */
const processCompletionEmailNotification = async (booking, userId) => {
  const bookingId = booking._id || booking;
  const { notification } = await notificationClient.dispatch({
    type: NOTIFICATION_TYPES.BOOKING_COMPLETED,
    bookingId,
    userId
  });
  return notification || null;
};

module.exports = {
  processNotificationSimulation,
  processCompletionEmailNotification
};
