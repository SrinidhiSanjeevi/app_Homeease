const { dispatchNotification } = require("./notification/notificationService");
const { NOTIFICATION_TYPES } = require("./notification/notificationTypes");

/**
 * Backward-compatible adapter delegating to the unified notificationService.
 */
const processNotificationSimulation = async (booking, userId) => {
  const doc = await dispatchNotification({
    type: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
    booking,
    userId
  });
  return doc ? [doc] : [];
};

/**
 * Backward-compatible adapter for service completion notification.
 */
const processCompletionEmailNotification = async (booking, userId) => {
  return dispatchNotification({
    type: NOTIFICATION_TYPES.BOOKING_COMPLETED,
    booking,
    userId
  });
};

module.exports = {
  processNotificationSimulation,
  processCompletionEmailNotification
};
