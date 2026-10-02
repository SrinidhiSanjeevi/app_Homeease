const notificationClient = require("./notification/notificationClient");
const metrics = require("../metrics");

const NOTIFICATION_TYPES = {
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  BOOKING_COMPLETED: "BOOKING_COMPLETED"
};

// Every dispatch ends in exactly one of the two counters, so
// success + failures always equals the number of notifications attempted.
const dispatchCounted = async (payload) => {
  try {
    const result = await notificationClient.dispatch(payload);
    metrics.notificationSuccess.inc();
    return result;
  } catch (error) {
    metrics.notificationFailures.inc();
    throw error;
  }
};

const processNotificationSimulation = async (booking, userId) => {
  const bookingId = booking._id || booking;
  const { notification } = await dispatchCounted({
    type: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
    bookingId,
    userId
  });
  return notification ? [notification] : [];
};

const processCompletionEmailNotification = async (booking, userId) => {
  const bookingId = booking._id || booking;
  const { notification } = await dispatchCounted({
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
