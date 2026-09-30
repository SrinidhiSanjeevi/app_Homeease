const notificationClient = require("./notification/notificationClient");

const NOTIFICATION_TYPES = {
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  BOOKING_COMPLETED: "BOOKING_COMPLETED"
};

const processNotificationSimulation = async (booking, userId) => {
  const bookingId = booking._id || booking;
  const { notification } = await notificationClient.dispatch({
    type: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
    bookingId,
    userId
  });
  return notification ? [notification] : [];
};

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
