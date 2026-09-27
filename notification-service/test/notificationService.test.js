// Business-logic tests for the outbox pipeline (enqueue → claim → deliver →
// retry/backoff → permanent failure) with no real MongoDB or SMTP server:
// the Notification model's static methods and nodemailer's transporter are
// mocked per-test via node:test's built-in TestContext mock tracker (which
// auto-restores after each test), so every test still exercises the real
// enqueueNotification/processNotification/processPendingOutbox/
// dispatchNotification code paths, just against a controlled persistence
// and delivery layer instead of a live database/SMTP server.
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");

const Notification = require("../models/Notification");
const bookingServiceClient = require("../services/bookingServiceClient");
const metrics = require("../metrics");
const {
  enqueueNotification,
  processNotification,
  processPendingOutbox,
  dispatchNotification
} = require("../services/notificationService");
const { NOTIFICATION_TYPES, NOTIFICATION_STATUS } = require("../services/notificationTypes");

function fakeNotificationDoc(overrides = {}) {
  const doc = {
    _id: "notif-1",
    booking: "booking-1",
    recipient: "user@example.com",
    notificationType: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
    status: NOTIFICATION_STATUS.PROCESSING,
    attempts: 1,
    maxAttempts: 3,
    lastError: "",
    nextRetryAt: null,
    processedAt: null,
    ...overrides
  };
  doc.save = async () => doc;
  return doc;
}

// ─── enqueueNotification ──────────────────────────────────────────────────

test("enqueueNotification is idempotent when a record already exists", async (t) => {
  const existing = { _id: "existing-id", status: NOTIFICATION_STATUS.SUCCESS };
  t.mock.method(Notification, "findOne", async () => existing);
  const createMock = t.mock.method(Notification, "create", async () => {
    throw new Error("create should not run on an idempotent no-op");
  });

  const result = await enqueueNotification({
    type: NOTIFICATION_TYPES.BOOKING_CREATED,
    booking: "booking-1",
    userId: "user-1",
    recipientEmail: "a@example.com",
    recipientName: "A"
  });

  assert.equal(result, existing);
  assert.equal(createMock.mock.callCount(), 0);
});

test("enqueueNotification falls back to a generic recipient when the user lookup fails", async (t) => {
  t.mock.method(Notification, "findOne", async () => null);
  t.mock.method(bookingServiceClient, "getUser", async () => {
    throw new Error("booking-service unreachable");
  });
  let created = null;
  t.mock.method(Notification, "create", async (doc) => {
    created = { ...doc, _id: "new-id" };
    return created;
  });

  const result = await enqueueNotification({
    type: NOTIFICATION_TYPES.BOOKING_CREATED,
    booking: "booking-1",
    userId: "user-1"
  });

  assert.equal(result.recipient, "customer@homeease.com");
  assert.equal(created.recipient, "customer@homeease.com");
});

test("enqueueNotification uses the explicit recipient without calling the user lookup", async (t) => {
  t.mock.method(Notification, "findOne", async () => null);
  const getUserMock = t.mock.method(bookingServiceClient, "getUser", async () => ({ email: "x@x.com", name: "X" }));
  t.mock.method(Notification, "create", async (doc) => ({ ...doc, _id: "new-id" }));

  const result = await enqueueNotification({
    type: NOTIFICATION_TYPES.BOOKING_CREATED,
    booking: "booking-1",
    userId: "user-1",
    recipientEmail: "explicit@example.com",
    recipientName: "Explicit"
  });

  assert.equal(result.recipient, "explicit@example.com");
  assert.equal(getUserMock.mock.callCount(), 0);
});

test("enqueueNotification returns null when the datastore errors", async (t) => {
  t.mock.method(Notification, "findOne", async () => {
    throw new Error("mongo down");
  });

  const result = await enqueueNotification({
    type: NOTIFICATION_TYPES.BOOKING_CREATED,
    booking: "booking-1",
    userId: "user-1"
  });

  assert.equal(result, null);
});

// ─── processNotification ──────────────────────────────────────────────────

test("processNotification returns the existing doc when it can't be claimed but is already complete", async (t) => {
  t.mock.method(Notification, "findOneAndUpdate", async () => null);
  const completed = fakeNotificationDoc({ status: NOTIFICATION_STATUS.SUCCESS });
  t.mock.method(Notification, "findById", async () => completed);

  const result = await processNotification("notif-1");
  assert.equal(result, completed);
});

test("processNotification marks delivery success and increments the success metric", async (t) => {
  const doc = fakeNotificationDoc();
  t.mock.method(Notification, "findOneAndUpdate", async () => doc);
  // Booking-service lookup fails here on purpose — proves the resilient
  // fallback-bookingDoc branch also runs on the way to a successful send.
  t.mock.method(bookingServiceClient, "getBooking", async () => {
    throw new Error("booking service down");
  });

  process.env.EMAIL_USER = "ci@example.com";
  process.env.EMAIL_PASS = "app-password";
  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: async () => ({ messageId: "msg-1" })
  }));
  const incMock = t.mock.method(metrics.notificationSuccess, "inc", () => {});

  const result = await processNotification("notif-1");

  assert.equal(result.status, NOTIFICATION_STATUS.SUCCESS);
  assert.ok(result.processedAt instanceof Date);
  assert.equal(incMock.mock.callCount(), 1);

  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;
});

test("processNotification schedules a backoff retry when delivery fails with attempts remaining", async (t) => {
  const doc = fakeNotificationDoc({ attempts: 1, maxAttempts: 3 });
  t.mock.method(Notification, "findOneAndUpdate", async () => doc);
  t.mock.method(bookingServiceClient, "getBooking", async () => ({ _id: "booking-1", totalPrice: 100 }));

  process.env.EMAIL_USER = "ci@example.com";
  process.env.EMAIL_PASS = "app-password";
  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: async () => {
      throw new Error("smtp rejected");
    }
  }));

  const result = await processNotification("notif-1");

  assert.equal(result.status, NOTIFICATION_STATUS.PENDING);
  assert.ok(result.nextRetryAt instanceof Date);
  assert.match(result.lastError, /smtp rejected/);

  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;
});

test("processNotification marks permanent failure once max attempts are reached", async (t) => {
  const doc = fakeNotificationDoc({ attempts: 3, maxAttempts: 3 });
  t.mock.method(Notification, "findOneAndUpdate", async () => doc);
  t.mock.method(bookingServiceClient, "getBooking", async () => ({ _id: "booking-1" }));

  process.env.EMAIL_USER = "ci@example.com";
  process.env.EMAIL_PASS = "app-password";
  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: async () => {
      throw new Error("smtp rejected");
    }
  }));
  const incMock = t.mock.method(metrics.notificationFailures, "inc", () => {});

  const result = await processNotification("notif-1");

  assert.equal(result.status, NOTIFICATION_STATUS.FAILURE);
  assert.equal(incMock.mock.callCount(), 1);

  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;
});

test("processNotification returns null when an unexpected error is thrown", async (t) => {
  t.mock.method(Notification, "findOneAndUpdate", async () => {
    throw new Error("mongo down");
  });

  const result = await processNotification("notif-1");
  assert.equal(result, null);
});

// ─── processPendingOutbox ─────────────────────────────────────────────────

test("processPendingOutbox returns an empty list when nothing is due", async (t) => {
  t.mock.method(Notification, "find", () => ({ limit: async () => [] }));
  const result = await processPendingOutbox({ limit: 5 });
  assert.deepEqual(result, []);
});

test("processPendingOutbox returns an empty list when the query errors", async (t) => {
  t.mock.method(Notification, "find", () => {
    throw new Error("mongo down");
  });
  const result = await processPendingOutbox();
  assert.deepEqual(result, []);
});

// ─── dispatchNotification ─────────────────────────────────────────────────

test("dispatchNotification enqueues then immediately delivers a new PENDING record", async (t) => {
  t.mock.method(Notification, "findOne", async () => null);
  const created = fakeNotificationDoc({ status: NOTIFICATION_STATUS.PENDING, attempts: 0 });
  t.mock.method(Notification, "create", async () => created);
  t.mock.method(Notification, "findOneAndUpdate", async () => created);
  t.mock.method(bookingServiceClient, "getBooking", async () => ({ _id: "booking-1" }));

  process.env.EMAIL_USER = "ci@example.com";
  process.env.EMAIL_PASS = "app-password";
  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: async () => ({ messageId: "msg-1" })
  }));

  const result = await dispatchNotification({
    type: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
    booking: "booking-1",
    userId: "user-1"
  });

  assert.equal(result.status, NOTIFICATION_STATUS.SUCCESS);

  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;
});

test("dispatchNotification returns the existing doc without reprocessing when already resolved", async (t) => {
  const existing = fakeNotificationDoc({ status: NOTIFICATION_STATUS.SUCCESS });
  t.mock.method(Notification, "findOne", async () => existing);
  const findOneAndUpdateMock = t.mock.method(Notification, "findOneAndUpdate", async () => {
    throw new Error("should not reprocess an already-resolved notification");
  });

  const result = await dispatchNotification({
    type: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
    booking: "booking-1",
    userId: "user-1"
  });

  assert.equal(result, existing);
  assert.equal(findOneAndUpdateMock.mock.callCount(), 0);
});
