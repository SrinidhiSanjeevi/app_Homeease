const Notification = require("../../models/Notification");
const User = require("../../models/User");
const Booking = require("../../models/Booking");
const metrics = require("../../metrics");
const logger = require("../../utils/logger");
const { sendEmail } = require("./emailProvider");
const {
  getBookingConfirmedTemplate,
  getBookingCompletedTemplate
} = require("./notificationTemplates");
const {
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUS
} = require("./notificationTypes");

const MAX_RETRY_ATTEMPTS = 3;

/**
 * Resolves template data based on notification type and booking.
 */
function resolveTemplateData(type, booking, recipientName, recipientEmail) {
  const bookingRef = (booking._id || booking).toString().slice(-6).toUpperCase();

  switch (type) {
    case NOTIFICATION_TYPES.BOOKING_CONFIRMED:
      return getBookingConfirmedTemplate({
        recipientName,
        bookingRef,
        booking,
        recipientEmail
      });

    case NOTIFICATION_TYPES.BOOKING_COMPLETED:
      return getBookingCompletedTemplate({
        recipientName,
        bookingRef,
        booking,
        recipientEmail
      });

    default:
      return {
        subject: `HomeEase Notification [${bookingRef}]`,
        message: `Notification for booking ${bookingRef}`,
        html: `<p>Notification for booking ${bookingRef}</p>`
      };
  }
}

/**
 * Creates a persistent notification/outbox record with idempotency protection.
 */
async function enqueueNotification({
  type,
  booking,
  userId,
  recipientEmail: explicitEmail,
  recipientName: explicitName,
  channel = NOTIFICATION_CHANNELS.EMAIL
}) {
  try {
    const bookingId = booking._id || booking;
    const idempotencyKey = `booking_${bookingId}_${type}`;

    // ─── Idempotency Check: Prevent duplicate notification records ────────────
    const existingNotification = await Notification.findOne({ idempotencyKey });
    if (existingNotification) {
      logger.info(
        { notificationId: existingNotification._id, idempotencyKey, status: existingNotification.status },
        "[NotificationService] Notification already enqueued/processed (idempotent no-op)"
      );
      return existingNotification;
    }

    let recipientEmail = explicitEmail;
    let recipientName = explicitName;

    if (!recipientEmail || !recipientName) {
      const userDoc = await User.findById(userId).lean();
      recipientEmail = recipientEmail || userDoc?.email || "customer@homeease.com";
      recipientName = recipientName || userDoc?.name || "Customer";
    }

    const templateData = resolveTemplateData(type, booking, recipientName, recipientEmail);

    const notificationDoc = await Notification.create({
      booking: bookingId,
      user: userId,
      type: channel,
      status: NOTIFICATION_STATUS.PENDING,
      recipient: recipientEmail,
      message: templateData.message,
      notificationType: type,
      idempotencyKey,
      attempts: 0,
      maxAttempts: MAX_RETRY_ATTEMPTS,
      nextRetryAt: null
    });

    logger.info(
      { notificationId: notificationDoc._id, idempotencyKey, type },
      "[NotificationService] Enqueued persistent notification outbox record"
    );

    return notificationDoc;
  } catch (error) {
    logger.error(
      { err: error.message, type, userId },
      "[NotificationService] Error enqueuing notification outbox record"
    );
    return null;
  }
}

/**
 * Delivers a single notification outbox record with retry and backoff logic.
 */
async function processNotification(notificationId) {
  try {
    // ─── Atomically claim and lock the notification ───────────────────────────
    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        status: { $in: [NOTIFICATION_STATUS.PENDING, NOTIFICATION_STATUS.FAILED, NOTIFICATION_STATUS.FAILURE] },
        attempts: { $lt: MAX_RETRY_ATTEMPTS }
      },
      {
        $set: { status: NOTIFICATION_STATUS.PROCESSING },
        $inc: { attempts: 1 }
      },
      { new: true }
    );

    if (!notification) {
      const existing = await Notification.findById(notificationId);
      if (existing && (existing.status === NOTIFICATION_STATUS.SUCCESS || existing.status === NOTIFICATION_STATUS.SENT)) {
        logger.info({ notificationId }, "[NotificationService] Notification already completed; skipping");
        return existing;
      }
      logger.warn({ notificationId }, "[NotificationService] Notification cannot be claimed or exceeded max attempts");
      return existing;
    }

    // Load booking if available for template formatting
    let bookingDoc = null;
    try {
      bookingDoc = await Booking.findById(notification.booking);
    } catch (_) {
      bookingDoc = { _id: notification.booking };
    }

    const templateData = resolveTemplateData(
      notification.notificationType,
      bookingDoc || { _id: notification.booking },
      "Customer",
      notification.recipient
    );

    // ─── External delivery (Nodemailer / Email Provider) ─────────────────────
    const emailResult = await sendEmail({
      to: notification.recipient,
      subject: templateData.subject,
      html: templateData.html
    });

    if (emailResult.success) {
      notification.status = NOTIFICATION_STATUS.SUCCESS;
      notification.processedAt = new Date();
      notification.lastError = "";
      notification.nextRetryAt = null;
      await notification.save();

      if (metrics && metrics.notificationSuccess) metrics.notificationSuccess.inc();

      logger.info(
        { notificationId: notification._id, recipient: notification.recipient, attempts: notification.attempts },
        "[NotificationService] Notification delivered successfully"
      );

      return notification;
    }

    // ─── Failure: Bounded Retry with Exponential Backoff ─────────────────────
    if (notification.attempts < notification.maxAttempts) {
      const backoffSeconds = Math.min(Math.pow(2, notification.attempts), 30);
      notification.status = NOTIFICATION_STATUS.PENDING;
      notification.nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
      notification.lastError = emailResult.error || "Provider delivery failed";
      await notification.save();

      logger.warn(
        {
          notificationId: notification._id,
          attempt: notification.attempts,
          nextRetryAt: notification.nextRetryAt,
          err: emailResult.error
        },
        "[NotificationService] Delivery failed, scheduled retry with exponential backoff"
      );
    } else {
      notification.status = NOTIFICATION_STATUS.FAILURE;
      notification.lastError = emailResult.error || "Max retry attempts reached";
      notification.nextRetryAt = null;
      await notification.save();

      if (metrics && metrics.notificationFailures) metrics.notificationFailures.inc();

      logger.error(
        { notificationId: notification._id, attempts: notification.attempts, err: notification.lastError },
        "[NotificationService] Notification permanently failed after maximum attempts"
      );
    }

    return notification;
  } catch (error) {
    logger.error(
      { err: error.message, notificationId },
      "[NotificationService] Unexpected error processing notification"
    );
    return null;
  }
}

/**
 * Sweeps all pending outbox notifications that are due for delivery.
 */
async function processPendingOutbox({ limit = 10 } = {}) {
  try {
    const now = new Date();
    const pendingDocs = await Notification.find({
      status: NOTIFICATION_STATUS.PENDING,
      $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }],
      attempts: { $lt: MAX_RETRY_ATTEMPTS }
    }).limit(limit);

    const results = [];
    for (const doc of pendingDocs) {
      const processed = await processNotification(doc._id);
      if (processed) results.push(processed);
    }

    return results;
  } catch (error) {
    logger.error({ err: error.message }, "[NotificationService] Error sweeping pending outbox notifications");
    return [];
  }
}

/**
 * Dispatch notification entrypoint: persists outbox record, then triggers immediate delivery.
 */
async function dispatchNotification({ type, booking, userId }) {
  const doc = await enqueueNotification({ type, booking, userId });
  if (doc && doc.status === NOTIFICATION_STATUS.PENDING) {
    return processNotification(doc._id);
  }
  return doc;
}

module.exports = {
  enqueueNotification,
  processNotification,
  processPendingOutbox,
  dispatchNotification,
  resolveTemplateData
};
