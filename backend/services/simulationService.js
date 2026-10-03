const notificationClient = require("./notification/notificationClient");
const metrics = require("../metrics");

const NOTIFICATION_TYPES = {
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  BOOKING_COMPLETED: "BOOKING_COMPLETED",
  PROFESSIONAL_NEW_JOB: "PROFESSIONAL_NEW_JOB"
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

// Tells the service provider about the job. Without an email on the professional the notification
// service falls back to the admin mailbox.
const processProfessionalAssignedNotification = async (booking, userId, professional) => {
  const bookingId = booking._id || booking;
  const { notification } = await dispatchCounted({
    type: NOTIFICATION_TYPES.PROFESSIONAL_NEW_JOB,
    bookingId,
    userId,
    recipientEmail: professional && professional.email ? professional.email : undefined,
    recipientName: professional && professional.name ? professional.name : undefined
  });
  return notification || null;
};

// Customer "booking confirmed" + service-provider "new job" emails, for a booking that now has a professional.
// Safe to call more than once: the notification service de-duplicates per booking and notification type.
const notifyBookingAssigned = async (booking, professional) => {
  const userId = booking.user && booking.user._id ? booking.user._id : booking.user;
  const results = await Promise.allSettled([
    processNotificationSimulation(booking, userId),
    processProfessionalAssignedNotification(booking, userId, professional)
  ]);
  const failed = results.find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
};

module.exports = {
  notifyBookingAssigned,
  processNotificationSimulation,
  processProfessionalAssignedNotification,
  processCompletionEmailNotification
};
