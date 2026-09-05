const Notification = require("../models/Notification");
const User = require("../models/User");
const Booking = require("../models/Booking");
const { sendEmail } = require("../services/notification/emailProvider");
const {
  NOTIFICATION_TYPES,
  NOTIFICATION_STATUS
} = require("../services/notification/notificationTypes");

jest.mock("../models/Notification");
jest.mock("../models/User");
jest.mock("../models/Booking");
jest.mock("../services/notification/emailProvider");

const {
  enqueueNotification,
  processNotification,
  dispatchNotification
} = require("../services/notification/notificationService");

describe("Notification Outbox & Delivery Reliability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("1. notification created: persists outbox record with Pending status and idempotencyKey", async () => {
    Notification.findOne.mockResolvedValue(null);
    User.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        name: "Charlie Brown",
        email: "charlie@example.com"
      })
    });

    const mockCreatedDoc = {
      _id: "notif-outbox-1",
      booking: "booking-101",
      user: "user-101",
      status: NOTIFICATION_STATUS.PENDING,
      idempotencyKey: "booking_booking-101_BOOKING_CONFIRMED",
      attempts: 0,
      maxAttempts: 3
    };

    Notification.create.mockResolvedValue(mockCreatedDoc);

    const result = await enqueueNotification({
      type: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
      booking: { _id: "booking-101", totalPrice: 500 },
      userId: "user-101"
    });

    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        booking: "booking-101",
        user: "user-101",
        status: NOTIFICATION_STATUS.PENDING,
        idempotencyKey: "booking_booking-101_BOOKING_CONFIRMED",
        attempts: 0,
        maxAttempts: 3,
        recipient: "charlie@example.com"
      })
    );

    expect(result._id).toBe("notif-outbox-1");
    expect(result.status).toBe(NOTIFICATION_STATUS.PENDING);
  });

  test("2. successful processing: delivers email, transitions to Success and sets processedAt", async () => {
    const mockNotification = {
      _id: "notif-proc-2",
      booking: "booking-102",
      user: "user-102",
      recipient: "customer@example.com",
      notificationType: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
      status: NOTIFICATION_STATUS.PROCESSING,
      attempts: 1,
      maxAttempts: 3,
      save: jest.fn().mockResolvedValue(this)
    };

    Notification.findOneAndUpdate.mockResolvedValue(mockNotification);
    Booking.findById.mockResolvedValue({ _id: "booking-102", totalPrice: 750 });
    sendEmail.mockResolvedValue({ success: true, messageId: "msg_ok_123" });

    const result = await processNotification("notif-proc-2");

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "customer@example.com"
      })
    );
    expect(mockNotification.status).toBe(NOTIFICATION_STATUS.SUCCESS);
    expect(mockNotification.processedAt).toBeInstanceOf(Date);
    expect(mockNotification.lastError).toBe("");
    expect(mockNotification.save).toHaveBeenCalled();
    expect(result.status).toBe(NOTIFICATION_STATUS.SUCCESS);
  });

  test("3. retry after provider failure: schedules backoff and preserves Pending status", async () => {
    const mockNotification = {
      _id: "notif-retry-3",
      booking: "booking-103",
      user: "user-103",
      recipient: "customer@example.com",
      notificationType: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
      status: NOTIFICATION_STATUS.PROCESSING,
      attempts: 1,
      maxAttempts: 3,
      save: jest.fn().mockResolvedValue(this)
    };

    Notification.findOneAndUpdate.mockResolvedValue(mockNotification);
    Booking.findById.mockResolvedValue({ _id: "booking-103" });
    sendEmail.mockResolvedValue({ success: false, error: "SMTP Connection Timeout" });

    const result = await processNotification("notif-retry-3");

    expect(mockNotification.status).toBe(NOTIFICATION_STATUS.PENDING);
    expect(mockNotification.nextRetryAt).toBeInstanceOf(Date);
    expect(mockNotification.nextRetryAt.getTime()).toBeGreaterThan(Date.now());
    expect(mockNotification.lastError).toBe("SMTP Connection Timeout");
    expect(mockNotification.save).toHaveBeenCalled();
    expect(result.status).toBe(NOTIFICATION_STATUS.PENDING);
  });

  test("4. maximum retry/failure state: transitions to Failure after reaching maxAttempts", async () => {
    const mockNotification = {
      _id: "notif-max-4",
      booking: "booking-104",
      user: "user-104",
      recipient: "customer@example.com",
      notificationType: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
      status: NOTIFICATION_STATUS.PROCESSING,
      attempts: 3, // Reached maxAttempts
      maxAttempts: 3,
      save: jest.fn().mockResolvedValue(this)
    };

    Notification.findOneAndUpdate.mockResolvedValue(mockNotification);
    Booking.findById.mockResolvedValue({ _id: "booking-104" });
    sendEmail.mockResolvedValue({ success: false, error: "Recipient mailbox unavailable" });

    const result = await processNotification("notif-max-4");

    expect(mockNotification.status).toBe(NOTIFICATION_STATUS.FAILURE);
    expect(mockNotification.lastError).toBe("Recipient mailbox unavailable");
    expect(mockNotification.nextRetryAt).toBeNull();
    expect(mockNotification.save).toHaveBeenCalled();
    expect(result.status).toBe(NOTIFICATION_STATUS.FAILURE);
  });

  test("5. duplicate event/idempotency: ignores duplicate event and does not re-send email", async () => {
    const existingSuccessfulNotification = {
      _id: "notif-already-done",
      booking: "booking-105",
      idempotencyKey: "booking_booking-105_BOOKING_CONFIRMED",
      status: NOTIFICATION_STATUS.SUCCESS
    };

    Notification.findOne.mockResolvedValue(existingSuccessfulNotification);

    const result = await enqueueNotification({
      type: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
      booking: { _id: "booking-105" },
      userId: "user-105"
    });

    // Should return existing without creating a new record
    expect(Notification.create).not.toHaveBeenCalled();
    expect(result._id).toBe("notif-already-done");
    expect(result.status).toBe(NOTIFICATION_STATUS.SUCCESS);

    // If dispatch is called on it, sendEmail should never execute
    await dispatchNotification({
      type: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
      booking: { _id: "booking-105" },
      userId: "user-105"
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });
});
